import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 5000; // 5s, 25s, 125s

@Injectable()
export class WebhookEmitterService {
  private readonly logger = new Logger(WebhookEmitterService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private getClient() {
    return this.supabaseAdmin.getClient();
  }

  /**
   * Emit a webhook event. Finds all matching webhooks for the account/event
   * and delivers the payload asynchronously.
   */
  async emit(accountId: string, event: string, payload: Record<string, unknown>) {
    try {
      const { data: webhooks, error } = await this.getClient()
        .from('webhooks')
        .select('id, url, secret, events')
        .eq('account_id', accountId)
        .eq('active', true);

      if (error || !webhooks?.length) return;

      const matching = webhooks.filter(
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
      this.logger.error(`Webhook emit error for event ${event}: ${(err as Error).message}`);
    }
  }

  private async deliver(
    webhook: { id: string; url: string; secret: string },
    event: string,
    payload: Record<string, unknown>,
    attempt = 1,
  ) {
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');

    // Create delivery record
    const { data: delivery } = await this.getClient()
      .from('webhook_deliveries')
      .insert({
        webhook_id: webhook.id,
        event,
        payload: { event, payload },
        status: 'pending',
        attempts: attempt,
      })
      .select('id')
      .single();

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
          await this.getClient()
            .from('webhook_deliveries')
            .update({
              status: 'success',
              response_code: res.status,
              response_body: responseBody.substring(0, 1000),
              attempts: attempt,
            })
            .eq('id', deliveryId);
        }
      } else {
        throw new Error(`HTTP ${res.status}: ${responseBody.substring(0, 200)}`);
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      this.logger.warn(
        `Webhook delivery attempt ${attempt}/${MAX_ATTEMPTS} failed for ${webhook.id}: ${errMsg}`,
      );

      if (deliveryId) {
        const nextRetry =
          attempt < MAX_ATTEMPTS
            ? new Date(Date.now() + BACKOFF_BASE_MS * Math.pow(5, attempt - 1)).toISOString()
            : null;

        await this.getClient()
          .from('webhook_deliveries')
          .update({
            status: attempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
            response_body: errMsg.substring(0, 1000),
            attempts: attempt,
            next_retry_at: nextRetry,
          })
          .eq('id', deliveryId);
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
