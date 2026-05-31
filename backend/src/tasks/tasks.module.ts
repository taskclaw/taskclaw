import { Module, forwardRef } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { CommonModule } from '../common/common.module';
import { SyncModule } from '../sync/sync.module';
import { AdaptersModule } from '../adapters/adapters.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { BoardRoutingModule } from '../board-routing/board-routing.module';
import { HeartbeatModule } from '../heartbeat/heartbeat.module';
import { MentionModule } from '../mention/mention.module';

@Module({
  imports: [
    CommonModule,
    SyncModule,
    AdaptersModule,
    forwardRef(() => ConversationsModule),
    forwardRef(() => BoardRoutingModule),
    forwardRef(() => HeartbeatModule),
    MentionModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
