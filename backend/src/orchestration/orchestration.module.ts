import { Module, forwardRef, OnModuleInit, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { HeartbeatModule } from '../heartbeat/heartbeat.module';
import { BackboneModule } from '../backbone/backbone.module';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { DagTaskDispatcher } from './dag-task-dispatcher.service';
import { StaleTaskReconcilerService } from './stale-task-reconciler.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { BackboneDispatchProcessor } from '../backbone/backbone-dispatch.processor';
import { BACKBONE_DISPATCH_QUEUE_NAME } from '../backbone/backbone-dispatch-queue.module';

@Module({
  imports: [
    SupabaseModule,
    CommonModule,
    HeartbeatModule,
    forwardRef(() => BackboneModule),
    WebhooksModule,
  ],
  controllers: [OrchestrationController],
  providers: [OrchestrationService, DagTaskDispatcher, StaleTaskReconcilerService],
  exports: [OrchestrationService, DagTaskDispatcher, StaleTaskReconcilerService],
})
export class OrchestrationModule implements OnModuleInit {
  private readonly logger = new Logger(OrchestrationModule.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly dagTaskDispatcher: DagTaskDispatcher,
    private readonly staleTaskReconciler: StaleTaskReconcilerService,
  ) {}

  async onModuleInit() {
    // B6: Wire backbone-dispatch queue to DagTaskDispatcher
    try {
      const backboneDispatchQueue = this.moduleRef.get<Queue>(
        getQueueToken(BACKBONE_DISPATCH_QUEUE_NAME),
        { strict: false },
      );
      if (backboneDispatchQueue) {
        this.dagTaskDispatcher.setBackboneDispatchQueue(backboneDispatchQueue);
        this.logger.log(
          'Backbone dispatch queue wired to DagTaskDispatcher (B6).',
        );
      }
    } catch {
      this.logger.log(
        'Backbone dispatch queue not available — DagTaskDispatcher will dispatch directly.',
      );
    }

    // B5: Wire backbone-dispatch queue to StaleTaskReconcilerService
    try {
      const backboneDispatchQueue = this.moduleRef.get<Queue>(
        getQueueToken(BACKBONE_DISPATCH_QUEUE_NAME),
        { strict: false },
      );
      if (backboneDispatchQueue) {
        this.staleTaskReconciler.setBackboneDispatchQueue(backboneDispatchQueue);
        this.logger.log(
          'Backbone dispatch queue wired to StaleTaskReconcilerService (B5).',
        );
      }
    } catch {
      this.logger.log(
        'Backbone dispatch queue not available — StaleTaskReconcilerService will mark tasks failed.',
      );
    }

    // B6: Wire dispatchTask callback to BackboneDispatchProcessor
    try {
      const backboneDispatchProcessor = this.moduleRef.get<BackboneDispatchProcessor>(
        BackboneDispatchProcessor,
        { strict: false },
      );
      if (backboneDispatchProcessor) {
        backboneDispatchProcessor.setDispatchTaskCallback(
          this.dagTaskDispatcher.dispatchTask.bind(this.dagTaskDispatcher),
        );
        this.logger.log(
          'dispatchTask wired to BackboneDispatchProcessor (B6).',
        );
      }
    } catch {
      this.logger.log(
        'BackboneDispatchProcessor not available — dispatchTask callback not wired.',
      );
    }
  }
}
