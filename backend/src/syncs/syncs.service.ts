import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import {
  CreateSyncSchema,
  type CreateSyncInput,
  SyncRowSchema,
  type SyncRow,
  type SyncRunRow,
  SyncRunRowSchema,
  UpdateSyncSchema,
  type UpdateSyncInput,
} from './dto/syncs.schema';

interface RunResult {
  status: 'ok' | 'error' | 'partial';
  items_added: number;
  items_updated: number;
  items_removed: number;
  log_excerpt?: string;
  error?: string;
}

export interface SyncRunner {
  /** Identifier this runner handles, e.g. 'skills:local-folder'. */
  readonly id: string;
  /** Tuple this runner serves: (sync_type, source_kind). */
  readonly handles: { sync_type: string; source_kind: string };
  /** Run one execution. Must be idempotent. */
  run(sync: SyncRow): Promise<RunResult>;
}

/**
 * SyncsService — CRUD + run dispatch for inbound content ingestion.
 * Runners register themselves at module init via registerRunner(); the
 * service routes runs by (sync_type, source_kind).
 */
@Injectable()
export class SyncsService {
  private readonly logger = new Logger(SyncsService.name);
  private readonly runners = new Map<string, SyncRunner>();
  // Soft per-process lock to avoid double-running the same sync from
  // overlapping schedule + manual triggers.
  private readonly running = new Set<string>();

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  registerRunner(runner: SyncRunner) {
    const key = this.runnerKey(runner.handles.sync_type, runner.handles.source_kind);
    if (this.runners.has(key)) {
      this.logger.warn(`Runner already registered for ${key}; replacing`);
    }
    this.runners.set(key, runner);
    this.logger.log(`Registered sync runner ${runner.id} for ${key}`);
  }

  private runnerKey(syncType: string, sourceKind: string): string {
    return `${syncType}:${sourceKind}`;
  }

  // ------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------

  async list(accountId: string): Promise<SyncRow[]> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('syncs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => SyncRowSchema.parse(row));
  }

  async get(accountId: string, syncId: string): Promise<SyncRow> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('syncs')
      .select('*')
      .eq('account_id', accountId)
      .eq('id', syncId)
      .single();
    if (error || !data) throw new NotFoundException('Sync not found');
    return SyncRowSchema.parse(data);
  }

  async create(accountId: string, input: unknown): Promise<SyncRow> {
    const parsed: CreateSyncInput = CreateSyncSchema.parse(input);
    if (!this.runners.has(this.runnerKey(parsed.sync_type, parsed.source_kind))) {
      // Allow creation even if no runner is registered yet (e.g. UI for a
      // future source_kind). Runs against missing runners fail with a clear
      // error.
      this.logger.warn(
        `No runner registered for ${parsed.sync_type}:${parsed.source_kind}; sync will be runnable only after a runner is loaded.`,
      );
    }
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('syncs')
      .insert({
        account_id: accountId,
        name: parsed.name,
        sync_type: parsed.sync_type,
        source_kind: parsed.source_kind,
        config: parsed.config,
        schedule_cron: parsed.schedule_cron ?? null,
        enabled: parsed.enabled,
      })
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Insert failed');
    return SyncRowSchema.parse(data);
  }

  async update(accountId: string, syncId: string, input: unknown): Promise<SyncRow> {
    const parsed: UpdateSyncInput = UpdateSyncSchema.parse(input);
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('syncs')
      .update(parsed)
      .eq('account_id', accountId)
      .eq('id', syncId)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Sync not found');
    return SyncRowSchema.parse(data);
  }

  async remove(accountId: string, syncId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();
    const { error } = await client
      .from('syncs')
      .delete()
      .eq('account_id', accountId)
      .eq('id', syncId);
    if (error) throw new BadRequestException(error.message);
  }

  /**
   * List all skills produced by this sync. Used by the Settings → Syncs UI
   * to expand a card and show "what did this actually pull in?".
   */
  async listSkills(
    accountId: string,
    syncId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      description: string | null;
      source_uri: string | null;
      source_version: string | null;
      locally_available: boolean | null;
    }>
  > {
    // Verify sync ownership.
    await this.get(accountId, syncId);
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('skills')
      .select('id, name, description, source_uri, source_version, locally_available')
      .eq('account_id', accountId)
      .eq('source_sync_id', syncId)
      .order('name', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as any;
  }

  async listRuns(accountId: string, syncId: string, limit = 20): Promise<SyncRunRow[]> {
    // Verify sync ownership first.
    await this.get(accountId, syncId);
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('sync_runs')
      .select('*')
      .eq('sync_id', syncId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => SyncRunRowSchema.parse(row));
  }

  // ------------------------------------------------------------
  // Run dispatch
  // ------------------------------------------------------------

  async runNow(
    accountId: string,
    syncId: string,
    trigger: 'manual' | 'schedule' | 'hook' = 'manual',
  ): Promise<SyncRunRow> {
    const sync = await this.get(accountId, syncId);
    return this.executeSync(sync, trigger);
  }

  /**
   * Execute a sync end-to-end: insert running row, dispatch to runner,
   * record result on sync + sync_runs. Soft per-process lock prevents
   * overlapping execution of the same sync.
   */
  async executeSync(
    sync: SyncRow,
    trigger: 'manual' | 'schedule' | 'hook',
  ): Promise<SyncRunRow> {
    if (this.running.has(sync.id)) {
      this.logger.debug(`Sync ${sync.id} already running in this process; skipping`);
      throw new BadRequestException('Sync is already running');
    }

    if (!sync.enabled) {
      throw new BadRequestException('Sync is disabled');
    }

    const runner = this.runners.get(this.runnerKey(sync.sync_type, sync.source_kind));
    if (!runner) {
      throw new BadRequestException(
        `No runner registered for ${sync.sync_type}:${sync.source_kind}`,
      );
    }

    this.running.add(sync.id);
    const client = this.supabaseAdmin.getClient();

    const { data: started, error: startErr } = await client
      .from('sync_runs')
      .insert({
        sync_id: sync.id,
        status: 'running',
        trigger,
      })
      .select('*')
      .single();
    if (startErr || !started) {
      this.running.delete(sync.id);
      throw new BadRequestException(startErr?.message ?? 'Could not start sync run');
    }

    // Mark the sync as running too, so the UI can show a spinner.
    await client
      .from('syncs')
      .update({ last_status: 'running', last_error: null })
      .eq('id', sync.id);

    try {
      const result = await runner.run(sync);
      const finalStatus = result.status;

      const { data: finished, error: finErr } = await client
        .from('sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: finalStatus,
          items_added: result.items_added,
          items_updated: result.items_updated,
          items_removed: result.items_removed,
          log_excerpt: result.log_excerpt ?? null,
        })
        .eq('id', started.id)
        .select('*')
        .single();
      if (finErr || !finished) throw new Error(finErr?.message ?? 'Could not finalize run');

      await client
        .from('syncs')
        .update({
          last_run_at: new Date().toISOString(),
          last_status: finalStatus,
          last_error: result.error ?? null,
        })
        .eq('id', sync.id);

      return SyncRunRowSchema.parse(finished);
    } catch (err) {
      this.logger.error(
        `Sync ${sync.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      const message = err instanceof Error ? err.message : String(err);
      await client
        .from('sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'error',
          log_excerpt: message.slice(0, 4000),
        })
        .eq('id', started.id);
      await client
        .from('syncs')
        .update({
          last_run_at: new Date().toISOString(),
          last_status: 'error',
          last_error: message.slice(0, 4000),
        })
        .eq('id', sync.id);
      throw err;
    } finally {
      this.running.delete(sync.id);
    }
  }

  /**
   * Returns the IDs of syncs that are due to run. Cron-aware version is
   * delegated to the scheduler component; for v1 we use a simple "last_run_at
   * older than X minutes" heuristic when schedule_cron is set, deferring full
   * cron evaluation to the BullMQ repeatable job.
   */
  async findEnabledSyncs(): Promise<SyncRow[]> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('syncs')
      .select('*')
      .eq('enabled', true)
      .order('last_run_at', { ascending: true, nullsFirst: true });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => SyncRowSchema.parse(row));
  }
}
