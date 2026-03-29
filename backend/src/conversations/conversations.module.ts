import { Module, forwardRef } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { OpenClawService } from './openclaw.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SkillsModule } from '../skills/skills.module';
import { AdaptersModule } from '../adapters/adapters.module';
import { AgentSyncModule } from '../agent-sync/agent-sync.module';

import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    SupabaseModule,
    CommonModule,
    forwardRef(() => AiProviderModule),
    forwardRef(() => KnowledgeModule),
    forwardRef(() => SkillsModule),
    AdaptersModule,
    forwardRef(() => AgentSyncModule),
    IntegrationsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, OpenClawService],
  exports: [ConversationsService, OpenClawService],
})
export class ConversationsModule {}
