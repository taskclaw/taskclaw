import {
  BadRequestException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { syncs, syncRuns, skills } from '../db/schema';
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
 *
 * Data access is Drizzle. The Zod row schemas (`SyncRowSchema`,
 * `SyncRunRowSchema`) still gate every row that crosses the boundary
 * (§12.3 "Parse, don't cast"), so Drizzle's camelCase rows are re-keyed
 * to the snake_case shape those schemas — and all callers — expect.
 */
@Injectable()
export class SyncsService {
  private readonly logger = new Logger(SyncsService.name);
  private readonly runners = new Map<string, SyncRunner>();
  // Soft per-process lock to avoid double-running the same sync from
  // overlapping schedule + manual triggers.
  private readonly running = new Set<string>();

  constructor(@Inject(DB) private readonly db: Db) {}

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

  /** Re-key a Drizzle `syncs` row (camelCase) to the snake_case SyncRow shape. */
  private toSyncRow(row: typeof syncs.$inferSelect): SyncRow {
    return SyncRowSchema.parse({
      id: row.id,
      account_id: row.accountId,
      name: row.name,
      sync_type: row.syncType,
      source_kind: row.sourceKind,
      config: row.config,
      schedule_cron: row.scheduleCron,
      last_run_at: row.lastRunAt,
      last_status: row.lastStatus,
      last_error: row.lastError,
      enabled: row.enabled,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    });
  }

  /** Re-key a Drizzle `sync_runs` row (camelCase) to the snake_case SyncRunRow shape. */
  private toSyncRunRow(row: typeof syncRuns.$inferSelect): SyncRunRow {
    return SyncRunRowSchema.parse({
      id: row.id,
      sync_id: row.syncId,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
      status: row.status,
      items_added: row.itemsAdded,
      items_updated: row.itemsUpdated,
      items_removed: row.itemsRemoved,
      log_excerpt: row.logExcerpt,
      trigger: row.trigger,
    });
  }

  // ------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------

  async list(accountId: string): Promise<SyncRow[]> {
    const rows = await this.db
      .select()
      .from(syncs)
      .where(eq(syncs.accountId, accountId))
      .orderBy(desc(syncs.createdAt));
    return rows.map((row) => this.toSyncRow(row));
  }

  async get(accountId: string, syncId: string): Promise<SyncRow> {
    const [data] = await this.db
      .select()
      .from(syncs)
      .where(and(eq(syncs.accountId, accountId), eq(syncs.id, syncId)))
      .limit(1);
    if (!data) throw new NotFoundException('Sync not found');
    return this.toSyncRow(data);
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
    const [data] = await this.db
      .insert(syncs)
      .values({
        accountId,
        name: parsed.name,
        syncType: parsed.sync_type,
        sourceKind: parsed.source_kind,
        config: parsed.config,
        scheduleCron: parsed.schedule_cron ?? null,
        enabled: parsed.enabled,
      })
      .returning();
    if (!data) throw new BadRequestException('Insert failed');
    return this.toSyncRow(data);
  }

  async update(accountId: string, syncId: string, input: unknown): Promise<SyncRow> {
    const parsed: UpdateSyncInput = UpdateSyncSchema.parse(input);
    // Map the snake_case DTO to camelCase columns (only defined fields).
    const patch: Partial<typeof syncs.$inferInsert> = {};
    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.config !== undefined) patch.config = parsed.config;
    if (parsed.schedule_cron !== undefined) patch.scheduleCron = parsed.schedule_cron;
    if (parsed.enabled !== undefined) patch.enabled = parsed.enabled;

    const [data] = await this.db
      .update(syncs)
      .set(patch)
      .where(and(eq(syncs.accountId, accountId), eq(syncs.id, syncId)))
      .returning();
    if (!data) throw new NotFoundException('Sync not found');
    return this.toSyncRow(data);
  }

  async remove(accountId: string, syncId: string): Promise<void> {
    await this.db
      .delete(syncs)
      .where(and(eq(syncs.accountId, accountId), eq(syncs.id, syncId)));
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
    const rows = await this.db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        source_uri: skills.sourceUri,
        source_version: skills.sourceVersion,
        locally_available: skills.locallyAvailable,
      })
      .from(skills)
      .where(and(eq(skills.accountId, accountId), eq(skills.sourceSyncId, syncId)))
      .orderBy(asc(skills.name));
    return rows;
  }

  async listRuns(accountId: string, syncId: string, limit = 20): Promise<SyncRunRow[]> {
    // Verify sync ownership first.
    await this.get(accountId, syncId);
    const rows = await this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.syncId, syncId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(limit);
    return rows.map((row) => this.toSyncRunRow(row));
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

    let started: typeof syncRuns.$inferSelect;
    try {
      [started] = await this.db
        .insert(syncRuns)
        .values({
          syncId: sync.id,
          status: 'running',
          trigger,
        })
        .returning();
      if (!started) throw new Error('no row');
    } catch {
      this.running.delete(sync.id);
      throw new BadRequestException('Could not start sync run');
    }

    // Mark the sync as running too, so the UI can show a spinner.
    await this.db
      .update(syncs)
      .set({ lastStatus: 'running', lastError: null })
      .where(eq(syncs.id, sync.id));

    try {
      const result = await runner.run(sync);
      const finalStatus = result.status;

      const [finished] = await this.db
        .update(syncRuns)
        .set({
          finishedAt: new Date().toISOString(),
          status: finalStatus,
          itemsAdded: result.items_added,
          itemsUpdated: result.items_updated,
          itemsRemoved: result.items_removed,
          logExcerpt: result.log_excerpt ?? null,
        })
        .where(eq(syncRuns.id, started.id))
        .returning();
      if (!finished) throw new Error('Could not finalize run');

      await this.db
        .update(syncs)
        .set({
          lastRunAt: new Date().toISOString(),
          lastStatus: finalStatus,
          lastError: result.error ?? null,
        })
        .where(eq(syncs.id, sync.id));

      return this.toSyncRunRow(finished);
    } catch (err) {
      this.logger.error(
        `Sync ${sync.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(syncRuns)
        .set({
          finishedAt: new Date().toISOString(),
          status: 'error',
          logExcerpt: message.slice(0, 4000),
        })
        .where(eq(syncRuns.id, started.id));
      await this.db
        .update(syncs)
        .set({
          lastRunAt: new Date().toISOString(),
          lastStatus: 'error',
          lastError: message.slice(0, 4000),
        })
        .where(eq(syncs.id, sync.id));
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
    const rows = await this.db
      .select()
      .from(syncs)
      .where(eq(syncs.enabled, true))
      .orderBy(sql`${syncs.lastRunAt} ASC NULLS FIRST`);
    return rows.map((row) => this.toSyncRow(row));
  }
}
