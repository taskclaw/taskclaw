import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';

const TOOL_TYPES = ['telegram', 'whatsapp', 'slack'] as const;
type ToolType = (typeof TOOL_TYPES)[number];

export interface CommToolStatus {
  tool_type: ToolType;
  is_enabled: boolean;
  health_status: 'healthy' | 'unhealthy' | 'checking' | 'unknown';
  last_checked_at: string | null;
  last_healthy_at: string | null;
  last_error: string | null;
  check_interval_minutes: number;
  config: Record<string, any>;
}

@Injectable()
export class CommToolsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommToolsService.name);
  private cronInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckLocks = new Map<string, boolean>();

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly aiProviderService: AiProviderService,
  ) {}

  onModuleInit() {
    this.cronInterval = setInterval(() => {
      this.handleScheduledHealthChecks().catch((err) => {
        this.logger.error(`Comm tools health check sweep failed: ${err.message}`);
      });
    }, 60_000);
    this.logger.log('Comm tools health check cron registered (every 60s)');
  }

  onModuleDestroy() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════

  async getAll(accountId: string): Promise<CommToolStatus[]> {
    const client = this.supabaseAdmin.getClient();

    const { data: rows, error } = await client
      .from('comm_tool_integrations')
      .select('*')
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to fetch comm tools: ${error.message}`);
    }

    const existingMap = new Map(
      (rows || []).map((r) => [r.tool_type, r]),
    );

    return TOOL_TYPES.map((toolType) => {
      const row = existingMap.get(toolType);
      if (row) {
        return {
          tool_type: row.tool_type as ToolType,
          is_enabled: row.is_enabled,
          health_status: row.health_status,
          last_checked_at: row.last_checked_at,
          last_healthy_at: row.last_healthy_at,
          last_error: row.last_error,
          check_interval_minutes: row.check_interval_minutes,
          config: row.config || {},
        };
      }
      return {
        tool_type: toolType,
        is_enabled: false,
        health_status: 'unknown' as const,
        last_checked_at: null,
        last_healthy_at: null,
        last_error: null,
        check_interval_minutes: 5,
        config: {},
      };
    });
  }

  /**
   * Toggle a tool ON or OFF.
   * ON: verifies OpenClaw is connected, checks gateway reachability, saves to DB.
   * OFF: updates DB.
   */
  async toggle(
    accountId: string,
    toolType: string,
    isEnabled: boolean,
  ): Promise<CommToolStatus> {
    if (!TOOL_TYPES.includes(toolType as ToolType)) {
      throw new BadRequestException(`Invalid tool type: ${toolType}`);
    }

    const client = this.supabaseAdmin.getClient();

    if (isEnabled) {
      const aiConfig = await this.getAiConfig(accountId);
      if (!aiConfig) {
        throw new BadRequestException(
          'OpenClaw must be connected and verified before enabling communication tools. Go to Settings > AI Provider to connect.',
        );
      }

      // Verify OpenClaw gateway is reachable
      const reachable = await this.checkGatewayReachable(aiConfig.api_url);

      const now = new Date().toISOString();
      const { data, error } = await client
        .from('comm_tool_integrations')
        .upsert(
          {
            account_id: accountId,
            tool_type: toolType,
            is_enabled: true,
            health_status: reachable ? 'healthy' : 'unhealthy',
            last_checked_at: now,
            last_healthy_at: reachable ? now : null,
            last_error: reachable
              ? null
              : 'OpenClaw gateway is not reachable',
          },
          { onConflict: 'account_id,tool_type' },
        )
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to save comm tool status: ${error.message}`);
      }

      this.logger.log(
        `Enabled ${toolType} for account ${accountId} (gateway ${reachable ? 'reachable' : 'unreachable'})`,
      );
      return this.rowToStatus(data);
    } else {
      const { data, error } = await client
        .from('comm_tool_integrations')
        .upsert(
          {
            account_id: accountId,
            tool_type: toolType,
            is_enabled: false,
            health_status: 'unknown',
            last_error: null,
          },
          { onConflict: 'account_id,tool_type' },
        )
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to save comm tool status: ${error.message}`);
      }

      this.logger.log(`Disabled ${toolType} for account ${accountId}`);
      return this.rowToStatus(data);
    }
  }

  async updateConfig(
    accountId: string,
    toolType: string,
    updateData: { check_interval_minutes?: number; config?: Record<string, any> },
  ): Promise<CommToolStatus> {
    const client = this.supabaseAdmin.getClient();

    const update: Record<string, any> = {};
    if (updateData.check_interval_minutes !== undefined) {
      update.check_interval_minutes = updateData.check_interval_minutes;
    }
    if (updateData.config !== undefined) {
      update.config = updateData.config;
    }

    const { data, error } = await client
      .from('comm_tool_integrations')
      .update(update)
      .eq('account_id', accountId)
      .eq('tool_type', toolType)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update comm tool config: ${error.message}`);
    }

    return this.rowToStatus(data);
  }

  /**
   * Trigger an immediate health check for a specific tool.
   * Checks that OpenClaw gateway is reachable via HTTP GET.
   */
  async checkToolHealth(
    accountId: string,
    toolType: string,
  ): Promise<CommToolStatus> {
    const client = this.supabaseAdmin.getClient();

    await client
      .from('comm_tool_integrations')
      .update({ health_status: 'checking' })
      .eq('account_id', accountId)
      .eq('tool_type', toolType);

    const aiConfig = await this.getAiConfig(accountId);
    if (!aiConfig) {
      const { data } = await client
        .from('comm_tool_integrations')
        .update({
          health_status: 'unhealthy',
          last_checked_at: new Date().toISOString(),
          last_error: 'OpenClaw is not connected',
        })
        .eq('account_id', accountId)
        .eq('tool_type', toolType)
        .select('*')
        .single();
      return this.rowToStatus(data);
    }

    const reachable = await this.checkGatewayReachable(aiConfig.api_url);
    const now = new Date().toISOString();

    const updateData = reachable
      ? {
          health_status: 'healthy',
          last_checked_at: now,
          last_healthy_at: now,
          last_error: null,
        }
      : {
          health_status: 'unhealthy',
          last_checked_at: now,
          last_error: 'OpenClaw gateway is not reachable',
        };

    const { data, error } = await client
      .from('comm_tool_integrations')
      .update(updateData)
      .eq('account_id', accountId)
      .eq('tool_type', toolType)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update health status: ${error.message}`);
    }

    return this.rowToStatus(data);
  }

  async getAvailableTools(accountId: string): Promise<string[]> {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('comm_tool_integrations')
      .select('tool_type')
      .eq('account_id', accountId)
      .eq('is_enabled', true)
      .eq('health_status', 'healthy');

    if (error) {
      this.logger.warn(`Failed to fetch available comm tools: ${error.message}`);
      return [];
    }

    return (data || []).map((r) => r.tool_type);
  }

  // ═══════════════════════════════════════════════════════════
  // SCHEDULER
  // ═══════════════════════════════════════════════════════════

  private async handleScheduledHealthChecks(): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    const { data: dueTools, error } = await client
      .from('comm_tool_integrations')
      .select('*')
      .eq('is_enabled', true)
      .or(
        `last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - 60_000).toISOString()}`,
      )
      .limit(10);

    if (error || !dueTools || dueTools.length === 0) return;

    const now = Date.now();
    const toolsDue = dueTools.filter((tool) => {
      if (!tool.last_checked_at) return true;
      const elapsed = now - new Date(tool.last_checked_at).getTime();
      return elapsed >= tool.check_interval_minutes * 60_000;
    });

    if (toolsDue.length === 0) return;

    const aiConfigCache = new Map<string, any>();

    for (const tool of toolsDue) {
      const lockKey = `${tool.account_id}:${tool.tool_type}`;
      if (this.healthCheckLocks.get(lockKey)) continue;

      this.healthCheckLocks.set(lockKey, true);
      try {
        let aiConfig = aiConfigCache.get(tool.account_id);
        if (aiConfig === undefined) {
          aiConfig = await this.getAiConfig(tool.account_id);
          aiConfigCache.set(tool.account_id, aiConfig);
        }

        const nowIso = new Date().toISOString();

        if (!aiConfig) {
          await client
            .from('comm_tool_integrations')
            .update({
              health_status: 'unhealthy',
              last_checked_at: nowIso,
              last_error: 'OpenClaw is not connected',
            })
            .eq('id', tool.id);
          continue;
        }

        const reachable = await this.checkGatewayReachable(aiConfig.api_url);

        if (reachable) {
          await client
            .from('comm_tool_integrations')
            .update({
              health_status: 'healthy',
              last_checked_at: nowIso,
              last_healthy_at: nowIso,
              last_error: null,
            })
            .eq('id', tool.id);
        } else {
          await client
            .from('comm_tool_integrations')
            .update({
              health_status: 'unhealthy',
              last_checked_at: nowIso,
              last_error: 'OpenClaw gateway is not reachable',
            })
            .eq('id', tool.id);
        }
      } catch (err: any) {
        this.logger.error(
          `Health check failed for ${tool.tool_type} (account ${tool.account_id}): ${err.message}`,
        );
      } finally {
        this.healthCheckLocks.delete(lockKey);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private async getAiConfig(accountId: string): Promise<any | null> {
    try {
      const config = await this.aiProviderService.getDecryptedConfig(
        accountId,
        'admin-bypass',
      );
      return config?.verified_at ? config : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if the OpenClaw gateway is reachable via a simple GET request.
   * The gateway serves the Control UI SPA at its root, so a 200 means it's up.
   */
  private async checkGatewayReachable(apiUrl: string): Promise<boolean> {
    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private rowToStatus(row: any): CommToolStatus {
    return {
      tool_type: row.tool_type,
      is_enabled: row.is_enabled,
      health_status: row.health_status,
      last_checked_at: row.last_checked_at,
      last_healthy_at: row.last_healthy_at,
      last_error: row.last_error,
      check_interval_minutes: row.check_interval_minutes,
      config: row.config || {},
    };
  }
}
