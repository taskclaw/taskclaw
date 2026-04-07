import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async findAll(accountId: string) {
    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('integration_tools')
      .select('*')
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch integration tools: ${error.message}`);
    }

    return data;
  }

  async findOne(accountId: string, toolId: string) {
    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('integration_tools')
      .select('*')
      .eq('id', toolId)
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .single();

    if (error || !data) {
      throw new Error(`Integration tool ${toolId} not found`);
    }

    return data;
  }

  async buildToolContext(
    accountId: string,
    requiredTools: string[],
  ): Promise<any[]> {
    if (!requiredTools.length) return [];

    const { data: tools } = await this.supabaseAdmin
      .getClient()
      .from('integration_tools')
      .select('*')
      .in('name', requiredTools)
      .or(`account_id.eq.${accountId},account_id.is.null`);

    return (tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      endpoint: t.endpoint_template,
      method: t.http_method,
      auth: t.auth_header_name
        ? {
            header: t.auth_header_name,
            credential_key: t.auth_credential_key,
          }
        : undefined,
      input_schema: t.request_body_schema,
    }));
  }
}
