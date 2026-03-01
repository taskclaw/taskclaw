import { Module } from '@nestjs/common';
import { CommToolsController } from './comm-tools.controller';
import { CommToolsService } from './comm-tools.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';

@Module({
  imports: [SupabaseModule, AiProviderModule],
  controllers: [CommToolsController],
  providers: [CommToolsService],
  exports: [CommToolsService],
})
export class CommToolsModule {}
