import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  providerAgents,
  agentSyncLogs,
  categories,
  agents,
} from '../db/schema';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { AgentCompilerService } from './agent-compiler.service';
import { OpenClawRpcClient } from './openclaw-rpc.client';

export interface SyncResult {
  categoryId: string;
  categoryName: string;
  action: 'created' | 'updated' | 'skipped' | 'deleted' | 'error';
  error?: string;
}

export interface AgentSyncResult {
  agentId: string;
  agentName: string;
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
    @Inject(DB) private readonly db: Db,
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
      let agentRow = (
        await this.db
          .select()
          .from(providerAgents)
          .where(
            and(
              eq(providerAgents.accountId, accountId),
              eq(providerAgents.categoryId, categoryId),
            ),
          )
          .limit(1)
      )[0];

      // If no content to compile, clean up if needed
      if (!compiled) {
        if (agentRow) {
          // Delete the remote skill file
          if (agentRow.remoteSkillPath) {
            await this.rpc.deleteSkill(aiConfig, agentRow.remoteSkillPath);
          }
          await this.db
            .delete(providerAgents)
            .where(eq(providerAgents.id, agentRow.id));
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
        agentRow.instructionsHash === compiled.hash &&
        agentRow.syncStatus === 'synced'
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
        const inserted = await this.db
          .insert(providerAgents)
          .values({
            accountId,
            categoryId,
            providerType: 'openclaw',
            remoteSkillPath: compiled.categorySlug,
            syncStatus: 'syncing',
          })
          .returning();
        agentRow = inserted[0];
      } else {
        // Mark as syncing
        await this.db
          .update(providerAgents)
          .set({ syncStatus: 'syncing' })
          .where(eq(providerAgents.id, agentRow.id));
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
      await this.db
        .update(providerAgents)
        .set({
          instructionsHash: compiled.hash,
          compiledInstructions: compiled.content,
          skillIdsSnapshot: compiled.skillIds,
          knowledgeDocId: compiled.knowledgeDocId,
          remoteSkillPath: compiled.categorySlug,
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          lastSyncError: null,
          retryCount: 0,
          nextRetryAt: null,
        })
        .where(eq(providerAgents.id, agentRow.id));

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
      const agentRow = (
        await this.db
          .select({
            id: providerAgents.id,
            retryCount: providerAgents.retryCount,
          })
          .from(providerAgents)
          .where(
            and(
              eq(providerAgents.accountId, accountId),
              eq(providerAgents.categoryId, categoryId),
            ),
          )
          .limit(1)
      )[0];

      if (agentRow) {
        const retryCount = (agentRow.retryCount || 0) + 1;
        const backoffMs = Math.pow(2, retryCount) * 30 * 1000; // 60s, 120s, 240s...
        const nextRetry = new Date(Date.now() + backoffMs);

        await this.db
          .update(providerAgents)
          .set({
            syncStatus: 'error',
            lastSyncError: err.message,
            retryCount: retryCount,
            nextRetryAt: nextRetry.toISOString(),
          })
          .where(eq(providerAgents.id, agentRow.id));

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
  // F07: Sync a single agent to the provider (via agent_skills + knowledge)
  // ═══════════════════════════════════════════════════════════

  async syncAgent(
    accountId: string,
    agentId: string,
  ): Promise<AgentSyncResult> {
    const lockKey = `agent:${accountId}:${agentId}`;
    if (this.syncLocks.get(lockKey)) {
      return { agentId, agentName: '', action: 'skipped' };
    }

    this.syncLocks.set(lockKey, true);
    const startTime = Date.now();

    try {
      const aiConfig = await this.getAiConfig(accountId);
      if (!aiConfig) {
        return { agentId, agentName: '', action: 'skipped', error: 'No AI provider configured' };
      }

      const compiled = await this.compiler.compileForAgent(accountId, agentId);

      // Get or create provider_agents row keyed by agent_id
      let agentRow = (
        await this.db
          .select()
          .from(providerAgents)
          .where(
            and(
              eq(providerAgents.accountId, accountId),
              eq(providerAgents.agentId, agentId),
            ),
          )
          .limit(1)
      )[0];

      if (!compiled) {
        if (agentRow?.remoteSkillPath) {
          await this.rpc.deleteSkill(aiConfig, agentRow.remoteSkillPath);
          await this.db
            .delete(providerAgents)
            .where(eq(providerAgents.id, agentRow.id));
        }
        return { agentId, agentName: '', action: 'deleted' };
      }

      // Skip if hash unchanged
      if (agentRow?.instructionsHash === compiled.hash && agentRow?.syncStatus === 'synced') {
        return { agentId, agentName: compiled.categoryName, action: 'skipped' };
      }

      const isNew = !agentRow;
      if (isNew) {
        // Agent-keyed rows carry no category_id (the original PostgREST insert
        // omitted it too); cast to the insert type since the schema marks the
        // column notNull but this sync path legitimately leaves it absent.
        const inserted = await this.db
          .insert(providerAgents)
          .values({
            accountId,
            agentId,
            providerType: 'openclaw',
            remoteSkillPath: compiled.categorySlug,
            syncStatus: 'syncing',
          } as typeof providerAgents.$inferInsert)
          .returning();
        agentRow = inserted[0];
      } else {
        await this.db
          .update(providerAgents)
          .set({ syncStatus: 'syncing' })
          .where(eq(providerAgents.id, agentRow.id));
      }

      const result = await this.rpc.syncSkill(aiConfig, compiled.categorySlug, compiled.content, compiled.hash);
      if (!result.ok) throw new Error(`RPC syncSkill failed: ${result.error}`);

      await this.db
        .update(providerAgents)
        .set({
          instructionsHash: compiled.hash,
          compiledInstructions: compiled.content,
          skillIdsSnapshot: compiled.skillIds,
          knowledgeDocId: compiled.knowledgeDocId,
          remoteSkillPath: compiled.categorySlug,
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          lastSyncError: null,
          retryCount: 0,
          nextRetryAt: null,
        })
        .where(eq(providerAgents.id, agentRow.id));

      this.logger.log(`Synced agent "${compiled.categoryName}" (${isNew ? 'created' : 'updated'}, ${Date.now() - startTime}ms)`);
      return { agentId, agentName: compiled.categoryName, action: isNew ? 'created' : 'updated' };

    } catch (err: any) {
      this.logger.error(`Sync failed for agent ${agentId}: ${err.message}`);
      return { agentId, agentName: '', action: 'error', error: err.message };
    } finally {
      this.syncLocks.delete(lockKey);
    }
  }

  /**
   * Mark an agent as stale and trigger immediate sync.
   */
  async markAgentStale(accountId: string, agentId: string): Promise<void> {
    const existing = (
      await this.db
        .select({
          id: providerAgents.id,
          syncStatus: providerAgents.syncStatus,
        })
        .from(providerAgents)
        .where(
          and(
            eq(providerAgents.accountId, accountId),
            eq(providerAgents.agentId, agentId),
          ),
        )
        .limit(1)
    )[0];

    if (existing?.syncStatus === 'synced') {
      await this.db
        .update(providerAgents)
        .set({ syncStatus: 'stale' })
        .where(eq(providerAgents.id, existing.id));
    }

    this.syncAgent(accountId, agentId).catch((err) => {
      this.logger.warn(`Immediate agent sync failed (cron will retry): ${err.message}`);
    });
  }

  /**
   * Check if an agent is synced to the provider.
   */
  async isAgentSynced(accountId: string, agentId: string): Promise<boolean> {
    const data = (
      await this.db
        .select({ syncStatus: providerAgents.syncStatus })
        .from(providerAgents)
        .where(
          and(
            eq(providerAgents.accountId, accountId),
            eq(providerAgents.agentId, agentId),
          ),
        )
        .limit(1)
    )[0];
    return data?.syncStatus === 'synced';
  }

  // ═══════════════════════════════════════════════════════════
  // BATCH: Sync all categories for an account
  // ═══════════════════════════════════════════════════════════

  async syncAllForAccount(accountId: string): Promise<SyncResult[]> {
    // Find all categories with linked skills or master knowledge docs
    let categoryRows: { id: string }[];
    try {
      categoryRows = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.accountId, accountId));
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch categories for account ${accountId}: ${error?.message}`,
      );
      return [];
    }

    const results: SyncResult[] = [];
    for (const cat of categoryRows) {
      const result = await this.syncCategory(accountId, cat.id);
      results.push(result);
    }

    // Also sync all agents (F07 — dual sync during migration period)
    const agentRows = await this.db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(eq(agents.accountId, accountId), eq(agents.isActive, true)),
      );

    if (agentRows) {
      for (const agent of agentRows) {
        await this.syncAgent(accountId, agent.id);
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════
  // MARK STALE: Called by skills/knowledge services on edit
  // ═══════════════════════════════════════════════════════════

  async markStale(accountId: string, categoryId: string): Promise<void> {
    const existing = (
      await this.db
        .select({
          id: providerAgents.id,
          syncStatus: providerAgents.syncStatus,
        })
        .from(providerAgents)
        .where(
          and(
            eq(providerAgents.accountId, accountId),
            eq(providerAgents.categoryId, categoryId),
          ),
        )
        .limit(1)
    )[0];

    if (existing && existing.syncStatus === 'synced') {
      await this.db
        .update(providerAgents)
        .set({ syncStatus: 'stale' })
        .where(eq(providerAgents.id, existing.id));

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
    const data = (
      await this.db
        .select({ syncStatus: providerAgents.syncStatus })
        .from(providerAgents)
        .where(
          and(
            eq(providerAgents.accountId, accountId),
            eq(providerAgents.categoryId, categoryId),
          ),
        )
        .limit(1)
    )[0];

    return data?.syncStatus === 'synced';
  }

  // ═══════════════════════════════════════════════════════════
  // STATUS: Get sync dashboard data
  // ═══════════════════════════════════════════════════════════

  async getStatus(accountId: string) {
    // Get all categories with their provider_agents status
    const categoryRows = await this.db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        icon: categories.icon,
      })
      .from(categories)
      .where(eq(categories.accountId, accountId))
      .orderBy(categories.name);

    const agentRows = await this.db
      .select()
      .from(providerAgents)
      .where(eq(providerAgents.accountId, accountId));

    const agentMap = new Map(
      (agentRows || []).map((a: any) => [a.categoryId, a]),
    );

    const details = (categoryRows || []).map((cat: any) => {
      const agent = agentMap.get(cat.id);
      return {
        category_id: cat.id,
        category_name: cat.name,
        category_color: cat.color,
        category_icon: cat.icon,
        sync_status: agent?.syncStatus || 'none',
        last_synced_at: agent?.lastSyncedAt || null,
        last_sync_error: agent?.lastSyncError || null,
        instructions_hash: agent?.instructionsHash || null,
        skill_count: agent?.skillIdsSnapshot?.length || 0,
        has_knowledge: !!agent?.knowledgeDocId,
        retry_count: agent?.retryCount || 0,
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
    const agentRow = (
      await this.db
        .select()
        .from(providerAgents)
        .where(
          and(
            eq(providerAgents.accountId, accountId),
            eq(providerAgents.categoryId, categoryId),
          ),
        )
        .limit(1)
    )[0];

    if (!agentRow) return;

    // Delete from provider
    const aiConfig = await this.getAiConfig(accountId);
    if (aiConfig && agentRow.remoteSkillPath) {
      await this.rpc.deleteSkill(aiConfig, agentRow.remoteSkillPath);
    }

    // Delete from DB
    await this.db
      .delete(providerAgents)
      .where(eq(providerAgents.id, agentRow.id));

    this.logger.log(`Deleted provider agent for category ${categoryId}`);
  }

  // ═══════════════════════════════════════════════════════════
  // CRON: Periodic sync check (every 5 minutes)
  // ═══════════════════════════════════════════════════════════

  async handleScheduledSync(): Promise<void> {
    this.logger.debug('Running scheduled agent sync check...');

    // 1. Find provider_agents needing sync
    const pendingAgents = await this.db
      .select({
        accountId: providerAgents.accountId,
        categoryId: providerAgents.categoryId,
        syncStatus: providerAgents.syncStatus,
        retryCount: providerAgents.retryCount,
        nextRetryAt: providerAgents.nextRetryAt,
      })
      .from(providerAgents)
      .where(
        or(
          sql`${providerAgents.syncStatus} in ('pending','stale')`,
          and(
            eq(providerAgents.syncStatus, 'error'),
            lt(providerAgents.retryCount, 5),
            lt(providerAgents.nextRetryAt, new Date().toISOString()),
          ),
        ),
      )
      .limit(20);

    if (pendingAgents && pendingAgents.length > 0) {
      this.logger.log(`Found ${pendingAgents.length} agents needing sync`);

      for (const agent of pendingAgents) {
        await this.syncCategory(agent.accountId, agent.categoryId);
      }
    }

    // 2. Health verification for synced agents (older than 30 minutes)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const staleVerify = await this.db
      .select({
        id: providerAgents.id,
        accountId: providerAgents.accountId,
        categoryId: providerAgents.categoryId,
        remoteSkillPath: providerAgents.remoteSkillPath,
        instructionsHash: providerAgents.instructionsHash,
      })
      .from(providerAgents)
      .where(
        and(
          eq(providerAgents.syncStatus, 'synced'),
          lt(providerAgents.lastSyncedAt, thirtyMinAgo),
        ),
      )
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
    const aiConfig = await this.getAiConfig(agent.accountId);
    if (!aiConfig || !agent.remoteSkillPath) return;

    const result = await this.rpc.verifySkill(
      aiConfig,
      agent.remoteSkillPath,
    );

    if (!result.ok) {
      this.logger.warn(`Verify failed for agent ${agent.id}: ${result.error}`);
      return;
    }

    if (!result.data?.exists || result.data.hash !== agent.instructionsHash) {
      this.logger.warn(`Agent ${agent.id} file mismatch — marking as stale`);
      await this.db
        .update(providerAgents)
        .set({ syncStatus: 'stale' })
        .where(eq(providerAgents.id, agent.id));
    } else {
      // Touch last_synced_at to indicate successful verification
      await this.db
        .update(providerAgents)
        .set({ lastSyncedAt: new Date().toISOString() })
        .where(eq(providerAgents.id, agent.id));
    }

    await this.logSync(
      agent.id,
      agent.accountId,
      'verify',
      'completed',
      agent.instructionsHash,
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
      await this.db.insert(agentSyncLogs).values({
        providerAgentId,
        accountId,
        action,
        status,
        instructionsHash: hash,
        errorMessage,
        durationMs,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write sync log: ${err.message}`);
    }
  }
}
