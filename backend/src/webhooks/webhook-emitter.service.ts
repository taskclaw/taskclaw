import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { webhooks, webhookDeliveries } from '../db/schema';

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 5000; // 5s, 25s, 125s

@Injectable()
export class WebhookEmitterService {
  private readonly logger = new Logger(WebhookEmitterService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Emit a webhook event. Finds all matching webhooks for the account/event
   * and delivers the payload asynchronously.
   */
  async emit(
    accountId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    try {
      const matchedWebhooks = await this.db
        .select({
          id: webhooks.id,
          url: webhooks.url,
          secret: webhooks.secret,
          events: webhooks.events,
        })
        .from(webhooks)
        .where(
          and(eq(webhooks.accountId, accountId), eq(webhooks.active, true)),
        );

      if (!matchedWebhooks.length) return;

      const matching = matchedWebhooks.filter(
        (wh) => wh.events.includes(event) || wh.events.includes('*'),
      );

      for (const webhook of matching) {
        // Fire and forget — don't block the caller
        this.deliver(webhook, event, payload).catch((err) => {
          this.logger.error(
            `Webhook delivery failed for ${webhook.id}: ${err.message}`,
          );
        });
      }
    } catch (err) {
      this.logger.error(
        `Webhook emit error for event ${event}: ${(err as Error).message}`,
      );
    }
  }

  private async deliver(
    webhook: { id: string; url: string; secret: string },
    event: string,
    payload: Record<string, unknown>,
    attempt = 1,
  ) {
    const body = JSON.stringify({
      event,
      payload,
      timestamp: new Date().toISOString(),
    });
    const signature = createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');

    // Create delivery record
    const [delivery] = await this.db
      .insert(webhookDeliveries)
      .values({
        webhookId: webhook.id,
        event,
        payload: { event, payload },
        status: 'pending',
        attempts: attempt,
      })
      .returning({ id: webhookDeliveries.id });

    const deliveryId = delivery?.id;

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      const responseBody = await res.text().catch(() => '');

      if (res.ok) {
        if (deliveryId) {
          await this.db
            .update(webhookDeliveries)
            .set({
              status: 'success',
              responseCode: res.status,
              responseBody: responseBody.substring(0, 1000),
              attempts: attempt,
            })
            .where(eq(webhookDeliveries.id, deliveryId));
        }
      } else {
        throw new Error(
          `HTTP ${res.status}: ${responseBody.substring(0, 200)}`,
        );
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      this.logger.warn(
        `Webhook delivery attempt ${attempt}/${MAX_ATTEMPTS} failed for ${webhook.id}: ${errMsg}`,
      );

      if (deliveryId) {
        const nextRetry =
          attempt < MAX_ATTEMPTS
            ? new Date(
                Date.now() + BACKOFF_BASE_MS * Math.pow(5, attempt - 1),
              ).toISOString()
            : null;

        await this.db
          .update(webhookDeliveries)
          .set({
            status: attempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
            responseBody: errMsg.substring(0, 1000),
            attempts: attempt,
            nextRetryAt: nextRetry,
          })
          .where(eq(webhookDeliveries.id, deliveryId));
      }

      // Retry with exponential backoff
      if (attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_BASE_MS * Math.pow(5, attempt - 1);
        setTimeout(() => {
          this.deliver(webhook, event, payload, attempt + 1).catch(() => {});
        }, delay);
      }
    }
  }
}
