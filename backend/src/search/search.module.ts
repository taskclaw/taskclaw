import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';

@Module({
  imports: [ AiAssistantModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
