import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [StripeController],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
