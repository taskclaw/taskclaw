import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  async getPlans(accessToken?: string) {
    const supabase = this.supabaseService.getClient(accessToken);

    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('price_cents', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async createPlan(planData: any) {
    const supabase = this.supabaseService.getAdminClient();

    // Step 1: Insert into DB first (plan exists even if Stripe fails)
    const { data: plan, error } = await supabase
      .from('plans')
      .insert(planData)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    // Step 2: Sync to Stripe
    let stripe_sync_status: 'synced' | 'failed' | 'skipped' = 'skipped';
    let stripe_sync_error: string | null = null;

    if (this.stripeService.isConfigured()) {
      try {
        const result = await this.stripeService.createProductAndPrice({
          name: plan.name,
          price_cents: plan.price_cents,
          currency: plan.currency || 'usd',
          interval: plan.interval,
          features: plan.features,
        });

        if (result) {
          // Step 3: Patch plan with Stripe IDs
          const { error: patchError } = await supabase
            .from('plans')
            .update({
              stripe_product_id: result.productId,
              stripe_price_id: result.priceId,
            })
            .eq('id', plan.id);

          if (patchError) {
            this.logger.error(
              `Plan ${plan.id} created in Stripe but failed to save IDs: ${patchError.message}`,
            );
            stripe_sync_status = 'failed';
            stripe_sync_error =
              'Stripe product created but failed to save IDs to database';
          } else {
            plan.stripe_product_id = result.productId;
            plan.stripe_price_id = result.priceId;
            stripe_sync_status = 'synced';
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to create Stripe product for plan ${plan.id}: ${err.message}`,
        );
        stripe_sync_status = 'failed';
        stripe_sync_error = err.message;
      }
    }

    return { ...plan, stripe_sync_status, stripe_sync_error };
  }

  async updatePlan(id: string, planData: any) {
    const supabase = this.supabaseService.getAdminClient();

    // Step 0: Fetch existing plan to compare price/interval changes
    const { data: existingPlan, error: fetchError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingPlan) {
      throw new InternalServerErrorException(
        fetchError?.message || 'Plan not found',
      );
    }

    // Step 1: Update the DB first
    const { data: plan, error } = await supabase
      .from('plans')
      .update(planData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    // Step 2: Sync to Stripe
    let stripe_sync_status: 'synced' | 'failed' | 'skipped' = 'skipped';
    let stripe_sync_error: string | null = null;

    if (this.stripeService.isConfigured()) {
      try {
        if (existingPlan.stripe_product_id) {
          // Product already exists in Stripe — update it
          const result = await this.stripeService.updateProductAndPrice(
            existingPlan.stripe_product_id,
            existingPlan.stripe_price_id,
            {
              name: plan.name,
              price_cents: plan.price_cents,
              currency: plan.currency || 'usd',
              interval: plan.interval,
              features: plan.features,
            },
            existingPlan.price_cents,
            existingPlan.interval,
          );

          if (result && result.priceId !== existingPlan.stripe_price_id) {
            // Price ID changed (price or interval was modified)
            const { error: patchError } = await supabase
              .from('plans')
              .update({ stripe_price_id: result.priceId })
              .eq('id', id);

            if (patchError) {
              this.logger.error(
                `Plan ${id}: new Stripe price created but failed to save ID: ${patchError.message}`,
              );
              stripe_sync_status = 'failed';
              stripe_sync_error =
                'New Stripe price created but failed to save ID';
            } else {
              plan.stripe_price_id = result.priceId;
              stripe_sync_status = 'synced';
            }
          } else {
            stripe_sync_status = 'synced';
          }
        } else {
          // No Stripe product yet — create one (plan was created before Stripe was configured)
          const result = await this.stripeService.createProductAndPrice({
            name: plan.name,
            price_cents: plan.price_cents,
            currency: plan.currency || 'usd',
            interval: plan.interval,
            features: plan.features,
          });

          if (result) {
            const { error: patchError } = await supabase
              .from('plans')
              .update({
                stripe_product_id: result.productId,
                stripe_price_id: result.priceId,
              })
              .eq('id', id);

            if (patchError) {
              stripe_sync_status = 'failed';
              stripe_sync_error = 'Created in Stripe but failed to save IDs';
            } else {
              plan.stripe_product_id = result.productId;
              plan.stripe_price_id = result.priceId;
              stripe_sync_status = 'synced';
            }
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to sync plan ${id} to Stripe: ${err.message}`,
        );
        stripe_sync_status = 'failed';
        stripe_sync_error = err.message;
      }
    }

    return { ...plan, stripe_sync_status, stripe_sync_error };
  }

  async deletePlan(id: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Fetch Stripe IDs before deletion
    const { data: plan } = await supabase
      .from('plans')
      .select('stripe_product_id, stripe_price_id')
      .eq('id', id)
      .single();

    // Delete from DB
    const { error } = await supabase.from('plans').delete().eq('id', id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    // Archive in Stripe (fire-and-forget)
    if (plan?.stripe_product_id) {
      this.stripeService
        .archiveProduct(plan.stripe_product_id, plan.stripe_price_id)
        .catch((err) =>
          this.logger.error(`Failed to archive Stripe product: ${err.message}`),
        );
    }

    return { success: true };
  }
}
