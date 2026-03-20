import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AdapterRegistry } from '../adapters/adapter.registry';
import { SYNC_QUEUE_NAME } from './sync-queue.module';
import { SyncJobData } from './sync.processor';
import { encrypt, decrypt } from '../common/utils/encryption.util';

export interface SyncResult {
  tasks_synced: number;
  tasks_created: number;
  tasks_updated: number;
  tasks_deleted: number;
  errors: string[];
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private syncLocks = new Map<string, boolean>(); // Prevent concurrent syncs for same source
  private bullQueue: Queue<SyncJobData> | null = null;

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly adapterRegistry: AdapterRegistry,
    @Optional()
    @Inject('BULL_QUEUE_AVAILABLE')
    private readonly bullQueueAvailable: boolean,
  ) {
    // The queue will be injected separately via setBullQueue if available
  }

  /**
   * Set the Bull queue reference. Called during module init when Redis is available.
   */
  setBullQueue(queue: Queue<SyncJobData>) {
    this.bullQueue = queue;
    this.logger.log('BullMQ queue attached to SyncService.');
  }

  /** Use admin client for all sync operations to bypass RLS */
  private get db() {
    return this.supabaseAdmin.getClient();
  }

  /**
   * Check if BullMQ queue is available and operational.
   */
  private isQueueAvailable(): boolean {
    return this.bullQueueAvailable && this.bullQueue !== null;
  }

  /**
   * Add a sync job to the Bull queue (or execute directly if queue unavailable).
   */
  async addSyncJob(
    sourceId: string,
    accountId?: string,
    triggeredBy: 'cron' | 'manual' = 'manual',
  ): Promise<{ queued: boolean; jobId?: string }> {
    if (this.isQueueAvailable()) {
      try {
        const job = await this.bullQueue!.add(
          'sync',
          { sourceId, accountId, triggeredBy },
          {
            jobId: `sync-${sourceId}-${Date.now()}`,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          },
        );
        this.logger.log(
          `Sync job queued: ${job.id} for source ${sourceId} (trigger: ${triggeredBy})`,
        );
        return { queued: true, jobId: job.id };
      } catch (error) {
        this.logger.error(
          `Failed to queue sync job for source ${sourceId}, falling back to direct execution: ${(error as Error).message}`,
        );
        // Fall through to direct execution
      }
    }

    // Direct execution fallback (no Redis / queue error)
    this.logger.log(
      `Executing sync directly for source ${sourceId} (no queue available)`,
    );
    this.syncSource(sourceId).catch((err) =>
      this.logger.error(
        `Direct sync failed for source ${sourceId}: ${err.message}`,
      ),
    );
    return { queued: false };
  }

  /**
   * Cron job: runs every 5 minutes to check for sources that need syncing.
   * When BullMQ is available, enqueues jobs instead of processing inline.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleScheduledSync() {
    this.logger.log('Running scheduled sync check...');

    try {
      // Find all active sources that are due for sync
      const { data: sources, error } = await this.db
        .from('sources')
        .select('*')
        .eq('is_active', true)
        .neq('sync_status', 'syncing');

      if (error) {
        this.logger.error(`Failed to fetch sources: ${error.message}`);
        return;
      }

      const now = new Date();

      for (const source of sources || []) {
        const lastSync = source.last_synced_at
          ? new Date(source.last_synced_at)
          : new Date(0);
        const minutesSinceSync =
          (now.getTime() - lastSync.getTime()) / (1000 * 60);

        // Check if it's time to sync this source
        if (minutesSinceSync >= (source.sync_interval_minutes || 30)) {
          this.logger.log(
            `Source ${source.id} (${source.provider}) is due for sync`,
          );

          // Route through the queue if available, otherwise direct execution
          await this.addSyncJob(source.id, source.account_id, 'cron');
        }
      }
    } catch (error) {
      this.logger.error(
        `Scheduled sync check failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Manually trigger a sync for a specific source.
   * This performs the actual sync logic (called directly or via the queue processor).
   */
  async syncSource(sourceId: string): Promise<SyncResult> {
    // Check if sync already in progress
    if (this.syncLocks.get(sourceId)) {
      throw new Error(`Sync already in progress for source ${sourceId}`);
    }

    this.syncLocks.set(sourceId, true);

    try {
      // Fetch source details
      const { data: source, error: sourceError } = await this.db
        .from('sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (sourceError || !source) {
        throw new Error(`Source ${sourceId} not found`);
      }

      // Create sync job record
      const { data: syncJob, error: jobError } = await this.db
        .from('sync_jobs')
        .insert({
          source_id: sourceId,
          direction: 'inbound',
          status: 'running',
        })
        .select()
        .single();

      if (jobError || !syncJob) {
        throw new Error('Failed to create sync job');
      }

      // Update source status to syncing
      await this.db
        .from('sources')
        .update({ sync_status: 'syncing' })
        .eq('id', sourceId);

      try {
        // Perform the actual sync
        const result = await this.performInboundSync(source);

        // Update source status
        await this.db
          .from('sources')
          .update({
            sync_status: 'idle',
            last_synced_at: new Date().toISOString(),
            last_sync_error: null,
          })
          .eq('id', sourceId);

        // Update sync job
        await this.db
          .from('sync_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            tasks_synced: result.tasks_synced,
            tasks_created: result.tasks_created,
            tasks_updated: result.tasks_updated,
            tasks_deleted: result.tasks_deleted,
            error_log: result.errors.join('\n') || null,
          })
          .eq('id', syncJob.id);

        this.logger.log(
          `Sync completed for source ${sourceId}: ${result.tasks_synced} tasks synced`,
        );

        return result;
      } catch (syncError) {
        const errorMessage = (syncError as Error).message;

        // Update source with error
        await this.db
          .from('sources')
          .update({
            sync_status: 'error',
            last_sync_error: errorMessage,
          })
          .eq('id', sourceId);

        // Update sync job with error
        await this.db
          .from('sync_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_log: errorMessage,
          })
          .eq('id', syncJob.id);

        throw syncError;
      }
    } finally {
      this.syncLocks.delete(sourceId);
    }
  }

  /**
   * Perform inbound sync: fetch tasks from external source → upsert into Supabase
   */
  private async performInboundSync(source: any): Promise<SyncResult> {
    const result: SyncResult = {
      tasks_synced: 0,
      tasks_created: 0,
      tasks_updated: 0,
      tasks_deleted: 0,
      errors: [],
    };

    try {
      // Get the appropriate adapter
      const adapter = this.adapterRegistry.getAdapter(source.provider);

      // Fetch tasks from external source, applying any configured pre-filters
      const syncFilters = source.sync_filters && Array.isArray(source.sync_filters) && source.sync_filters.length > 0
        ? source.sync_filters
        : undefined;
      this.logger.log(
        `Fetching tasks from ${source.provider} (source ${source.id})${syncFilters ? ` with ${syncFilters.length} filter(s)` : ''}...`,
      );
      // If source is linked to an integration connection, merge decrypted credentials
      let effectiveConfig = source.config;
      if (source.connection_id) {
        try {
          const connCredentials = await this.getConnectionCredentials(source.connection_id);
          effectiveConfig = { ...source.config, ...connCredentials };
        } catch (err) {
          this.logger.warn(`Failed to get connection credentials for source ${source.id}, falling back to source config: ${(err as Error).message}`);
        }
      }

      const externalTasks = await adapter.fetchTasks(effectiveConfig, syncFilters);

      this.logger.log(
        `Fetched ${externalTasks.length} tasks from external source`,
      );

      // Get existing tasks for this source from Supabase
      const { data: existingTasks } = await this.db
        .from('tasks')
        .select('id, external_id, last_synced_at')
        .eq('source_id', source.id);

      const existingMap = new Map(
        (existingTasks || []).map((t) => [t.external_id, t]),
      );

      // Build category name → id map for dynamic category assignment
      const { data: categories } = await this.db
        .from('categories')
        .select('id, name')
        .eq('account_id', source.account_id);

      const categoryMap = new Map(
        (categories || []).map((c) => [c.name.toLowerCase(), c.id]),
      );

      // Sync each external task
      for (const externalTask of externalTasks) {
        try {
          const existing = existingMap.get(externalTask.external_id);

          // Resolve category: match external property → local category, fallback to source default
          let categoryId = source.category_id;
          const categoryPropertyName = source.category_property || 'category';
          const externalCategory = externalTask.metadata?.[categoryPropertyName]
            || externalTask.metadata?.category; // fallback to 'category' metadata
          if (externalCategory) {
            const matchedCategoryId = categoryMap.get(
              String(externalCategory).toLowerCase(),
            );
            if (matchedCategoryId) {
              categoryId = matchedCategoryId;
            }
          }

          const taskData = {
            account_id: source.account_id,
            category_id: categoryId,
            source_id: source.id,
            external_id: externalTask.external_id,
            title: externalTask.title,
            status: externalTask.status,
            priority: externalTask.priority || 'Medium',
            completed: externalTask.completed,
            notes: externalTask.notes || '',
            metadata: externalTask.metadata || {},
            external_url: externalTask.external_url,
            due_date: externalTask.due_date?.toISOString() || null,
            completed_at: externalTask.completed_at?.toISOString() || null,
            last_synced_at: new Date().toISOString(),
          };

          if (existing) {
            // Update existing task (conflict resolution: last-write-wins from external)
            await this.db
              .from('tasks')
              .update(taskData)
              .eq('id', existing.id);

            result.tasks_updated++;
          } else {
            // Create new task
            await this.db.from('tasks').insert(taskData);

            result.tasks_created++;
          }

          result.tasks_synced++;
          existingMap.delete(externalTask.external_id); // Mark as processed
        } catch (error) {
          const msg = `Failed to sync task ${externalTask.external_id}: ${(error as Error).message}`;
          this.logger.error(msg);
          result.errors.push(msg);
        }
      }

      // TODO: Handle deleted tasks (tasks in existingMap that weren't in externalTasks)
      // For now, we leave them in place. Future: add a "soft delete" or archive flag.

      return result;
    } catch (error) {
      this.logger.error(
        `Inbound sync failed for source ${source.id}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Get sync status for all sources in an account
   */
  async getSyncStatus(userId: string, accountId: string) {
    // Note: Access control should be done by caller
    const { data: sources, error } = await this.db
      .from('sources')
      .select('id, provider, sync_status, last_synced_at, last_sync_error')
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to fetch sync status: ${error.message}`);
    }

    // Get recent sync jobs for each source
    const syncStatusPromises = (sources || []).map(async (source) => {
      const { data: recentJobs } = await this.db
        .from('sync_jobs')
        .select('*')
        .eq('source_id', source.id)
        .order('started_at', { ascending: false })
        .limit(5);

      return {
        ...source,
        recent_jobs: recentJobs || [],
      };
    });

    return Promise.all(syncStatusPromises);
  }

  private async getConnectionCredentials(connectionId: string): Promise<Record<string, string>> {
    const { data, error } = await this.db
      .from('integration_connections')
      .select('credentials')
      .eq('id', connectionId)
      .single();

    if (error || !data || !data.credentials) return {};

    try {
      const json = decrypt(data.credentials);
      return JSON.parse(json);
    } catch {
      // May be unencrypted JSON from migration
      try {
        const parsed = JSON.parse(data.credentials);
        // Re-encrypt for next time
        const encrypted = encrypt(JSON.stringify(parsed));
        void this.db
          .from('integration_connections')
          .update({ credentials: encrypted })
          .eq('id', connectionId);
        return parsed;
      } catch {
        return {};
      }
    }
  }
}
