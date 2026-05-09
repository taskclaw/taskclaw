import { Module, DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BoardRoutingProcessor } from './board-routing.processor';

export const BOARD_ROUTING_QUEUE_NAME = 'board-routing-jobs';

/**
 * Conditionally registers the BullMQ queue and processor for board-routing jobs.
 *
 * - When REDIS_URL is set: registers the queue (connection comes from SyncQueueModule's BullModule.forRoot).
 * - When REDIS_URL is NOT set: provides a no-op processor stub.
 */
@Module({})
export class BoardRoutingQueueModule {
  private static readonly logger = new Logger(BoardRoutingQueueModule.name);

  static register(): DynamicModule {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      BoardRoutingQueueModule.logger.warn(
        'REDIS_URL not set — board-routing BullMQ queue disabled.',
      );
      return {
        module: BoardRoutingQueueModule,
        providers: [
          { provide: 'BOARD_ROUTING_QUEUE_AVAILABLE', useValue: false },
          {
            provide: BoardRoutingProcessor,
            useValue: {
              process: () => {},
              setRouteCallback: () => {},
            },
          },
        ],
        exports: ['BOARD_ROUTING_QUEUE_AVAILABLE', BoardRoutingProcessor],
      };
    }

    BoardRoutingQueueModule.logger.log(
      `REDIS_URL detected — registering BullMQ queue '${BOARD_ROUTING_QUEUE_NAME}'.`,
    );

    return {
      module: BoardRoutingQueueModule,
      imports: [
        BullModule.registerQueue({
          name: BOARD_ROUTING_QUEUE_NAME,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 200 },
          },
        }),
      ],
      providers: [
        { provide: 'BOARD_ROUTING_QUEUE_AVAILABLE', useValue: true },
        BoardRoutingProcessor,
      ],
      exports: ['BOARD_ROUTING_QUEUE_AVAILABLE', BoardRoutingProcessor, BullModule],
    };
  }
}
