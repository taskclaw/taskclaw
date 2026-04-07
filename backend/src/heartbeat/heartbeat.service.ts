import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ExecutionLogService } from './execution-log.service';
import { HEARTBEAT_QUEUE_NAME } from './heartbeat-queue.module';
import { CreateHeartbeatDto } from './dto/create-heartbeat.dto';
import { UpdateHeartbeatDto } from './dto/update-heartbeat.dto';

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private heartbeatQueue?: Queue;

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  /**
   * Called by HeartbeatModule.onModuleInit to inject the BullMQ queue
   * if Redis is available. If not called, the service operates in
   * manual-trigger-only mode.
   */
  setBullQueue(queue: Queue) {
    this.heartbeatQueue = queue;
    this.logger.log('BullMQ queue attached to HeartbeatService.');
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

    const { data: configs } = await this.supabaseAdmin
      .getClient()
      .from('heartbeat_configs')
      .select('*')
      .eq('is_active', true);

    for (const config of configs ?? []) {
      await this.scheduleConfig(config);
    }

    this.logger.log(
      `Scheduled ${configs?.length ?? 0} active heartbeat configs`,
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
    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('heartbeat_configs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(
        `Failed to fetch heartbeat configs: ${error.message}`,
      );
    }

    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('heartbeat_configs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Heartbeat config ${id} not found`);
    }

    return data;
  }

  async create(accountId: string, dto: CreateHeartbeatDto) {
    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('heartbeat_configs')
      .insert({
        account_id: accountId,
        name: dto.name,
        schedule: dto.schedule ?? '0 */4 * * *',
        prompt:
          dto.prompt ??
          'Review pending tasks and take appropriate actions.',
        is_active: dto.is_active ?? false,
        dry_run: dto.dry_run ?? false,
        max_tasks_per_run: dto.max_tasks_per_run ?? 5,
        pod_id: dto.pod_id ?? null,
        board_id: dto.board_id ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to create heartbeat config: ${error.message}`,
      );
    }

    // Schedule if active
    if (data.is_active) {
      await this.scheduleConfig(data);
    }

    return data;
  }

  async update(id: string, dto: UpdateHeartbeatDto) {
    await this.findOne(id);

    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('heartbeat_configs')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to update heartbeat config: ${error.message}`,
      );
    }

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

    const { error } = await this.supabaseAdmin
      .getClient()
      .from('heartbeat_configs')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(
        `Failed to delete heartbeat config: ${error.message}`,
      );
    }

    return { message: 'Heartbeat config deleted successfully' };
  }

  async toggle(id: string, isActive: boolean) {
    await this.findOne(id);

    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('heartbeat_configs')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to toggle heartbeat config: ${error.message}`,
      );
    }

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

  async executeHeartbeat(configId: string) {
    const startTime = Date.now();
    const config = await this.findOne(configId);

    // Check circuit breaker
    if (
      this.circuitBreaker.isOpen(
        configId,
        config.circuit_breaker_threshold ?? 3,
      )
    ) {
      this.logger.warn(
        `Circuit breaker open for heartbeat "${config.name}" — skipping`,
      );

      await this.supabaseAdmin
        .getClient()
        .from('heartbeat_configs')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'skipped',
          last_run_summary:
            'Circuit breaker open — too many consecutive failures',
        })
        .eq('id', configId);

      await this.executionLog.create({
        account_id: config.account_id,
        trigger_type: 'heartbeat',
        status: 'skipped',
        heartbeat_config_id: configId,
        pod_id: config.pod_id,
        board_id: config.board_id,
        summary: 'Circuit breaker open',
        duration_ms: Date.now() - startTime,
      });

      return;
    }

    // Mark as running
    await this.supabaseAdmin
      .getClient()
      .from('heartbeat_configs')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: 'running',
      })
      .eq('id', configId);

    const logEntry = await this.executionLog.create({
      account_id: config.account_id,
      trigger_type: 'heartbeat',
      status: 'running',
      heartbeat_config_id: configId,
      pod_id: config.pod_id,
      board_id: config.board_id,
    });

    try {
      // Fetch pending tasks for the scope
      const client = this.supabaseAdmin.getClient();
      let tasksQuery = client
        .from('tasks')
        .select('id, title, status, priority, notes')
        .eq('account_id', config.account_id)
        .eq('completed', false)
        .limit(config.max_tasks_per_run ?? 5);

      if (config.board_id) {
        tasksQuery = tasksQuery.eq('board_instance_id', config.board_id);
      }

      const { data: tasks } = await tasksQuery;

      const summary = config.dry_run
        ? `[DRY RUN] Would process ${tasks?.length ?? 0} tasks`
        : `Processed ${tasks?.length ?? 0} tasks`;

      // Update config with success
      this.circuitBreaker.recordSuccess(configId);

      await this.supabaseAdmin
        .getClient()
        .from('heartbeat_configs')
        .update({
          last_run_status: 'success',
          last_run_summary: summary,
          consecutive_failures: 0,
        })
        .eq('id', configId);

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

      const isOpen = this.circuitBreaker.recordFailure(
        configId,
        config.circuit_breaker_threshold ?? 3,
      );

      await this.supabaseAdmin
        .getClient()
        .from('heartbeat_configs')
        .update({
          last_run_status: 'error',
          last_run_summary: errorMessage.slice(0, 500),
          consecutive_failures: (config.consecutive_failures ?? 0) + 1,
        })
        .eq('id', configId);

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
