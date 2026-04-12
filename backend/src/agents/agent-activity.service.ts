import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

export type AgentActivityType =
  | 'task_completed'
  | 'task_failed'
  | 'task_assigned'
  | 'conversation_reply'
  | 'dag_created'
  | 'route_triggered'
  | 'status_changed'
  | 'error';

export interface RecordActivityOptions {
  accountId: string;
  agentId: string;
  activityType: AgentActivityType;
  summary: string;
  taskId?: string;
  dagId?: string;
  conversationId?: string;
  boardId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * AgentActivityService — records activity events for agents.
 * Called from DAGExecutorService, TasksService, ConversationsService, etc.
 */
@Injectable()
export class AgentActivityService {
  private readonly logger = new Logger(AgentActivityService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  /**
   * Record a single activity event. Non-throwing — logs errors instead.
   */
  async record(opts: RecordActivityOptions): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    const { error } = await client.from('agent_activity').insert({
      account_id: opts.accountId,
      agent_id: opts.agentId,
      activity_type: opts.activityType,
      summary: opts.summary,
      task_id: opts.taskId ?? null,
      dag_id: opts.dagId ?? null,
      conversation_id: opts.conversationId ?? null,
      board_id: opts.boardId ?? null,
      metadata: opts.metadata ?? {},
    });

    if (error) {
      this.logger.error(
        `[AgentActivityService] Failed to record activity (${opts.activityType}) for agent ${opts.agentId}: ${error.message}`,
      );
    }
  }

  /**
   * Get paginated activity feed for an agent.
   */
  async getActivity(
    accountId: string,
    agentId: string,
    page = 1,
    limit = 20,
  ) {
    const client = this.supabaseAdmin.getClient();
    const offset = (page - 1) * limit;

    const { data, error, count } = await client
      .from('agent_activity')
      .select('*', { count: 'exact' })
      .eq('account_id', accountId)
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch agent activity: ${error.message}`);
    }

    return {
      data: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }
}
