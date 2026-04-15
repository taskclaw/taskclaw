import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  forwardRef,
  Inject,
  Optional,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
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

@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
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
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Determine effective autonomy_level
    let effectiveAutonomy = dto.autonomy_level ?? 1;

    // If not provided, try to get from the first pod's autonomy_level
    if (!dto.autonomy_level && dto.tasks.length > 0) {
      const { data: podData } = await client
        .from('pods')
        .select('autonomy_level')
        .eq('id', dto.tasks[0].pod_id)
        .eq('account_id', accountId)
        .single();
      if (podData?.autonomy_level) {
        effectiveAutonomy = podData.autonomy_level;
      }
    }

    // Determine parent task status — root orchestration row is always 'pending_approval' for tracking
    // unless autonomy_level >= 3
    const parentStatus =
      effectiveAutonomy >= 3 ? 'pending' : 'pending_approval';

    // Create the parent orchestration container row
    // Store the primary pod_id (first task's pod) so the parent row can show a pod name
    const primaryPodId = dto.tasks.length > 0 ? dto.tasks[0].pod_id : null;

    const { data: parentTask, error: parentError } = await client
      .from('orchestrated_tasks')
      .insert({
        account_id: accountId,
        pod_id: primaryPodId,
        parent_orchestrated_task_id: null,
        goal: dto.goal,
        input_context: null,
        status: parentStatus,
        autonomy_level: effectiveAutonomy,
        metadata: { task_count: dto.tasks.length },
      })
      .select()
      .single();

    if (parentError || !parentTask) {
      throw new Error(
        `Failed to create orchestration: ${parentError?.message}`,
      );
    }

    this.logger.log(
      `Orchestration parent created: ${parentTask.id} status=${parentTask.status}`,
    );

    // Determine per-task status:
    // If autonomy_level < 3: all tasks start as 'pending_approval'
    // If autonomy_level >= 3: tasks with no upstream deps (root tasks) → 'pending', others → 'pending_approval' until triggered
    const taskInserts = dto.tasks.map((t, _idx) => ({
      account_id: accountId,
      pod_id: t.pod_id,
      parent_orchestrated_task_id: parentTask.id,
      goal: t.goal,
      input_context: t.input_context ?? null,
      status: 'pending_approval', // will be updated after inserting
      autonomy_level: effectiveAutonomy,
      metadata: {},
    }));

    const { data: childTasks, error: childError } = await client
      .from('orchestrated_tasks')
      .insert(taskInserts)
      .select();

    if (childError || !childTasks) {
      // Rollback parent
      await client
        .from('orchestrated_tasks')
        .delete()
        .eq('id', parentTask.id);
      throw new Error(`Failed to create child tasks: ${childError?.message}`);
    }

    // Build dependency edges
    const depInserts: Array<{
      upstream_task_id: string;
      downstream_task_id: string;
    }> = [];

    dto.tasks.forEach((taskDto, idx) => {
      if (taskDto.depends_on_indices && taskDto.depends_on_indices.length > 0) {
        for (const upstreamIdx of taskDto.depends_on_indices) {
          if (upstreamIdx >= 0 && upstreamIdx < childTasks.length) {
            depInserts.push({
              upstream_task_id: childTasks[upstreamIdx].id,
              downstream_task_id: childTasks[idx].id,
            });
          }
        }
      }
    });

    if (depInserts.length > 0) {
      const { error: depError } = await client
        .from('orchestrated_task_deps')
        .insert(depInserts);

      if (depError) {
        this.logger.error(`Failed to create task deps: ${depError.message}`);
        // Not rolling back — tasks created, deps are best-effort here but log the error
        throw new Error(`Failed to create task dependencies: ${depError.message}`);
      }
    }

    // Now set correct statuses:
    // Root tasks (no upstream deps) get 'pending' if autonomy_level >= 3
    if (effectiveAutonomy >= 3 && childTasks.length > 0) {
      // Find which tasks have upstream deps
      const hasUpstream = new Set(depInserts.map((d) => d.downstream_task_id));
      const rootTaskIds = childTasks
        .filter((t) => !hasUpstream.has(t.id))
        .map((t) => t.id);

      if (rootTaskIds.length > 0) {
        await client
          .from('orchestrated_tasks')
          .update({ status: 'pending' })
          .in('id', rootTaskIds);

        // Reflect in returned data
        childTasks.forEach((t) => {
          if (rootTaskIds.includes(t.id)) {
            t.status = 'pending';
          }
        });
      }
    }

    this.logger.log(
      `Orchestration created: ${parentTask.id} with ${childTasks.length} tasks, ${depInserts.length} dep edges`,
    );

    return {
      orchestration: parentTask as OrchestratedTask,
      tasks: childTasks as OrchestratedTask[],
    };
  }

  /**
   * List top-level orchestrations (parent rows) for an account.
   */
  async listOrchestrations(
    userId: string,
    accountId: string,
  ): Promise<OrchestratedTask[]> {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('orchestrated_tasks')
      .select('*, pods(id, name, slug)')
      .eq('account_id', accountId)
      .is('parent_orchestrated_task_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list orchestrations: ${error.message}`);
    }

    // For parent rows without a pod_id (legacy data), look up pod from first child task
    const parentRows = (data ?? []) as any[];
    const nullPodParentIds = parentRows
      .filter((r) => !r.pod_id)
      .map((r) => r.id);

    let childPodMap: Record<string, { name: string | null; slug: string | null }> = {};
    if (nullPodParentIds.length > 0) {
      const { data: childData } = await client
        .from('orchestrated_tasks')
        .select('parent_orchestrated_task_id, pods(id, name, slug)')
        .in('parent_orchestrated_task_id', nullPodParentIds)
        .not('pod_id', 'is', null)
        .order('created_at', { ascending: true });

      for (const child of (childData ?? []) as any[]) {
        const parentId = child.parent_orchestrated_task_id;
        if (!childPodMap[parentId] && child.pods) {
          childPodMap[parentId] = { name: child.pods.name ?? null, slug: child.pods.slug ?? null };
        }
      }
    }

    return parentRows.map((row) => ({
      ...row,
      pod_name: row.pods?.name ?? childPodMap[row.id]?.name ?? null,
      pod_slug: row.pods?.slug ?? childPodMap[row.id]?.slug ?? null,
      pods: undefined,
    })) as OrchestratedTask[];
  }

  /**
   * Get a single orchestration with all child tasks and dependency edges.
   */
  async getOrchestration(
    userId: string,
    accountId: string,
    orchestrationId: string,
  ): Promise<OrchestrationDetail> {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Fetch parent
    const { data: orchestration, error: orchError } = await client
      .from('orchestrated_tasks')
      .select('*')
      .eq('id', orchestrationId)
      .eq('account_id', accountId)
      .is('parent_orchestrated_task_id', null)
      .single();

    if (orchError || !orchestration) {
      throw new NotFoundException(
        `Orchestration ${orchestrationId} not found`,
      );
    }

    // Fetch child tasks
    const { data: tasks, error: tasksError } = await client
      .from('orchestrated_tasks')
      .select('*')
      .eq('parent_orchestrated_task_id', orchestrationId)
      .order('created_at', { ascending: true });

    if (tasksError) {
      throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
    }

    const childTasks = (tasks ?? []) as OrchestratedTask[];

    // Fetch deps for child tasks
    const taskIds = childTasks.map((t) => t.id);
    let deps: Array<{ upstream_task_id: string; downstream_task_id: string }> =
      [];

    if (taskIds.length > 0) {
      const { data: depsData, error: depsError } = await client
        .from('orchestrated_task_deps')
        .select('upstream_task_id, downstream_task_id')
        .in('upstream_task_id', taskIds);

      if (depsError) {
        this.logger.warn(`Failed to fetch deps: ${depsError.message}`);
      } else {
        deps = depsData ?? [];
      }
    }

    // Fetch board tasks created during this orchestration (via metadata.orchestration_id)
    // These are tracked for the live task cards feature in the Cockpit
    const allOrchIds = [orchestrationId, ...taskIds];
    const boardTasksResults = await Promise.all(
      allOrchIds.map((oid) =>
        client
          .from('tasks')
          .select('id, title, status, priority, board_instance_id, created_at, metadata')
          .eq('account_id', accountId)
          .contains('metadata', { orchestration_id: oid })
      )
    );
    const boardTasks = boardTasksResults
      .flatMap((r) => r.data ?? [])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return {
      orchestration: orchestration as OrchestratedTask,
      tasks: childTasks,
      deps,
      boardTasks,
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
    const client = this.supabaseAdmin.getClient();

    // Fetch account_id before updating (needed for DAG continuation)
    const { data: taskRow } = await client
      .from('orchestrated_tasks')
      .select('account_id')
      .eq('id', taskId)
      .single();

    const { error } = await client
      .from('orchestrated_tasks')
      .update({
        status: 'completed',
        result_summary: result.summary,
        structured_output: result.structured_output ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) {
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
    const client = this.supabaseAdmin.getClient();

    const { error } = await client
      .from('orchestrated_tasks')
      .update({
        status: 'failed',
        result_summary: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) {
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
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify orchestration exists and belongs to account
    const { data: orchestration, error: orchError } = await client
      .from('orchestrated_tasks')
      .select('id, status, account_id')
      .eq('id', orchestrationId)
      .eq('account_id', accountId)
      .is('parent_orchestrated_task_id', null)
      .single();

    if (orchError || !orchestration) {
      throw new NotFoundException(
        `Orchestration ${orchestrationId} not found`,
      );
    }

    if (orchestration.account_id !== accountId) {
      throw new ForbiddenException('Access denied to this orchestration');
    }

    // Get all child tasks
    const { data: childTasks, error: childError } = await client
      .from('orchestrated_tasks')
      .select('id')
      .eq('parent_orchestrated_task_id', orchestrationId);

    if (childError || !childTasks || childTasks.length === 0) {
      // No children — update parent status to 'running' and dispatch it directly
      await client
        .from('orchestrated_tasks')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', orchestrationId);
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
    const { data: depsData } = await client
      .from('orchestrated_task_deps')
      .select('downstream_task_id')
      .in('downstream_task_id', childTaskIds);

    const hasUpstream = new Set(
      (depsData ?? []).map((d) => d.downstream_task_id),
    );

    // Root tasks = child tasks with NO upstream deps
    const rootTaskIds = childTaskIds.filter((id) => !hasUpstream.has(id));

    // Transition root tasks to 'pending'
    if (rootTaskIds.length > 0) {
      const { error: updateError } = await client
        .from('orchestrated_tasks')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .in('id', rootTaskIds);

      if (updateError) {
        throw new Error(
          `Failed to approve root tasks: ${updateError.message}`,
        );
      }
    }

    // Update parent orchestration status to 'running' (children are now executing)
    await client
      .from('orchestrated_tasks')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', orchestrationId);

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
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify orchestration exists and belongs to account
    const { data: orchestration, error: orchError } = await client
      .from('orchestrated_tasks')
      .select('id, account_id')
      .eq('id', orchestrationId)
      .eq('account_id', accountId)
      .is('parent_orchestrated_task_id', null)
      .single();

    if (orchError || !orchestration) {
      throw new NotFoundException(
        `Orchestration ${orchestrationId} not found`,
      );
    }

    if (orchestration.account_id !== accountId) {
      throw new ForbiddenException('Access denied to this orchestration');
    }

    // Cancel all child tasks
    await client
      .from('orchestrated_tasks')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('parent_orchestrated_task_id', orchestrationId);

    // Cancel parent orchestration
    const { error: parentError } = await client
      .from('orchestrated_tasks')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orchestrationId);

    if (parentError) {
      throw new Error(
        `Failed to cancel orchestration: ${parentError.message}`,
      );
    }

    this.logger.log(`Orchestration rejected/cancelled: ${orchestrationId}`);
  }
}
