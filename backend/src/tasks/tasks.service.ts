import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { OutboundSyncService } from '../sync/outbound-sync.service';
import { NotionAdapter } from '../adapters/notion/notion.adapter';
import { ConversationsService } from '../conversations/conversations.service';
import { WebhookEmitterService } from '../webhooks/webhook-emitter.service';
import { DAGExecutorService } from '../board-routing/dag-executor.service';
import { ExecutionLogService } from '../heartbeat/execution-log.service';

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
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    private readonly webhookEmitter: WebhookEmitterService,
    @Inject(forwardRef(() => DAGExecutorService))
    private readonly dagExecutor: DAGExecutorService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  async findAll(
    userId: string,
    accountId: string,
    filters?: TaskFilters,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    let query = client
      .from('tasks')
      .select(
        '*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon), assignee_agent:agents!assignee_id(id, name, color, avatar_url)',
      )
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

  async findOne(
    userId: string,
    accountId: string,
    id: string,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('tasks')
      .select(
        '*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon), assignee_agent:agents!assignee_id(id, name, color, avatar_url)',
      )
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return data;
  }

  async create(
    userId: string,
    accountId: string,
    createTaskDto: CreateTaskDto,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify category exists and belongs to this account (if provided)
    if (createTaskDto.category_id) {
      const { data: category, error: categoryError } = await client
        .from('categories')
        .select('id')
        .eq('id', createTaskDto.category_id)
        .eq('account_id', accountId)
        .single();

      if (categoryError || !category) {
        throw new BadRequestException('Invalid agent ID for this account');
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

    // Resolve status and default agent from board step if board context provided
    let status = createTaskDto.status || 'To-Do';
    let defaultAgentId: string | null = null;
    if (createTaskDto.current_step_id) {
      const { data: step } = await client
        .from('board_steps')
        .select('name, default_agent_id')
        .eq('id', createTaskDto.current_step_id)
        .single();
      if (step) {
        status = step.name;
        defaultAgentId = step.default_agent_id ?? null;
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
        card_data: createTaskDto.card_data || {},
        // F02: auto-assign to column's default agent if one exists
        assignee_type: defaultAgentId ? 'agent' : 'none',
        assignee_id: defaultAgentId,
      })
      .select(
        '*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon), assignee_agent:agents!assignee_id(id, name, color, avatar_url)',
      )
      .single();

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`);
    }

    this.webhookEmitter.emit(accountId, 'task.created', { task: data });

    return data;
  }

  /**
   * Bulk-create tasks for a board. Used by Board AI Chat after user confirms.
   */
  async bulkCreateForBoard(
    userId: string,
    accountId: string,
    boardId: string,
    tasks: Array<{
      title: string;
      priority?: string;
      notes?: string;
      card_data?: Record<string, any>;
    }>,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify board exists
    const { data: board, error: boardError } = await client
      .from('board_instances')
      .select('id')
      .eq('id', boardId)
      .eq('account_id', accountId)
      .single();

    if (boardError || !board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    // Get first step for default placement (include ai_first for auto-trigger)
    const { data: steps } = await client
      .from('board_steps')
      .select(
        'id, name, step_key, step_type, trigger_type, ai_first, linked_category_id, position',
      )
      .eq('board_instance_id', boardId)
      .order('position', { ascending: true })
      .limit(1);

    const firstStep = steps?.[0];
    const status = firstStep?.name || 'To-Do';

    // Create all tasks
    const rows = tasks.map((t) => ({
      account_id: accountId,
      title: t.title,
      priority: t.priority || 'Medium',
      notes: t.notes || '',
      board_instance_id: boardId,
      current_step_id: firstStep?.id || null,
      card_data: t.card_data || {},
      status,
      completed: false,
    }));

    const { data, error } = await client
      .from('tasks')
      .insert(rows)
      .select(
        '*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon), assignee_agent:agents!assignee_id(id, name, color, avatar_url)',
      );

    if (error) {
      throw new Error(`Failed to bulk-create tasks: ${error.message}`);
    }

    this.logger.log(
      `Bulk-created ${data?.length || 0} tasks for board ${boardId}`,
    );

    // Auto-trigger AI First if the first step has it enabled
    if (firstStep?.ai_first && accessToken && data?.length) {
      const logPrefix = `[BulkCreate:${boardId.slice(0, 8)}]`;
      this.logger.log(
        `${logPrefix} First step "${firstStep.name}" has AI First enabled — triggering for ${data.length} tasks (max 2 concurrent, 5s stagger)`,
      );

      // Stagger triggers: max 2 concurrent, 5s delay between each pair
      const CONCURRENCY = 2;
      const STAGGER_MS = 5000;

      const triggerWithStagger = async () => {
        for (let i = 0; i < data.length; i += CONCURRENCY) {
          const batch = data.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            batch.map((task) =>
              this.conversationsService
                .autoTriggerAiForStep(
                  task.id,
                  accountId,
                  userId,
                  accessToken,
                  firstStep,
                  logPrefix,
                  0,
                )
                .catch((err) =>
                  this.logger.error(
                    `${logPrefix} AI trigger failed for task ${task.id}: ${err.message}`,
                  ),
                ),
            ),
          );
          // Wait before next batch (skip delay after the last batch)
          if (i + CONCURRENCY < data.length) {
            await new Promise((r) => setTimeout(r, STAGGER_MS));
          }
        }
      };

      // Run in background — don't block response
      triggerWithStagger().catch((err) =>
        this.logger.error(
          `${logPrefix} Staggered AI trigger failed: ${err.message}`,
        ),
      );
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

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

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
        throw new BadRequestException('Invalid agent ID for this account');
      }
    }

    // Handle completion state
    const updateData: any = { ...updateTaskDto };
    if (updateTaskDto.completed === true && !existingTask.completed) {
      updateData.completed_at = new Date().toISOString();
    } else if (updateTaskDto.completed === false) {
      updateData.completed_at = null;
    }

    // Merge card_data: preserve prior step data, overwrite at step_key level
    if (updateTaskDto.card_data) {
      const existingCardData = existingTask.card_data || {};
      updateData.card_data = {
        ...existingCardData,
        ...updateTaskDto.card_data,
      };
    }

    // Auto-sync status when current_step_id changes (board tasks)
    if (
      updateTaskDto.current_step_id &&
      updateTaskDto.current_step_id !== existingTask.current_step_id
    ) {
      const { data: step } = await client
        .from('board_steps')
        .select('name, step_type, default_agent_id')
        .eq('id', updateTaskDto.current_step_id)
        .single();
      if (step) {
        updateData.status = step.name;
        // Auto-complete when moved to "done" step
        if (step.step_type === 'done' && !existingTask.completed) {
          updateData.completed = true;
          updateData.completed_at = new Date().toISOString();
        }
        // F02: auto-assign to new column's default agent if task is currently unassigned
        if (step.default_agent_id && existingTask.assignee_type === 'none') {
          updateData.assignee_type = 'agent';
          updateData.assignee_id = step.default_agent_id;
        }
      }
    }

    const { data, error } = await client
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .eq('account_id', accountId)
      .select(
        '*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon), assignee_agent:agents!assignee_id(id, name, color, avatar_url)',
      )
      .single();

    if (error) {
      throw new Error(`Failed to update task: ${error.message}`);
    }

    // Sprint 7: Trigger outbound sync if task has a source_id
    if (data.source_id) {
      this.outboundSync
        .syncTaskToSource(id)
        .catch((err) =>
          this.logger.error(
            `Outbound sync failed for task ${id}: ${err.message}`,
          ),
        );
    }

    const webhookEvent = data.completed ? 'task.completed' : 'task.updated';
    this.webhookEmitter.emit(accountId, webhookEvent, { task: data });

    // Fire-and-forget: notify DAG executor when a task is completed
    if (data.completed && data.dag_id) {
      this.dagExecutor
        .onTaskCompleted(id, data.result)
        .catch((err) =>
          this.logger.error(
            `DAG executor failed for task ${id}: ${(err as Error).message}`,
          ),
        );
    }

    return data;
  }

  async remove(
    userId: string,
    accountId: string,
    id: string,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

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

    this.webhookEmitter.emit(accountId, 'task.deleted', { task_id: id });

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
    if (
      !task.source_id ||
      !task.external_id ||
      task.sources?.provider !== 'notion'
    ) {
      return '';
    }

    try {
      return await this.notionAdapter.getPageContent(
        task.sources.config,
        task.external_id,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to fetch content for task ${taskId}: ${(err as Error).message}`,
      );
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
  ): Promise<
    Array<{ id: string; text: string; created_at: string; author: string }>
  > {
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
    if (
      !task.source_id ||
      !task.external_id ||
      task.sources?.provider !== 'notion'
    ) {
      return [];
    }

    try {
      return await this.notionAdapter.getComments(
        task.sources.config,
        task.external_id,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to fetch comments for task ${taskId}: ${(err as Error).message}`,
      );
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
    body: {
      notes_append: string;
      conversation_id?: string;
      card_data?: Record<string, any>;
    },
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Fetch existing task
    const existingTask = await this.findOne(
      userId,
      accountId,
      taskId,
      accessToken,
    );

    // Append AI findings to existing notes
    const timestamp = new Date().toISOString().split('T')[0];
    const separator = `\n\n--- AI Findings (${timestamp}) ---\n`;
    const updatedNotes =
      (existingTask.notes || '') + separator + body.notes_append;

    const updatePayload: any = {
      notes: updatedNotes,
      updated_at: new Date().toISOString(),
    };

    // Merge card_data if provided by AI
    if (body.card_data) {
      const existingCardData = existingTask.card_data || {};
      updatePayload.card_data = { ...existingCardData, ...body.card_data };
    }

    const { data, error } = await client
      .from('tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .eq('account_id', accountId)
      .select(
        '*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon), assignee_agent:agents!assignee_id(id, name, color, avatar_url)',
      )
      .single();

    if (error) {
      throw new Error(
        `Failed to update task with AI findings: ${error.message}`,
      );
    }

    this.logger.log(`AI findings saved to task ${taskId}`);

    // Trigger outbound sync if task has a source
    let syncResult: {
      success: boolean;
      provider?: string;
      external_id?: string;
      error?: string;
    } | null = null;
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
      return {
        success: true,
        message: 'Local task — no external source to sync',
      };
    }

    const result = await this.outboundSync.syncTaskToSource(taskId);
    return result;
  }

  /**
   * Full-text search on task title and notes
   */
  async search(
    userId: string,
    accountId: string,
    query: string,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = `%${query.trim()}%`;

    const { data, error } = await client
      .from('tasks')
      .select(
        '*, categories:categories!category_id(id, name, color, icon), sources(id, provider), override_category:categories!override_category_id(id, name, color, icon), assignee_agent:agents!assignee_id(id, name, color, avatar_url)',
      )
      .eq('account_id', accountId)
      .or(`title.ilike.${searchTerm},notes.ilike.${searchTerm}`)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to search tasks: ${error.message}`);
    }

    return data;
  }

  /**
   * Bulk update multiple tasks at once
   */
  async bulkUpdate(
    userId: string,
    accountId: string,
    updates: Array<{
      id: string;
      status?: string;
      priority?: string;
      current_step_id?: string;
      completed?: boolean;
    }>,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    if (!updates || updates.length === 0) {
      throw new BadRequestException('No updates provided');
    }

    if (updates.length > 100) {
      throw new BadRequestException('Maximum 100 tasks per bulk update');
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const update of updates) {
      try {
        const payload: Record<string, any> = {};
        if (update.status !== undefined) payload.status = update.status;
        if (update.priority !== undefined) payload.priority = update.priority;
        if (update.current_step_id !== undefined)
          payload.current_step_id = update.current_step_id;
        if (update.completed !== undefined)
          payload.completed = update.completed;

        if (Object.keys(payload).length === 0) {
          results.push({ id: update.id, success: true });
          continue;
        }

        const { data, error } = await client
          .from('tasks')
          .update(payload)
          .eq('id', update.id)
          .eq('account_id', accountId)
          .select()
          .single();

        if (error) {
          results.push({ id: update.id, success: false, error: error.message });
        } else {
          const webhookEvent = update.completed
            ? 'task.completed'
            : 'task.updated';
          this.webhookEmitter.emit(accountId, webhookEvent, { task: data });
          results.push({ id: update.id, success: true });
        }
      } catch (err) {
        results.push({
          id: update.id,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    return {
      total: updates.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * Get sync status for a specific task
   */
  async getSyncStatus(
    userId: string,
    accountId: string,
    id: string,
    accessToken?: string,
  ) {
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

  /**
   * Report a blocker on a task, escalating it to the pod and cockpit.
   *
   * Sets task.status = 'blocked' and stores the blocker details in metadata.
   * Writes an execution_log entry so the cockpit timeline shows the event.
   * Emits a webhook event for external integrations.
   *
   * Supabase Realtime broadcasts the tasks UPDATE automatically, so the
   * cockpit UI will receive the blocker notification without polling.
   */
  async reportBlocker(
    userId: string,
    accountId: string,
    taskId: string,
    dto: {
      reason: string;
      blocker_type?: 'dependency' | 'external_tool' | 'missing_data' | 'human_required';
      suggested_resolution?: string;
    },
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const task = await this.findOne(userId, accountId, taskId, accessToken);

    const blockerMeta = {
      reason: dto.reason,
      blocker_type: dto.blocker_type ?? 'missing_data',
      suggested_resolution: dto.suggested_resolution ?? null,
      reported_at: new Date().toISOString(),
    };

    // Merge blocker into existing metadata, preserve other fields
    const updatedMetadata = {
      ...(task.metadata ?? {}),
      blocker: blockerMeta,
    };

    const { data: updatedTask, error } = await client
      .from('tasks')
      .update({
        status: 'blocked',
        metadata: updatedMetadata,
      })
      .eq('id', taskId)
      .eq('account_id', accountId)
      .select('*, categories:categories!category_id(id, name, color), assignee_agent:agents!assignee_id(id, name)')
      .single();

    if (error) {
      throw new Error(`Failed to report blocker: ${error.message}`);
    }

    // Log execution event — appears in 24H cockpit timeline
    await this.executionLog.create({
      account_id: accountId,
      trigger_type: 'manual',
      status: 'error',
      task_id: taskId,
      board_id: task.board_instance_id ?? undefined,
      summary: `Blocker reported: ${dto.reason}`,
      error_details: dto.suggested_resolution ?? undefined,
      metadata: {
        blocker_type: dto.blocker_type ?? 'missing_data',
        task_title: task.title,
      },
    });

    // Emit webhook for external integrations
    this.webhookEmitter.emit(accountId, 'task.blocked', {
      task: updatedTask,
      blocker: blockerMeta,
    });

    this.logger.log(`Blocker reported on task ${taskId}: ${dto.reason}`);

    return { task: updatedTask, blocker: blockerMeta };
  }

  /**
   * Resolve a blocker on a task, restoring it to its previous active status.
   */
  async resolveBlocker(
    userId: string,
    accountId: string,
    taskId: string,
    accessToken?: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const task = await this.findOne(userId, accountId, taskId, accessToken);

    // Remove the blocker from metadata
    const { blocker: _removed, ...metadataWithoutBlocker } = (task.metadata ?? {}) as any;

    const { data: updatedTask, error } = await client
      .from('tasks')
      .update({
        status: 'in_progress',
        metadata: metadataWithoutBlocker,
      })
      .eq('id', taskId)
      .eq('account_id', accountId)
      .select('*, categories:categories!category_id(id, name, color), assignee_agent:agents!assignee_id(id, name)')
      .single();

    if (error) {
      throw new Error(`Failed to resolve blocker: ${error.message}`);
    }

    await this.executionLog.create({
      account_id: accountId,
      trigger_type: 'manual',
      status: 'success',
      task_id: taskId,
      board_id: task.board_instance_id ?? undefined,
      summary: `Blocker resolved on task: ${task.title}`,
    });

    this.webhookEmitter.emit(accountId, 'task.blocker_resolved', { task: updatedTask });

    this.logger.log(`Blocker resolved on task ${taskId}`);

    return { task: updatedTask };
  }
}
