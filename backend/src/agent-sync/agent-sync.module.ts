import { Module, forwardRef } from '@nestjs/common';
import { AgentSyncService } from './agent-sync.service';
import { AgentCompilerService } from './agent-compiler.service';
import { OpenClawRpcClient } from './openclaw-rpc.client';
import { AgentSyncController } from './agent-sync.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => AiProviderModule),
    forwardRef(() => KnowledgeModule),
    forwardRef(() => SkillsModule),
  ],
  controllers: [AgentSyncController],
  providers: [AgentSyncService, AgentCompilerService, OpenClawRpcClient],
  exports: [AgentSyncService, OpenClawRpcClient],
})
export class AgentSyncModule {}
