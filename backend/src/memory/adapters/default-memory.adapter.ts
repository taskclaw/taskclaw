import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import { EmbeddingService } from '../../ai-assistant/services/embedding.service';
import {
  MemoryAdapter,
  MemoryEntry,
  MemoryHealthResult,
  MemorySearchOptions,
  MemoryWriteOptions,
} from './memory-adapter.interface';

/**
 * DefaultMemoryAdapter (BE02)
 *
 * Persists memories to the agent_memories Supabase table.
 * - remember(): INSERT row + generate embedding non-blocking (errors caught silently)
 * - recall(): vector similarity via search_memories_vector() RPC with ILIKE fallback
 * - recent(): SELECT ORDER BY created_at DESC LIMIT N
 * - forget(): DELETE by id + account_id
 * - buildContextBlock(): '\n=== AGENT MEMORY ===\n' + bullet list
 */
@Injectable()
export class DefaultMemoryAdapter implements MemoryAdapter {
  readonly slug = 'default';
  readonly name = 'Default (Built-in)';

  private readonly logger = new Logger(DefaultMemoryAdapter.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async remember(options: MemoryWriteOptions): Promise<MemoryEntry> {
    const client = this.supabaseAdmin.getClient();
    const { content, type, source = 'agent', metadata = {} as any } = options;
    const account_id = metadata?.account_id as string;

    if (!account_id) {
      throw new BadRequestException('remember() requires metadata.account_id');
    }

    const row: Record<string, any> = {
      account_id,
      content,
      type,
      source,
      salience: 1.0,
      metadata,
      task_id: metadata?.task_id || null,
      conversation_id: metadata?.conversation_id || null,
      board_instance_id: metadata?.board_instance_id || null,
      category_id: metadata?.category_id || null,
    };

    const { data, error } = await client
      .from('agent_memories')
      .insert(row)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to insert memory: ${error.message}`);
      throw new Error(`Memory insert failed: ${error.message}`);
    }

    // Non-blocking embedding generation — errors caught silently
    this.generateAndStoreEmbedding(data.id, content).catch((err) => {
      this.logger.warn(
        `Embedding generation for memory ${data.id} failed silently: ${err.message}`,
      );
    });

    return this.mapRow(data);
  }

  async recall(options: MemorySearchOptions): Promise<MemoryEntry[]> {
    const {
      query,
      account_id,
      limit = 10,
      threshold = 0.3,
      task_id,
      type,
    } = options;

    const client = this.supabaseAdmin.getClient();

    // Try vector similarity first
    try {
      if (this.embeddingService.isConfigured()) {
        const embedding = await this.embeddingService.generateEmbedding(query);

        const { data, error } = await client.rpc('search_memories_vector', {
          query_embedding: embedding,
          p_account_id: account_id,
          match_limit: limit,
          similarity_threshold: threshold,
          p_task_id: task_id || null,
          p_type: type || null,
        });

        if (!error && data && data.length > 0) {
          return (data as any[]).map((r) => this.mapRow(r));
        }
      }
    } catch (err) {
      this.logger.warn(
        `Vector recall failed, falling back to ILIKE: ${err.message}`,
      );
    }

    // ILIKE fallback
    try {
      let q = client
        .from('agent_memories')
        .select('*')
        .eq('account_id', account_id)
        .is('valid_to', null)
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (task_id) q = q.eq('task_id', task_id);
      if (type) q = q.eq('type', type);

      const { data, error } = await q;
      if (error) {
        this.logger.warn(`ILIKE fallback failed: ${error.message}`);
        return [];
      }
      return (data || []).map((r) => this.mapRow(r));
    } catch (err) {
      this.logger.warn(`recall() completely failed: ${err.message}`);
      return [];
    }
  }

  async recent(
    accountId: string,
    limit = 20,
    type?: string,
  ): Promise<MemoryEntry[]> {
    const client = this.supabaseAdmin.getClient();

    let q = client
      .from('agent_memories')
      .select('*')
      .eq('account_id', accountId)
      .is('valid_to', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) q = q.eq('type', type);

    const { data, error } = await q;
    if (error) {
      this.logger.error(`recent() failed: ${error.message}`);
      return [];
    }
    return (data || []).map((r) => this.mapRow(r));
  }

  async forget(id: string, accountId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();
    const { error } = await client
      .from('agent_memories')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      this.logger.error(`forget() failed: ${error.message}`);
      throw new Error(`Memory delete failed: ${error.message}`);
    }
  }

  async healthCheck(
    _config?: Record<string, any>,
  ): Promise<MemoryHealthResult> {
    const start = Date.now();
    try {
      const client = this.supabaseAdmin.getClient();
      const { error } = await client
        .from('agent_memories')
        .select('id')
        .limit(1);

      if (error) {
        return { healthy: false, error: error.message };
      }
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, error: err.message };
    }
  }

  validateConfig(_config: Record<string, any>): void {
    // Default adapter has no required config fields
  }

  buildContextBlock(entries: MemoryEntry[]): string {
    if (!entries || entries.length === 0) return '';

    let block = `\n=== AGENT MEMORY ===\n`;
    block += `Relevant memories from previous interactions:\n`;
    entries.forEach((entry, i) => {
      const typeLabel =
        entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
      block += `${i + 1}. [${typeLabel}] ${entry.content}\n`;
    });
    block += `\n`;
    return block;
  }

  // ── Private helpers ──────────────────────────────────────────

  private async generateAndStoreEmbedding(
    memoryId: string,
    content: string,
  ): Promise<void> {
    const embedding = await this.embeddingService.generateEmbedding(content);
    const client = this.supabaseAdmin.getClient();
    const { error } = await client
      .from('agent_memories')
      .update({ content_embedding: embedding })
      .eq('id', memoryId);

    if (error) {
      throw new Error(`Failed to store embedding: ${error.message}`);
    }
    this.logger.debug(`Embedding stored for memory ${memoryId}`);
  }

  private mapRow(row: any): MemoryEntry {
    return {
      id: row.id,
      account_id: row.account_id,
      content: row.content,
      type: row.type,
      source: row.source,
      salience: row.salience ?? 1.0,
      task_id: row.task_id || null,
      conversation_id: row.conversation_id || null,
      board_instance_id: row.board_instance_id || null,
      category_id: row.category_id || null,
      metadata: row.metadata || {},
      created_at: row.created_at,
      valid_from: row.valid_from,
      valid_to: row.valid_to || null,
    };
  }
}
