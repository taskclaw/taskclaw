import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { HeartbeatQueueModule, HEARTBEAT_QUEUE_NAME } from './heartbeat-queue.module';
import { HeartbeatService } from './heartbeat.service';
import { HeartbeatProcessor } from './heartbeat.processor';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ExecutionLogService } from './execution-log.service';
import { HeartbeatController } from './heartbeat.controller';

/**
 * HeartbeatModule (A01-A05)
 *
 * Scheduled autonomy system that periodically scans pending tasks and takes action.
 * Uses BullMQ for cron-like scheduling when Redis is available,
 * falls back to manual-trigger-only mode otherwise.
 */
@Module({
  imports: [
    SupabaseModule,
    CommonModule,
    HeartbeatQueueModule.register(),
  ],
  controllers: [HeartbeatController],
  providers: [
    HeartbeatService,
    CircuitBreakerService,
    ExecutionLogService,
  ],
  exports: [HeartbeatService, ExecutionLogService, CircuitBreakerService],
})
export class HeartbeatModule implements OnModuleInit {
  private readonly logger = new Logger(HeartbeatModule.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly heartbeatService: HeartbeatService,
    private readonly heartbeatProcessor: HeartbeatProcessor,
  ) {}

  async onModuleInit() {
    // Wire processor callback
    this.heartbeatProcessor.setHeartbeatCallback(
      this.heartbeatService.executeHeartbeat.bind(this.heartbeatService),
    );

    // Try to inject the Bull queue into the heartbeat service
    try {
      const queue = this.moduleRef.get<Queue>(
        getQueueToken(HEARTBEAT_QUEUE_NAME),
        { strict: false },
      );
      if (queue) {
        this.heartbeatService.setBullQueue(queue);
        this.logger.log(
          'BullMQ heartbeat queue wired to HeartbeatService successfully.',
        );
      }
    } catch {
      this.logger.log(
        'BullMQ queue not available — HeartbeatService will use direct execution.',
      );
    }

    // Schedule active heartbeat configs
    await this.heartbeatService.initSchedules();
  }
}
