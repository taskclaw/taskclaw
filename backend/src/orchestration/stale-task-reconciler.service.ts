import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { and, eq, lt } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { orchestratedTasks } from '../db/schema';
import { CircuitBreakerService } from '../heartbeat/circuit-breaker.service';

/**
 * StaleTaskReconciler (B5)
 *
 * Runs every 5 minutes to detect and recover stranded orchestration tasks.
 *
 * A task is considered stale if:
 *   status = 'running' AND updated_at < NOW() - INTERVAL '10 minutes'
 *
 * For each stale task:
 *   - If backbone circuit is healthy → re-enqueue to backbone-dispatch with priority 2
 *   - If circuit is open → mark task as 'failed' with reason 'stale_execution_timeout'
 *
 * BullMQ jobId deduplication (`orch-task-${taskId}`) prevents double-dispatch
 * if the reconciler and a retry path race.
 */
@Injectable()
export class StaleTaskReconcilerService {
  private readonly logger = new Logger(StaleTaskReconcilerService.name);

  private backboneDispatchQueue?: Queue;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * Called by OrchestrationModule.onModuleInit to inject the backbone-dispatch queue.
   */
  setBackboneDispatchQueue(queue: Queue) {
    this.backboneDispatchQueue = queue;
    this.logger.log('Backbone dispatch queue wired to StaleTaskReconcilerService.');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileStaleTasks(): Promise<void> {
    this.logger.log('[Reconciler] Scanning for stale orchestration tasks...');

    // Query tasks stuck in 'running' for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let staleTasks: {
      id: string;
      account_id: string;
      pod_id: string | null;
    }[];
    try {
      staleTasks = await this.db
        .select({
          id: orchestratedTasks.id,
          account_id: orchestratedTasks.accountId,
          pod_id: orchestratedTasks.podId,
        })
        .from(orchestratedTasks)
        .where(
          and(
            eq(orchestratedTasks.status, 'running'),
            lt(orchestratedTasks.updatedAt, tenMinutesAgo),
          ),
        );
    } catch (error) {
      this.logger.error(
        `[Reconciler] Failed to query stale tasks: ${(error as Error).message}`,
      );
      return;
    }

    if (!staleTasks || staleTasks.length === 0) {
      this.logger.debug('[Reconciler] No stale tasks found.');
      return;
    }

    this.logger.warn(
      `[Reconciler] Found ${staleTasks.length} stale task(s) — processing...`,
    );

    let requeued = 0;
    let failed = 0;

    for (const task of staleTasks) {
      const taskId: string = task.id;
      const accountId: string = task.account_id;

      // Check if backbone circuit is open for this task's config
      // Use task's pod_id as proxy for circuit breaker config_id, or fall through
      const circuitOpen = task.pod_id
        ? await this.circuitBreaker.isOpen(task.pod_id, 3)
        : false;

      if (circuitOpen) {
        // Circuit is open — mark task as failed
        this.logger.warn(
          `[Reconciler] Task ${taskId}: circuit open for pod ${task.pod_id} → marking failed`,
        );

        await this.db
          .update(orchestratedTasks)
          .set({
            status: 'failed',
            resultSummary: 'stale_execution_timeout: circuit breaker open',
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(orchestratedTasks.id, taskId),
              eq(orchestratedTasks.status, 'running'),
            ),
          ); // Conditional update to avoid race

        failed++;
      } else {
        // Circuit is healthy — re-enqueue via backbone-dispatch
        const jobId = `orch-task-${taskId}`;

        if (this.backboneDispatchQueue) {
          await this.backboneDispatchQueue.add(
            'dispatch',
            {
              type: 'orchestration_task',
              orchestratedTaskId: taskId,
              accountId,
              priority: 2,
              idempotencyKey: jobId,
            },
            {
              priority: 2,
              jobId, // BullMQ deduplicates — safe to call even if already queued
            },
          );
          this.logger.log(
            `[Reconciler] Task ${taskId} re-enqueued to backbone-dispatch (jobId=${jobId})`,
          );
          requeued++;
        } else {
          // Queue not available — mark as failed to avoid eternal stale state
          this.logger.warn(
            `[Reconciler] Task ${taskId}: no queue available → marking failed`,
          );

          await this.db
            .update(orchestratedTasks)
            .set({
              status: 'failed',
              resultSummary: 'stale_execution_timeout: no queue available for requeue',
              updatedAt: new Date().toISOString(),
            })
            .where(
              and(
                eq(orchestratedTasks.id, taskId),
                eq(orchestratedTasks.status, 'running'),
              ),
            );

          failed++;
        }
      }
    }

    this.logger.log(
      `[Reconciler] Done: ${requeued} requeued, ${failed} marked failed`,
    );
  }
}
