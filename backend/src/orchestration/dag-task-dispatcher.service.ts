import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { BackboneRouterService } from '../backbone/backbone-router.service';
import { ExecutionLogService } from '../heartbeat/execution-log.service';
import { WebhookEmitterService } from '../webhooks/webhook-emitter.service';
import { OrchestrationService } from './orchestration.service';

/**
 * DagTaskDispatcher (F021–F023, F025, B6)
 *
 * Handles:
 * - Detecting newly-unblocked tasks after a task completes (F021)
 * - Routing based on autonomy_level — approval gate vs. auto-dispatch (F021)
 * - Enqueueing tasks to backbone-dispatch queue with idempotency (B6)
 * - Dispatching to backbone with upstream context injection (F022) — via BackboneDispatchProcessor
 * - Semaphore concurrency control (max 3 concurrent per account) (F023)
 * - Cockpit timeline log entries (F025)
 */
@Injectable()
export class DagTaskDispatcher {
  private readonly logger = new Logger(DagTaskDispatcher.name);

  /** Max concurrent backbone calls per account */
  private static readonly MAX_CONCURRENT = 3;

  private backboneDispatchQueue?: Queue;

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    @Inject(forwardRef(() => BackboneRouterService))
    private readonly backboneRouter: BackboneRouterService,
    private readonly executionLogService: ExecutionLogService,
    private readonly webhookEmitter: WebhookEmitterService,
    @Inject(forwardRef(() => OrchestrationService))
    private readonly orchestrationService: OrchestrationService,
  ) {}

  /**
   * Called by OrchestrationModule.onModuleInit to inject the backbone-dispatch queue.
   */
  setBackboneDispatchQueue(queue: Queue) {
    this.backboneDispatchQueue = queue;
    this.logger.log('Backbone dispatch queue wired to DagTaskDispatcher (B6).');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F021 — Unblocked task detection + autonomy routing
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Called by OrchestrationService.completeTask() when a task finishes.
   * Queries the DB for newly-unblocked downstream tasks and routes them
   * according to their autonomy_level.
   */
  async onTaskCompleted(taskId: string, accountId: string): Promise<void> {
    this.logger.log(
      `[DAG] Task ${taskId} completed — checking for newly-unblocked tasks`,
    );

    const client = this.supabaseAdmin.getClient();

    // Call the SQL function that finds tasks whose all deps are now completed
    const { data: rows, error } = await client.rpc(
      'get_newly_unblocked_tasks',
      { p_completed_task_id: taskId },
    );

    if (error) {
      this.logger.error(
        `[DAG] get_newly_unblocked_tasks failed for task ${taskId}: ${error.message}`,
      );
      return;
    }

    const unblocked: string[] = (rows ?? []).map((r: any) => r.task_id as string);

    if (unblocked.length === 0) {
      this.logger.debug(`[DAG] No newly-unblocked tasks after completing ${taskId}`);
      return;
    }

    this.logger.log(
      `[DAG] ${unblocked.length} newly-unblocked task(s): ${unblocked.join(', ')}`,
    );

    for (const unblockedTaskId of unblocked) {
      // Fetch the task to decide routing
      const { data: task, error: taskError } = await client
        .from('orchestrated_tasks')
        .select('id, account_id, pod_id, goal, autonomy_level, parent_orchestrated_task_id')
        .eq('id', unblockedTaskId)
        .single();

      if (taskError || !task) {
        this.logger.warn(
          `[DAG] Could not fetch task ${unblockedTaskId}: ${taskError?.message}`,
        );
        continue;
      }

      const effectiveAccountId = task.account_id || accountId;

      if (task.autonomy_level < 3) {
        // Human approval required — emit event and insert approval request
        this.logger.log(
          `[DAG] Task ${unblockedTaskId} needs approval (autonomy_level=${task.autonomy_level})`,
        );
        await this.emitApprovalRequired(task, effectiveAccountId);
      } else {
        // Fully autonomous — enqueue via backbone-dispatch (B6)
        this.logger.log(
          `[DAG] Auto-enqueueing task ${unblockedTaskId} (autonomy_level=${task.autonomy_level})`,
        );
        await this.enqueueTask(unblockedTaskId, 2);
      }
    }
  }

  /**
   * Called when a human approves a pending_approval task.
   * Transitions the task to 'pending' then enqueues it with priority 1 (user just acted).
   */
  async approveTask(taskId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    const { error } = await client
      .from('orchestrated_tasks')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('status', 'pending_approval');

    if (error) {
      throw new Error(`Failed to approve task ${taskId}: ${error.message}`);
    }

    this.logger.log(`[DAG] Task ${taskId} approved — enqueueing (priority 1)`);
    await this.enqueueTask(taskId, 1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // B6 — Enqueue task to backbone-dispatch queue
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * B6: Enqueues an orchestration task to the backbone-dispatch BullMQ queue.
   * Uses jobId for idempotency — duplicate calls for the same taskId are no-ops.
   *
   * Priority lanes:
   *   1 = user-initiated (cockpit delegation, approval just granted)
   *   2 = DAG continuation (unblocked task, reconciler requeue)
   */
  async enqueueTask(taskId: string, priority = 2): Promise<void> {
    // Fetch account_id for the job payload
    const client = this.supabaseAdmin.getClient();
    const { data: task } = await client
      .from('orchestrated_tasks')
      .select('account_id')
      .eq('id', taskId)
      .single();

    const accountId = task?.account_id ?? 'unknown';
    const jobId = `orch-task-${taskId}`;

    if (this.backboneDispatchQueue) {
      await this.backboneDispatchQueue.add(
        'dispatch',
        {
          type: 'orchestration_task',
          orchestratedTaskId: taskId,
          accountId,
          priority,
          idempotencyKey: jobId,
        },
        {
          priority,
          jobId, // BullMQ deduplicates by jobId
        },
      );
      this.logger.log(
        `[DAG] Task ${taskId} enqueued to backbone-dispatch (priority=${priority}, jobId=${jobId})`,
      );
    } else {
      // Fallback: direct dispatch when queue is unavailable
      this.logger.warn(
        `[DAG] backbone-dispatch queue not available — dispatching task ${taskId} directly`,
      );
      await this.dispatchTask(taskId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F022 — Backbone dispatch with upstream context injection
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetch the task, inject upstream results into the system prompt,
   * call the backbone, and persist the result.
   *
   * Called by BackboneDispatchProcessor (type: 'orchestration_task') or
   * directly as fallback when backbone-dispatch queue is unavailable.
   */
  async dispatchTask(taskId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    // 1. Fetch the orchestrated task
    const { data: task, error: taskError } = await client
      .from('orchestrated_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      this.logger.error(
        `[DAG] dispatchTask: task ${taskId} not found: ${taskError?.message}`,
      );
      return;
    }

    const accountId: string = task.account_id;
    const startTime = Date.now();

    // 2. Fetch upstream completed task results
    const { data: upstreamRows } = await client
      .from('orchestrated_task_deps')
      .select(
        'orchestrated_tasks!upstream_task_id(goal, result_summary, structured_output)',
      )
      .eq('downstream_task_id', taskId);

    const upstreamTasks = (upstreamRows ?? [])
      .map((r: any) => r.orchestrated_tasks)
      .filter(Boolean)
      .filter((t: any) => t.result_summary !== null);

    // 3. Build upstream context envelope
    let systemPromptAddition = '';
    if (upstreamTasks.length > 0) {
      const parts = upstreamTasks
        .map(
          (t: any, i: number) => `
[${i + 1}] Goal: ${t.goal}
Summary: ${t.result_summary}
Output: ${JSON.stringify(t.structured_output ?? {})}
`,
        )
        .join('\n');

      systemPromptAddition = `
<upstream_context>
This task depends on the following completed upstream work:
${parts}
</upstream_context>
`;
    }

    // 4. Resolve pod name for logging
    let podName = task.pod_id ?? 'Unknown Pod';
    if (task.pod_id) {
      const { data: pod } = await client
        .from('pods')
        .select('name')
        .eq('id', task.pod_id)
        .single();
      if (pod?.name) podName = pod.name;
    }

    // 5. Create execution log entry (F025)
    const execLog = await this.executionLogService.create({
      account_id: accountId,
      trigger_type: 'coordinator',
      status: 'running',
      pod_id: task.pod_id ?? undefined,
      dag_id: task.parent_orchestrated_task_id ?? undefined,
      summary: `DAG task: ${task.goal} (pod: ${podName})`,
      metadata: {
        orchestrated_task_id: taskId,
        pod_id: task.pod_id,
        dag_id: task.parent_orchestrated_task_id,
      },
    });
    const execLogId = execLog?.id ?? null;

    // 6. Acquire semaphore (F023)
    const acquired = await this.acquireLease(accountId, taskId);
    if (!acquired) {
      this.logger.log(
        `[DAG] Semaphore full for account ${accountId} — task ${taskId} will be retried by BullMQ`,
      );
      // Throw so BullMQ retries with exponential backoff
      throw new Error(
        `Semaphore full for account ${accountId} — concurrency limit reached`,
      );
    }

    try {
      // 7. Update task status to running
      await client
        .from('orchestrated_tasks')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', taskId);

      // 8. Fetch pod boards so the agent knows which board_id to use with create_task
      let podBoardsContext = '';
      if (task.pod_id) {
        const { data: boards } = await client
          .from('board_instances')
          .select('id, name')
          .eq('pod_id', task.pod_id)
          .limit(10);
        if (boards && boards.length > 0) {
          const boardList = boards.map((b: any) => `  - ${b.name} (board_id: ${b.id})`).join('\n');
          podBoardsContext = `\n\n<pod_boards>\nBoards available in this pod:\n${boardList}\n</pod_boards>`;
        }
      }

      // 9. Build system prompt with tool definitions so the agent can create tasks
      const podToolDefinitions = `<tool_definitions>
[
  {
    "name": "create_task",
    "description": "Create a task on a specific board column within this pod. Use this to break down the goal into actionable board tasks.",
    "parameters": {
      "type": "object",
      "required": ["board_id", "title"],
      "properties": {
        "board_id": { "type": "string", "description": "UUID of the board_instance to create the task on" },
        "title": { "type": "string", "description": "Task title" },
        "description": { "type": "string", "description": "Detailed task description or instructions" },
        "priority": { "type": "string", "enum": ["Low", "Medium", "High", "Urgent"], "description": "Task priority level (defaults to Medium)" }
      }
    }
  }
]
</tool_definitions>

When executing a goal, decompose it into board tasks using create_task tool calls. Use this exact format:
<tool_call name="create_task">
{"board_id": "UUID", "title": "Task title", "description": "What to do", "priority": "Medium"}
</tool_call>

Emit one tool call per task. Then provide a summary of what you created.`;

      const systemPrompt =
        `You are a TaskClaw pod agent executing a delegated goal. Decompose the goal into actionable tasks on the available boards, then provide a summary.` +
        podBoardsContext +
        systemPromptAddition +
        '\n\n' + podToolDefinitions;

      const result = await this.backboneRouter.send({
        accountId,
        podId: task.pod_id ?? undefined,
        sendOptions: {
          message: task.goal,
          systemPrompt,
          isConversational: false,
          metadata: {
            orchestrated_task_id: taskId,
            account_id: accountId,
          },
        },
      });

      // 9. Process tool calls from the AI response (e.g. create_task)
      if (result.text.includes('<tool_call')) {
        await this.processDagToolCalls(result.text, accountId, taskId, task.pod_id);
      }

      // 10. Complete task
      await this.orchestrationService.completeTask(taskId, {
        summary: result.text,
        structured_output: { raw_response: result.text, usage: result.usage },
      });

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `[DAG] Task ${taskId} completed in ${durationMs}ms`,
      );

      // Complete execution log (F025)
      if (execLogId) {
        await this.executionLogService.complete(execLogId, {
          status: 'success',
          summary: result.text.length > 200
            ? result.text.slice(0, 200) + '…'
            : result.text,
          duration_ms: durationMs,
        });
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `[DAG] Task ${taskId} failed after ${durationMs}ms: ${err.message}`,
      );

      await this.orchestrationService.failTask(taskId, err.message);

      // Fail execution log (F025)
      if (execLogId) {
        await this.executionLogService.complete(execLogId, {
          status: 'error',
          summary: err.message,
          duration_ms: durationMs,
        });
      }

      // Re-throw so BullMQ can retry
      throw err;
    } finally {
      // Always release the semaphore lease (F023)
      await this.releaseLease(accountId, taskId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tool call processing for DAG dispatch (no ConversationsService dependency)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Parses tool calls from a backbone response and executes them.
   * Currently handles: create_task — inserts board tasks with orchestration metadata
   * so frontend can subscribe via Supabase Realtime and show live task cards.
   */
  private async processDagToolCalls(
    responseText: string,
    accountId: string,
    orchestratedTaskId: string,
    _podId: string | null,
  ): Promise<void> {
    const client = this.supabaseAdmin.getClient();
    const toolCallPattern = /<tool_call\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_call>/g;

    let match: RegExpExecArray | null;
    while ((match = toolCallPattern.exec(responseText)) !== null) {
      const toolName = match[1];
      const toolBody = match[2];

      if (toolName !== 'create_task') continue;

      let params: Record<string, any> = {};
      try {
        params = JSON.parse(toolBody.trim());
      } catch {
        this.logger.warn(`[DAGTools] Failed to parse JSON for create_task: ${toolBody}`);
        continue;
      }

      if (!params.board_id || !params.title) {
        this.logger.warn(`[DAGTools] create_task missing board_id or title`);
        continue;
      }

      try {
        // Resolve column/step
        let stepId: string | null = params.column_id || null;
        let status = 'To-Do';
        let defaultAgentId: string | null = params.agent_id || null;

        if (stepId) {
          const { data: step } = await client
            .from('board_steps')
            .select('id, name, default_agent_id')
            .eq('id', stepId)
            .eq('board_instance_id', params.board_id)
            .single();
          if (step) {
            status = step.name;
            if (!defaultAgentId && step.default_agent_id) defaultAgentId = step.default_agent_id;
          }
        } else {
          const { data: firstStep } = await client
            .from('board_steps')
            .select('id, name, default_agent_id')
            .eq('board_instance_id', params.board_id)
            .order('position', { ascending: true })
            .limit(1)
            .single();
          if (firstStep) {
            stepId = firstStep.id;
            status = firstStep.name;
            if (!defaultAgentId && firstStep.default_agent_id) defaultAgentId = firstStep.default_agent_id;
          }
        }

        const { data: task, error } = await client
          .from('tasks')
          .insert({
            account_id: accountId,
            title: params.title,
            notes: params.description || '',
            priority: params.priority || 'Medium',
            status,
            board_instance_id: params.board_id,
            current_step_id: stepId,
            assignee_type: defaultAgentId ? 'agent' : 'none',
            assignee_id: defaultAgentId,
            completed: false,
            card_data: {},
            metadata: { orchestration_id: orchestratedTaskId },
          })
          .select('id')
          .single();

        if (error || !task) {
          this.logger.error(`[DAGTools] create_task insert failed: ${error?.message}`);
          continue;
        }

        this.logger.log(`[DAGTools] create_task executed: task_id=${task.id} orch=${orchestratedTaskId}`);

        // Emit webhook so other listeners (e.g. board) know about the new task
        this.webhookEmitter.emit(accountId, 'task.created', { task });
      } catch (err: any) {
        this.logger.error(`[DAGTools] create_task failed: ${err.message}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F023 — Semaphore concurrency control
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Attempt to acquire a backbone call lease for this account.
   * Returns true if the lease was acquired, false if at capacity.
   */
  private async acquireLease(
    accountId: string,
    holderId: string,
  ): Promise<boolean> {
    const client = this.supabaseAdmin.getClient();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // +5 min

    // Try INSERT — will fail on unique violation only if same holderId exists
    const { error: insertError } = await client
      .from('semaphore_leases')
      .insert({
        account_id: accountId,
        resource_key: 'backbone_calls',
        holder_id: holderId,
        expires_at: expiresAt,
      });

    if (!insertError) {
      // Inserted successfully
      return true;
    }

    // Insert failed — check current active lease count
    const { data: activeLeases, error: countError } = await client
      .from('semaphore_leases')
      .select('holder_id')
      .eq('account_id', accountId)
      .eq('resource_key', 'backbone_calls')
      .gt('expires_at', new Date().toISOString());

    if (countError) {
      this.logger.error(
        `[Semaphore] Failed to count leases for ${accountId}: ${countError.message}`,
      );
      // Fail safe — allow execution
      return true;
    }

    const count = (activeLeases ?? []).length;
    if (count >= DagTaskDispatcher.MAX_CONCURRENT) {
      this.logger.debug(
        `[Semaphore] At capacity (${count}/${DagTaskDispatcher.MAX_CONCURRENT}) for account ${accountId}`,
      );
      return false;
    }

    // Under capacity — retry insert (different holder_id so no unique conflict)
    const { error: retryError } = await client
      .from('semaphore_leases')
      .insert({
        account_id: accountId,
        resource_key: 'backbone_calls',
        holder_id: holderId,
        expires_at: expiresAt,
      });

    if (retryError) {
      this.logger.warn(
        `[Semaphore] Retry insert failed for holder ${holderId}: ${retryError.message}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Release the backbone call lease for this holder.
   */
  private async releaseLease(
    accountId: string,
    holderId: string,
  ): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    const { error } = await client
      .from('semaphore_leases')
      .delete()
      .eq('account_id', accountId)
      .eq('holder_id', holderId);

    if (error) {
      this.logger.warn(
        `[Semaphore] Failed to release lease for ${holderId}: ${error.message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F021 — Approval request emission
  // ─────────────────────────────────────────────────────────────────────────

  private async emitApprovalRequired(
    task: any,
    accountId: string,
  ): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    // Insert into agent_approval_requests with the orchestrated_task_id
    let approvalRequestId: string | null = null;
    const { data: approvalRow, error: approvalError } = await client
      .from('agent_approval_requests')
      .insert({
        orchestrated_task_id: task.id,
        reason: `DAG task requires approval before execution: ${task.goal}`,
        status: 'pending',
      })
      .select('id')
      .single();

    if (approvalError) {
      this.logger.warn(
        `[DAG] Failed to insert agent_approval_requests for task ${task.id}: ${approvalError.message}`,
      );
    } else {
      approvalRequestId = approvalRow?.id ?? null;
    }

    // Update task status to pending_approval
    await client
      .from('orchestrated_tasks')
      .update({
        status: 'pending_approval',
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);

    // Emit webhook event for frontend
    await this.webhookEmitter.emit(accountId, 'dag.approval_required', {
      type: 'dag.approval_required',
      orchestrated_task_id: task.id,
      approval_request_id: approvalRequestId,
      goal: task.goal,
      pod_id: task.pod_id,
      autonomy_level: task.autonomy_level,
      dag_id: task.parent_orchestrated_task_id,
    });

    this.logger.log(
      `[DAG] Approval required emitted for task ${task.id}: approval_request_id=${approvalRequestId}`,
    );
  }
}
