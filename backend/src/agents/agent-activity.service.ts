import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { agentActivity } from '../db/schema';

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

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Record a single activity event. Non-throwing — logs errors instead.
   */
  async record(opts: RecordActivityOptions): Promise<void> {
    try {
      await this.db.insert(agentActivity).values({
        accountId: opts.accountId,
        agentId: opts.agentId,
        activityType: opts.activityType,
        summary: opts.summary,
        taskId: opts.taskId ?? null,
        dagId: opts.dagId ?? null,
        conversationId: opts.conversationId ?? null,
        boardId: opts.boardId ?? null,
        metadata: opts.metadata ?? {},
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[AgentActivityService] Failed to record activity (${opts.activityType}) for agent ${opts.agentId}: ${message}`,
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
    const offset = (page - 1) * limit;

    const where = and(
      eq(agentActivity.accountId, accountId),
      eq(agentActivity.agentId, agentId),
    );

    const [data, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(agentActivity)
        .where(where)
        .orderBy(desc(agentActivity.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(agentActivity)
        .where(where),
    ]);

    return {
      data: data ?? [],
      pagination: {
        page,
        limit,
        total: total ?? 0,
        totalPages: Math.ceil((total ?? 0) / limit),
      },
    };
  }
}
