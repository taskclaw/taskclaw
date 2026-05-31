import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { executionLog } from '../db/schema';

@Injectable()
export class ExecutionLogService {
  private readonly logger = new Logger(ExecutionLogService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Drizzle returns camelCase columns; the frontend ExecutionLog contract is
   * snake_case (e.g. `trigger_type`). Re-key so the cockpit timeline renders
   * (it does `log.trigger_type.toUpperCase()`).
   */
  private present(row: typeof executionLog.$inferSelect) {
    return {
      id: row.id,
      account_id: row.accountId,
      trigger_type: row.triggerType,
      status: row.status,
      pod_id: row.podId,
      board_id: row.boardId,
      task_id: row.taskId,
      dag_id: row.dagId,
      heartbeat_config_id: row.heartbeatConfigId,
      route_id: row.routeId,
      conversation_id: row.conversationId,
      summary: row.summary,
      error_details: row.errorDetails,
      duration_ms: row.durationMs,
      metadata: row.metadata,
      started_at: row.startedAt,
      completed_at: row.completedAt,
    };
  }

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
    try {
      const [row] = await this.db
        .insert(executionLog)
        .values({
          accountId: dto.account_id,
          triggerType: dto.trigger_type,
          status: dto.status,
          podId: dto.pod_id,
          boardId: dto.board_id,
          taskId: dto.task_id,
          dagId: dto.dag_id,
          heartbeatConfigId: dto.heartbeat_config_id,
          routeId: dto.route_id,
          conversationId: dto.conversation_id,
          summary: dto.summary,
          errorDetails: dto.error_details,
          durationMs: dto.duration_ms,
          metadata: dto.metadata,
          startedAt: new Date().toISOString(),
        })
        .returning();

      return row;
    } catch (error) {
      this.logger.error(
        `Failed to create execution log: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async complete(
    logId: string,
    update: {
      status: string;
      summary?: string;
      error_details?: string;
      duration_ms?: number;
    },
  ) {
    try {
      await this.db
        .update(executionLog)
        .set({
          status: update.status,
          summary: update.summary,
          errorDetails: update.error_details,
          durationMs: update.duration_ms,
          completedAt: new Date().toISOString(),
        })
        .where(eq(executionLog.id, logId));
    } catch (error) {
      this.logger.error(
        `Failed to update execution log ${logId}: ${(error as Error).message}`,
      );
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

    const conditions = [eq(executionLog.accountId, accountId)];

    if (filters?.trigger_type) {
      conditions.push(eq(executionLog.triggerType, filters.trigger_type));
    }
    if (filters?.status) {
      conditions.push(eq(executionLog.status, filters.status));
    }
    if (filters?.pod_id) {
      conditions.push(eq(executionLog.podId, filters.pod_id));
    }
    if (filters?.board_id) {
      conditions.push(eq(executionLog.boardId, filters.board_id));
    }

    try {
      const rows = await this.db
        .select()
        .from(executionLog)
        .where(and(...conditions))
        .orderBy(desc(executionLog.startedAt))
        .limit(limit)
        .offset(offset);
      return rows.map((r) => this.present(r));
    } catch (error) {
      throw new Error(
        `Failed to fetch execution logs: ${(error as Error).message}`,
      );
    }
  }
}
