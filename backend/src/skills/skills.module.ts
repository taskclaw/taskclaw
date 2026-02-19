import { Module, forwardRef } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { AgentSyncModule } from '../agent-sync/agent-sync.module';

@Module({
  imports: [SupabaseModule, forwardRef(() => AgentSyncModule)],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
