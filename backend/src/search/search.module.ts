import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';

@Module({
  imports: [SupabaseModule, AiAssistantModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
