import { Module, forwardRef } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { SyncModule } from '../sync/sync.module';
import { AdaptersModule } from '../adapters/adapters.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { BoardRoutingModule } from '../board-routing/board-routing.module';

@Module({
  imports: [
    SupabaseModule,
    CommonModule,
    SyncModule,
    AdaptersModule,
    forwardRef(() => ConversationsModule),
    forwardRef(() => BoardRoutingModule),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
