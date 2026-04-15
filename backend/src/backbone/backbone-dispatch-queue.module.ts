import { Module, DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

export const BACKBONE_DISPATCH_QUEUE_NAME = 'backbone-dispatch';

/**
 * Conditionally registers the BullMQ queue for backbone dispatch jobs.
 *
 * - When REDIS_URL is set: registers the queue (connection comes from AppModule's BullModule.forRoot).
 * - When REDIS_URL is NOT set: provides a no-op token indicating unavailability.
 *
 * Queue handles all AI-bound work: orchestration tasks, heartbeats, board routing.
 * Worker concurrency: 3 (matches DB semaphore limit).
 */
@Module({})
export class BackboneDispatchQueueModule {
  private static readonly logger = new Logger(BackboneDispatchQueueModule.name);

  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      BackboneDispatchQueueModule.logger.warn(
        'REDIS_URL not set — backbone-dispatch BullMQ queue disabled.',
      );
      return {
        module: BackboneDispatchQueueModule,
        providers: [
          { provide: 'BACKBONE_DISPATCH_QUEUE_AVAILABLE', useValue: false },
        ],
        exports: ['BACKBONE_DISPATCH_QUEUE_AVAILABLE'],
      };
    }

    BackboneDispatchQueueModule.logger.log(
      `REDIS_URL detected — registering BullMQ queue '${BACKBONE_DISPATCH_QUEUE_NAME}'.`,
    );

    return {
      module: BackboneDispatchQueueModule,
      imports: [
        BullModule.registerQueue({
          name: BACKBONE_DISPATCH_QUEUE_NAME,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 15_000 },
            removeOnComplete: { count: 200 },
            removeOnFail: { count: 100 },
          },
        }),
      ],
      providers: [
        { provide: 'BACKBONE_DISPATCH_QUEUE_AVAILABLE', useValue: true },
      ],
      exports: [
        'BACKBONE_DISPATCH_QUEUE_AVAILABLE',
        BullModule,
      ],
    };
  }
}
