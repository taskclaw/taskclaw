import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { OutboundSyncService } from '../sync/outbound-sync.service';
import { NotionAdapter } from '../adapters/notion/notion.adapter';

interface TaskFilters {
  category_id?: string;
  source_id?: string;
  status?: string;
  priority?: string;
  completed?: boolean;
  board_id?: string;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
    private readonly outboundSync: OutboundSyncService,
    private readonly notionAdapter: NotionAdapter,
  ) {}

  async findAll(userId: string, accountId: string, filters?: TaskFilters, accessToken?: string) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    let query = client
      .from('tasks')
      .select('*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon)')
      .eq('account_id', accountId);

    // Apply filters
    if (filters?.category_id) {
      query = query.eq('category_id', filters.category_id);
    }
    if (filters?.source_id) {
      query = query.eq('source_id', filters.source_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters?.completed !== undefined) {
      query = query.eq('completed', filters.completed);
    }
    if (filters?.board_id) {
      query = query.eq('board_instance_id', filters.board_id);
    } else {
      // Default: only show legacy (boardless) tasks unless board_id is specified
      query = query.is('board_instance_id', null);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch tasks: ${error.message}`);
    }

    return data;
  }

  async findOne(userId: string, accountId: string, id: string, accessToken?: string) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    const { data, error } = await client
      .from('tasks')
      .select('*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon)')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return data;
  }

  async create(userId: string, accountId: string, createTaskDto: CreateTaskDto, accessToken?: string) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    // Verify category exists and belongs to this account (if provided)
    if (createTaskDto.category_id) {
      const { data: category, error: categoryError } = await client
        .from('categories')
        .select('id')
        .eq('id', createTaskDto.category_id)
        .eq('account_id', accountId)
        .single();

      if (categoryError || !category) {
        throw new BadRequestException('Invalid category_id for this account');
      }
    }

    // If source_id provided, verify it exists and belongs to this account
    if (createTaskDto.source_id) {
      const { data: source, error: sourceError } = await client
        .from('sources')
        .select('id')
        .eq('id', createTaskDto.source_id)
        .eq('account_id', accountId)
        .single();

      if (sourceError || !source) {
        throw new BadRequestException('Invalid source_id for this account');
      }
    }

    // Resolve status from board step if board context provided
    let status = createTaskDto.status || 'To-Do';
    if (createTaskDto.current_step_id) {
      const { data: step } = await client
        .from('board_steps')
        .select('name')
        .eq('id', createTaskDto.current_step_id)
        .single();
      if (step) {
        status = step.name;
      }
    }

    const { data, error } = await client
      .from('tasks')
      .insert({
        account_id: accountId,
        category_id: createTaskDto.category_id || null,
        source_id: createTaskDto.source_id || null,
        title: createTaskDto.title,
        status,
        priority: createTaskDto.priority || 'Medium',
        completed: createTaskDto.completed || false,
        notes: createTaskDto.notes || '',
        due_date: createTaskDto.due_date || null,
        board_instance_id: createTaskDto.board_instance_id || null,
        current_step_id: createTaskDto.current_step_id || null,
      })
      .select('*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon)')
      .single();

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`);
    }

    return data;
  }

  async update(
    userId: string,
    accountId: string,
    id: string,
    updateTaskDto: UpdateTaskDto,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    // Verify task exists and belongs to account
    const existingTask = await this.findOne(userId, accountId, id, accessToken);

    // If updating category, verify it belongs to this account
    if (updateTaskDto.category_id) {
      const { data: category, error: categoryError } = await client
        .from('categories')
        .select('id')
        .eq('id', updateTaskDto.category_id)
        .eq('account_id', accountId)
        .single();

      if (categoryError || !category) {
        throw new BadRequestException('Invalid category_id for this account');
      }
    }

    // Handle completion state
    const updateData: any = { ...updateTaskDto };
    if (updateTaskDto.completed === true && !existingTask.completed) {
      updateData.completed_at = new Date().toISOString();
    } else if (updateTaskDto.completed === false) {
      updateData.completed_at = null;
    }

    // Auto-sync status when current_step_id changes (board tasks)
    if (updateTaskDto.current_step_id && updateTaskDto.current_step_id !== existingTask.current_step_id) {
      const { data: step } = await client
        .from('board_steps')
        .select('name, step_type')
        .eq('id', updateTaskDto.current_step_id)
        .single();
      if (step) {
        updateData.status = step.name;
        // Auto-complete when moved to "done" step
        if (step.step_type === 'done' && !existingTask.completed) {
          updateData.completed = true;
          updateData.completed_at = new Date().toISOString();
        }
      }
    }

    const { data, error } = await client
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon)')
      .single();

    if (error) {
      throw new Error(`Failed to update task: ${error.message}`);
    }

    // Sprint 7: Trigger outbound sync if task has a source_id
    if (data.source_id) {
      this.outboundSync.syncTaskToSource(id).catch((err) =>
        this.logger.error(`Outbound sync failed for task ${id}: ${err.message}`),
      );
    }

    return data;
  }

  async remove(userId: string, accountId: string, id: string, accessToken?: string) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    // Verify task exists and belongs to account
    await this.findOne(userId, accountId, id, accessToken);

    const { error } = await client
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to delete task: ${error.message}`);
    }

    return { message: 'Task deleted successfully' };
  }

  /**
   * Fetch page body content from Notion (blocks API).
   * Returns markdown-like plain text for display in the task detail panel.
   */
  async getTaskContent(
    userId: string,
    accountId: string,
    taskId: string,
    accessToken?: string,
  ): Promise<string> {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Fetch task with source info
    const { data: task, error } = await client
      .from('tasks')
      .select('*, sources(id, provider, config)')
      .eq('id', taskId)
      .eq('account_id', accountId)
      .single();

    if (error || !task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    // Only Notion tasks have page content
    if (!task.source_id || !task.external_id || task.sources?.provider !== 'notion') {
      return '';
    }

    try {
      return await this.notionAdapter.getPageContent(task.sources.config, task.external_id);
    } catch (err) {
      this.logger.warn(`Failed to fetch content for task ${taskId}: ${(err as Error).message}`);
      return '';
    }
  }

  /**
   * Fetch comments from the external source (Notion/ClickUp) for a task.
   * Returns comments in chronological order.
   */
  async getTaskComments(
    userId: string,
    accountId: string,
    taskId: string,
    accessToken?: string,
  ): Promise<Array<{ id: string; text: string; created_at: string; author: string }>> {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Fetch task with source info
    const { data: task, error } = await client
      .from('tasks')
      .select('*, sources(id, provider, config)')
      .eq('id', taskId)
      .eq('account_id', accountId)
      .single();

    if (error || !task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    // Only Notion tasks have comments via API
    if (!task.source_id || !task.external_id || task.sources?.provider !== 'notion') {
      return [];
    }

    try {
      return await this.notionAdapter.getComments(task.sources.config, task.external_id);
    } catch (err) {
      this.logger.warn(`Failed to fetch comments for task ${taskId}: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Sprint 7: Save AI findings to task notes and trigger outbound sync.
   * Appends AI content to existing notes with a separator.
   */
  async aiUpdate(
    userId: string,
    accountId: string,
    taskId: string,
    body: { notes_append: string; conversation_id?: string },
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Fetch existing task
    const existingTask = await this.findOne(userId, accountId, taskId, accessToken);

    // Append AI findings to existing notes
    const timestamp = new Date().toISOString().split('T')[0];
    const separator = `\n\n--- AI Findings (${timestamp}) ---\n`;
    const updatedNotes = (existingTask.notes || '') + separator + body.notes_append;

    const { data, error } = await client
      .from('tasks')
      .update({
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .eq('account_id', accountId)
      .select('*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon)')
      .single();

    if (error) {
      throw new Error(`Failed to update task with AI findings: ${error.message}`);
    }

    this.logger.log(`AI findings saved to task ${taskId}`);

    // Trigger outbound sync if task has a source
    let syncResult: { success: boolean; provider?: string; external_id?: string; error?: string } | null = null;
    if (data.source_id) {
      syncResult = await this.outboundSync.syncTaskToSource(taskId);
      this.logger.log(
        `Outbound sync for AI update: ${syncResult?.success ? 'success' : 'failed'} (${syncResult?.provider})`,
      );
    }

    return {
      task: data,
      sync: syncResult,
    };
  }

  /**
   * Sprint 7: Manually sync a task to its external source
   */
  async syncToSource(
    userId: string,
    accountId: string,
    taskId: string,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify task exists
    const task = await this.findOne(userId, accountId, taskId, accessToken);

    if (!task.source_id) {
      return { success: true, message: 'Local task — no external source to sync' };
    }

    const result = await this.outboundSync.syncTaskToSource(taskId);
    return result;
  }

  /**
   * Get sync status for a specific task
   */
  async getSyncStatus(userId: string, accountId: string, id: string, accessToken?: string) {
    const task = await this.findOne(userId, accountId, id, accessToken);

    if (!task.source_id) {
      return { synced: true, message: 'Local task (no external source)' };
    }

    return {
      synced: true, // TODO: Implement actual sync status check
      last_synced_at: task.last_synced_at,
      source: task.sources,
    };
  }
}
