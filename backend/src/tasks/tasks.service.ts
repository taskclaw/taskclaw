import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  tasks,
  categories,
  sources,
  boardInstances,
  boardSteps,
} from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { OutboundSyncService } from '../sync/outbound-sync.service';
import { NotionAdapter } from '../adapters/notion/notion.adapter';
import { ConversationsService } from '../conversations/conversations.service';
import { WebhookEmitterService } from '../webhooks/webhook-emitter.service';
import { DAGExecutorService } from '../board-routing/dag-executor.service';
import { ExecutionLogService } from '../heartbeat/execution-log.service';
import { MentionDispatchService } from '../mention/dispatch.service';

interface TaskFilters {
  category_id?: string;
  source_id?: string;
  status?: string;
  priority?: string;
  completed?: boolean;
  board_id?: string;
}

/**
 * `with` clause for the canonical task embed. PostgREST expressed this as
 * `categories:categories!category_id(...), sources(...),
 *  override_category:categories!override_category_id(...),
 *  assignee_agent:agents!assignee_id(...)`. Drizzle's relational query returns
 * each joined row under the *relation* name from `relations.ts`
 * (`category_categoryId`, `category_overrideCategoryId`, `source`, `agent`),
 * so we re-key in `present()` to preserve the PostgREST response shape callers
 * depend on.
 */
const TASK_EMBED_WITH = {
  category_categoryId: {
    columns: { id: true, name: true, color: true, icon: true },
  },
  source: {
    columns: { id: true, provider: true },
  },
  category_overrideCategoryId: {
    columns: { id: true, name: true, color: true, icon: true },
  },
  agent: {
    columns: { id: true, name: true, color: true, avatarUrl: true },
  },
} as const;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
    private readonly outboundSync: OutboundSyncService,
    private readonly notionAdapter: NotionAdapter,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    private readonly webhookEmitter: WebhookEmitterService,
    @Inject(forwardRef(() => DAGExecutorService))
    private readonly dagExecutor: DAGExecutorService,
    private readonly executionLog: ExecutionLogService,
    private readonly mentionDispatch: MentionDispatchService,
  ) {}

  /**
   * Re-key Drizzle relation names back to the PostgREST aliases so the response
   * shape is byte-for-byte what callers expect:
   *   category_categoryId          → categories
   *   category_overrideCategoryId  → override_category
   *   source                       → sources
   *   agent                        → assignee_agent
   * Each missing relation collapses to `null`, matching PostgREST's behaviour
   * for an unmatched embedded select.
   */
  private present(row: any) {
    const {
      category_categoryId,
      category_overrideCategoryId,
      source,
      agent,
      ...rest
    } = row;
    return {
      ...rest,
      categories: category_categoryId ?? null,
      sources: source ?? null,
      override_category: category_overrideCategoryId ?? null,
      assignee_agent: agent ?? null,
    };
  }

  async findAll(
    userId: string,
    accountId: string,
    filters?: TaskFilters,
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const conditions = [eq(tasks.accountId, accountId)];

    // Apply filters
    if (filters?.category_id) {
      conditions.push(eq(tasks.categoryId, filters.category_id));
    }
    if (filters?.source_id) {
      conditions.push(eq(tasks.sourceId, filters.source_id));
    }
    if (filters?.status) {
      conditions.push(eq(tasks.status, filters.status));
    }
    if (filters?.priority) {
      conditions.push(eq(tasks.priority, filters.priority));
    }
    if (filters?.completed !== undefined) {
      conditions.push(eq(tasks.completed, filters.completed));
    }
    if (filters?.board_id) {
      conditions.push(eq(tasks.boardInstanceId, filters.board_id));
    } else {
      // Default: only show legacy (boardless) tasks unless board_id is specified
      conditions.push(sql`${tasks.boardInstanceId} is null`);
    }

    const rows = await this.db.query.tasks.findMany({
      where: and(...conditions),
      orderBy: desc(tasks.createdAt),
      with: TASK_EMBED_WITH,
    });

    return rows.map((r) => this.present(r));
  }

  async findOne(
    userId: string,
    accountId: string,
    id: string,
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const row = await this.db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.accountId, accountId)),
      with: TASK_EMBED_WITH,
    });

    if (!row) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.present(row);
  }

  async create(
    userId: string,
    accountId: string,
    createTaskDto: CreateTaskDto,
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify category exists and belongs to this account (if provided)
    if (createTaskDto.category_id) {
      const [category] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, createTaskDto.category_id),
            eq(categories.accountId, accountId),
          ),
        )
        .limit(1);

      if (!category) {
        throw new BadRequestException('Invalid agent ID for this account');
      }
    }

    // If source_id provided, verify it exists and belongs to this account
    if (createTaskDto.source_id) {
      const [source] = await this.db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            eq(sources.id, createTaskDto.source_id),
            eq(sources.accountId, accountId),
          ),
        )
        .limit(1);

      if (!source) {
        throw new BadRequestException('Invalid source_id for this account');
      }
    }

    // Resolve status and default agent from board step if board context provided
    let status = createTaskDto.status || 'To-Do';
    let defaultAgentId: string | null = null;
    if (createTaskDto.current_step_id) {
      const [step] = await this.db
        .select({
          name: boardSteps.name,
          defaultAgentId: boardSteps.defaultAgentId,
        })
        .from(boardSteps)
        .where(eq(boardSteps.id, createTaskDto.current_step_id))
        .limit(1);
      if (step) {
        status = step.name;
        defaultAgentId = step.defaultAgentId ?? null;
      }
    }

    const inserted = await this.db
      .insert(tasks)
      .values({
        accountId,
        categoryId: createTaskDto.category_id || null,
        sourceId: createTaskDto.source_id || null,
        title: createTaskDto.title,
        status,
        priority: createTaskDto.priority || 'Medium',
        completed: createTaskDto.completed || false,
        notes: createTaskDto.notes || '',
        dueDate: createTaskDto.due_date || null,
        boardInstanceId: createTaskDto.board_instance_id || null,
        currentStepId: createTaskDto.current_step_id || null,
        cardData: createTaskDto.card_data || {},
        // F02: auto-assign to column's default agent if one exists
        assigneeType: defaultAgentId ? 'agent' : 'none',
        assigneeId: defaultAgentId,
      })
      .returning();

    const data = await this.findOne(userId, accountId, inserted[0].id);

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
    tasksInput: Array<{
      title: string;
      priority?: string;
      notes?: string;
      card_data?: Record<string, any>;
    }>,
    accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify board exists
    const [board] = await this.db
      .select({ id: boardInstances.id })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      )
      .limit(1);

    if (!board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    // Get first step for default placement (include ai_first for auto-trigger)
    const steps = await this.db
      .select({
        id: boardSteps.id,
        name: boardSteps.name,
        step_key: boardSteps.stepKey,
        step_type: boardSteps.stepType,
        trigger_type: boardSteps.triggerType,
        ai_first: boardSteps.aiFirst,
        linked_category_id: boardSteps.linkedCategoryId,
        position: boardSteps.position,
      })
      .from(boardSteps)
      .where(eq(boardSteps.boardInstanceId, boardId))
      .orderBy(asc(boardSteps.position))
      .limit(1);

    const firstStep = steps?.[0];
    const status = firstStep?.name || 'To-Do';

    // Create all tasks
    const rows = tasksInput.map((t) => ({
      accountId,
      title: t.title,
      priority: t.priority || 'Medium',
      notes: t.notes || '',
      boardInstanceId: boardId,
      currentStepId: firstStep?.id || null,
      cardData: t.card_data || {},
      status,
      completed: false,
    }));

    const inserted = await this.db
      .insert(tasks)
      .values(rows)
      .returning({ id: tasks.id });

    // Re-fetch each created task with the canonical embed so the response shape
    // matches PostgREST's `.insert(...).select(<embed>)`.
    const data = await Promise.all(
      inserted.map((t) => this.findOne(userId, accountId, t.id)),
    );

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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify task exists and belongs to account
    const existingTask = await this.findOne(userId, accountId, id, accessToken);

    // If updating category, verify it belongs to this account
    if (updateTaskDto.category_id) {
      const [category] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, updateTaskDto.category_id),
            eq(categories.accountId, accountId),
          ),
        )
        .limit(1);

      if (!category) {
        throw new BadRequestException('Invalid agent ID for this account');
      }
    }

    // Map the snake_case DTO to camelCase columns (only defined fields).
    // PostgREST previously spread the DTO directly; here we map field-by-field.
    const updateData: Record<string, any> = {};
    if (updateTaskDto.title !== undefined)
      updateData.title = updateTaskDto.title;
    if (updateTaskDto.category_id !== undefined)
      updateData.categoryId = updateTaskDto.category_id;
    if (updateTaskDto.status !== undefined)
      updateData.status = updateTaskDto.status;
    if (updateTaskDto.priority !== undefined)
      updateData.priority = updateTaskDto.priority;
    if (updateTaskDto.notes !== undefined)
      updateData.notes = updateTaskDto.notes;
    if (updateTaskDto.due_date !== undefined)
      updateData.dueDate = updateTaskDto.due_date;
    if (updateTaskDto.current_step_id !== undefined)
      updateData.currentStepId = updateTaskDto.current_step_id;
    if (updateTaskDto.override_category_id !== undefined)
      updateData.overrideCategoryId = updateTaskDto.override_category_id;
    if (updateTaskDto.backbone_connection_id !== undefined)
      updateData.backboneConnectionId = updateTaskDto.backbone_connection_id;
    if (updateTaskDto.completed !== undefined)
      updateData.completed = updateTaskDto.completed;

    // Handle completion state
    if (updateTaskDto.completed === true && !existingTask.completed) {
      updateData.completedAt = new Date().toISOString();
    } else if (updateTaskDto.completed === false) {
      updateData.completedAt = null;
    }

    // Merge card_data: preserve prior step data, overwrite at step_key level
    if (updateTaskDto.card_data) {
      const existingCardData = existingTask.card_data || {};
      updateData.cardData = {
        ...existingCardData,
        ...updateTaskDto.card_data,
      };
    }

    // Auto-sync status when current_step_id changes (board tasks)
    if (
      updateTaskDto.current_step_id &&
      updateTaskDto.current_step_id !== existingTask.current_step_id
    ) {
      const [step] = await this.db
        .select({
          name: boardSteps.name,
          step_type: boardSteps.stepType,
          default_agent_id: boardSteps.defaultAgentId,
        })
        .from(boardSteps)
        .where(eq(boardSteps.id, updateTaskDto.current_step_id))
        .limit(1);
      if (step) {
        updateData.status = step.name;
        // Auto-complete when moved to "done" step
        if (step.step_type === 'done' && !existingTask.completed) {
          updateData.completed = true;
          updateData.completedAt = new Date().toISOString();
        }
        // F02: auto-assign to new column's default agent if task is currently unassigned
        if (step.default_agent_id && existingTask.assignee_type === 'none') {
          updateData.assigneeType = 'agent';
          updateData.assigneeId = step.default_agent_id;
        }
      }
    }

    await this.db
      .update(tasks)
      .set(updateData)
      .where(and(eq(tasks.id, id), eq(tasks.accountId, accountId)));

    const data = await this.findOne(userId, accountId, id);

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

    // PRD §7 — fire mention dispatch when notes changed. Mention spawning
    // happens in the background to keep the update response snappy; failures
    // never block the caller.
    const notesChanged =
      typeof updateTaskDto.notes === 'string' &&
      updateTaskDto.notes !== existingTask.notes;
    if (notesChanged) {
      const parentDepth = Number(
        (existingTask.input_context as any)?.mention_depth ?? 0,
      );
      this.mentionDispatch
        .dispatch({
          account_id: accountId,
          source_task_id: id,
          source_user_id: userId,
          text: updateTaskDto.notes ?? '',
          parent_mention_depth: Number.isFinite(parentDepth) ? parentDepth : 0,
        })
        .catch((err) =>
          this.logger.error(
            `Mention dispatch failed for task ${id}: ${(err as Error).message}`,
          ),
        );
    }

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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify task exists and belongs to account
    await this.findOne(userId, accountId, id, accessToken);

    await this.db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.accountId, accountId)));

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
    _accessToken?: string,
  ): Promise<string> {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Fetch task with source info
    const task = await this.db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)),
      with: {
        source: {
          columns: { id: true, provider: true, config: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    // Only Notion tasks have page content
    if (
      !task.sourceId ||
      !task.externalId ||
      task.source?.provider !== 'notion'
    ) {
      return '';
    }

    try {
      return await this.notionAdapter.getPageContent(
        task.source.config,
        task.externalId,
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
    _accessToken?: string,
  ): Promise<
    Array<{ id: string; text: string; created_at: string; author: string }>
  > {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Fetch task with source info
    const task = await this.db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)),
      with: {
        source: {
          columns: { id: true, provider: true, config: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    // Only Notion tasks have comments via API
    if (
      !task.sourceId ||
      !task.externalId ||
      task.source?.provider !== 'notion'
    ) {
      return [];
    }

    try {
      return await this.notionAdapter.getComments(
        task.source.config,
        task.externalId,
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

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

    const updatePayload: Record<string, any> = {
      notes: updatedNotes,
      updatedAt: new Date().toISOString(),
    };

    // Merge card_data if provided by AI
    if (body.card_data) {
      const existingCardData = existingTask.card_data || {};
      updatePayload.cardData = { ...existingCardData, ...body.card_data };
    }

    await this.db
      .update(tasks)
      .set(updatePayload)
      .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));

    const data = await this.findOne(userId, accountId, taskId);

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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

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
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = `%${query.trim()}%`;

    const rows = await this.db.query.tasks.findMany({
      where: and(
        eq(tasks.accountId, accountId),
        or(ilike(tasks.title, searchTerm), ilike(tasks.notes, searchTerm)),
      ),
      orderBy: desc(tasks.updatedAt),
      limit: 50,
      with: TASK_EMBED_WITH,
    });

    return rows.map((r) => this.present(r));
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
    _accessToken?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

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
          payload.currentStepId = update.current_step_id;
        if (update.completed !== undefined)
          payload.completed = update.completed;

        if (Object.keys(payload).length === 0) {
          results.push({ id: update.id, success: true });
          continue;
        }

        const updated = await this.db
          .update(tasks)
          .set(payload)
          .where(
            and(eq(tasks.id, update.id), eq(tasks.accountId, accountId)),
          )
          .returning();

        const data = updated[0];

        const webhookEvent = update.completed
          ? 'task.completed'
          : 'task.updated';
        this.webhookEmitter.emit(accountId, webhookEvent, { task: data });
        results.push({ id: update.id, success: true });
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const task = await this.findOne(userId, accountId, taskId, accessToken);

    const blockerMeta = {
      reason: dto.reason,
      blocker_type: dto.blocker_type ?? 'missing_data',
      suggested_resolution: dto.suggested_resolution ?? null,
      reported_at: new Date().toISOString(),
    };

    // Merge blocker into existing metadata, preserve other fields
    const updatedMetadata = {
      ...((task.metadata as Record<string, any>) ?? {}),
      blocker: blockerMeta,
    };

    await this.db
      .update(tasks)
      .set({
        status: 'blocked',
        metadata: updatedMetadata,
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));

    const updatedTask = await this.db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)),
      with: {
        category_categoryId: {
          columns: { id: true, name: true, color: true },
        },
        agent: {
          columns: { id: true, name: true },
        },
      },
    });

    const presentedTask = updatedTask
      ? this.presentBlocker(updatedTask)
      : updatedTask;

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
      task: presentedTask,
      blocker: blockerMeta,
    });

    this.logger.log(`Blocker reported on task ${taskId}: ${dto.reason}`);

    return { task: presentedTask, blocker: blockerMeta };
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const task = await this.findOne(userId, accountId, taskId, accessToken);

    // Remove the blocker from metadata
    const { blocker: _removed, ...metadataWithoutBlocker } = (task.metadata ??
      {}) as any;

    await this.db
      .update(tasks)
      .set({
        status: 'in_progress',
        metadata: metadataWithoutBlocker,
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));

    const updatedTask = await this.db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)),
      with: {
        category_categoryId: {
          columns: { id: true, name: true, color: true },
        },
        agent: {
          columns: { id: true, name: true },
        },
      },
    });

    const presentedTask = updatedTask
      ? this.presentBlocker(updatedTask)
      : updatedTask;

    await this.executionLog.create({
      account_id: accountId,
      trigger_type: 'manual',
      status: 'success',
      task_id: taskId,
      board_id: task.board_instance_id ?? undefined,
      summary: `Blocker resolved on task: ${task.title}`,
    });

    this.webhookEmitter.emit(accountId, 'task.blocker_resolved', {
      task: presentedTask,
    });

    this.logger.log(`Blocker resolved on task ${taskId}`);

    return { task: presentedTask };
  }

  /**
   * Re-key the slim blocker embed (`categories!category_id(id, name, color),
   * agents!assignee_id(id, name)`) back to the PostgREST aliases.
   */
  private presentBlocker(row: any) {
    const { category_categoryId, agent, ...rest } = row;
    return {
      ...rest,
      categories: category_categoryId ?? null,
      assignee_agent: agent ?? null,
    };
  }
}
