import { Module, forwardRef } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AgentSyncModule } from '../agent-sync/agent-sync.module';

@Module({
  imports: [SupabaseModule, forwardRef(() => AgentSyncModule)],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
