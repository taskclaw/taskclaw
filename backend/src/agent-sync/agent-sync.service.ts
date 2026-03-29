import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { AgentCompilerService } from './agent-compiler.service';
import { OpenClawRpcClient } from './openclaw-rpc.client';

export interface SyncResult {
  categoryId: string;
  categoryName: string;
  action: 'created' | 'updated' | 'skipped' | 'deleted' | 'error';
  error?: string;
}

@Injectable()
export class AgentSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentSyncService.name);

  // Prevent concurrent sync for the same category
  private syncLocks = new Map<string, boolean>();
  private cronInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly aiProviderService: AiProviderService,
    private readonly compiler: AgentCompilerService,
    private readonly rpc: OpenClawRpcClient,
  ) {}

  onModuleInit() {
    // Run scheduled sync every 5 minutes (300,000 ms)
    this.cronInterval = setInterval(
      () => {
        this.handleScheduledSync().catch((err) => {
          this.logger.error(`Scheduled sync failed: ${err.message}`);
        });
      },
      5 * 60 * 1000,
    );
    this.logger.log('Agent sync cron registered (every 5 minutes)');
  }

  onModuleDestroy() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CORE: Sync a single category to the provider
  // ═══════════════════════════════════════════════════════════

  async syncCategory(
    accountId: string,
    categoryId: string,
  ): Promise<SyncResult> {
    const lockKey = `${accountId}:${categoryId}`;
    if (this.syncLocks.get(lockKey)) {
      this.logger.debug(`Sync already in progress for ${lockKey}, skipping`);
      return { categoryId, categoryName: '', action: 'skipped' };
    }

    this.syncLocks.set(lockKey, true);
    const startTime = Date.now();
    const client = this.supabaseAdmin.getClient();

    try {
      // 1. Get AI provider config
      const aiConfig = await this.getAiConfig(accountId);
      if (!aiConfig) {
        return {
          categoryId,
          categoryName: '',
          action: 'skipped',
          error: 'No AI provider configured',
        };
      }

      // 2. Compile SKILL.md content
      const compiled = await this.compiler.compileForCategory(
        accountId,
        categoryId,
      );

      // 3. Get or create provider_agents row
      let { data: agentRow } = await client
        .from('provider_agents')
        .select('*')
        .eq('account_id', accountId)
        .eq('category_id', categoryId)
        .single();

      // If no content to compile, clean up if needed
      if (!compiled) {
        if (agentRow) {
          // Delete the remote skill file
          if (agentRow.remote_skill_path) {
            await this.rpc.deleteSkill(aiConfig, agentRow.remote_skill_path);
          }
          await client.from('provider_agents').delete().eq('id', agentRow.id);
          await this.logSync(
            agentRow.id,
            accountId,
            'delete',
            'completed',
            null,
            null,
            Date.now() - startTime,
          );
        }
        return { categoryId, categoryName: '', action: 'deleted' };
      }

      // 4. Check if hash changed
      if (
        agentRow &&
        agentRow.instructions_hash === compiled.hash &&
        agentRow.sync_status === 'synced'
      ) {
        this.logger.debug(
          `Category "${compiled.categoryName}" unchanged — skipping`,
        );
        return {
          categoryId,
          categoryName: compiled.categoryName,
          action: 'skipped',
        };
      }

      // 5. Create row if doesn't exist
      const isNew = !agentRow;
      if (isNew) {
        const { data: newRow, error: insertErr } = await client
          .from('provider_agents')
          .insert({
            account_id: accountId,
            category_id: categoryId,
            provider_type: 'openclaw',
            remote_skill_path: compiled.categorySlug,
            sync_status: 'syncing',
          })
          .select()
          .single();

        if (insertErr) {
          throw new Error(
            `Failed to create provider_agents row: ${insertErr.message}`,
          );
        }
        agentRow = newRow;
      } else {
        // Mark as syncing
        await client
          .from('provider_agents')
          .update({ sync_status: 'syncing' })
          .eq('id', agentRow.id);
      }

      // 6. Push to OpenClaw via RPC
      const result = await this.rpc.syncSkill(
        aiConfig,
        compiled.categorySlug,
        compiled.content,
        compiled.hash,
      );

      if (!result.ok) {
        throw new Error(`RPC syncSkill failed: ${result.error}`);
      }

      // 7. Update provider_agents row
      await client
        .from('provider_agents')
        .update({
          instructions_hash: compiled.hash,
          compiled_instructions: compiled.content,
          skill_ids_snapshot: compiled.skillIds,
          knowledge_doc_id: compiled.knowledgeDocId,
          remote_skill_path: compiled.categorySlug,
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
          retry_count: 0,
          next_retry_at: null,
        })
        .eq('id', agentRow.id);

      // 8. Log success
      const durationMs = Date.now() - startTime;
      await this.logSync(
        agentRow.id,
        accountId,
        isNew ? 'create' : 'update',
        'completed',
        compiled.hash,
        null,
        durationMs,
      );

      this.logger.log(
        `Synced category "${compiled.categoryName}" to provider (${isNew ? 'created' : 'updated'}, ${durationMs}ms)`,
      );

      return {
        categoryId,
        categoryName: compiled.categoryName,
        action: isNew ? 'created' : 'updated',
      };
    } catch (err: any) {
      this.logger.error(
        `Sync failed for category ${categoryId}: ${err.message}`,
      );

      // Update provider_agents with error
      const { data: agentRow } = await client
        .from('provider_agents')
        .select('id, retry_count')
        .eq('account_id', accountId)
        .eq('category_id', categoryId)
        .single();

      if (agentRow) {
        const retryCount = (agentRow.retry_count || 0) + 1;
        const backoffMs = Math.pow(2, retryCount) * 30 * 1000; // 60s, 120s, 240s...
        const nextRetry = new Date(Date.now() + backoffMs);

        await client
          .from('provider_agents')
          .update({
            sync_status: 'error',
            last_sync_error: err.message,
            retry_count: retryCount,
            next_retry_at: nextRetry.toISOString(),
          })
          .eq('id', agentRow.id);

        await this.logSync(
          agentRow.id,
          accountId,
          'update',
          'failed',
          null,
          err.message,
          Date.now() - startTime,
        );
      }

      return {
        categoryId,
        categoryName: '',
        action: 'error',
        error: err.message,
      };
    } finally {
      this.syncLocks.delete(lockKey);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BATCH: Sync all categories for an account
  // ═══════════════════════════════════════════════════════════

  async syncAllForAccount(accountId: string): Promise<SyncResult[]> {
    const client = this.supabaseAdmin.getClient();

    // Find all categories with linked skills or master knowledge docs
    const { data: categories, error } = await client
      .from('categories')
      .select('id')
      .eq('account_id', accountId);

    if (error || !categories) {
      this.logger.error(
        `Failed to fetch categories for account ${accountId}: ${error?.message}`,
      );
      return [];
    }

    const results: SyncResult[] = [];
    for (const cat of categories) {
      const result = await this.syncCategory(accountId, cat.id);
      results.push(result);
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════
  // MARK STALE: Called by skills/knowledge services on edit
  // ═══════════════════════════════════════════════════════════

  async markStale(accountId: string, categoryId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    const { data: existing } = await client
      .from('provider_agents')
      .select('id, sync_status')
      .eq('account_id', accountId)
      .eq('category_id', categoryId)
      .single();

    if (existing && existing.sync_status === 'synced') {
      await client
        .from('provider_agents')
        .update({ sync_status: 'stale' })
        .eq('id', existing.id);

      this.logger.debug(
        `Marked provider agent as stale for category ${categoryId}`,
      );
    }

    // Trigger immediate sync (fire-and-forget, cron is fallback)
    this.syncCategory(accountId, categoryId).catch((err) => {
      this.logger.warn(
        `Immediate sync failed (cron will retry): ${err.message}`,
      );
    });
  }

  // ═══════════════════════════════════════════════════════════
  // LOOKUP: Get agent sync status for conversation optimization
  // ═══════════════════════════════════════════════════════════

  async isSynced(accountId: string, categoryId: string): Promise<boolean> {
    const client = this.supabaseAdmin.getClient();

    const { data } = await client
      .from('provider_agents')
      .select('sync_status')
      .eq('account_id', accountId)
      .eq('category_id', categoryId)
      .single();

    return data?.sync_status === 'synced';
  }

  // ═══════════════════════════════════════════════════════════
  // STATUS: Get sync dashboard data
  // ═══════════════════════════════════════════════════════════

  async getStatus(accountId: string) {
    const client = this.supabaseAdmin.getClient();

    // Get all categories with their provider_agents status
    const { data: categories } = await client
      .from('categories')
      .select('id, name, color, icon')
      .eq('account_id', accountId)
      .order('name');

    const { data: agents } = await client
      .from('provider_agents')
      .select('*')
      .eq('account_id', accountId);

    const agentMap = new Map(
      (agents || []).map((a: any) => [a.category_id, a]),
    );

    const details = (categories || []).map((cat: any) => {
      const agent = agentMap.get(cat.id);
      return {
        category_id: cat.id,
        category_name: cat.name,
        category_color: cat.color,
        category_icon: cat.icon,
        sync_status: agent?.sync_status || 'none',
        last_synced_at: agent?.last_synced_at || null,
        last_sync_error: agent?.last_sync_error || null,
        instructions_hash: agent?.instructions_hash || null,
        skill_count: agent?.skill_ids_snapshot?.length || 0,
        has_knowledge: !!agent?.knowledge_doc_id,
        retry_count: agent?.retry_count || 0,
      };
    });

    const counts = {
      total_categories: details.length,
      agents_synced: details.filter((d: any) => d.sync_status === 'synced')
        .length,
      agents_pending: details.filter((d: any) => d.sync_status === 'pending')
        .length,
      agents_stale: details.filter((d: any) => d.sync_status === 'stale')
        .length,
      agents_error: details.filter((d: any) => d.sync_status === 'error')
        .length,
      agents_none: details.filter((d: any) => d.sync_status === 'none').length,
    };

    return { ...counts, details };
  }

  // ═══════════════════════════════════════════════════════════
  // HEALTH: Check plugin connectivity + verify remote files
  // ═══════════════════════════════════════════════════════════

  async checkHealth(accountId: string) {
    const aiConfig = await this.getAiConfig(accountId);
    if (!aiConfig) {
      return { plugin_connected: false, error: 'No AI provider configured' };
    }

    const healthResult = await this.rpc.health(aiConfig);

    return {
      plugin_connected: healthResult.ok,
      plugin_data: healthResult.data || null,
      error: healthResult.error || null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PREVIEW: Show what SKILL.md would look like
  // ═══════════════════════════════════════════════════════════

  async previewInstructions(accountId: string, categoryId: string) {
    const compiled = await this.compiler.compileForCategory(
      accountId,
      categoryId,
    );
    if (!compiled) {
      return {
        content: null,
        message: 'No skills or knowledge linked to this agent',
      };
    }
    return {
      content: compiled.content,
      hash: compiled.hash,
      skillIds: compiled.skillIds,
      knowledgeDocId: compiled.knowledgeDocId,
      categorySlug: compiled.categorySlug,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE: Remove provider agent for a category
  // ═══════════════════════════════════════════════════════════

  async deleteAgent(accountId: string, categoryId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    const { data: agentRow } = await client
      .from('provider_agents')
      .select('*')
      .eq('account_id', accountId)
      .eq('category_id', categoryId)
      .single();

    if (!agentRow) return;

    // Delete from provider
    const aiConfig = await this.getAiConfig(accountId);
    if (aiConfig && agentRow.remote_skill_path) {
      await this.rpc.deleteSkill(aiConfig, agentRow.remote_skill_path);
    }

    // Delete from DB
    await client.from('provider_agents').delete().eq('id', agentRow.id);

    this.logger.log(`Deleted provider agent for category ${categoryId}`);
  }

  // ═══════════════════════════════════════════════════════════
  // CRON: Periodic sync check (every 5 minutes)
  // ═══════════════════════════════════════════════════════════

  async handleScheduledSync(): Promise<void> {
    this.logger.debug('Running scheduled agent sync check...');
    const client = this.supabaseAdmin.getClient();

    // 1. Find provider_agents needing sync
    const { data: pendingAgents } = await client
      .from('provider_agents')
      .select(
        'account_id, category_id, sync_status, retry_count, next_retry_at',
      )
      .or(
        `sync_status.in.(pending,stale),and(sync_status.eq.error,retry_count.lt.5,next_retry_at.lte.${new Date().toISOString()})`,
      )
      .limit(20);

    if (pendingAgents && pendingAgents.length > 0) {
      this.logger.log(`Found ${pendingAgents.length} agents needing sync`);

      for (const agent of pendingAgents) {
        await this.syncCategory(agent.account_id, agent.category_id);
      }
    }

    // 2. Health verification for synced agents (older than 30 minutes)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: staleVerify } = await client
      .from('provider_agents')
      .select(
        'id, account_id, category_id, remote_skill_path, instructions_hash',
      )
      .eq('sync_status', 'synced')
      .lt('last_synced_at', thirtyMinAgo)
      .limit(5);

    if (staleVerify && staleVerify.length > 0) {
      for (const agent of staleVerify) {
        await this.verifyAgent(agent);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  private async getAiConfig(accountId: string): Promise<any | null> {
    try {
      return await this.aiProviderService.getDecryptedConfig(
        accountId,
        'admin-bypass',
      );
    } catch {
      return null;
    }
  }

  private async verifyAgent(agent: any): Promise<void> {
    const aiConfig = await this.getAiConfig(agent.account_id);
    if (!aiConfig || !agent.remote_skill_path) return;

    const result = await this.rpc.verifySkill(
      aiConfig,
      agent.remote_skill_path,
    );
    const client = this.supabaseAdmin.getClient();

    if (!result.ok) {
      this.logger.warn(`Verify failed for agent ${agent.id}: ${result.error}`);
      return;
    }

    if (!result.data?.exists || result.data.hash !== agent.instructions_hash) {
      this.logger.warn(`Agent ${agent.id} file mismatch — marking as stale`);
      await client
        .from('provider_agents')
        .update({ sync_status: 'stale' })
        .eq('id', agent.id);
    } else {
      // Touch last_synced_at to indicate successful verification
      await client
        .from('provider_agents')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', agent.id);
    }

    await this.logSync(
      agent.id,
      agent.account_id,
      'verify',
      'completed',
      agent.instructions_hash,
      null,
      0,
    );
  }

  private async logSync(
    providerAgentId: string,
    accountId: string,
    action: string,
    status: string,
    hash: string | null,
    errorMessage: string | null,
    durationMs: number,
  ): Promise<void> {
    try {
      const client = this.supabaseAdmin.getClient();
      await client.from('agent_sync_logs').insert({
        provider_agent_id: providerAgentId,
        account_id: accountId,
        action,
        status,
        instructions_hash: hash,
        error_message: errorMessage,
        duration_ms: durationMs,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write sync log: ${err.message}`);
    }
  }
}
