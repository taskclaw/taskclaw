import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AdapterRegistry } from '../adapters/adapter.registry';

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
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly adapterRegistry: AdapterRegistry,
  ) {}

  private get db() {
    return this.supabaseAdmin.getClient();
  }

  /**
   * Push a single task's current state to its external source.
   * Used after AI chat saves findings to task notes, or any task update.
   */
  async syncTaskToSource(taskId: string): Promise<OutboundSyncResult> {
    try {
      // Fetch the task with its source info
      const { data: task, error: taskError } = await this.db
        .from('tasks')
        .select('*, sources(id, provider, config, account_id)')
        .eq('id', taskId)
        .single();

      if (taskError || !task) {
        return { success: false, error: `Task ${taskId} not found` };
      }

      // If the task has no source, it's a local-only task
      if (!task.source_id || !task.sources || !task.external_id) {
        this.logger.log(
          `Task ${taskId} is local-only, no outbound sync needed`,
        );
        return { success: true, provider: 'local' };
      }

      const source = task.sources;
      const adapter = this.adapterRegistry.getAdapter(source.provider);

      this.logger.log(
        `Pushing task ${taskId} to ${source.provider} (external_id: ${task.external_id})`,
      );

      // Build the update payload
      const update = {
        external_id: task.external_id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        completed: task.completed,
        notes: task.notes,
        due_date: task.due_date ? new Date(task.due_date) : undefined,
      };

      // Push update via adapter
      await adapter.pushTaskUpdate(source.config, update);

      // Create outbound sync job record
      await this.db.from('sync_jobs').insert({
        source_id: source.id,
        direction: 'outbound',
        status: 'completed',
        tasks_synced: 1,
        tasks_created: 0,
        tasks_updated: 1,
        tasks_deleted: 0,
        completed_at: new Date().toISOString(),
      });

      // Update task's last_synced_at
      await this.db
        .from('tasks')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', taskId);

      this.logger.log(
        `Successfully synced task ${taskId} to ${source.provider}`,
      );

      return {
        success: true,
        provider: source.provider,
        external_id: task.external_id,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.logger.error(
        `Outbound sync failed for task ${taskId}: ${errorMessage}`,
      );

      // Log the failed sync job
      try {
        const { data: task } = await this.db
          .from('tasks')
          .select('source_id')
          .eq('id', taskId)
          .single();

        if (task?.source_id) {
          await this.db.from('sync_jobs').insert({
            source_id: task.source_id,
            direction: 'outbound',
            status: 'failed',
            error_log: errorMessage,
            completed_at: new Date().toISOString(),
          });
        }
      } catch {
        // Ignore logging errors
      }

      return { success: false, error: errorMessage };
    }
  }
}
