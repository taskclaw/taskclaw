import {
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { plans } from '../../db/schema';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Drizzle returns camelCase columns; PostgREST returned snake_case. Callers
   * (admin/billing frontend) read `price_cents`, `is_default`, `is_hidden`,
   * `stripe_product_id`, `stripe_price_id`, etc. Re-key to the snake_case shape
   * so the response is unchanged from the PostgREST era.
   */
  private present(row: typeof plans.$inferSelect) {
    return {
      id: row.id,
      name: row.name,
      price_cents: row.priceCents,
      currency: row.currency,
      interval: row.interval,
      features: row.features,
      is_default: row.isDefault,
      is_hidden: row.isHidden,
      created_at: row.createdAt,
      stripe_price_id: row.stripePriceId,
      stripe_product_id: row.stripeProductId,
    };
  }

  /**
   * Map a free-form (snake_case) plan payload to the schema's camelCase columns.
   * Only keys present on the input are carried over, mirroring PostgREST's
   * partial-insert/partial-update behaviour. Unknown keys are dropped.
   */
  private toPlanRow(planData: any): Partial<typeof plans.$inferInsert> {
    const row: Partial<typeof plans.$inferInsert> = {};
    if (planData.name !== undefined) row.name = planData.name;
    if (planData.price_cents !== undefined)
      row.priceCents = planData.price_cents;
    if (planData.currency !== undefined) row.currency = planData.currency;
    if (planData.interval !== undefined) row.interval = planData.interval;
    if (planData.features !== undefined) row.features = planData.features;
    if (planData.is_default !== undefined) row.isDefault = planData.is_default;
    if (planData.is_hidden !== undefined) row.isHidden = planData.is_hidden;
    if (planData.stripe_price_id !== undefined)
      row.stripePriceId = planData.stripe_price_id;
    if (planData.stripe_product_id !== undefined)
      row.stripeProductId = planData.stripe_product_id;
    return row;
  }

  async getPlans(_accessToken?: string) {
    try {
      const rows = await this.db
        .select()
        .from(plans)
        .orderBy(asc(plans.priceCents));
      return rows.map((r) => this.present(r));
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async createPlan(planData: any) {
    // Step 1: Insert into DB first (plan exists even if Stripe fails)
    let plan: typeof plans.$inferSelect;
    try {
      [plan] = await this.db
        .insert(plans)
        .values(this.toPlanRow(planData) as typeof plans.$inferInsert)
        .returning();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }

    // Step 2: Sync to Stripe
    let stripe_sync_status: 'synced' | 'failed' | 'skipped' = 'skipped';
    let stripe_sync_error: string | null = null;

    if (this.stripeService.isConfigured()) {
      try {
        const result = await this.stripeService.createProductAndPrice({
          name: plan.name,
          price_cents: plan.priceCents,
          currency: plan.currency || 'usd',
          interval: plan.interval as 'month' | 'year',
          features: plan.features as string[] | undefined,
        });

        if (result) {
          // Step 3: Patch plan with Stripe IDs
          try {
            await this.db
              .update(plans)
              .set({
                stripeProductId: result.productId,
                stripePriceId: result.priceId,
              })
              .where(eq(plans.id, plan.id));

            plan.stripeProductId = result.productId;
            plan.stripePriceId = result.priceId;
            stripe_sync_status = 'synced';
          } catch (patchError: any) {
            this.logger.error(
              `Plan ${plan.id} created in Stripe but failed to save IDs: ${patchError.message}`,
            );
            stripe_sync_status = 'failed';
            stripe_sync_error =
              'Stripe product created but failed to save IDs to database';
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

    return { ...this.present(plan), stripe_sync_status, stripe_sync_error };
  }

  async updatePlan(id: string, planData: any) {
    // Step 0: Fetch existing plan to compare price/interval changes
    const [existingPlan] = await this.db
      .select()
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);

    if (!existingPlan) {
      throw new InternalServerErrorException('Plan not found');
    }

    // Step 1: Update the DB first
    let plan: typeof plans.$inferSelect;
    try {
      [plan] = await this.db
        .update(plans)
        .set(this.toPlanRow(planData))
        .where(eq(plans.id, id))
        .returning();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }

    // Step 2: Sync to Stripe
    let stripe_sync_status: 'synced' | 'failed' | 'skipped' = 'skipped';
    let stripe_sync_error: string | null = null;

    if (this.stripeService.isConfigured()) {
      try {
        if (existingPlan.stripeProductId) {
          // Product already exists in Stripe — update it
          const result = await this.stripeService.updateProductAndPrice(
            existingPlan.stripeProductId,
            existingPlan.stripePriceId,
            {
              name: plan.name,
              price_cents: plan.priceCents,
              currency: plan.currency || 'usd',
              interval: plan.interval as 'month' | 'year',
              features: plan.features as string[] | undefined,
            },
            existingPlan.priceCents,
            existingPlan.interval,
          );

          if (result && result.priceId !== existingPlan.stripePriceId) {
            // Price ID changed (price or interval was modified)
            try {
              await this.db
                .update(plans)
                .set({ stripePriceId: result.priceId })
                .where(eq(plans.id, id));

              plan.stripePriceId = result.priceId;
              stripe_sync_status = 'synced';
            } catch (patchError: any) {
              this.logger.error(
                `Plan ${id}: new Stripe price created but failed to save ID: ${patchError.message}`,
              );
              stripe_sync_status = 'failed';
              stripe_sync_error =
                'New Stripe price created but failed to save ID';
            }
          } else {
            stripe_sync_status = 'synced';
          }
        } else {
          // No Stripe product yet — create one (plan was created before Stripe was configured)
          const result = await this.stripeService.createProductAndPrice({
            name: plan.name,
            price_cents: plan.priceCents,
            currency: plan.currency || 'usd',
            interval: plan.interval as 'month' | 'year',
            features: plan.features as string[] | undefined,
          });

          if (result) {
            try {
              await this.db
                .update(plans)
                .set({
                  stripeProductId: result.productId,
                  stripePriceId: result.priceId,
                })
                .where(eq(plans.id, id));

              plan.stripeProductId = result.productId;
              plan.stripePriceId = result.priceId;
              stripe_sync_status = 'synced';
            } catch (patchError: any) {
              stripe_sync_status = 'failed';
              stripe_sync_error = 'Created in Stripe but failed to save IDs';
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

    return { ...this.present(plan), stripe_sync_status, stripe_sync_error };
  }

  async deletePlan(id: string) {
    // Fetch Stripe IDs before deletion
    const [plan] = await this.db
      .select({
        stripeProductId: plans.stripeProductId,
        stripePriceId: plans.stripePriceId,
      })
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);

    // Delete from DB
    try {
      await this.db.delete(plans).where(eq(plans.id, id));
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }

    // Archive in Stripe (fire-and-forget)
    if (plan?.stripeProductId) {
      this.stripeService
        .archiveProduct(plan.stripeProductId, plan.stripePriceId)
        .catch((err) =>
          this.logger.error(`Failed to archive Stripe product: ${err.message}`),
        );
    }

    return { success: true };
  }
}
