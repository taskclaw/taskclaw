import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { EmbeddingService } from './services/embedding.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, SupabaseModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, EmbeddingService],
  exports: [AiAssistantService, EmbeddingService],
})
export class AiAssistantModule {}
