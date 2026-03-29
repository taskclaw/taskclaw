import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import {
  ProjectsController,
  AccountProjectsController,
} from './projects.controller';
import { AdminProjectsController } from './admin-projects.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';

@Module({
  imports: [SupabaseModule, CommonModule, AiAssistantModule],
  controllers: [
    ProjectsController,
    AccountProjectsController,
    AdminProjectsController,
  ],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
