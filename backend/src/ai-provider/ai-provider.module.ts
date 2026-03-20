import { Module, forwardRef } from '@nestjs/common';
import { AiProviderController } from './ai-provider.controller';
import { AiProviderService } from './ai-provider.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [SupabaseModule, CommonModule, forwardRef(() => ConversationsModule)],
  controllers: [AiProviderController],
  providers: [AiProviderService],
  exports: [AiProviderService], // Export for use in ConversationsModule
})
export class AiProviderModule {}
