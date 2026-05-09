import { Module, forwardRef, OnModuleInit, Logger } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { BackboneModule } from '../backbone/backbone.module';
import { BoardRoutingQueueModule } from './board-routing-queue.module';
import { BoardRoutingService } from './board-routing.service';
import { BoardRoutingProcessor } from './board-routing.processor';
import { CoordinatorService } from './coordinator.service';
import { DAGExecutorService } from './dag-executor.service';
import { BoardRoutingController } from './board-routing.controller';

/**
 * BoardRoutingModule (D01-D06)
 *
 * Handles board-to-board routing, goal decomposition via AI (coordinator),
 * and DAG execution for multi-step task workflows.
 *
 * BullMQ is registered conditionally via BoardRoutingQueueModule:
 * - When REDIS_URL is set: routing jobs go through BullMQ with retry.
 * - When REDIS_URL is NOT set: triggerRoute runs synchronously.
 */
@Module({
  imports: [
    SupabaseModule,
    CommonModule,
    forwardRef(() => BackboneModule),
    BoardRoutingQueueModule.register(),
  ],
  controllers: [BoardRoutingController],
  providers: [
    BoardRoutingService,
    CoordinatorService,
    DAGExecutorService,
  ],
  exports: [BoardRoutingService, CoordinatorService, DAGExecutorService],
})
export class BoardRoutingModule implements OnModuleInit {
  private readonly logger = new Logger(BoardRoutingModule.name);

  constructor(
    private readonly routingService: BoardRoutingService,
    private readonly routingProcessor: BoardRoutingProcessor,
  ) {}

  onModuleInit() {
    this.routingProcessor.setRouteCallback(
      this.routingService.triggerRoute.bind(this.routingService),
    );
    this.logger.log(
      'BoardRoutingProcessor callback wired to BoardRoutingService.',
    );
  }
}
