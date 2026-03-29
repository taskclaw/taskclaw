import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [SupabaseModule, StripeModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
