import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

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

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  isEnabled(): boolean {
    return process.env[FEATURE_FLAG_ENV] === 'true';
  }

  /**
   * Insert a run row in 'queued' state. Returns the row id (or null when
   * the feature flag is off — callers must tolerate that).
   */
  async begin(input: BeginRunInput): Promise<string | null> {
    if (!this.isEnabled()) return null;
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('task_runs')
      .insert({
        account_id: input.account_id,
        task_id: input.task_id ?? null,
        orchestrated_task_id: input.orchestrated_task_id ?? null,
        pod_id: input.pod_id ?? null,
        agent_id: input.agent_id ?? null,
        status: 'queued',
        attempt: input.attempt ?? 1,
        max_attempts: input.max_attempts ?? 2,
        parent_run_id: input.parent_run_id ?? null,
        trigger: input.trigger,
        metadata: input.metadata ?? {},
      })
      .select('id')
      .single();
    if (error || !data) {
      this.logger.warn(`task_runs begin failed: ${error?.message ?? 'unknown'}`);
      return null;
    }
    return data.id;
  }

  /** Transition queued → dispatched/running. No-op when flag is off. */
  async transitionTo(
    runId: string | null,
    status: 'dispatched' | 'running',
  ): Promise<void> {
    if (!runId || !this.isEnabled()) return;
    const client = this.supabaseAdmin.getClient();
    const update: Record<string, unknown> = { status };
    if (status === 'running') update.started_at = new Date().toISOString();
    const { error } = await client.from('task_runs').update(update).eq('id', runId);
    if (error) this.logger.warn(`task_runs transition failed: ${error.message}`);
  }

  /** Finalize a run with result + duration. No-op when flag is off. */
  async finish(input: FinishRunInput): Promise<void> {
    if (!input.run_id || !this.isEnabled()) return;
    const client = this.supabaseAdmin.getClient();
    const { data: existing } = await client
      .from('task_runs')
      .select('started_at, created_at')
      .eq('id', input.run_id)
      .maybeSingle();
    const startedAt = existing?.started_at
      ? new Date(existing.started_at as string).getTime()
      : existing?.created_at
        ? new Date(existing.created_at as string).getTime()
        : null;
    const finishedAt = Date.now();
    const duration = startedAt ? Math.max(0, finishedAt - startedAt) : null;

    const { error } = await client
      .from('task_runs')
      .update({
        status: input.status,
        failure_reason: input.failure_reason ?? null,
        failure_message: input.failure_message ?? null,
        result: input.result ?? null,
        finished_at: new Date(finishedAt).toISOString(),
        duration_ms: duration,
      })
      .eq('id', input.run_id);
    if (error) this.logger.warn(`task_runs finish failed: ${error.message}`);
  }

  // ============================================================
  // Read APIs
  // ============================================================

  async listForAccount(accountId: string, limit = 50) {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('task_runs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listForPod(accountId: string, podId: string, limit = 50) {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('task_runs')
      .select('*')
      .eq('account_id', accountId)
      .eq('pod_id', podId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listForTask(accountId: string, taskId: string, limit = 20) {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('task_runs')
      .select('*')
      .eq('account_id', accountId)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /**
   * Aggregate failures by reason for the dashboard ("why did this Pod
   * fail yesterday?"). Returns top reasons in the last N days.
   */
  async failureBreakdown(accountId: string, daysBack = 7) {
    const client = this.supabaseAdmin.getClient();
    const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();
    const { data, error } = await client
      .from('task_runs')
      .select('failure_reason, pod_id')
      .eq('account_id', accountId)
      .eq('status', 'failed')
      .gte('created_at', since);
    if (error) throw new Error(error.message);
    const totals = new Map<string, number>();
    const byPod = new Map<string, Map<string, number>>();
    for (const r of data ?? []) {
      const reason = (r as any).failure_reason ?? 'other';
      totals.set(reason, (totals.get(reason) ?? 0) + 1);
      const pid = (r as any).pod_id ?? 'unassigned';
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
