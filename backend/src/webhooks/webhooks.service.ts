import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

@Injectable()
export class WebhooksService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private getClient() {
    return this.supabaseAdmin.getClient();
  }

  async findAll(accountId: string) {
    const { data, error } = await this.getClient()
      .from('webhooks')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list webhooks: ${error.message}`);
    return data;
  }

  async create(
    accountId: string,
    body: { url: string; secret: string; events: string[]; active?: boolean },
  ) {
    const { data, error } = await this.getClient()
      .from('webhooks')
      .insert({
        account_id: accountId,
        url: body.url,
        secret: body.secret,
        events: body.events,
        active: body.active ?? true,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create webhook: ${error.message}`);
    return data;
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
    const { data, error } = await this.getClient()
      .from('webhooks')
      .update(body)
      .eq('id', webhookId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) throw new NotFoundException('Webhook not found');
    return data;
  }

  async remove(accountId: string, webhookId: string) {
    const { error } = await this.getClient()
      .from('webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('account_id', accountId);

    if (error) throw new NotFoundException('Webhook not found');
    return { success: true };
  }

  async getDeliveries(accountId: string, webhookId: string) {
    // Verify the webhook belongs to the account
    const { data: webhook, error: whError } = await this.getClient()
      .from('webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('account_id', accountId)
      .single();

    if (whError || !webhook) throw new NotFoundException('Webhook not found');

    const { data, error } = await this.getClient()
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(`Failed to list deliveries: ${error.message}`);
    return data;
  }
}
