import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { and, desc, eq, isNull, ilike, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { agentMemories } from '../../db/schema';
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
 * Persists memories to the agent_memories table (Drizzle).
 * - remember(): INSERT row + generate embedding non-blocking (errors caught silently)
 * - recall(): vector similarity via search_memories_vector() SQL fn with ILIKE fallback
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
    @Inject(DB) private readonly db: Db,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async remember(options: MemoryWriteOptions): Promise<MemoryEntry> {
    const { content, type, source = 'agent', metadata = {} as any } = options;
    const account_id = metadata?.account_id as string;

    if (!account_id) {
      throw new BadRequestException('remember() requires metadata.account_id');
    }

    let data: typeof agentMemories.$inferSelect;
    try {
      const rows = await this.db
        .insert(agentMemories)
        .values({
          accountId: account_id,
          content,
          type,
          source,
          salience: 1.0,
          metadata,
          taskId: metadata?.task_id || null,
          conversationId: metadata?.conversation_id || null,
          boardInstanceId: metadata?.board_instance_id || null,
          categoryId: metadata?.category_id || null,
        })
        .returning();
      data = rows[0];
    } catch (error: any) {
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

    // Try vector similarity first.
    // Vector search STAYS as a SQL function (per migration guide). The embedding
    // is cast to ::vector; args are parameterized. Param order matches
    // search_memories_vector(query_embedding, p_account_id, match_limit,
    // similarity_threshold, p_task_id, p_type).
    try {
      if (this.embeddingService.isConfigured()) {
        const embedding = await this.embeddingService.generateEmbedding(query);
        const embeddingJson = JSON.stringify(embedding);

        const res = await this.db.execute(
          sql`select * from search_memories_vector(${embeddingJson}::vector, ${account_id}, ${limit}, ${threshold}, ${task_id || null}, ${type || null})`,
        );
        const data = res.rows;

        if (data && data.length > 0) {
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
      const conditions = [
        eq(agentMemories.accountId, account_id),
        isNull(agentMemories.validTo),
        ilike(agentMemories.content, `%${query}%`),
      ];
      if (task_id) conditions.push(eq(agentMemories.taskId, task_id));
      if (type) conditions.push(eq(agentMemories.type, type));

      const data = await this.db
        .select()
        .from(agentMemories)
        .where(and(...conditions))
        .orderBy(desc(agentMemories.createdAt))
        .limit(limit);

      return data.map((r) => this.mapRow(r));
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
    try {
      const conditions = [
        eq(agentMemories.accountId, accountId),
        isNull(agentMemories.validTo),
      ];
      if (type) conditions.push(eq(agentMemories.type, type));

      const data = await this.db
        .select()
        .from(agentMemories)
        .where(and(...conditions))
        .orderBy(desc(agentMemories.createdAt))
        .limit(limit);

      return data.map((r) => this.mapRow(r));
    } catch (err: any) {
      this.logger.error(`recent() failed: ${err.message}`);
      return [];
    }
  }

  async forget(id: string, accountId: string): Promise<void> {
    try {
      await this.db
        .delete(agentMemories)
        .where(
          and(
            eq(agentMemories.id, id),
            eq(agentMemories.accountId, accountId),
          ),
        );
    } catch (error: any) {
      this.logger.error(`forget() failed: ${error.message}`);
      throw new Error(`Memory delete failed: ${error.message}`);
    }
  }

  async healthCheck(
    _config?: Record<string, any>,
  ): Promise<MemoryHealthResult> {
    const start = Date.now();
    try {
      await this.db
        .select({ id: agentMemories.id })
        .from(agentMemories)
        .limit(1);

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
    try {
      await this.db
        .update(agentMemories)
        .set({ contentEmbedding: embedding })
        .where(eq(agentMemories.id, memoryId));
    } catch (error: any) {
      throw new Error(`Failed to store embedding: ${error.message}`);
    }
    this.logger.debug(`Embedding stored for memory ${memoryId}`);
  }

  private mapRow(row: any): MemoryEntry {
    return {
      id: row.id,
      account_id: row.account_id ?? row.accountId,
      content: row.content,
      type: row.type,
      source: row.source,
      salience: row.salience ?? 1.0,
      task_id: row.task_id ?? row.taskId ?? null,
      conversation_id: row.conversation_id ?? row.conversationId ?? null,
      board_instance_id: row.board_instance_id ?? row.boardInstanceId ?? null,
      category_id: row.category_id ?? row.categoryId ?? null,
      metadata: row.metadata || {},
      created_at: row.created_at ?? row.createdAt,
      valid_from: row.valid_from ?? row.validFrom,
      valid_to: row.valid_to ?? row.validTo ?? null,
    };
  }
}
