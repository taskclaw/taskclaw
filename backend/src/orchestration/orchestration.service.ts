import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  forwardRef,
  Inject,
  Optional,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  orchestratedTasks,
  orchestratedTaskDeps,
  tasks,
  pods,
} from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateOrchestrationDto } from './orchestration.dto';
import { DagTaskDispatcher } from './dag-task-dispatcher.service';

export interface OrchestratedTask {
  id: string;
  account_id: string;
  pod_id: string | null;
  parent_orchestrated_task_id: string | null;
  goal: string;
  input_context: Record<string, unknown> | null;
  status: string;
  autonomy_level: number;
  result_summary: string | null;
  structured_output: unknown | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OrchestrationResult {
  orchestration: OrchestratedTask;
  tasks: OrchestratedTask[];
}

export interface OrchestrationDetail {
  orchestration: OrchestratedTask;
  tasks: OrchestratedTask[];
  deps: Array<{ upstream_task_id: string; downstream_task_id: string }>;
  boardTasks?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    board_instance_id: string | null;
    created_at: string;
  }>;
}

/**
 * Drizzle's relational query returns the joined `pods` row under the relation
 * name `pod`; PostgREST returned it under the table name `pods`. The pod fields
 * are flattened onto the orchestration row here (`pod_name` / `pod_slug`), so we
 * read off the `pod` relation key and drop it from the response.
 */
@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
    @Optional() @Inject(forwardRef(() => DagTaskDispatcher))
    private readonly dagDispatcher: DagTaskDispatcher | null,
  ) {}

  /**
   * Create a full orchestration DAG from a high-level goal.
   * Creates one parent orchestrated_tasks row as the DAG container,
   * then one child row per task with dependency edges.
   */
  async createOrchestration(
    userId: string,
    accountId: string,
    dto: CreateOrchestrationDto,
  ): Promise<OrchestrationResult> {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Determine effective autonomy_level
    let effectiveAutonomy = dto.autonomy_level ?? 1;

    // If not provided, try to get from the first pod's autonomy_level
    if (!dto.autonomy_level && dto.tasks.length > 0) {
      const podRows = await this.db.query.pods.findFirst({
        columns: { autonomyLevel: true },
        where: and(
          eq(pods.id, dto.tasks[0].pod_id),
          eq(pods.accountId, accountId),
        ),
      });
      if (podRows?.autonomyLevel) {
        effectiveAutonomy = podRows.autonomyLevel;
      }
    }

    // Parent orchestration always starts as 'pending_approval' so the user
    // can review the plan before execution begins — regardless of autonomy_level.
    // autonomy_level controls how the pod executes tasks (e.g. pauses for confirmation),
    // not whether the human approves the orchestration itself.
    const parentStatus = 'pending_approval';

    // Create the parent orchestration container row
    // Store the primary pod_id (first task's pod) so the parent row can show a pod name
    const primaryPodId = dto.tasks.length > 0 ? dto.tasks[0].pod_id : null;

    const parentRows = await this.db
      .insert(orchestratedTasks)
      .values({
        accountId,
        podId: primaryPodId,
        parentOrchestratedTaskId: null,
        goal: dto.goal,
        inputContext: null,
        status: parentStatus,
        autonomyLevel: effectiveAutonomy,
        metadata: { task_count: dto.tasks.length },
      })
      .returning();
    const parentTask = this.toOrchestratedTask(parentRows[0]);

    if (!parentTask) {
      throw new Error('Failed to create orchestration: undefined');
    }

    this.logger.log(
      `Orchestration parent created: ${parentTask.id} status=${parentTask.status}`,
    );

    // All child tasks start as 'pending_approval' — they are promoted to 'pending'
    // (and dispatched) only when the user approves the orchestration via approveOrchestration().
    const taskInserts = dto.tasks.map((t, _idx) => ({
      accountId,
      podId: t.pod_id,
      parentOrchestratedTaskId: parentTask.id,
      goal: t.goal,
      inputContext: t.input_context ?? null,
      status: 'pending_approval', // will be updated after inserting
      autonomyLevel: effectiveAutonomy,
      metadata: {},
    }));

    let childTasks: OrchestratedTask[];
    try {
      const childRows = await this.db
        .insert(orchestratedTasks)
        .values(taskInserts)
        .returning();
      childTasks = childRows.map((r) => this.toOrchestratedTask(r)!);
    } catch (childError: any) {
      // Rollback parent
      await this.db
        .delete(orchestratedTasks)
        .where(eq(orchestratedTasks.id, parentTask.id));
      throw new Error(`Failed to create child tasks: ${childError?.message}`);
    }

    // Build dependency edges
    const depInserts: Array<{
      upstreamTaskId: string;
      downstreamTaskId: string;
    }> = [];

    dto.tasks.forEach((taskDto, idx) => {
      if (taskDto.depends_on_indices && taskDto.depends_on_indices.length > 0) {
        for (const upstreamIdx of taskDto.depends_on_indices) {
          if (upstreamIdx >= 0 && upstreamIdx < childTasks.length) {
            depInserts.push({
              upstreamTaskId: childTasks[upstreamIdx].id,
              downstreamTaskId: childTasks[idx].id,
            });
          }
        }
      }
    });

    if (depInserts.length > 0) {
      try {
        await this.db.insert(orchestratedTaskDeps).values(depInserts);
      } catch (depError: any) {
        this.logger.error(`Failed to create task deps: ${depError.message}`);
        // Not rolling back — tasks created, deps are best-effort here but log the error
        throw new Error(`Failed to create task dependencies: ${depError.message}`);
      }
    }

    this.logger.log(
      `Orchestration created: ${parentTask.id} with ${childTasks.length} tasks, ${depInserts.length} dep edges`,
    );

    return {
      orchestration: parentTask,
      tasks: childTasks,
    };
  }

  /**
   * List top-level orchestrations (parent rows) for an account.
   */
  async listOrchestrations(
    userId: string,
    accountId: string,
  ): Promise<OrchestratedTask[]> {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const data = await this.db.query.orchestratedTasks.findMany({
      where: and(
        eq(orchestratedTasks.accountId, accountId),
        isNull(orchestratedTasks.parentOrchestratedTaskId),
      ),
      orderBy: desc(orchestratedTasks.createdAt),
      with: { pod: { columns: { id: true, name: true, slug: true } } },
    });

    // For parent rows without a pod_id (legacy data), look up pod from first child task
    const parentRows = data as any[];
    const nullPodParentIds = parentRows
      .filter((r) => !r.podId)
      .map((r) => r.id);

    let childPodMap: Record<string, { name: string | null; slug: string | null }> = {};
    if (nullPodParentIds.length > 0) {
      const childData = await this.db.query.orchestratedTasks.findMany({
        columns: { parentOrchestratedTaskId: true },
        where: and(
          inArray(orchestratedTasks.parentOrchestratedTaskId, nullPodParentIds),
          isNotNull(orchestratedTasks.podId),
        ),
        orderBy: asc(orchestratedTasks.createdAt),
        with: { pod: { columns: { id: true, name: true, slug: true } } },
      });

      for (const child of childData as any[]) {
        const parentId = child.parentOrchestratedTaskId;
        if (!childPodMap[parentId] && child.pod) {
          childPodMap[parentId] = { name: child.pod.name ?? null, slug: child.pod.slug ?? null };
        }
      }
    }

    return parentRows.map((row) => {
      const { pod, ...rest } = row;
      return {
        ...this.toOrchestratedTask(rest),
        pod_name: pod?.name ?? childPodMap[row.id]?.name ?? null,
        pod_slug: pod?.slug ?? childPodMap[row.id]?.slug ?? null,
      };
    }) as OrchestratedTask[];
  }

  /**
   * Get a single orchestration with all child tasks and dependency edges.
   */
  async getOrchestration(
    userId: string,
    accountId: string,
    orchestrationId: string,
  ): Promise<OrchestrationDetail> {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Fetch parent
    const orchestration = await this.db.query.orchestratedTasks.findFirst({
      where: and(
        eq(orchestratedTasks.id, orchestrationId),
        eq(orchestratedTasks.accountId, accountId),
        isNull(orchestratedTasks.parentOrchestratedTaskId),
      ),
    });

    if (!orchestration) {
      throw new NotFoundException(
        `Orchestration ${orchestrationId} not found`,
      );
    }

    // Fetch child tasks
    const taskRows = await this.db
      .select()
      .from(orchestratedTasks)
      .where(eq(orchestratedTasks.parentOrchestratedTaskId, orchestrationId))
      .orderBy(asc(orchestratedTasks.createdAt));

    const childTasks = taskRows.map((r) => this.toOrchestratedTask(r)!);

    // Fetch deps for child tasks
    const taskIds = childTasks.map((t) => t.id);
    let deps: Array<{ upstream_task_id: string; downstream_task_id: string }> =
      [];

    if (taskIds.length > 0) {
      try {
        const depsData = await this.db
          .select({
            upstream_task_id: orchestratedTaskDeps.upstreamTaskId,
            downstream_task_id: orchestratedTaskDeps.downstreamTaskId,
          })
          .from(orchestratedTaskDeps)
          .where(inArray(orchestratedTaskDeps.upstreamTaskId, taskIds));
        deps = depsData ?? [];
      } catch (depsError: any) {
        this.logger.warn(`Failed to fetch deps: ${depsError.message}`);
      }
    }

    // Fetch board tasks created during this orchestration (via metadata.orchestration_id)
    // These are tracked for the live task cards feature in the Cockpit
    const allOrchIds = [orchestrationId, ...taskIds];
    const boardTasksResults = await Promise.all(
      allOrchIds.map((oid) =>
        this.db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            board_instance_id: tasks.boardInstanceId,
            created_at: tasks.createdAt,
            metadata: tasks.metadata,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.accountId, accountId),
              sql`${tasks.metadata} @> ${JSON.stringify({ orchestration_id: oid })}::jsonb`,
            ),
          ),
      ),
    );
    const boardTasks = boardTasksResults
      .flatMap((r) => r ?? [])
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

    return {
      orchestration: this.toOrchestratedTask(orchestration)!,
      tasks: childTasks,
      deps,
      boardTasks: boardTasks as OrchestrationDetail['boardTasks'],
    };
  }

  /**
   * Mark a task as completed with result.
   * After persisting, triggers DAG continuation via DagTaskDispatcher (F021).
   */
  async completeTask(
    taskId: string,
    result: { summary: string; structured_output?: unknown },
  ): Promise<void> {
    // Fetch account_id before updating (needed for DAG continuation)
    const [taskRow] = await this.db
      .select({ account_id: orchestratedTasks.accountId })
      .from(orchestratedTasks)
      .where(eq(orchestratedTasks.id, taskId))
      .limit(1);

    try {
      await this.db
        .update(orchestratedTasks)
        .set({
          status: 'completed',
          resultSummary: result.summary,
          structuredOutput: result.structured_output ?? null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(orchestratedTasks.id, taskId));
    } catch (error: any) {
      throw new Error(`Failed to complete task: ${error.message}`);
    }

    this.logger.log(`Task completed: ${taskId}`);

    // F021: Trigger DAG continuation — detect newly-unblocked downstream tasks
    if (this.dagDispatcher && taskRow?.account_id) {
      this.dagDispatcher
        .onTaskCompleted(taskId, taskRow.account_id)
        .catch((err) => {
          this.logger.error(
            `DAG continuation failed for task ${taskId}: ${err.message}`,
          );
        });
    }
  }

  /**
   * Mark a task as failed with reason.
   */
  async failTask(taskId: string, reason: string): Promise<void> {
    try {
      await this.db
        .update(orchestratedTasks)
        .set({
          status: 'failed',
          resultSummary: reason,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(orchestratedTasks.id, taskId));
    } catch (error: any) {
      throw new Error(`Failed to fail task: ${error.message}`);
    }

    this.logger.log(`Task failed: ${taskId}`);
  }

  /**
   * Approve a pending_approval orchestration.
   * Transitions root tasks (no upstream deps) to 'pending'.
   * Non-root tasks remain 'pending_approval' until their deps complete.
   */
  async approveOrchestration(
    userId: string,
    accountId: string,
    orchestrationId: string,
  ): Promise<void> {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify orchestration exists and belongs to account
    const orchestration = await this.db.query.orchestratedTasks.findFirst({
      columns: { id: true, status: true, accountId: true },
      where: and(
        eq(orchestratedTasks.id, orchestrationId),
        eq(orchestratedTasks.accountId, accountId),
        isNull(orchestratedTasks.parentOrchestratedTaskId),
      ),
    });

    if (!orchestration) {
      throw new NotFoundException(
        `Orchestration ${orchestrationId} not found`,
      );
    }

    if (orchestration.accountId !== accountId) {
      throw new ForbiddenException('Access denied to this orchestration');
    }

    // Get all child tasks
    const childTasks = await this.db
      .select({ id: orchestratedTasks.id })
      .from(orchestratedTasks)
      .where(eq(orchestratedTasks.parentOrchestratedTaskId, orchestrationId));

    if (!childTasks || childTasks.length === 0) {
      // No children — update parent status to 'running' and dispatch it directly
      await this.db
        .update(orchestratedTasks)
        .set({ status: 'running', updatedAt: new Date().toISOString() })
        .where(eq(orchestratedTasks.id, orchestrationId));
      if (this.dagDispatcher) {
        this.dagDispatcher.enqueueTask(orchestrationId, 1).catch((err) => {
          this.logger.error(
            `Failed to enqueue orchestration ${orchestrationId} after approval: ${err.message}`,
          );
        });
      }
      return;
    }

    const childTaskIds = childTasks.map((t) => t.id);

    // Find which child tasks have upstream dependencies
    const depsData = await this.db
      .select({ downstream_task_id: orchestratedTaskDeps.downstreamTaskId })
      .from(orchestratedTaskDeps)
      .where(inArray(orchestratedTaskDeps.downstreamTaskId, childTaskIds));

    const hasUpstream = new Set(
      (depsData ?? []).map((d) => d.downstream_task_id),
    );

    // Root tasks = child tasks with NO upstream deps
    const rootTaskIds = childTaskIds.filter((id) => !hasUpstream.has(id));

    // Transition root tasks to 'pending'
    if (rootTaskIds.length > 0) {
      try {
        await this.db
          .update(orchestratedTasks)
          .set({ status: 'pending', updatedAt: new Date().toISOString() })
          .where(inArray(orchestratedTasks.id, rootTaskIds));
      } catch (updateError: any) {
        throw new Error(
          `Failed to approve root tasks: ${updateError.message}`,
        );
      }
    }

    // Update parent orchestration status to 'running' (children are now executing)
    await this.db
      .update(orchestratedTasks)
      .set({ status: 'running', updatedAt: new Date().toISOString() })
      .where(eq(orchestratedTasks.id, orchestrationId));

    this.logger.log(
      `Orchestration approved: ${orchestrationId} → running, ${rootTaskIds.length} root tasks set to pending`,
    );

    // Enqueue root tasks for backbone dispatch (priority 1 = user just approved)
    if (this.dagDispatcher && rootTaskIds.length > 0) {
      for (const taskId of rootTaskIds) {
        this.dagDispatcher.enqueueTask(taskId, 1).catch((err) => {
          this.logger.error(
            `Failed to enqueue task ${taskId} after approval: ${err.message}`,
          );
        });
      }
    }
  }

  /**
   * Reject a pending_approval orchestration.
   * Cancels ALL child tasks and the parent orchestration row.
   */
  async rejectOrchestration(
    userId: string,
    accountId: string,
    orchestrationId: string,
  ): Promise<void> {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify orchestration exists and belongs to account
    const orchestration = await this.db.query.orchestratedTasks.findFirst({
      columns: { id: true, accountId: true },
      where: and(
        eq(orchestratedTasks.id, orchestrationId),
        eq(orchestratedTasks.accountId, accountId),
        isNull(orchestratedTasks.parentOrchestratedTaskId),
      ),
    });

    if (!orchestration) {
      throw new NotFoundException(
        `Orchestration ${orchestrationId} not found`,
      );
    }

    if (orchestration.accountId !== accountId) {
      throw new ForbiddenException('Access denied to this orchestration');
    }

    // Cancel all child tasks
    await this.db
      .update(orchestratedTasks)
      .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(orchestratedTasks.parentOrchestratedTaskId, orchestrationId));

    // Cancel parent orchestration
    try {
      await this.db
        .update(orchestratedTasks)
        .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
        .where(eq(orchestratedTasks.id, orchestrationId));
    } catch (parentError: any) {
      throw new Error(
        `Failed to cancel orchestration: ${parentError.message}`,
      );
    }

    this.logger.log(`Orchestration rejected/cancelled: ${orchestrationId}`);
  }

  /**
   * Map a camelCase Drizzle row to the snake_case OrchestratedTask response shape
   * that callers (and the frontend) depend on. Preserves the PostgREST contract.
   */
  private toOrchestratedTask(
    row: typeof orchestratedTasks.$inferSelect | undefined,
  ): OrchestratedTask | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      account_id: row.accountId,
      pod_id: row.podId,
      parent_orchestrated_task_id: row.parentOrchestratedTaskId,
      goal: row.goal,
      input_context: row.inputContext as Record<string, unknown> | null,
      status: row.status,
      autonomy_level: row.autonomyLevel,
      result_summary: row.resultSummary,
      structured_output: row.structuredOutput,
      metadata: row.metadata as Record<string, unknown> | null,
      created_at: row.createdAt as string,
      updated_at: row.updatedAt as string,
    };
  }
}
