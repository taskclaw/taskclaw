import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { heartbeatConfigs, tasks } from '../db/schema';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ExecutionLogService } from './execution-log.service';
import { HEARTBEAT_QUEUE_NAME } from './heartbeat-queue.module';
import { CreateHeartbeatDto } from './dto/create-heartbeat.dto';
import { UpdateHeartbeatDto } from './dto/update-heartbeat.dto';
import { BACKBONE_DISPATCH_QUEUE_NAME } from '../backbone/backbone-dispatch-queue.module';

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private heartbeatQueue?: Queue;
  private backboneDispatchQueue?: Queue;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  /**
   * Drizzle returns camelCase columns; callers (and the previous PostgREST
   * response shape) depend on snake_case keys. Re-key every heartbeat_configs
   * row to the snake_case shape so behavior is unchanged.
   */
  private present(row: typeof heartbeatConfigs.$inferSelect) {
    return {
      id: row.id,
      account_id: row.accountId,
      pod_id: row.podId,
      board_id: row.boardId,
      name: row.name,
      schedule: row.schedule,
      prompt: row.prompt,
      is_active: row.isActive,
      dry_run: row.dryRun,
      max_tasks_per_run: row.maxTasksPerRun,
      circuit_breaker_threshold: row.circuitBreakerThreshold,
      consecutive_failures: row.consecutiveFailures,
      last_run_at: row.lastRunAt,
      last_run_status: row.lastRunStatus,
      last_run_summary: row.lastRunSummary,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      pilot_enabled: row.pilotEnabled,
      execution_mode: row.executionMode,
      concurrency_policy: row.concurrencyPolicy,
    };
  }

  /**
   * Called by HeartbeatModule.onModuleInit to inject the BullMQ queue
   * if Redis is available. If not called, the service operates in
   * manual-trigger-only mode.
   */
  setBullQueue(queue: Queue) {
    this.heartbeatQueue = queue;
    this.logger.log('BullMQ queue attached to HeartbeatService.');
  }

  /**
   * Called by HeartbeatModule.onModuleInit to inject the backbone-dispatch queue
   * if Redis is available. Used by B7 to route heartbeat execution through the
   * backbone-dispatch queue for concurrency control.
   */
  setBackboneDispatchQueue(queue: Queue) {
    this.backboneDispatchQueue = queue;
    this.logger.log('Backbone dispatch queue attached to HeartbeatService.');
  }

  async initSchedules() {
    if (this.heartbeatQueue) {
      await this.scheduleAll();
    } else {
      this.logger.log(
        'No BullMQ queue available — heartbeat scheduling disabled. Use manual triggers.',
      );
    }
  }

  async scheduleAll() {
    if (!this.heartbeatQueue) return;

    const rows = await this.db
      .select()
      .from(heartbeatConfigs)
      .where(eq(heartbeatConfigs.isActive, true));

    const configs = rows.map((r) => this.present(r));

    for (const config of configs) {
      await this.scheduleConfig(config);
    }

    this.logger.log(
      `Scheduled ${configs.length} active heartbeat configs`,
    );
  }

  async scheduleConfig(config: any) {
    if (!this.heartbeatQueue) return;

    // Remove existing repeatable job for this config
    const existingJobs = await this.heartbeatQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      if (job.id === `heartbeat:${config.id}`) {
        await this.heartbeatQueue.removeRepeatableByKey(job.key);
      }
    }

    if (!config.is_active) return;

    await this.heartbeatQueue.add(
      'heartbeat',
      { configId: config.id },
      {
        repeat: { pattern: config.schedule },
        jobId: `heartbeat:${config.id}`,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    this.logger.log(
      `Scheduled heartbeat "${config.name}" (${config.id}) with cron: ${config.schedule}`,
    );
  }

  async findAll(accountId: string) {
    try {
      const rows = await this.db
        .select()
        .from(heartbeatConfigs)
        .where(eq(heartbeatConfigs.accountId, accountId))
        .orderBy(desc(heartbeatConfigs.createdAt));

      return rows.map((r) => this.present(r));
    } catch (error) {
      throw new Error(
        `Failed to fetch heartbeat configs: ${(error as Error).message}`,
      );
    }
  }

  async findOne(id: string) {
    const [row] = await this.db
      .select()
      .from(heartbeatConfigs)
      .where(eq(heartbeatConfigs.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Heartbeat config ${id} not found`);
    }

    return this.present(row);
  }

  async create(accountId: string, dto: CreateHeartbeatDto) {
    let row: typeof heartbeatConfigs.$inferSelect;
    try {
      [row] = await this.db
        .insert(heartbeatConfigs)
        .values({
          accountId: accountId,
          name: dto.name,
          schedule: dto.schedule ?? '0 */4 * * *',
          prompt:
            dto.prompt ??
            'Review pending tasks and take appropriate actions.',
          isActive: dto.is_active ?? false,
          dryRun: dto.dry_run ?? false,
          maxTasksPerRun: dto.max_tasks_per_run ?? 5,
          podId: dto.pod_id ?? null,
          boardId: dto.board_id ?? null,
        })
        .returning();
    } catch (error) {
      throw new Error(
        `Failed to create heartbeat config: ${(error as Error).message}`,
      );
    }

    const data = this.present(row);

    // Schedule if active
    if (data.is_active) {
      await this.scheduleConfig(data);
    }

    return data;
  }

  async update(id: string, dto: UpdateHeartbeatDto) {
    await this.findOne(id);

    // Map the snake_case DTO to camelCase columns (only defined fields).
    const patch: Partial<typeof heartbeatConfigs.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.schedule !== undefined) patch.schedule = dto.schedule;
    if (dto.prompt !== undefined) patch.prompt = dto.prompt;
    if (dto.is_active !== undefined) patch.isActive = dto.is_active;
    if (dto.dry_run !== undefined) patch.dryRun = dto.dry_run;
    if (dto.max_tasks_per_run !== undefined)
      patch.maxTasksPerRun = dto.max_tasks_per_run;
    if (dto.pod_id !== undefined) patch.podId = dto.pod_id;
    if (dto.board_id !== undefined) patch.boardId = dto.board_id;

    let row: typeof heartbeatConfigs.$inferSelect;
    try {
      [row] = await this.db
        .update(heartbeatConfigs)
        .set(patch)
        .where(eq(heartbeatConfigs.id, id))
        .returning();
    } catch (error) {
      throw new Error(
        `Failed to update heartbeat config: ${(error as Error).message}`,
      );
    }

    const data = this.present(row);

    // Re-schedule if schedule or active state changed
    if (dto.schedule !== undefined || dto.is_active !== undefined) {
      await this.scheduleConfig(data);
    }

    return data;
  }

  async delete(id: string) {
    await this.findOne(id);

    // Remove repeatable job
    if (this.heartbeatQueue) {
      const existingJobs = await this.heartbeatQueue.getRepeatableJobs();
      for (const job of existingJobs) {
        if (job.id === `heartbeat:${id}`) {
          await this.heartbeatQueue.removeRepeatableByKey(job.key);
        }
      }
    }

    try {
      await this.db
        .delete(heartbeatConfigs)
        .where(eq(heartbeatConfigs.id, id));
    } catch (error) {
      throw new Error(
        `Failed to delete heartbeat config: ${(error as Error).message}`,
      );
    }

    return { message: 'Heartbeat config deleted successfully' };
  }

  async toggle(id: string, isActive: boolean) {
    await this.findOne(id);

    let row: typeof heartbeatConfigs.$inferSelect;
    try {
      [row] = await this.db
        .update(heartbeatConfigs)
        .set({
          isActive: isActive,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(heartbeatConfigs.id, id))
        .returning();
    } catch (error) {
      throw new Error(
        `Failed to toggle heartbeat config: ${(error as Error).message}`,
      );
    }

    const data = this.present(row);

    await this.scheduleConfig(data);

    return data;
  }

  async trigger(id: string) {
    if (this.heartbeatQueue) {
      await this.heartbeatQueue.add('heartbeat', {
        configId: id,
        immediate: true,
      });
      return { message: 'Heartbeat triggered (queued)' };
    }

    // Direct execution fallback
    await this.executeHeartbeat(id);
    return { message: 'Heartbeat triggered (direct)' };
  }

  /**
   * B7: Enqueues heartbeat execution via backbone-dispatch queue for concurrency control.
   * When backbone-dispatch queue is available, adds a job with priority 5.
   * Falls back to direct execution if the queue is not available.
   *
   * This method is called by HeartbeatProcessor when a scheduled heartbeat fires.
   */
  async executeHeartbeat(configId: string) {
    if (this.backboneDispatchQueue) {
      const idempotencyKey = `heartbeat-exec-${configId}-${Date.now()}`;
      // Resolve account_id so the dispatch processor can shadow-write a
      // task_runs row (PRD §10.1, gated by FEATURE_TASK_RUNS_V2).
      const [cfg] = await this.db
        .select({ accountId: heartbeatConfigs.accountId })
        .from(heartbeatConfigs)
        .where(eq(heartbeatConfigs.id, configId))
        .limit(1);
      await this.backboneDispatchQueue.add(
        'dispatch',
        {
          type: 'heartbeat',
          heartbeatConfigId: configId,
          accountId: cfg?.accountId ?? undefined,
          priority: 5,
          idempotencyKey,
        },
        {
          priority: 5,
          jobId: idempotencyKey,
        },
      );
      this.logger.log(
        `Heartbeat ${configId} enqueued to backbone-dispatch (priority 5)`,
      );
      return;
    }

    // Fallback: direct execution when backbone-dispatch queue is unavailable
    this.logger.debug(
      `backbone-dispatch queue not available — executing heartbeat ${configId} directly`,
    );
    await this.executeHeartbeatCore(configId);
  }

  /**
   * Core heartbeat execution logic. Called by BackboneDispatchProcessor
   * (type: 'heartbeat') or directly as fallback.
   */
  async executeHeartbeatCore(configId: string) {
    const startTime = Date.now();
    const config = await this.findOne(configId);

    // Check circuit breaker
    if (
      await this.circuitBreaker.isOpen(
        configId,
        config.circuit_breaker_threshold ?? 3,
      )
    ) {
      this.logger.warn(
        `Circuit breaker open for heartbeat "${config.name}" — skipping`,
      );

      await this.db
        .update(heartbeatConfigs)
        .set({
          lastRunAt: new Date().toISOString(),
          lastRunStatus: 'skipped',
          lastRunSummary:
            'Circuit breaker open — too many consecutive failures',
        })
        .where(eq(heartbeatConfigs.id, configId));

      await this.executionLog.create({
        account_id: config.account_id,
        trigger_type: 'heartbeat',
        status: 'skipped',
        heartbeat_config_id: configId,
        pod_id: config.pod_id ?? undefined,
        board_id: config.board_id ?? undefined,
        summary: 'Circuit breaker open',
        duration_ms: Date.now() - startTime,
      });

      return;
    }

    // Mark as running
    await this.db
      .update(heartbeatConfigs)
      .set({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: 'running',
      })
      .where(eq(heartbeatConfigs.id, configId));

    const logEntry = await this.executionLog.create({
      account_id: config.account_id,
      trigger_type: 'heartbeat',
      status: 'running',
      heartbeat_config_id: configId,
      pod_id: config.pod_id ?? undefined,
      board_id: config.board_id ?? undefined,
    });

    try {
      // Fetch pending tasks for the scope
      const conditions = [
        eq(tasks.accountId, config.account_id),
        eq(tasks.completed, false),
      ];

      if (config.board_id) {
        conditions.push(eq(tasks.boardInstanceId, config.board_id));
      }

      const taskRows = await this.db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          notes: tasks.notes,
        })
        .from(tasks)
        .where(and(...conditions))
        .limit(config.max_tasks_per_run ?? 5);

      const summary = config.dry_run
        ? `[DRY RUN] Would process ${taskRows.length} tasks`
        : `Processed ${taskRows.length} tasks`;

      // Update config with success
      await this.circuitBreaker.recordSuccess(configId);

      await this.db
        .update(heartbeatConfigs)
        .set({
          lastRunStatus: 'success',
          lastRunSummary: summary,
          consecutiveFailures: 0,
        })
        .where(eq(heartbeatConfigs.id, configId));

      if (logEntry) {
        await this.executionLog.complete(logEntry.id, {
          status: config.dry_run ? 'dry_run' : 'success',
          summary,
          duration_ms: Date.now() - startTime,
        });
      }

      this.logger.log(`Heartbeat "${config.name}": ${summary}`);
    } catch (err) {
      const errorMessage = (err as Error).message;

      const isOpen = await this.circuitBreaker.recordFailure(
        configId,
        config.circuit_breaker_threshold ?? 3,
      );

      await this.db
        .update(heartbeatConfigs)
        .set({
          lastRunStatus: 'error',
          lastRunSummary: errorMessage.slice(0, 500),
          consecutiveFailures: (config.consecutive_failures ?? 0) + 1,
        })
        .where(eq(heartbeatConfigs.id, configId));

      if (logEntry) {
        await this.executionLog.complete(logEntry.id, {
          status: 'error',
          error_details: errorMessage.slice(0, 1000),
          duration_ms: Date.now() - startTime,
        });
      }

      this.logger.error(
        `Heartbeat "${config.name}" failed: ${errorMessage}${isOpen ? ' — circuit breaker now OPEN' : ''}`,
      );
    }
  }
}
