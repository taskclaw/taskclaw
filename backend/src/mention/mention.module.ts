import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { MentionExpandService } from './expand.service';
import { MentionDispatchService } from './dispatch.service';

/**
 * MentionModule (PRD §7) — owns @mention expansion + dispatch side-effects.
 * Pure expand service is also useful in other contexts (rendering, search),
 * which is why it ships as a separate provider.
 */
@Module({
  imports: [SupabaseModule],
  providers: [MentionExpandService, MentionDispatchService],
  exports: [MentionExpandService, MentionDispatchService],
})
export class MentionModule {}
