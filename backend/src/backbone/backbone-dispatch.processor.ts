import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { BACKBONE_DISPATCH_QUEUE_NAME } from './backbone-dispatch-queue.module';
import { TaskRunsService, type TaskRunFailureReason } from '../task-runs/task-runs.service';

export interface BackboneDispatchJob {
  type: 'orchestration_task' | 'heartbeat' | 'board_routing';
  accountId?: string;
  // For orchestration_task:
  orchestratedTaskId?: string;
  // For heartbeat:
  heartbeatConfigId?: string;
  // For board_routing:
  boardRoutingJobId?: string;
  taskId?: string;
  routeId?: string;
  // Shared:
  priority: number;
  idempotencyKey: string;
}

/**
 * BackboneDispatchProcessor (B2)
 *
 * Single worker for all AI-bound work. Routes jobs by type.
 * Concurrency: 3 — matches the DB semaphore limit.
 *
 * Priority lanes (lower number = higher priority):
 *   1 = user-initiated (cockpit delegation, approval just granted)
 *   2 = DAG continuation (unblocked task)
 *   3 = board routing (background automation)
 *   5 = heartbeat (scheduled, no urgency)
 */
@Processor(BACKBONE_DISPATCH_QUEUE_NAME, { concurrency: 3 })
export class BackboneDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(BackboneDispatchProcessor.name);

  constructor(private readonly taskRuns: TaskRunsService) {
    super();
  }

  private dispatchTaskCallback:
    | ((taskId: string) => Promise<void>)
    | null = null;

  private executeHeartbeatCallback:
    | ((configId: string) => Promise<void>)
    | null = null;

  private triggerRouteCallback:
    | ((taskId: string, routeId: string) => Promise<void>)
    | null = null;

  setDispatchTaskCallback(cb: (taskId: string) => Promise<void>) {
    this.dispatchTaskCallback = cb;
  }

  setExecuteHeartbeatCallback(cb: (configId: string) => Promise<void>) {
    this.executeHeartbeatCallback = cb;
  }

  setTriggerRouteCallback(
    cb: (taskId: string, routeId: string) => Promise<void>,
  ) {
    this.triggerRouteCallback = cb;
  }

  async process(job: Job<BackboneDispatchJob>): Promise<any> {
    this.logger.log(
      `Processing backbone-dispatch job ${job.id} type=${job.data.type} ` +
        `priority=${job.data.priority} attempt=${job.attemptsMade + 1}`,
    );

    // PRD §10.1 — dual-write task_runs in shadow mode behind FEATURE_TASK_RUNS_V2.
    // Begin a row in 'queued' status; the processor body transitions it to
    // 'running' and finalizes with completed/failed. When the flag is off,
    // begin() returns null and every other call is a no-op.
    const runId = await this.beginRunFor(job);
    await this.taskRuns.transitionTo(runId, 'running');

    try {
      let result: unknown;
      switch (job.data.type) {
        case 'orchestration_task':
          result = await this.processOrchestrationTask(job);
          break;
        case 'heartbeat':
          result = await this.processHeartbeat(job);
          break;
        case 'board_routing':
          result = await this.processBoardRouting(job);
          break;
        default:
          throw new Error(
            `BackboneDispatchProcessor: unknown job type '${(job.data as any).type}'`,
          );
      }
      await this.taskRuns.finish({ run_id: runId ?? '', status: 'completed', result });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.taskRuns.finish({
        run_id: runId ?? '',
        status: 'failed',
        failure_reason: this.classifyFailure(message),
        failure_message: message.slice(0, 4000),
      });
      throw err;
    }
  }

  private async beginRunFor(job: Job<BackboneDispatchJob>): Promise<string | null> {
    if (!this.taskRuns.isEnabled()) return null;
    const accountId = job.data.accountId ?? null;
    if (!accountId) return null;

    const triggerByType: Record<BackboneDispatchJob['type'], 'dag' | 'heartbeat' | 'schedule'> =
      {
        orchestration_task: 'dag',
        heartbeat: 'heartbeat',
        board_routing: 'schedule',
      };

    return this.taskRuns.begin({
      account_id: accountId,
      orchestrated_task_id: job.data.orchestratedTaskId ?? null,
      task_id: job.data.taskId ?? null,
      trigger: triggerByType[job.data.type],
      attempt: job.attemptsMade + 1,
      metadata: {
        bullmq_job_id: job.id,
        idempotency_key: job.data.idempotencyKey,
        priority: job.data.priority,
        job_type: job.data.type,
      },
    });
  }

  private classifyFailure(message: string): TaskRunFailureReason {
    const lower = message.toLowerCase();
    if (lower.includes('circuit') && lower.includes('open')) return 'circuit_open';
    if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
    if (lower.includes('econn') || lower.includes('runtime') || lower.includes('offline'))
      return 'runtime_offline';
    if (lower.includes('tool') && lower.includes('error')) return 'tool_error';
    if (lower.includes('invalid') || lower.includes('bad request')) return 'invalid_input';
    return 'agent_error';
  }

  private async processOrchestrationTask(
    job: Job<BackboneDispatchJob>,
  ): Promise<void> {
    const { orchestratedTaskId } = job.data;
    if (!orchestratedTaskId) {
      throw new Error(
        'BackboneDispatchProcessor: orchestration_task job missing orchestratedTaskId',
      );
    }

    if (!this.dispatchTaskCallback) {
      throw new Error(
        'BackboneDispatchProcessor: dispatchTask callback not registered. ' +
          'Ensure OrchestrationModule has initialized.',
      );
    }

    this.logger.log(
      `[orchestration_task] Dispatching task ${orchestratedTaskId}`,
    );
    await this.dispatchTaskCallback(orchestratedTaskId);
    this.logger.log(
      `[orchestration_task] Task ${orchestratedTaskId} completed`,
    );
  }

  private async processHeartbeat(job: Job<BackboneDispatchJob>): Promise<void> {
    const { heartbeatConfigId } = job.data;
    if (!heartbeatConfigId) {
      throw new Error(
        'BackboneDispatchProcessor: heartbeat job missing heartbeatConfigId',
      );
    }

    if (!this.executeHeartbeatCallback) {
      throw new Error(
        'BackboneDispatchProcessor: executeHeartbeat callback not registered. ' +
          'Ensure HeartbeatModule has initialized.',
      );
    }

    this.logger.log(
      `[heartbeat] Executing heartbeat for config ${heartbeatConfigId}`,
    );
    await this.executeHeartbeatCallback(heartbeatConfigId);
    this.logger.log(
      `[heartbeat] Heartbeat config ${heartbeatConfigId} completed`,
    );
  }

  private async processBoardRouting(
    job: Job<BackboneDispatchJob>,
  ): Promise<void> {
    const { taskId, routeId } = job.data;
    if (!taskId || !routeId) {
      throw new Error(
        'BackboneDispatchProcessor: board_routing job missing taskId or routeId',
      );
    }

    if (!this.triggerRouteCallback) {
      throw new Error(
        'BackboneDispatchProcessor: triggerRoute callback not registered. ' +
          'Ensure BoardRoutingModule has initialized.',
      );
    }

    this.logger.log(
      `[board_routing] Triggering route ${routeId} for task ${taskId}`,
    );
    await this.triggerRouteCallback(taskId, routeId);
    this.logger.log(
      `[board_routing] Route ${routeId} for task ${taskId} completed`,
    );
  }
}
