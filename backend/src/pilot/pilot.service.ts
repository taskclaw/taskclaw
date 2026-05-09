import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
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
    private readonly supabaseAdmin: SupabaseAdminService,
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
    const client = this.supabaseAdmin.getClient();

    // Fetch active pilot config for this pod
    const { data: config } = await client
      .from('pilot_configs')
      .select('*')
      .eq('account_id', accountId)
      .eq('pod_id', podId)
      .eq('is_active', true)
      .maybeSingle();

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
      // Fetch all boards in pod with steps + pending tasks (limit 20)
      const { data: boards } = await client
        .from('board_instances')
        .select('id, name, board_steps(id, name, step_type, position)')
        .eq('account_id', accountId)
        .eq('pod_id', podId);

      const boardIds = (boards ?? []).map((b: any) => b.id);

      let pendingTasks: any[] = [];
      if (boardIds.length > 0) {
        const { data: tasks } = await client
          .from('tasks')
          .select(
            'id, title, status, priority, notes, board_instance_id, current_step_id',
          )
          .in('board_instance_id', boardIds)
          .eq('completed', false)
          .order('created_at', { ascending: false })
          .limit(config.max_tasks_per_cycle ?? 20);

        pendingTasks = tasks ?? [];
      }

      // Build org context markdown
      const boardsMarkdown =
        (boards ?? [])
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
        ...(config.backbone_connection_id ? {} : {}),
        sendOptions: {
          systemPrompt: config.system_prompt,
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
      await client
        .from('pilot_configs')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_summary: summary.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);

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
    const client = this.supabaseAdmin.getClient();

    // Fetch workspace-level config (pod_id IS NULL)
    const { data: config } = await client
      .from('pilot_configs')
      .select('*')
      .eq('account_id', accountId)
      .is('pod_id', null)
      .eq('is_active', true)
      .maybeSingle();

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
      const { data: pods } = await client
        .from('pods')
        .select('id, name, description')
        .eq('account_id', accountId);

      const podSummaries: string[] = [];

      for (const pod of pods ?? []) {
        const { data: boards } = await client
          .from('board_instances')
          .select('id, name')
          .eq('account_id', accountId)
          .eq('pod_id', pod.id);

        const boardIds = (boards ?? []).map((b: any) => b.id);
        let taskCount = 0;

        if (boardIds.length > 0) {
          const { count } = await client
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .in('board_instance_id', boardIds)
            .eq('completed', false);

          taskCount = count ?? 0;
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
        `\n\nTotal pods: ${pods?.length ?? 0}`;

      // Find or create the workspace conversation so history is browsable
      const conversationId = await this.findOrCreateWorkspaceConversation(
        accountId,
        logEntry?.id,
      );

      // Save user context message
      if (conversationId) {
        await client.from('ai_messages').insert({
          conversation_id: conversationId,
          role: 'user',
          content: contextBlock,
        });
      }

      // Call backbone
      const result = await this.backboneRouter.send({
        accountId,
        sendOptions: {
          systemPrompt: config.system_prompt,
          message: contextBlock,
        },
      });

      const summary = result.text ?? 'Workspace pilot ran but no response.';

      // Save AI response to conversation
      if (conversationId) {
        await client.from('ai_messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: summary,
        });
        // Touch conversation updated_at
        await client
          .from('conversations')
          .update({
            updated_at: new Date().toISOString(),
            title: `Workspace Pilot · ${new Date().toLocaleDateString()}`,
          })
          .eq('id', conversationId);
      }

      // Parse and execute actions (no specific pod — actions target any board)
      const actionsTaken = await this.parseAndExecuteActions(
        summary,
        accountId,
        undefined,
      );

      // Update config last_run
      await client
        .from('pilot_configs')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_summary: summary.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);

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
    const client = this.supabaseAdmin.getClient();

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
    const { data: podConfigs } = await client
      .from('pilot_configs')
      .select('pod_id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .not('pod_id', 'is', null);

    const podResults: Array<{
      podId: string;
      result: PilotRunResult | null;
      error?: string;
    }> = [];

    for (const cfg of podConfigs ?? []) {
      try {
        const result = await this.runPodPilot(accountId, cfg.pod_id);
        podResults.push({ podId: cfg.pod_id, result });
      } catch (err) {
        podResults.push({
          podId: cfg.pod_id,
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
    const client = this.supabaseAdmin.getClient();

    try {
      // Reuse the most recently updated workspace conversation
      const { data: existing } = await client
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .is('task_id', null)
        .is('board_id', null)
        .is('pod_id', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) return existing.id;

      // Get the account owner (first member) as user_id — required by conversations table
      const { data: member } = await client
        .from('account_members')
        .select('user_id')
        .eq('account_id', accountId)
        .limit(1)
        .maybeSingle();

      if (!member?.user_id) return null;

      const { data: conv } = await client
        .from('conversations')
        .insert({
          account_id: accountId,
          user_id: member.user_id,
          title: 'Workspace Pilot',
        })
        .select('id')
        .single();

      return conv?.id ?? null;
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
