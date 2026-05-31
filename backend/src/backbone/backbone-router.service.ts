import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  tasks,
  boardSteps,
  boardInstances,
  agents,
  categories,
  pods,
  backboneConnections,
} from '../db/schema';
import { BackboneAdapterRegistry } from './adapters/backbone-adapter.registry';
import { BackboneConnectionsService } from './backbone-connections.service';
import { TokenUsageService } from './token-usage.service';
import {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
} from './adapters/backbone-adapter.interface';

/**
 * Where in the resolution cascade the backbone was found.
 */
export type ResolvedFrom =
  | 'conversation'
  | 'task'
  | 'step'
  | 'board'
  | 'agent'
  | 'category'
  | 'pod'
  | 'account_default'
  | 'legacy_fallback';

export interface ResolveResult {
  adapter: BackboneAdapter;
  connection: any; // raw DB row
  config: Record<string, any>; // decrypted config
  resolvedFrom: ResolvedFrom;
}

export interface BackboneRouterSendOptions {
  accountId: string;
  /** Optional: narrow resolution to a specific task (highest priority) */
  taskId?: string;
  /** Optional: narrow resolution to a specific board step */
  stepId?: string;
  /** Optional: narrow resolution to a specific board */
  boardId?: string;
  /** Optional: narrow resolution to a specific agent */
  agentId?: string;
  /** Optional: narrow resolution to a specific category (legacy) */
  categoryId?: string;
  /** Optional: narrow resolution to a specific pod */
  podId?: string;
  /** The send payload (message, history, skills, etc.) */
  sendOptions: Omit<BackboneSendOptions, 'config'>;
}

/**
 * BackboneRouterService (F011)
 *
 * Resolves which backbone connection to use for a given request context
 * using a cascade: Step -> Board -> Category -> Account default -> Legacy fallback.
 *
 * Then delegates to the appropriate adapter.
 */
@Injectable()
export class BackboneRouterService {
  private readonly logger = new Logger(BackboneRouterService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly registry: BackboneAdapterRegistry,
    private readonly connections: BackboneConnectionsService,
    private readonly tokenUsage: TokenUsageService,
  ) {}

  /**
   * Resolve the backbone connection for the given context.
   * Walks the cascade: Step -> Board -> Category -> Account default -> Legacy.
   */
  async resolve(
    accountId: string,
    options?: { taskId?: string; stepId?: string; boardId?: string; categoryId?: string; agentId?: string; podId?: string; conversationBackboneId?: string },
  ): Promise<ResolveResult> {
    // -1. Conversation-pinned backbone (explicit user selection, highest priority)
    if (options?.conversationBackboneId) {
      const result = await this.loadConnection(
        options.conversationBackboneId,
        'conversation',
      );
      if (result) return result;
    }

    // 0. Task-level override (highest priority)
    if (options?.taskId) {
      const [task] = await this.db
        .select({ backboneConnectionId: tasks.backboneConnectionId })
        .from(tasks)
        .where(eq(tasks.id, options.taskId))
        .limit(1);

      if (task?.backboneConnectionId) {
        const result = await this.loadConnection(
          task.backboneConnectionId,
          'task',
        );
        if (result) return result;
      }
    }

    // 1. Step-level override
    if (options?.stepId) {
      const [step] = await this.db
        .select({ backboneConnectionId: boardSteps.backboneConnectionId })
        .from(boardSteps)
        .where(eq(boardSteps.id, options.stepId))
        .limit(1);

      if (step?.backboneConnectionId) {
        const result = await this.loadConnection(
          step.backboneConnectionId,
          'step',
        );
        if (result) return result;
      }
    }

    // 2. Board-level override
    if (options?.boardId) {
      const [board] = await this.db
        .select({
          defaultBackboneConnectionId:
            boardInstances.defaultBackboneConnectionId,
        })
        .from(boardInstances)
        .where(eq(boardInstances.id, options.boardId))
        .limit(1);

      if (board?.defaultBackboneConnectionId) {
        const result = await this.loadConnection(
          board.defaultBackboneConnectionId,
          'board',
        );
        if (result) return result;
      }
    }

    // 3. Agent-level override (new — replaces category level for assigned tasks)
    if (options?.agentId) {
      const [agent] = await this.db
        .select({ backboneConnectionId: agents.backboneConnectionId })
        .from(agents)
        .where(eq(agents.id, options.agentId))
        .limit(1);

      if (agent?.backboneConnectionId) {
        const result = await this.loadConnection(
          agent.backboneConnectionId,
          'agent',
        );
        if (result) return result;
      }
    }

    // 3b. Category-level override (legacy — kept for backward compat during migration)
    if (options?.categoryId) {
      const [category] = await this.db
        .select({
          preferredBackboneConnectionId:
            categories.preferredBackboneConnectionId,
        })
        .from(categories)
        .where(eq(categories.id, options.categoryId))
        .limit(1);

      if (category?.preferredBackboneConnectionId) {
        const result = await this.loadConnection(
          category.preferredBackboneConnectionId,
          'category',
        );
        if (result) return result;
      }
    }

    // 4. Pod-level override
    if (options?.podId) {
      const [pod] = await this.db
        .select({ backboneConnectionId: pods.backboneConnectionId })
        .from(pods)
        .where(eq(pods.id, options.podId))
        .limit(1);
      if (pod?.backboneConnectionId) {
        const result = await this.loadConnection(
          pod.backboneConnectionId,
          'pod',
        );
        if (result) return result;
      }
    }

    // 5. Account default
    const defaultConn = await this.connections.getAccountDefault(accountId);
    if (defaultConn) {
      const adapter = this.registry.get(defaultConn.backbone_type);
      const config = this.connections.decryptConfig(defaultConn.config);
      return {
        adapter,
        connection: defaultConn,
        config,
        resolvedFrom: 'account_default',
      };
    }

    // 6. Legacy fallback — look for any active connection
    const activeConns = await this.connections.findAllActive(accountId);
    if (activeConns.length > 0) {
      const conn = activeConns[0];
      const adapter = this.registry.get(conn.backbone_type);
      const config = this.connections.decryptConfig(conn.config);
      this.logger.warn(
        `No default backbone for account ${accountId}; falling back to connection ${conn.id}`,
      );
      return {
        adapter,
        connection: conn,
        config,
        resolvedFrom: 'legacy_fallback',
      };
    }

    throw new NotFoundException(
      `No backbone connection configured for account ${accountId}. ` +
        'Please add a backbone connection in Settings.',
    );
  }

  /**
   * Convenience: resolve + send in one call.
   */
  async send(options: BackboneRouterSendOptions): Promise<BackboneSendResult> {
    const resolved = await this.resolve(options.accountId, {
      taskId: options.taskId,
      stepId: options.stepId,
      boardId: options.boardId,
      agentId: options.agentId,
      categoryId: options.categoryId,
      podId: options.podId,
    });

    this.logger.debug(
      `Routing to ${resolved.adapter.slug} (${resolved.resolvedFrom}) for account ${options.accountId}`,
    );

    // Transform system prompt if the adapter supports it
    let systemPrompt = options.sendOptions.systemPrompt;
    if (resolved.adapter.transformSystemPrompt) {
      systemPrompt = resolved.adapter.transformSystemPrompt(
        systemPrompt ?? '',
        resolved.config,
      );
    }

    // Decide whether to pass skills natively or inject into prompt
    let skills = options.sendOptions.skills;
    if (
      skills?.length &&
      resolved.adapter.supportsNativeSkillInjection &&
      !resolved.adapter.supportsNativeSkillInjection()
    ) {
      // Adapter does not support native skills — inject descriptions into prompt
      const skillBlock = skills
        .map((s) => `- ${s.name}: ${s.description}`)
        .join('\n');
      systemPrompt = (systemPrompt ?? '') + `\n\nAvailable skills:\n${skillBlock}`;
      skills = undefined;
    }

    const startedAt = Date.now();
    const result = await resolved.adapter.sendMessage({
      ...options.sendOptions,
      config: resolved.config,
      systemPrompt,
      skills,
    });
    const latency = Date.now() - startedAt;

    // Track usage asynchronously (fire-and-forget)
    if (result.usage?.total_tokens) {
      this.connections
        .trackUsage(resolved.connection.id, result.usage.total_tokens)
        .catch((err) =>
          this.logger.error(`Failed to track usage: ${err.message}`),
        );
    }

    // PRD §11 — record per-call token usage for the Factory Dashboard.
    // Fire-and-forget; failures must never block the caller.
    const usage = result.usage;
    const cacheStats = result.cacheStats;
    if (usage || cacheStats) {
      this.tokenUsage
        .record({
          account_id: options.accountId,
          agent_id: options.agentId ?? null,
          pod_id: options.podId ?? null,
          conversation_id:
            (options.sendOptions.metadata?.conversation_id as string | undefined) ?? null,
          task_id: options.taskId ?? null,
          provider: resolved.adapter.slug,
          model:
            result.model ??
            (resolved.config?.model as string | undefined) ??
            'unknown',
          input_tokens:
            (usage?.prompt_tokens ?? 0) + (cacheStats?.input_tokens ?? 0),
          output_tokens: usage?.completion_tokens ?? 0,
          cache_read_tokens: cacheStats?.cache_read_input_tokens ?? 0,
          cache_write_tokens: cacheStats?.cache_creation_input_tokens ?? 0,
          latency_ms: latency,
        })
        .catch((err) =>
          this.logger.warn(
            `token_usage record failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    return result;
  }

  // ─── Private ─────────────────────────────────────────────

  private async loadConnection(
    connectionId: string,
    resolvedFrom: ResolvedFrom,
  ): Promise<ResolveResult | null> {
    const [row] = await this.db
      .select()
      .from(backboneConnections)
      .where(
        and(
          eq(backboneConnections.id, connectionId),
          eq(backboneConnections.isActive, true),
        ),
      )
      .limit(1);

    if (!row) return null;

    // Re-key to the snake_case shape callers depend on (raw DB row),
    // preserving `backbone_type` / `config` / `id` access downstream.
    const conn = {
      ...row,
      backbone_type: row.backboneType,
    };

    const adapter = this.registry.get(conn.backbone_type);
    const config = this.connections.decryptConfig(
      conn.config as Record<string, any>,
    );

    return { adapter, connection: conn, config, resolvedFrom };
  }
}
