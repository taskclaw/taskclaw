import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
