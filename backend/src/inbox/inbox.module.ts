import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';

/**
 * InboxModule — single "what needs me?" surface aggregating
 * orchestration approvals, agent approval requests, DAG approvals,
 * and open mention-spawned tasks. Read-only; the UI navigates the
 * user to the existing detail surface for each kind.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
