import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
export const HEARTBEAT_PROCESSOR_QUEUE = 'heartbeat-jobs';

export interface HeartbeatJobData {
  configId: string;
  immediate?: boolean;
}

@Processor(HEARTBEAT_PROCESSOR_QUEUE)
export class HeartbeatProcessor extends WorkerHost {
  private readonly logger = new Logger(HeartbeatProcessor.name);

  private heartbeatCallback:
    | ((configId: string) => Promise<void>)
    | null = null;

  setHeartbeatCallback(callback: (configId: string) => Promise<void>) {
    this.heartbeatCallback = callback;
  }

  async process(job: Job<HeartbeatJobData>): Promise<any> {
    const { configId, immediate } = job.data;

    this.logger.log(
      `Processing heartbeat job ${job.id} for config ${configId}` +
        `${immediate ? ' (immediate trigger)' : ''} ` +
        `(attempt ${job.attemptsMade + 1}/${job.opts.attempts || 2})`,
    );

    if (!this.heartbeatCallback) {
      throw new Error(
        'HeartbeatProcessor: heartbeat callback not registered. Ensure HeartbeatModule has initialized.',
      );
    }

    try {
      await this.heartbeatCallback(configId);
      this.logger.log(
        `Heartbeat job ${job.id} completed for config ${configId}`,
      );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Heartbeat job ${job.id} failed: ${message} (attempt ${job.attemptsMade + 1})`,
      );
      throw error;
    }
  }
}
