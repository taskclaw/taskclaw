import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { and, eq, desc } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { webhooks, webhookDeliveries } from '../db/schema';
import { snakeKeys } from '../common/utils/snake-keys.util';

@Injectable()
export class WebhooksService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findAll(accountId: string) {
    const rows = await this.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.accountId, accountId))
      .orderBy(desc(webhooks.createdAt));
    return rows.map(snakeKeys);
  }

  async create(
    accountId: string,
    body: { url: string; secret: string; events: string[]; active?: boolean },
  ) {
    const [row] = await this.db
      .insert(webhooks)
      .values({
        accountId,
        url: body.url,
        secret: body.secret,
        events: body.events,
        active: body.active ?? true,
      })
      .returning();
    return snakeKeys(row);
  }

  async update(
    accountId: string,
    webhookId: string,
    body: {
      url?: string;
      secret?: string;
      events?: string[];
      active?: boolean;
    },
  ) {
    const [row] = await this.db
      .update(webhooks)
      .set(body)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.accountId, accountId)))
      .returning();
    if (!row) throw new NotFoundException('Webhook not found');
    return snakeKeys(row);
  }

  async remove(accountId: string, webhookId: string) {
    await this.db
      .delete(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.accountId, accountId)));
    return { success: true };
  }

  async getDeliveries(accountId: string, webhookId: string) {
    // Verify the webhook belongs to the account
    const [webhook] = await this.db
      .select({ id: webhooks.id })
      .from(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.accountId, accountId)))
      .limit(1);

    if (!webhook) throw new NotFoundException('Webhook not found');

    const rows = await this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(50);
    return rows.map(snakeKeys);
  }
}
