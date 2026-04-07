import { Module, DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HeartbeatProcessor } from './heartbeat.processor';

export const HEARTBEAT_QUEUE_NAME = 'heartbeat-jobs';

/**
 * Conditionally registers the BullMQ queue and processor for heartbeat jobs.
 *
 * - When REDIS_URL is set: registers the queue (connection comes from AppModule's BullModule.forRoot).
 * - When REDIS_URL is NOT set: provides a no-op processor stub.
 */
@Module({})
export class HeartbeatQueueModule {
  private static readonly logger = new Logger(HeartbeatQueueModule.name);

  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      HeartbeatQueueModule.logger.warn(
        'REDIS_URL not set — heartbeat BullMQ queue disabled.',
      );
      return {
        module: HeartbeatQueueModule,
        providers: [
          { provide: 'HEARTBEAT_QUEUE_AVAILABLE', useValue: false },
          {
            provide: HeartbeatProcessor,
            useValue: { process: () => {}, setHeartbeatCallback: () => {} },
          },
        ],
        exports: ['HEARTBEAT_QUEUE_AVAILABLE', HeartbeatProcessor],
      };
    }

    HeartbeatQueueModule.logger.log(
      `REDIS_URL detected — registering BullMQ queue '${HEARTBEAT_QUEUE_NAME}'.`,
    );

    return {
      module: HeartbeatQueueModule,
      imports: [
        BullModule.registerQueue({
          name: HEARTBEAT_QUEUE_NAME,
          defaultJobOptions: {
            attempts: 2,
            backoff: { type: 'exponential', delay: 10000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 50 },
          },
        }),
      ],
      providers: [
        { provide: 'HEARTBEAT_QUEUE_AVAILABLE', useValue: true },
        HeartbeatProcessor,
      ],
      exports: ['HEARTBEAT_QUEUE_AVAILABLE', HeartbeatProcessor, BullModule],
    };
  }
}
