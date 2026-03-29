import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../supabase/supabase.service';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe | null = null;
  private readonly logger = new Logger(StripeService.name);
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (secretKey) {
      this.stripe = new Stripe(secretKey);
      this.logger.log('Stripe client initialized successfully');
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY not set – Stripe billing features are disabled. ' +
          'Set STRIPE_SECRET_KEY in your .env to enable billing.',
      );
    }
  }

  private ensureStripe(): Stripe {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.',
      );
    }
    return this.stripe;
  }

  /**
   * Create a Stripe Checkout Session for a given plan.
   */
  async createCheckoutSession(
    accountId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ sessionId: string; url: string }> {
    const stripe = this.ensureStripe();
    const supabase = this.supabaseService.getAdminClient();

    // Look up the plan to get its stripe_price_id
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      throw new InternalServerErrorException('Plan not found');
    }

    const stripePriceId = plan.stripe_price_id;
    if (!stripePriceId) {
      throw new InternalServerErrorException(
        `Plan "${plan.name}" does not have a Stripe price ID configured. ` +
          'Add a stripe_price_id to the plans table.',
      );
    }

    // Check if the account already has a Stripe customer ID
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('account_id', accountId)
      .maybeSingle();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        account_id: accountId,
        plan_id: planId,
      },
    };

    // Attach existing customer if we have one
    if (subscription?.stripe_customer_id) {
      sessionParams.customer = subscription.stripe_customer_id;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      sessionId: session.id,
      url: session.url!,
    };
  }

  /**
   * Create a Stripe Customer Portal session so the user can manage billing.
   */
  async createCustomerPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const stripe = this.ensureStripe();

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Handle incoming Stripe webhooks.
   */
  async handleWebhook(
    payload: Buffer,
    sig: string,
  ): Promise<{ received: boolean }> {
    const stripe = this.ensureStripe();

    if (!this.webhookSecret) {
      throw new InternalServerErrorException(
        'STRIPE_WEBHOOK_SECRET is not configured.',
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, sig, this.webhookSecret);
    } catch (err: any) {
      this.logger.error(
        `Webhook signature verification failed: ${err.message}`,
      );
      throw new InternalServerErrorException(
        `Webhook signature verification failed: ${err.message}`,
      );
    }

    this.logger.log(`Received Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  /**
   * Extract billing period dates from a Stripe Subscription's first item.
   * In Stripe API v2026+, current_period_start/end live on SubscriptionItem, not Subscription.
   */
  private getPeriodDates(subscription: Stripe.Subscription): {
    periodStart: string | null;
    periodEnd: string | null;
  } {
    const firstItem = subscription.items?.data?.[0];
    if (!firstItem) {
      return { periodStart: null, periodEnd: null };
    }
    return {
      periodStart: new Date(
        firstItem.current_period_start * 1000,
      ).toISOString(),
      periodEnd: new Date(firstItem.current_period_end * 1000).toISOString(),
    };
  }

  /**
   * When a checkout session completes, create or update the subscription record.
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const accountId = session.metadata?.account_id;
    const planId = session.metadata?.plan_id;
    const stripeCustomerId = session.customer as string;
    const stripeSubscriptionId = session.subscription as string;

    if (!accountId || !planId) {
      this.logger.error(
        'checkout.session.completed missing metadata (account_id or plan_id)',
      );
      return;
    }

    const stripe = this.ensureStripe();

    // Fetch the subscription details from Stripe (expand items for period dates)
    const stripeSubscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const { periodStart, periodEnd } = this.getPeriodDates(stripeSubscription);

    const supabase = this.supabaseService.getAdminClient();

    // Upsert the subscription record
    const { error } = await supabase.from('subscriptions').upsert(
      {
        account_id: accountId,
        plan_id: planId,
        status: stripeSubscription.status,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      },
      { onConflict: 'account_id' },
    );

    if (error) {
      this.logger.error(`Failed to upsert subscription: ${error.message}`);
    } else {
      this.logger.log(`Subscription created/updated for account ${accountId}`);
    }
  }

  /**
   * When a subscription is updated (e.g. plan change, renewal), update the record.
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const supabase = this.supabaseService.getAdminClient();
    const { periodStart, periodEnd } = this.getPeriodDates(subscription);

    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: subscription.status,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      })
      .eq('stripe_subscription_id', subscription.id);

    if (error) {
      this.logger.error(`Failed to update subscription: ${error.message}`);
    } else {
      this.logger.log(
        `Subscription ${subscription.id} updated to status: ${subscription.status}`,
      );
    }
  }

  /**
   * When a subscription is deleted/canceled, update the record.
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const supabase = this.supabaseService.getAdminClient();
    const { periodEnd } = this.getPeriodDates(subscription);

    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        current_period_end: periodEnd,
      })
      .eq('stripe_subscription_id', subscription.id);

    if (error) {
      this.logger.error(
        `Failed to update canceled subscription: ${error.message}`,
      );
    } else {
      this.logger.log(`Subscription ${subscription.id} marked as canceled`);
    }
  }

  // ─── Plan ↔ Stripe Product/Price Sync ───────────────────────────

  /**
   * Returns true if the Stripe client is initialized (STRIPE_SECRET_KEY is set).
   */
  isConfigured(): boolean {
    return this.stripe !== null;
  }

  /**
   * Create a Stripe Product + recurring Price for a new plan.
   * Returns { productId, priceId } or null if Stripe is not configured.
   */
  async createProductAndPrice(plan: {
    name: string;
    price_cents: number;
    currency: string;
    interval: 'month' | 'year';
    features?: string[];
  }): Promise<{ productId: string; priceId: string } | null> {
    if (!this.stripe) {
      this.logger.warn(
        'Stripe not configured – skipping product/price creation',
      );
      return null;
    }

    const product = await this.stripe.products.create({
      name: plan.name,
      description: plan.features?.length ? plan.features.join(', ') : undefined,
      metadata: { source: 'onset-dashboard' },
    });

    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: plan.price_cents,
      currency: plan.currency || 'usd',
      recurring: { interval: plan.interval },
      metadata: { source: 'onset-dashboard' },
    });

    this.logger.log(`Created Stripe Product ${product.id} + Price ${price.id}`);
    return { productId: product.id, priceId: price.id };
  }

  /**
   * Update a Stripe Product and, if the price/interval changed, create a new Price
   * and archive the old one (Stripe Prices are immutable).
   */
  async updateProductAndPrice(
    existingProductId: string,
    existingPriceId: string | null,
    plan: {
      name: string;
      price_cents: number;
      currency: string;
      interval: 'month' | 'year';
      features?: string[];
    },
    previousPriceCents: number,
    previousInterval: string,
  ): Promise<{ productId: string; priceId: string } | null> {
    if (!this.stripe) {
      this.logger.warn('Stripe not configured – skipping product/price update');
      return null;
    }

    // Update the Product (name and description are mutable)
    await this.stripe.products.update(existingProductId, {
      name: plan.name,
      description: plan.features?.length ? plan.features.join(', ') : undefined,
    });

    // Check if price or interval changed
    const priceChanged = plan.price_cents !== previousPriceCents;
    const intervalChanged = plan.interval !== previousInterval;

    if (priceChanged || intervalChanged) {
      // Archive the old price
      if (existingPriceId) {
        await this.stripe.prices.update(existingPriceId, { active: false });
        this.logger.log(`Archived old Stripe Price ${existingPriceId}`);
      }

      // Create a new price
      const newPrice = await this.stripe.prices.create({
        product: existingProductId,
        unit_amount: plan.price_cents,
        currency: plan.currency || 'usd',
        recurring: { interval: plan.interval },
        metadata: { source: 'onset-dashboard' },
      });

      this.logger.log(
        `Created new Stripe Price ${newPrice.id} for Product ${existingProductId}`,
      );
      return { productId: existingProductId, priceId: newPrice.id };
    }

    // No price change — return existing IDs
    return { productId: existingProductId, priceId: existingPriceId || '' };
  }

  /**
   * Archive a Stripe Product and its Price (set active=false).
   * Called when a plan is deleted.
   */
  async archiveProduct(
    productId: string,
    priceId: string | null,
  ): Promise<void> {
    if (!this.stripe) return;

    try {
      if (priceId) {
        await this.stripe.prices.update(priceId, { active: false });
      }
      await this.stripe.products.update(productId, { active: false });
      this.logger.log(`Archived Stripe Product ${productId}`);
    } catch (err: any) {
      this.logger.error(
        `Failed to archive Stripe product ${productId}: ${err.message}`,
      );
    }
  }
}
