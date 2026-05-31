import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [ StripeModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
