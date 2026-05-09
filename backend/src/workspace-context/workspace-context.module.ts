import { Module } from '@nestjs/common';
import { WorkspaceContextService } from './workspace-context.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [WorkspaceContextService],
  exports: [WorkspaceContextService],
})
export class WorkspaceContextModule {}
