import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { BackboneAdapterRegistry } from './adapters/backbone-adapter.registry';
import { BackboneConnectionsService } from './backbone-connections.service';
import {
  BackboneAdapter,
  BackboneSendOptions,
  BackboneSendResult,
} from './adapters/backbone-adapter.interface';

/**
 * Where in the resolution cascade the backbone was found.
 */
export type ResolvedFrom =
  | 'step'
  | 'board'
  | 'category'
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
  /** Optional: narrow resolution to a specific board step */
  stepId?: string;
  /** Optional: narrow resolution to a specific board */
  boardId?: string;
  /** Optional: narrow resolution to a specific category */
  categoryId?: string;
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
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly registry: BackboneAdapterRegistry,
    private readonly connections: BackboneConnectionsService,
  ) {}

  /**
   * Resolve the backbone connection for the given context.
   * Walks the cascade: Step -> Board -> Category -> Account default -> Legacy.
   */
  async resolve(
    accountId: string,
    options?: { stepId?: string; boardId?: string; categoryId?: string },
  ): Promise<ResolveResult> {
    const client = this.supabaseAdmin.getClient();

    // 1. Step-level override
    if (options?.stepId) {
      const { data: step } = await client
        .from('board_steps')
        .select('backbone_connection_id')
        .eq('id', options.stepId)
        .maybeSingle();

      if (step?.backbone_connection_id) {
        const result = await this.loadConnection(
          step.backbone_connection_id,
          'step',
        );
        if (result) return result;
      }
    }

    // 2. Board-level override
    if (options?.boardId) {
      const { data: board } = await client
        .from('board_instances')
        .select('default_backbone_connection_id')
        .eq('id', options.boardId)
        .maybeSingle();

      if (board?.default_backbone_connection_id) {
        const result = await this.loadConnection(
          board.default_backbone_connection_id,
          'board',
        );
        if (result) return result;
      }
    }

    // 3. Category-level override
    if (options?.categoryId) {
      const { data: category } = await client
        .from('categories')
        .select('preferred_backbone_connection_id')
        .eq('id', options.categoryId)
        .maybeSingle();

      if (category?.preferred_backbone_connection_id) {
        const result = await this.loadConnection(
          category.preferred_backbone_connection_id,
          'category',
        );
        if (result) return result;
      }
    }

    // 4. Account default
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

    // 5. Legacy fallback — look for any active connection
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
      stepId: options.stepId,
      boardId: options.boardId,
      categoryId: options.categoryId,
    });

    this.logger.debug(
      `Routing to ${resolved.adapter.slug} (${resolved.resolvedFrom}) for account ${options.accountId}`,
    );

    // Transform system prompt if the adapter supports it
    let systemPrompt = options.sendOptions.systemPrompt;
    if (resolved.adapter.transformSystemPrompt) {
      systemPrompt = resolved.adapter.transformSystemPrompt(
        systemPrompt,
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
      systemPrompt += `\n\nAvailable skills:\n${skillBlock}`;
      skills = undefined;
    }

    const result = await resolved.adapter.sendMessage({
      ...options.sendOptions,
      config: resolved.config,
      systemPrompt,
      skills,
    });

    // Track usage asynchronously (fire-and-forget)
    if (result.usage?.total_tokens) {
      this.connections
        .trackUsage(resolved.connection.id, result.usage.total_tokens)
        .catch((err) =>
          this.logger.error(`Failed to track usage: ${err.message}`),
        );
    }

    return result;
  }

  // ─── Private ─────────────────────────────────────────────

  private async loadConnection(
    connectionId: string,
    resolvedFrom: ResolvedFrom,
  ): Promise<ResolveResult | null> {
    const client = this.supabaseAdmin.getClient();

    const { data: conn } = await client
      .from('backbone_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('is_active', true)
      .maybeSingle();

    if (!conn) return null;

    const adapter = this.registry.get(conn.backbone_type);
    const config = this.connections.decryptConfig(conn.config);

    return { adapter, connection: conn, config, resolvedFrom };
  }
}
