import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { SyncsService } from './syncs.service';
import { SyncsController } from './syncs.controller';
import { SyncsScheduler } from './syncs.scheduler';
import { SkillsLocalFolderRunner } from './runners/skills-local-folder.runner';

/**
 * SyncsModule (PRD F1)
 *
 * Inbound content ingestion. A Sync is a recurring, idempotent job that
 * pulls content (skills, knowledge, pods) from a source (local folder,
 * git repo, marketplace, ...) into TaskClaw's catalog so users can use
 * it inside Pods.
 *
 * Runners self-register at OnModuleInit by calling
 * SyncsService.registerRunner(this). Add more runners by simply listing
 * them in `providers` here.
 */
@Module({
  imports: [SupabaseModule, CommonModule],
  controllers: [SyncsController],
  providers: [SyncsService, SyncsScheduler, SkillsLocalFolderRunner],
  exports: [SyncsService],
})
export class SyncsModule {}
