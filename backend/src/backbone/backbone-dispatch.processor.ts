import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { BACKBONE_DISPATCH_QUEUE_NAME } from './backbone-dispatch-queue.module';

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

    switch (job.data.type) {
      case 'orchestration_task':
        return this.processOrchestrationTask(job);
      case 'heartbeat':
        return this.processHeartbeat(job);
      case 'board_routing':
        return this.processBoardRouting(job);
      default:
        throw new Error(
          `BackboneDispatchProcessor: unknown job type '${(job.data as any).type}'`,
        );
    }
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
