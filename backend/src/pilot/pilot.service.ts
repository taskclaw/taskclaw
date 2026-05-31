import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql, count } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  pilotConfigs,
  boardInstances,
  tasks,
  pods,
  conversations,
  aiMessages,
  accountUsers,
} from '../db/schema';
import { BackboneRouterService } from '../backbone/backbone-router.service';
import { TasksService } from '../tasks/tasks.service';
import { CoordinatorService } from '../board-routing/coordinator.service';
import { ExecutionLogService } from '../heartbeat/execution-log.service';

export interface PilotRunResult {
  summary: string;
  actions_taken: number;
  conversation_id?: string | null;
}

interface PilotAction {
  action: string;
  params: Record<string, any>;
}

@Injectable()
export class PilotService {
  private readonly logger = new Logger(PilotService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly backboneRouter: BackboneRouterService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    private readonly coordinatorService: CoordinatorService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  // ─── BE13: Pod-level Pilot ────────────────────────────────────────────────

  /**
   * Run the pilot agent for a specific pod.
   * Fetches active pilot_config, builds context, calls backbone, executes actions.
   */
  async runPodPilot(
    accountId: string,
    podId: string,
  ): Promise<PilotRunResult | null> {
    // Fetch active pilot config for this pod
    const config = await this.db.query.pilotConfigs.findFirst({
      where: and(
        eq(pilotConfigs.accountId, accountId),
        eq(pilotConfigs.podId, podId),
        eq(pilotConfigs.isActive, true),
      ),
    });

    if (!config) {
      this.logger.debug(`No active pilot config for pod ${podId} — skipping`);
      return null;
    }

    const startTime = Date.now();

    const logEntry = await this.executionLog.create({
      account_id: accountId,
      trigger_type: 'coordinator',
      status: 'running',
      pod_id: podId,
    });

    try {
      // Fetch all boards in pod with steps + pending tasks (limit 20).
      // Drizzle's relational query returns the joined rows under the relation
      // name (`boardSteps`); PostgREST returned them under the table name
      // (`board_steps`). Re-key to `board_steps` to preserve response shape.
      const boardRows = await this.db.query.boardInstances.findMany({
        where: and(
          eq(boardInstances.accountId, accountId),
          eq(boardInstances.podId, podId),
        ),
        columns: { id: true, name: true },
        with: {
          boardSteps: {
            columns: { id: true, name: true, stepType: true, position: true },
          },
        },
      });

      const boards = boardRows.map((b) => ({
        id: b.id,
        name: b.name,
        board_steps: b.boardSteps.map((s) => ({
          id: s.id,
          name: s.name,
          step_type: s.stepType,
          position: s.position,
        })),
      }));

      const boardIds = boards.map((b: any) => b.id);

      let pendingTasks: any[] = [];
      if (boardIds.length > 0) {
        pendingTasks = await this.db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            notes: tasks.notes,
            board_instance_id: tasks.boardInstanceId,
            current_step_id: tasks.currentStepId,
          })
          .from(tasks)
          .where(
            and(
              inArray(tasks.boardInstanceId, boardIds),
              eq(tasks.completed, false),
            ),
          )
          .orderBy(desc(tasks.createdAt))
          .limit(config.maxTasksPerCycle ?? 20);
      }

      // Build org context markdown
      const boardsMarkdown =
        boards
          .map((b: any) => {
            const steps = (b.board_steps ?? [])
              .sort((a: any, b: any) => a.position - b.position)
              .map((s: any) => `  - "${s.name}" [${s.step_type}]`)
              .join('\n');
            const boardTasks = pendingTasks
              .filter((t: any) => t.board_instance_id === b.id)
              .map((t: any) => `  - [${t.priority}] ${t.title} (${t.status})`)
              .join('\n');
            return `### Board: "${b.name}" (id: ${b.id})\nSteps:\n${steps || '  (none)'}\nPending tasks:\n${boardTasks || '  (none)'}`;
          })
          .join('\n\n') || 'No boards found.';

      const contextBlock = `## Pod Context\nPod ID: ${podId}\n\n${boardsMarkdown}\n\nTotal pending tasks: ${pendingTasks.length}`;

      // Call backbone
      const result = await this.backboneRouter.send({
        accountId,
        podId,
        ...(config.backboneConnectionId ? {} : {}),
        sendOptions: {
          systemPrompt: config.systemPrompt,
          message: contextBlock,
        },
      });

      const summary = result.text ?? 'Pilot ran but no response received.';

      // Parse and execute actions
      const actionsTaken = await this.parseAndExecuteActions(
        summary,
        accountId,
        podId,
      );

      // Update config last_run
      await this.db
        .update(pilotConfigs)
        .set({
          lastRunAt: new Date().toISOString(),
          lastRunSummary: summary.slice(0, 1000),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(pilotConfigs.id, config.id));

      if (logEntry) {
        await this.executionLog.complete(logEntry.id, {
          status: 'success',
          summary: summary.slice(0, 500),
          duration_ms: Date.now() - startTime,
        });
      }

      this.logger.log(
        `Pod pilot for ${podId} completed: ${actionsTaken} actions taken`,
      );

      return { summary, actions_taken: actionsTaken };
    } catch (err) {
      const errorMessage = (err as Error).message;

      if (logEntry) {
        await this.executionLog.complete(logEntry.id, {
          status: 'error',
          error_details: errorMessage.slice(0, 1000),
          duration_ms: Date.now() - startTime,
        });
      }

      this.logger.error(`Pod pilot failed for pod ${podId}: ${errorMessage}`);
      throw err;
    }
  }

  // ─── BE14: Workspace-level Pilot ─────────────────────────────────────────

  /**
   * Run the workspace-level pilot agent (pod_id IS NULL config).
   */
  async runWorkspacePilot(accountId: string): Promise<PilotRunResult | null> {
    // Fetch workspace-level config (pod_id IS NULL)
    const config = await this.db.query.pilotConfigs.findFirst({
      where: and(
        eq(pilotConfigs.accountId, accountId),
        isNull(pilotConfigs.podId),
        eq(pilotConfigs.isActive, true),
      ),
    });

    if (!config) {
      this.logger.debug(
        `No active workspace pilot config for account ${accountId} — skipping`,
      );
      return null;
    }

    const startTime = Date.now();

    const logEntry = await this.executionLog.create({
      account_id: accountId,
      trigger_type: 'coordinator',
      status: 'running',
    });

    try {
      // Fetch all pods with their boards + task counts
      const podList = await this.db
        .select({ id: pods.id, name: pods.name, description: pods.description })
        .from(pods)
        .where(eq(pods.accountId, accountId));

      const podSummaries: string[] = [];

      for (const pod of podList ?? []) {
        const boards = await this.db
          .select({ id: boardInstances.id, name: boardInstances.name })
          .from(boardInstances)
          .where(
            and(
              eq(boardInstances.accountId, accountId),
              eq(boardInstances.podId, pod.id),
            ),
          );

        const boardIds = (boards ?? []).map((b: any) => b.id);
        let taskCount = 0;

        if (boardIds.length > 0) {
          const [{ value }] = await this.db
            .select({ value: count() })
            .from(tasks)
            .where(
              and(
                inArray(tasks.boardInstanceId, boardIds),
                eq(tasks.completed, false),
              ),
            );

          taskCount = value ?? 0;
        }

        const boardNames = (boards ?? [])
          .map((b: any) => `"${b.name}"`)
          .join(', ');

        podSummaries.push(
          `### Pod: "${pod.name}" (id: ${pod.id})\nBoards: ${boardNames || '(none)'}\nPending tasks: ${taskCount}`,
        );
      }

      const contextBlock =
        `## Workspace Overview\nAccount: ${accountId}\n\n` +
        (podSummaries.join('\n\n') || 'No pods configured.') +
        `\n\nTotal pods: ${podList?.length ?? 0}`;

      // Find or create the workspace conversation so history is browsable
      const conversationId = await this.findOrCreateWorkspaceConversation(
        accountId,
        logEntry?.id,
      );

      // Save user context message
      if (conversationId) {
        await this.db.insert(aiMessages).values({
          conversationId,
          role: 'user',
          content: contextBlock,
        });
      }

      // Call backbone
      const result = await this.backboneRouter.send({
        accountId,
        sendOptions: {
          systemPrompt: config.systemPrompt,
          message: contextBlock,
        },
      });

      const summary = result.text ?? 'Workspace pilot ran but no response.';

      // Save AI response to conversation
      if (conversationId) {
        await this.db.insert(aiMessages).values({
          conversationId,
          role: 'assistant',
          content: summary,
        });
        // Touch conversation updated_at
        await this.db
          .update(conversations)
          .set({
            updatedAt: new Date().toISOString(),
            title: `Workspace Pilot · ${new Date().toLocaleDateString()}`,
          })
          .where(eq(conversations.id, conversationId));
      }

      // Parse and execute actions (no specific pod — actions target any board)
      const actionsTaken = await this.parseAndExecuteActions(
        summary,
        accountId,
        undefined,
      );

      // Update config last_run
      await this.db
        .update(pilotConfigs)
        .set({
          lastRunAt: new Date().toISOString(),
          lastRunSummary: summary.slice(0, 1000),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(pilotConfigs.id, config.id));

      if (logEntry) {
        await this.executionLog.complete(logEntry.id, {
          status: 'success',
          summary: summary.slice(0, 500),
          duration_ms: Date.now() - startTime,
        });
      }

      this.logger.log(
        `Workspace pilot for account ${accountId} completed: ${actionsTaken} actions`,
      );

      return {
        summary,
        actions_taken: actionsTaken,
        conversation_id: conversationId,
      };
    } catch (err) {
      const errorMessage = (err as Error).message;

      if (logEntry) {
        await this.executionLog.complete(logEntry.id, {
          status: 'error',
          error_details: errorMessage.slice(0, 1000),
          duration_ms: Date.now() - startTime,
        });
      }

      this.logger.error(
        `Workspace pilot failed for account ${accountId}: ${errorMessage}`,
      );
      throw err;
    }
  }

  /**
   * Run workspace pilot + all active pod pilots sequentially.
   */
  async runAll(accountId: string): Promise<{
    workspace: PilotRunResult | null;
    pods: Array<{
      podId: string;
      result: PilotRunResult | null;
      error?: string;
    }>;
  }> {
    // Run workspace pilot first
    let workspaceResult: PilotRunResult | null = null;
    try {
      workspaceResult = await this.runWorkspacePilot(accountId);
    } catch (err) {
      this.logger.error(
        `runAll: workspace pilot failed: ${(err as Error).message}`,
      );
    }

    // Find all active pod configs
    const podConfigs = await this.db
      .select({ pod_id: pilotConfigs.podId })
      .from(pilotConfigs)
      .where(
        and(
          eq(pilotConfigs.accountId, accountId),
          eq(pilotConfigs.isActive, true),
          sql`${pilotConfigs.podId} is not null`,
        ),
      );

    const podResults: Array<{
      podId: string;
      result: PilotRunResult | null;
      error?: string;
    }> = [];

    for (const cfg of podConfigs ?? []) {
      try {
        const result = await this.runPodPilot(accountId, cfg.pod_id as string);
        podResults.push({ podId: cfg.pod_id as string, result });
      } catch (err) {
        podResults.push({
          podId: cfg.pod_id as string,
          result: null,
          error: (err as Error).message,
        });
      }
    }

    return { workspace: workspaceResult, pods: podResults };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Find the most recent workspace-level conversation for this account, or create one.
   * "Workspace" = no task_id, no board_id, no pod_id.
   */
  private async findOrCreateWorkspaceConversation(
    accountId: string,
    logId?: string | null,
  ): Promise<string | null> {
    try {
      // Reuse the most recently updated workspace conversation
      const existing = await this.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.accountId, accountId),
            isNull(conversations.taskId),
            isNull(conversations.boardId),
            isNull(conversations.podId),
          ),
        )
        .orderBy(desc(conversations.updatedAt))
        .limit(1);

      if (existing[0]?.id) return existing[0].id;

      // Get the account owner (first member) as user_id — required by conversations table
      const member = await this.db
        .select({ user_id: accountUsers.userId })
        .from(accountUsers)
        .where(eq(accountUsers.accountId, accountId))
        .limit(1);

      if (!member[0]?.user_id) return null;

      const conv = await this.db
        .insert(conversations)
        .values({
          accountId,
          userId: member[0].user_id,
          title: 'Workspace Pilot',
        })
        .returning({ id: conversations.id });

      return conv[0]?.id ?? null;
    } catch (err) {
      this.logger.warn(
        `findOrCreateWorkspaceConversation failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Parse a JSON action block from the AI response and execute each action.
   * Format: ```json [{action, params}] ```
   * Errors in parsing or execution are logged but don't throw.
   */
  private async parseAndExecuteActions(
    response: string,
    accountId: string,
    podId?: string,
  ): Promise<number> {
    let actions: PilotAction[] = [];

    // Find ```json ... ``` block
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/i);
    if (!jsonMatch) {
      return 0;
    }

    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(parsed)) {
        actions = parsed;
      }
    } catch (parseErr) {
      this.logger.warn(
        `Pilot: failed to parse action JSON: ${(parseErr as Error).message}`,
      );
      return 0;
    }

    let actionsTaken = 0;

    for (const action of actions) {
      try {
        await this.executeAction(action, accountId, podId);
        actionsTaken++;
      } catch (err) {
        this.logger.warn(
          `Pilot: action "${action.action}" failed: ${(err as Error).message}`,
        );
      }
    }

    return actionsTaken;
  }

  private async executeAction(
    action: PilotAction,
    accountId: string,
    podId?: string,
  ): Promise<void> {
    const { action: type, params } = action;

    switch (type) {
      case 'create_task': {
        // params: { title, board_id, priority?, notes? }
        await this.tasksService.create('system', accountId, {
          title: params.title,
          board_instance_id: params.board_id,
          priority: params.priority ?? 'Medium',
          notes: params.notes ?? '',
        });
        this.logger.log(
          `Pilot: created task "${params.title}" on board ${params.board_id}`,
        );
        break;
      }

      case 'move_task': {
        // params: { task_id, current_step_id }
        await this.tasksService.update('system', accountId, params.task_id, {
          current_step_id: params.current_step_id,
        });
        this.logger.log(
          `Pilot: moved task ${params.task_id} to step ${params.current_step_id}`,
        );
        break;
      }

      case 'decompose_goal': {
        // params: { goal, board_id? }
        await this.coordinatorService.decomposeGoal({
          accountId,
          podId,
          goal: params.goal,
        });
        this.logger.log(`Pilot: decomposed goal "${params.goal}"`);
        break;
      }

      default:
        this.logger.warn(`Pilot: unknown action type "${type}" — skipping`);
    }
  }
}
