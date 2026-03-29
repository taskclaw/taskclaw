import {
  Controller,
  Post,
  Body,
  Req,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { StripeService } from './stripe.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { SupabaseService } from '../../supabase/supabase.service';

@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * POST /stripe/checkout
   * Creates a Stripe Checkout Session for the authenticated user's account.
   */
  @Post('checkout')
  @UseGuards(AuthGuard)
  async createCheckoutSession(
    @Body()
    body: {
      planId: string;
      accountId: string;
      successUrl: string;
      cancelUrl: string;
    },
    @Req() req: any,
  ) {
    const { planId, accountId, successUrl, cancelUrl } = body;

    if (!planId || !accountId || !successUrl || !cancelUrl) {
      throw new BadRequestException(
        'planId, accountId, successUrl, and cancelUrl are required',
      );
    }

    return this.stripeService.createCheckoutSession(
      accountId,
      planId,
      successUrl,
      cancelUrl,
    );
  }

  /**
   * POST /stripe/portal
   * Creates a Stripe Customer Portal session for the authenticated user's account.
   */
  @Post('portal')
  @UseGuards(AuthGuard)
  async createPortalSession(
    @Body() body: { accountId: string; returnUrl: string },
    @Req() req: any,
  ) {
    const { accountId, returnUrl } = body;

    if (!accountId || !returnUrl) {
      throw new BadRequestException('accountId and returnUrl are required');
    }

    const token = req.headers.authorization?.split(' ')[1];
    const supabase = this.supabaseService.getClient(token);

    // Look up the subscription to get the Stripe customer ID
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('account_id', accountId)
      .single();

    if (error || !subscription?.stripe_customer_id) {
      throw new BadRequestException(
        'No active Stripe subscription found for this account. ' +
          'Please subscribe to a plan first.',
      );
    }

    return this.stripeService.createCustomerPortalSession(
      subscription.stripe_customer_id,
      returnUrl,
    );
  }

  /**
   * POST /stripe/webhook
   * Handles incoming Stripe webhooks.
   * NOT authenticated – uses raw body + Stripe signature for verification.
   */
  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') sig: string,
    @Req() req: any,
  ) {
    const rawBody: Buffer | undefined = req.rawBody;

    if (!rawBody) {
      throw new BadRequestException(
        'Missing raw body. Ensure rawBody is enabled in NestFactory.create().',
      );
    }

    if (!sig) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    return this.stripeService.handleWebhook(rawBody, sig);
  }
}
