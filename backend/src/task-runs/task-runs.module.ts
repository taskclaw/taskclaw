import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { TaskRunsService } from './task-runs.service';
import { TaskRunsController } from './task-runs.controller';

/**
 * TaskRunsModule (PRD §10.1) — owns the new task_runs audit table.
 * v1 ships in dual-write shadow mode behind FEATURE_TASK_RUNS_V2; the
 * service exports the begin/transition/finish primitives that the
 * BackboneDispatchProcessor calls when the flag is on.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [TaskRunsController],
  providers: [TaskRunsService],
  exports: [TaskRunsService],
})
export class TaskRunsModule {}
