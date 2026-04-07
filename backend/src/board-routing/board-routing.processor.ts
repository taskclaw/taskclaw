import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
export const BOARD_ROUTING_PROCESSOR_QUEUE = 'board-routing-jobs';

export interface BoardRoutingJobData {
  taskId: string;
  routeId: string;
}

@Processor(BOARD_ROUTING_PROCESSOR_QUEUE)
export class BoardRoutingProcessor extends WorkerHost {
  private readonly logger = new Logger(BoardRoutingProcessor.name);

  private routeCallback:
    | ((taskId: string, routeId: string) => Promise<any>)
    | null = null;

  setRouteCallback(
    callback: (taskId: string, routeId: string) => Promise<any>,
  ) {
    this.routeCallback = callback;
  }

  async process(job: Job<BoardRoutingJobData>): Promise<any> {
    const { taskId, routeId } = job.data;

    this.logger.log(
      `Processing board-routing job ${job.id}: task ${taskId} via route ${routeId} ` +
        `(attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3})`,
    );

    if (!this.routeCallback) {
      throw new Error(
        'BoardRoutingProcessor: route callback not registered. Ensure BoardRoutingModule has initialized.',
      );
    }

    try {
      const result = await this.routeCallback(taskId, routeId);
      this.logger.log(
        `Board-routing job ${job.id} completed: task ${taskId} -> ${result.id}`,
      );
      return result;
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Board-routing job ${job.id} failed: ${message} (attempt ${job.attemptsMade + 1})`,
      );
      throw error;
    }
  }
}
