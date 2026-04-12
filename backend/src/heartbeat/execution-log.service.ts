import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

@Injectable()
export class ExecutionLogService {
  private readonly logger = new Logger(ExecutionLogService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async create(dto: {
    account_id: string;
    trigger_type: string;
    status: string;
    pod_id?: string;
    board_id?: string;
    task_id?: string;
    dag_id?: string;
    heartbeat_config_id?: string;
    route_id?: string;
    conversation_id?: string;
    summary?: string;
    error_details?: string;
    duration_ms?: number;
    metadata?: any;
  }) {
    const { data, error } = await this.supabaseAdmin
      .getClient()
      .from('execution_log')
      .insert({
        ...dto,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create execution log: ${error.message}`);
      return null;
    }

    return data;
  }

  async complete(logId: string, update: { status: string; summary?: string; error_details?: string; duration_ms?: number; conversation_id?: string }) {
    const { error } = await this.supabaseAdmin
      .getClient()
      .from('execution_log')
      .update({
        ...update,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logId);

    if (error) {
      this.logger.error(`Failed to update execution log ${logId}: ${error.message}`);
    }
  }

  async findAll(
    accountId: string,
    filters?: {
      trigger_type?: string;
      status?: string;
      pod_id?: string;
      board_id?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    let query = this.supabaseAdmin
      .getClient()
      .from('execution_log')
      .select('*')
      .eq('account_id', accountId)
      .order('started_at', { ascending: false });

    if (filters?.trigger_type) {
      query = query.eq('trigger_type', filters.trigger_type);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.pod_id) {
      query = query.eq('pod_id', filters.pod_id);
    }
    if (filters?.board_id) {
      query = query.eq('board_id', filters.board_id);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch execution logs: ${error.message}`);
    }

    return data;
  }
}
