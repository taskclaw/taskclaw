import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { taskRuns } from '../db/schema';
import { snakeKeys } from '../common/utils/snake-keys.util';

export type TaskRunStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskRunTrigger =
  | 'manual'
  | 'autopilot'
  | 'mention'
  | 'heartbeat'
  | 'dag'
  | 'schedule';

export type TaskRunFailureReason =
  | 'agent_error'
  | 'timeout'
  | 'runtime_offline'
  | 'manual'
  | 'circuit_open'
  | 'invalid_input'
  | 'tool_error'
  | 'other';

export interface BeginRunInput {
  account_id: string;
  task_id?: string | null;
  orchestrated_task_id?: string | null;
  pod_id?: string | null;
  agent_id?: string | null;
  trigger: TaskRunTrigger;
  attempt?: number;
  max_attempts?: number;
  parent_run_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FinishRunInput {
  run_id: string;
  status: 'completed' | 'failed' | 'cancelled';
  failure_reason?: TaskRunFailureReason | null;
  failure_message?: string | null;
  result?: unknown;
}

const FEATURE_FLAG_ENV = 'FEATURE_TASK_RUNS_V2';

/**
 * TaskRunsService — Postgres-backed audit log for task execution
 * (PRD §10.1). v1 ships in DUAL-WRITE mode behind FEATURE_TASK_RUNS_V2:
 * BullMQ remains the trigger and source of truth for retries; this
 * service writes a parallel row per run so we can validate the table
 * shape and dashboards without changing orchestration logic.
 *
 * The service is safe-by-default — every public method returns gracefully
 * (returns null) when the feature flag is off, so adding a callsite
 * never breaks production.
 */
@Injectable()
export class TaskRunsService {
  private readonly logger = new Logger(TaskRunsService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  isEnabled(): boolean {
    return process.env[FEATURE_FLAG_ENV] === 'true';
  }

  /**
   * Insert a run row in 'queued' state. Returns the row id (or null when
   * the feature flag is off — callers must tolerate that).
   */
  async begin(input: BeginRunInput): Promise<string | null> {
    if (!this.isEnabled()) return null;
    try {
      const [row] = await this.db
        .insert(taskRuns)
        .values({
          accountId: input.account_id,
          taskId: input.task_id ?? null,
          orchestratedTaskId: input.orchestrated_task_id ?? null,
          podId: input.pod_id ?? null,
          agentId: input.agent_id ?? null,
          status: 'queued',
          attempt: input.attempt ?? 1,
          maxAttempts: input.max_attempts ?? 2,
          parentRunId: input.parent_run_id ?? null,
          trigger: input.trigger,
          metadata: input.metadata ?? {},
        })
        .returning({ id: taskRuns.id });
      if (!row) {
        this.logger.warn(`task_runs begin failed: unknown`);
        return null;
      }
      return row.id;
    } catch (e) {
      this.logger.warn(
        `task_runs begin failed: ${(e as Error)?.message ?? 'unknown'}`,
      );
      return null;
    }
  }

  /** Transition queued → dispatched/running. No-op when flag is off. */
  async transitionTo(
    runId: string | null,
    status: 'dispatched' | 'running',
  ): Promise<void> {
    if (!runId || !this.isEnabled()) return;
    const update: Partial<typeof taskRuns.$inferInsert> = { status };
    if (status === 'running') update.startedAt = new Date().toISOString();
    try {
      await this.db.update(taskRuns).set(update).where(eq(taskRuns.id, runId));
    } catch (e) {
      this.logger.warn(`task_runs transition failed: ${(e as Error).message}`);
    }
  }

  /** Finalize a run with result + duration. No-op when flag is off. */
  async finish(input: FinishRunInput): Promise<void> {
    if (!input.run_id || !this.isEnabled()) return;
    const [existing] = await this.db
      .select({
        startedAt: taskRuns.startedAt,
        createdAt: taskRuns.createdAt,
      })
      .from(taskRuns)
      .where(eq(taskRuns.id, input.run_id))
      .limit(1);
    const startedAt = existing?.startedAt
      ? new Date(existing.startedAt).getTime()
      : existing?.createdAt
        ? new Date(existing.createdAt).getTime()
        : null;
    const finishedAt = Date.now();
    const duration = startedAt ? Math.max(0, finishedAt - startedAt) : null;

    try {
      await this.db
        .update(taskRuns)
        .set({
          status: input.status,
          failureReason: input.failure_reason ?? null,
          failureMessage: input.failure_message ?? null,
          result: input.result ?? null,
          finishedAt: new Date(finishedAt).toISOString(),
          durationMs: duration,
        })
        .where(eq(taskRuns.id, input.run_id));
    } catch (e) {
      this.logger.warn(`task_runs finish failed: ${(e as Error).message}`);
    }
  }

  // ============================================================
  // Read APIs
  // ============================================================

  async listForAccount(accountId: string, limit = 50) {
    const rows = await this.db
      .select()
      .from(taskRuns)
      .where(eq(taskRuns.accountId, accountId))
      .orderBy(desc(taskRuns.createdAt))
      .limit(limit);
    return rows.map(snakeKeys);
  }

  async listForPod(accountId: string, podId: string, limit = 50) {
    const rows = await this.db
      .select()
      .from(taskRuns)
      .where(and(eq(taskRuns.accountId, accountId), eq(taskRuns.podId, podId)))
      .orderBy(desc(taskRuns.createdAt))
      .limit(limit);
    return rows.map(snakeKeys);
  }

  async listForTask(accountId: string, taskId: string, limit = 20) {
    const rows = await this.db
      .select()
      .from(taskRuns)
      .where(
        and(eq(taskRuns.accountId, accountId), eq(taskRuns.taskId, taskId)),
      )
      .orderBy(desc(taskRuns.createdAt))
      .limit(limit);
    return rows.map(snakeKeys);
  }

  /**
   * Aggregate failures by reason for the dashboard ("why did this Pod
   * fail yesterday?"). Returns top reasons in the last N days.
   */
  async failureBreakdown(accountId: string, daysBack = 7) {
    const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();
    const data = await this.db
      .select({
        failure_reason: taskRuns.failureReason,
        pod_id: taskRuns.podId,
      })
      .from(taskRuns)
      .where(
        and(
          eq(taskRuns.accountId, accountId),
          eq(taskRuns.status, 'failed'),
          gte(taskRuns.createdAt, since),
        ),
      );
    const totals = new Map<string, number>();
    const byPod = new Map<string, Map<string, number>>();
    for (const r of data ?? []) {
      const reason = r.failure_reason ?? 'other';
      totals.set(reason, (totals.get(reason) ?? 0) + 1);
      const pid = r.pod_id ?? 'unassigned';
      if (!byPod.has(pid)) byPod.set(pid, new Map());
      const sub = byPod.get(pid)!;
      sub.set(reason, (sub.get(reason) ?? 0) + 1);
    }
    return {
      window_days: daysBack,
      total: [...totals.entries()].map(([reason, count]) => ({ reason, count })),
      by_pod: [...byPod.entries()].map(([pod_id, m]) => ({
        pod_id,
        reasons: [...m.entries()].map(([reason, count]) => ({ reason, count })),
      })),
    };
  }
}
