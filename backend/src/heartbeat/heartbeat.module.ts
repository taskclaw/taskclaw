import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
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
import { BackboneModule } from '../backbone/backbone.module';
import { BackboneDispatchProcessor } from '../backbone/backbone-dispatch.processor';
import { BACKBONE_DISPATCH_QUEUE_NAME } from '../backbone/backbone-dispatch-queue.module';

/**
 * HeartbeatModule (A01-A05)
 *
 * Scheduled autonomy system that periodically scans pending tasks and takes action.
 * Uses BullMQ for cron-like scheduling when Redis is available,
 * falls back to manual-trigger-only mode otherwise.
 *
 * B7: Routes heartbeat execution through backbone-dispatch queue for concurrency control.
 */
@Module({
  imports: [
    SupabaseModule,
    CommonModule,
    HeartbeatQueueModule.register(),
    forwardRef(() => BackboneModule),
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
    // Wire heartbeat processor callback to executeHeartbeat
    // (which now enqueues to backbone-dispatch when available)
    this.heartbeatProcessor.setHeartbeatCallback(
      this.heartbeatService.executeHeartbeat.bind(this.heartbeatService),
    );

    // Try to inject the heartbeat BullMQ queue into the heartbeat service
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
        'BullMQ heartbeat queue not available — HeartbeatService will use direct execution.',
      );
    }

    // B7: Try to inject backbone-dispatch queue into HeartbeatService
    try {
      const backboneDispatchQueue = this.moduleRef.get<Queue>(
        getQueueToken(BACKBONE_DISPATCH_QUEUE_NAME),
        { strict: false },
      );
      if (backboneDispatchQueue) {
        this.heartbeatService.setBackboneDispatchQueue(backboneDispatchQueue);
        this.logger.log(
          'Backbone dispatch queue wired to HeartbeatService (B7).',
        );
      }
    } catch {
      this.logger.log(
        'Backbone dispatch queue not available — heartbeat will execute directly.',
      );
    }

    // B7: Wire executeHeartbeatCore callback to BackboneDispatchProcessor
    try {
      const backboneDispatchProcessor = this.moduleRef.get<BackboneDispatchProcessor>(
        BackboneDispatchProcessor,
        { strict: false },
      );
      if (backboneDispatchProcessor) {
        backboneDispatchProcessor.setExecuteHeartbeatCallback(
          this.heartbeatService.executeHeartbeatCore.bind(this.heartbeatService),
        );
        this.logger.log(
          'executeHeartbeatCore wired to BackboneDispatchProcessor (B7).',
        );
      }
    } catch {
      this.logger.log(
        'BackboneDispatchProcessor not available — heartbeat core callback not wired.',
      );
    }

    // Schedule active heartbeat configs
    await this.heartbeatService.initSchedules();
  }
}
