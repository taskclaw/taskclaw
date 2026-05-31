import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { syncJobs, tasks } from '../db/schema';
import { AdapterRegistry } from '../adapters/adapter.registry';
import type {
  SourceConfig,
  TaskUpdate,
} from '../adapters/interfaces/source-adapter.interface';

export interface OutboundSyncResult {
  success: boolean;
  provider?: string;
  external_id?: string;
  error?: string;
}

/**
 * OutboundSyncService
 *
 * Handles pushing task updates from OTT → external sources (Notion, ClickUp).
 * Called when task notes or properties are updated (e.g., from AI chat findings).
 */
@Injectable()
export class OutboundSyncService {
  private readonly logger = new Logger(OutboundSyncService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly adapterRegistry: AdapterRegistry,
  ) {}

  /**
   * Push a single task's current state to its external source.
   * Used after AI chat saves findings to task notes, or any task update.
   */
  async syncTaskToSource(taskId: string): Promise<OutboundSyncResult> {
    try {
      // Fetch the task with its source info.
      // Drizzle's relational query returns the joined row under the relation
      // name (`source`); PostgREST returned it under the table name (`sources`).
      // Re-key to `sources` so downstream access (`task.sources`) is unchanged.
      const taskRow = await this.db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
        with: {
          source: {
            columns: {
              id: true,
              provider: true,
              config: true,
              accountId: true,
            },
          },
        },
      });

      if (!taskRow) {
        return { success: false, error: `Task ${taskId} not found` };
      }

      const { source, ...rest } = taskRow as any;
      const task = { ...rest, sources: source ?? null };

      // If the task has no source, it's a local-only task
      if (!task.sourceId || !task.sources || !task.externalId) {
        this.logger.log(
          `Task ${taskId} is local-only, no outbound sync needed`,
        );
        return { success: true, provider: 'local' };
      }

      const source_ = task.sources;
      const adapter = this.adapterRegistry.getAdapter(source_.provider);

      this.logger.log(
        `Pushing task ${taskId} to ${source_.provider} (external_id: ${task.externalId})`,
      );

      // Build the update payload
      const update: TaskUpdate = {
        external_id: task.externalId,
        title: task.title,
        status: task.status as TaskUpdate['status'],
        priority: task.priority as TaskUpdate['priority'],
        completed: task.completed ?? undefined,
        notes: task.notes ?? undefined,
        due_date: task.dueDate ? new Date(task.dueDate) : undefined,
      };

      // Push update via adapter
      await adapter.pushTaskUpdate(source_.config as SourceConfig, update);

      // Create outbound sync job record
      await this.db.insert(syncJobs).values({
        sourceId: source_.id,
        direction: 'outbound',
        status: 'completed',
        tasksSynced: 1,
        tasksCreated: 0,
        tasksUpdated: 1,
        tasksDeleted: 0,
        completedAt: new Date().toISOString(),
      });

      // Update task's last_synced_at
      await this.db
        .update(tasks)
        .set({ lastSyncedAt: new Date().toISOString() })
        .where(eq(tasks.id, taskId));

      this.logger.log(
        `Successfully synced task ${taskId} to ${source_.provider}`,
      );

      return {
        success: true,
        provider: source_.provider,
        external_id: task.externalId,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.logger.error(
        `Outbound sync failed for task ${taskId}: ${errorMessage}`,
      );

      // Log the failed sync job
      try {
        const taskRow = await this.db
          .select({ source_id: tasks.sourceId })
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .limit(1);
        const task = taskRow[0];

        if (task?.source_id) {
          await this.db.insert(syncJobs).values({
            sourceId: task.source_id,
            direction: 'outbound',
            status: 'failed',
            errorLog: errorMessage,
            completedAt: new Date().toISOString(),
          });
        }
      } catch {
        // Ignore logging errors
      }

      return { success: false, error: errorMessage };
    }
  }
}
