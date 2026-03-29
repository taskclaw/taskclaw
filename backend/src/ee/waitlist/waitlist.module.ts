import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import {
  WaitlistController,
  AdminWaitlistController,
} from './waitlist.controller';
import { SupabaseModule } from '../../supabase/supabase.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [SupabaseModule, CommonModule],
  controllers: [WaitlistController, AdminWaitlistController],
  providers: [WaitlistService],
})
export class WaitlistModule {}
