import { Module, forwardRef } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { BackboneModule } from '../backbone/backbone.module';
import { TasksModule } from '../tasks/tasks.module';
import { BoardRoutingModule } from '../board-routing/board-routing.module';
import { PilotService } from './pilot.service';
import { PilotController } from './pilot.controller';

/**
 * PilotModule (BE15)
 *
 * Pod-level and workspace-level AI coordinator agent.
 * Reads boards + tasks, calls backbone, executes actions (create/move tasks, decompose goals).
 */
@Module({
  imports: [
    SupabaseModule,
    CommonModule,
    forwardRef(() => BackboneModule),
    forwardRef(() => TasksModule),
    forwardRef(() => BoardRoutingModule),
  ],
  controllers: [PilotController],
  providers: [PilotService],
  exports: [PilotService],
})
export class PilotModule {}
