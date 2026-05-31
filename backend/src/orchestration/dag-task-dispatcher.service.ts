import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  orchestratedTasks,
  orchestratedTaskDeps,
  pods,
  boardInstances,
  boardSteps,
  tasks as tasksTable,
  semaphoreLeases,
  agentApprovalRequests,
} from '../db/schema';
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
    @Inject(DB) private readonly db: Db,
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

    // Call the SQL function that finds tasks whose all deps are now completed.
    // DAG functions STAY as SQL — keep the function call, read `.rows`.
    let rows: Array<{ task_id: string }> = [];
    try {
      const result = await this.db.execute(
        sql`select * from get_newly_unblocked_tasks(${taskId})`,
      );
      rows = result.rows as Array<{ task_id: string }>;
    } catch (error: any) {
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
      const [task] = await this.db
        .select({
          id: orchestratedTasks.id,
          account_id: orchestratedTasks.accountId,
          pod_id: orchestratedTasks.podId,
          goal: orchestratedTasks.goal,
          autonomy_level: orchestratedTasks.autonomyLevel,
          parent_orchestrated_task_id:
            orchestratedTasks.parentOrchestratedTaskId,
        })
        .from(orchestratedTasks)
        .where(eq(orchestratedTasks.id, unblockedTaskId))
        .limit(1);

      if (!task) {
        this.logger.warn(
          `[DAG] Could not fetch task ${unblockedTaskId}`,
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
    try {
      await this.db
        .update(orchestratedTasks)
        .set({ status: 'pending', updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(orchestratedTasks.id, taskId),
            eq(orchestratedTasks.status, 'pending_approval'),
          ),
        );
    } catch (error: any) {
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
    const [task] = await this.db
      .select({ account_id: orchestratedTasks.accountId })
      .from(orchestratedTasks)
      .where(eq(orchestratedTasks.id, taskId))
      .limit(1);

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
    // 1. Fetch the orchestrated task
    const [task] = await this.db
      .select()
      .from(orchestratedTasks)
      .where(eq(orchestratedTasks.id, taskId))
      .limit(1);

    if (!task) {
      this.logger.error(`[DAG] dispatchTask: task ${taskId} not found`);
      return;
    }

    const accountId: string = task.accountId;
    const startTime = Date.now();

    // 2. Fetch upstream completed task results.
    //    PostgREST embedded `orchestrated_tasks!upstream_task_id(...)`; Drizzle's
    //    relation for that FK is `orchestratedTask_upstreamTaskId` — re-key it back
    //    to `orchestrated_tasks` so the downstream mapping is unchanged.
    const upstreamRows = await this.db.query.orchestratedTaskDeps.findMany({
      where: eq(orchestratedTaskDeps.downstreamTaskId, taskId),
      with: {
        orchestratedTask_upstreamTaskId: {
          columns: { goal: true, resultSummary: true, structuredOutput: true },
        },
      },
    });

    const upstreamTasks = upstreamRows
      .map((r: any) => {
        const u = r.orchestratedTask_upstreamTaskId;
        if (!u) return null;
        // Re-key camelCase relation columns to the snake_case shape callers use.
        return {
          goal: u.goal,
          result_summary: u.resultSummary,
          structured_output: u.structuredOutput,
        };
      })
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
    let podName = task.podId ?? 'Unknown Pod';
    if (task.podId) {
      const [pod] = await this.db
        .select({ name: pods.name })
        .from(pods)
        .where(eq(pods.id, task.podId))
        .limit(1);
      if (pod?.name) podName = pod.name;
    }

    // 5. Create execution log entry (F025)
    // Note: dag_id FK references task_dags table, but orchestrations use orchestrated_tasks.
    // Store the orchestration parent ID in metadata only to avoid FK violation.
    const execLog = await this.executionLogService.create({
      account_id: accountId,
      trigger_type: 'coordinator',
      status: 'running',
      pod_id: task.podId ?? undefined,
      summary: `DAG task: ${task.goal} (pod: ${podName})`,
      metadata: {
        orchestrated_task_id: taskId,
        pod_id: task.podId,
        orchestration_id: task.parentOrchestratedTaskId,
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
      await this.db
        .update(orchestratedTasks)
        .set({ status: 'running', updatedAt: new Date().toISOString() })
        .where(eq(orchestratedTasks.id, taskId));

      // 8. Fetch pod boards with descriptions for the decomposition prompt
      let boards: Array<{ id: string; name: string; description: string | null }> = [];
      if (task.podId) {
        boards = await this.db
          .select({
            id: boardInstances.id,
            name: boardInstances.name,
            description: boardInstances.description,
          })
          .from(boardInstances)
          .where(eq(boardInstances.podId, task.podId))
          .limit(10);
      }

      const boardListJson = boards.map((b) => ({
        board_id: b.id,
        name: b.name,
        description: b.description ?? '',
      }));

      // 9. Build system prompt — AI returns pure JSON, service handles all DB writes.
      //    No XML parsing, no tool-call fragility. The AI's job is decomposition only.
      const systemPrompt =
        `You are a TaskClaw pod agent. Your job is to decompose a delegated goal into a list of actionable board tasks.` +
        (systemPromptAddition ? `\n\n${systemPromptAddition}` : '') +
        `\n\n<available_boards>\n${JSON.stringify(boardListJson, null, 2)}\n</available_boards>` +
        `\n\nRespond with ONLY a valid JSON object — no markdown, no explanation, no preamble. Use this exact schema:
{
  "tasks": [
    {
      "board_id": "<UUID from available_boards>",
      "title": "<short action-oriented task title>",
      "description": "<detailed instructions for completing this task>",
      "priority": "<Low|Medium|High|Urgent>"
    }
  ],
  "summary": "<one paragraph describing what you decomposed and why>"
}

Rules:
- Each task must use a board_id from the available_boards list above.
- Create 2–8 tasks that fully cover the goal.
- Distribute tasks across relevant boards based on their descriptions.
- Do not return anything outside the JSON object.`;

      const result = await this.backboneRouter.send({
        accountId,
        podId: task.podId ?? undefined,
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

      // 9. Parse JSON response and insert tasks deterministically — no XML parsing.
      //    If the model wraps the JSON in markdown fences, strip them first.
      let decomposition: { tasks: any[]; summary: string } | null = null;
      try {
        const raw = result.text.trim();
        // Strip optional ```json ... ``` fences
        const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        decomposition = JSON.parse(jsonStr);
      } catch (parseErr: any) {
        this.logger.warn(
          `[DAG] JSON parse failed for task ${taskId}: ${parseErr.message}. Raw: ${result.text.slice(0, 300)}`,
        );
      }

      let createdCount = 0;
      if (decomposition?.tasks && Array.isArray(decomposition.tasks)) {
        createdCount = await this.insertDecomposedTasks(
          decomposition.tasks,
          accountId,
          taskId,
          task.podId,
        );
      } else {
        this.logger.warn(
          `[DAG] No tasks array in decomposition for task ${taskId} — storing raw response as summary.`,
        );
      }

      const summaryText = decomposition?.summary ?? result.text;

      // 10. Complete task
      await this.orchestrationService.completeTask(taskId, {
        summary: summaryText,
        structured_output: {
          tasks_created: createdCount,
          decomposition,
          usage: result.usage,
        },
      });

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `[DAG] Task ${taskId} completed in ${durationMs}ms — ${createdCount} board task(s) created`,
      );

      // Complete execution log (F025)
      if (execLogId) {
        const logSummary = `Created ${createdCount} task(s): ${summaryText}`;
        await this.executionLogService.complete(execLogId, {
          status: 'success',
          summary: logSummary.length > 200 ? logSummary.slice(0, 200) + '…' : logSummary,
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
  // ─────────────────────────────────────────────────────────────────────────
  // Structured JSON decomposition — deterministic task insertion (Option C/D)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inserts board tasks from the AI's structured JSON decomposition.
   * The AI returns `{ tasks: [...], summary: "..." }` — this method owns
   * all DB writes. No XML parsing, no tool-call fragility.
   *
   * Returns the number of tasks successfully inserted.
   */
  private async insertDecomposedTasks(
    tasks: Array<{ board_id: string; title: string; description?: string; priority?: string }>,
    accountId: string,
    orchestratedTaskId: string,
    podId: string | null,
  ): Promise<number> {
    // Pre-fetch first board step for each unique board_id in one round-trip
    const boardIds = [...new Set(tasks.map((t) => t.board_id).filter(Boolean))];
    const firstStepByBoard: Record<string, { id: string; name: string; default_agent_id: string | null }> = {};

    for (const boardId of boardIds) {
      const [firstStep] = await this.db
        .select({
          id: boardSteps.id,
          name: boardSteps.name,
          default_agent_id: boardSteps.defaultAgentId,
        })
        .from(boardSteps)
        .where(eq(boardSteps.boardInstanceId, boardId))
        .orderBy(asc(boardSteps.position))
        .limit(1);
      if (firstStep) firstStepByBoard[boardId] = firstStep;
    }

    let created = 0;
    for (const params of tasks) {
      if (!params.board_id || !params.title) {
        this.logger.warn(`[DAGTasks] Skipping task missing board_id or title: ${JSON.stringify(params)}`);
        continue;
      }

      const step = firstStepByBoard[params.board_id] ?? null;
      const stepId = step?.id ?? null;
      const status = step?.name ?? 'To-Do';
      const defaultAgentId = step?.default_agent_id ?? null;

      let inserted: { id: string } | undefined;
      try {
        const insertedRows = await this.db
          .insert(tasksTable)
          .values({
            accountId,
            title: params.title,
            notes: params.description ?? '',
            priority: params.priority ?? 'Medium',
            status,
            boardInstanceId: params.board_id,
            currentStepId: stepId,
            assigneeType: defaultAgentId ? 'agent' : 'none',
            assigneeId: defaultAgentId,
            completed: false,
            cardData: {},
            metadata: { orchestration_id: orchestratedTaskId, pod_id: podId },
          })
          .returning({ id: tasksTable.id });
        inserted = insertedRows[0];
      } catch (error: any) {
        this.logger.error(`[DAGTasks] Insert failed for "${params.title}": ${error?.message}`);
        continue;
      }

      if (!inserted) {
        this.logger.error(`[DAGTasks] Insert failed for "${params.title}": no row returned`);
        continue;
      }

      this.logger.log(`[DAGTasks] Created task ${inserted.id}: "${params.title}" on board ${params.board_id}`);
      this.webhookEmitter.emit(accountId, 'task.created', { task: inserted });
      created++;
    }

    return created;
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
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // +5 min

    // Try INSERT — will fail on unique violation only if same holderId exists
    try {
      await this.db.insert(semaphoreLeases).values({
        accountId,
        resourceKey: 'backbone_calls',
        holderId,
        expiresAt,
      });
      // Inserted successfully
      return true;
    } catch {
      // Insert failed — fall through to capacity check below
    }

    // Insert failed — check current active lease count
    let activeLeases: Array<{ holder_id: string }>;
    try {
      activeLeases = await this.db
        .select({ holder_id: semaphoreLeases.holderId })
        .from(semaphoreLeases)
        .where(
          and(
            eq(semaphoreLeases.accountId, accountId),
            eq(semaphoreLeases.resourceKey, 'backbone_calls'),
            gt(semaphoreLeases.expiresAt, new Date().toISOString()),
          ),
        );
    } catch (countError: any) {
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
    try {
      await this.db.insert(semaphoreLeases).values({
        accountId,
        resourceKey: 'backbone_calls',
        holderId,
        expiresAt,
      });
    } catch (retryError: any) {
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
    try {
      await this.db
        .delete(semaphoreLeases)
        .where(
          and(
            eq(semaphoreLeases.accountId, accountId),
            eq(semaphoreLeases.holderId, holderId),
          ),
        );
    } catch (error: any) {
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
    // Insert into agent_approval_requests with the orchestrated_task_id
    let approvalRequestId: string | null = null;
    try {
      const approvalRows = await this.db
        .insert(agentApprovalRequests)
        .values({
          orchestratedTaskId: task.id,
          reason: `DAG task requires approval before execution: ${task.goal}`,
          status: 'pending',
        })
        .returning({ id: agentApprovalRequests.id });
      approvalRequestId = approvalRows[0]?.id ?? null;
    } catch (approvalError: any) {
      this.logger.warn(
        `[DAG] Failed to insert agent_approval_requests for task ${task.id}: ${approvalError.message}`,
      );
    }

    // Update task status to pending_approval
    await this.db
      .update(orchestratedTasks)
      .set({
        status: 'pending_approval',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(orchestratedTasks.id, task.id));

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
