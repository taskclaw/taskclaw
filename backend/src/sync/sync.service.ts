import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { and, desc, eq, ne } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  sources,
  syncJobs,
  tasks,
  categories,
  integrationConnections,
} from '../db/schema';
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
    @Inject(DB) private readonly db: Db,
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
      const activeSources = await this.db
        .select()
        .from(sources)
        .where(
          and(eq(sources.isActive, true), ne(sources.syncStatus, 'syncing')),
        );

      const now = new Date();

      for (const source of activeSources) {
        const lastSync = source.lastSyncedAt
          ? new Date(source.lastSyncedAt)
          : new Date(0);
        const minutesSinceSync =
          (now.getTime() - lastSync.getTime()) / (1000 * 60);

        // Check if it's time to sync this source
        if (minutesSinceSync >= (source.syncIntervalMinutes || 30)) {
          this.logger.log(
            `Source ${source.id} (${source.provider}) is due for sync`,
          );

          // Route through the queue if available, otherwise direct execution
          await this.addSyncJob(source.id, source.accountId, 'cron');
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
      const [source] = await this.db
        .select()
        .from(sources)
        .where(eq(sources.id, sourceId))
        .limit(1);

      if (!source) {
        throw new Error(`Source ${sourceId} not found`);
      }

      // Create sync job record
      const syncJobRows = await this.db
        .insert(syncJobs)
        .values({
          sourceId,
          direction: 'inbound',
          status: 'running',
        })
        .returning();
      const syncJob = syncJobRows[0];

      if (!syncJob) {
        throw new Error('Failed to create sync job');
      }

      // Update source status to syncing
      await this.db
        .update(sources)
        .set({ syncStatus: 'syncing' })
        .where(eq(sources.id, sourceId));

      try {
        // Perform the actual sync
        const result = await this.performInboundSync(source);

        // Update source status
        await this.db
          .update(sources)
          .set({
            syncStatus: 'idle',
            lastSyncedAt: new Date().toISOString(),
            lastSyncError: null,
          })
          .where(eq(sources.id, sourceId));

        // Update sync job
        await this.db
          .update(syncJobs)
          .set({
            status: 'completed',
            completedAt: new Date().toISOString(),
            tasksSynced: result.tasks_synced,
            tasksCreated: result.tasks_created,
            tasksUpdated: result.tasks_updated,
            tasksDeleted: result.tasks_deleted,
            errorLog: result.errors.join('\n') || null,
          })
          .where(eq(syncJobs.id, syncJob.id));

        this.logger.log(
          `Sync completed for source ${sourceId}: ${result.tasks_synced} tasks synced`,
        );

        return result;
      } catch (syncError) {
        const errorMessage = (syncError as Error).message;

        // Update source with error
        await this.db
          .update(sources)
          .set({
            syncStatus: 'error',
            lastSyncError: errorMessage,
          })
          .where(eq(sources.id, sourceId));

        // Update sync job with error
        await this.db
          .update(syncJobs)
          .set({
            status: 'failed',
            completedAt: new Date().toISOString(),
            errorLog: errorMessage,
          })
          .where(eq(syncJobs.id, syncJob.id));

        throw syncError;
      }
    } finally {
      this.syncLocks.delete(sourceId);
    }
  }

  /**
   * Perform inbound sync: fetch tasks from external source → upsert into Postgres
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
      const syncFilters =
        source.syncFilters &&
        Array.isArray(source.syncFilters) &&
        source.syncFilters.length > 0
          ? source.syncFilters
          : undefined;
      this.logger.log(
        `Fetching tasks from ${source.provider} (source ${source.id})${syncFilters ? ` with ${syncFilters.length} filter(s)` : ''}...`,
      );
      // If source is linked to an integration connection, merge decrypted credentials
      let effectiveConfig = source.config;
      if (source.connectionId) {
        try {
          const connCredentials = await this.getConnectionCredentials(
            source.connectionId,
          );
          effectiveConfig = { ...source.config, ...connCredentials };
        } catch (err) {
          this.logger.warn(
            `Failed to get connection credentials for source ${source.id}, falling back to source config: ${(err as Error).message}`,
          );
        }
      }

      const externalTasks = await adapter.fetchTasks(
        effectiveConfig,
        syncFilters,
      );

      this.logger.log(
        `Fetched ${externalTasks.length} tasks from external source`,
      );

      // Get existing tasks for this source from Postgres
      const existingTasks = await this.db
        .select({
          id: tasks.id,
          external_id: tasks.externalId,
          last_synced_at: tasks.lastSyncedAt,
        })
        .from(tasks)
        .where(eq(tasks.sourceId, source.id));

      const existingMap = new Map(
        existingTasks.map((t) => [t.external_id, t]),
      );

      // Build category name → id map for dynamic category assignment
      const categoryList = await this.db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.accountId, source.accountId));

      const categoryMap = new Map(
        categoryList.map((c) => [c.name.toLowerCase(), c.id]),
      );

      // Sync each external task
      for (const externalTask of externalTasks) {
        try {
          const existing = existingMap.get(externalTask.external_id);

          // Resolve category: match external property → local category, fallback to source default
          let categoryId = source.categoryId;
          const categoryPropertyName = source.categoryProperty || 'category';
          const externalCategory =
            externalTask.metadata?.[categoryPropertyName] ||
            externalTask.metadata?.category; // fallback to 'category' metadata
          if (externalCategory) {
            const matchedCategoryId = categoryMap.get(
              String(externalCategory).toLowerCase(),
            );
            if (matchedCategoryId) {
              categoryId = matchedCategoryId;
            }
          }

          const taskData = {
            accountId: source.accountId,
            categoryId: categoryId,
            sourceId: source.id,
            externalId: externalTask.external_id,
            title: externalTask.title,
            status: externalTask.status,
            priority: externalTask.priority || 'Medium',
            completed: externalTask.completed,
            notes: externalTask.notes || '',
            metadata: externalTask.metadata || {},
            externalUrl: externalTask.external_url,
            dueDate: externalTask.due_date?.toISOString() || null,
            completedAt: externalTask.completed_at?.toISOString() || null,
            lastSyncedAt: new Date().toISOString(),
          };

          if (existing) {
            // Update existing task (conflict resolution: last-write-wins from external)
            await this.db
              .update(tasks)
              .set(taskData)
              .where(eq(tasks.id, existing.id));

            result.tasks_updated++;
          } else {
            // Create new task
            await this.db.insert(tasks).values(taskData);

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
    const sourceList = await this.db
      .select({
        id: sources.id,
        provider: sources.provider,
        sync_status: sources.syncStatus,
        last_synced_at: sources.lastSyncedAt,
        last_sync_error: sources.lastSyncError,
      })
      .from(sources)
      .where(eq(sources.accountId, accountId));

    // Get recent sync jobs for each source
    const syncStatusPromises = sourceList.map(async (source) => {
      const recentJobs = await this.db
        .select()
        .from(syncJobs)
        .where(eq(syncJobs.sourceId, source.id))
        .orderBy(desc(syncJobs.startedAt))
        .limit(5);

      return {
        ...source,
        recent_jobs: recentJobs,
      };
    });

    return Promise.all(syncStatusPromises);
  }

  private async getConnectionCredentials(
    connectionId: string,
  ): Promise<Record<string, string>> {
    const [data] = await this.db
      .select({ credentials: integrationConnections.credentials })
      .from(integrationConnections)
      .where(eq(integrationConnections.id, connectionId))
      .limit(1);

    if (!data || !data.credentials) return {};

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
          .update(integrationConnections)
          .set({ credentials: encrypted })
          .where(eq(integrationConnections.id, connectionId));
        return parsed;
      } catch {
        return {};
      }
    }
  }
}
