import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { memoryConnections } from '../db/schema';

export interface MemoryConnectionRow {
  id: string;
  account_id: string;
  adapter_slug: string;
  name: string;
  config: Record<string, any>;
  is_active: boolean;
  is_account_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMemoryConnectionDto {
  adapter_slug: string;
  name: string;
  config?: Record<string, any>;
  is_active?: boolean;
  is_account_default?: boolean;
}

export interface UpdateMemoryConnectionDto {
  name?: string;
  config?: Record<string, any>;
  is_active?: boolean;
  is_account_default?: boolean;
}

/**
 * MemoryConnectionsService (BE04)
 *
 * CRUD for the memory_connections table.
 * Handles the per-account mapping of adapter slug → connection config.
 */
@Injectable()
export class MemoryConnectionsService {
  private readonly logger = new Logger(MemoryConnectionsService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * List all memory connections for an account
   */
  async findAll(accountId: string): Promise<MemoryConnectionRow[]> {
    const rows = await this.db
      .select()
      .from(memoryConnections)
      .where(eq(memoryConnections.accountId, accountId))
      .orderBy(
        desc(memoryConnections.isAccountDefault),
        desc(memoryConnections.createdAt),
      );

    return rows as unknown as MemoryConnectionRow[];
  }

  /**
   * Get the active default connection for an account (if any)
   */
  async findActive(accountId: string): Promise<MemoryConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(memoryConnections)
      .where(
        and(
          eq(memoryConnections.accountId, accountId),
          eq(memoryConnections.isActive, true),
          eq(memoryConnections.isAccountDefault, true),
        ),
      )
      .limit(1);

    return (row as unknown as MemoryConnectionRow) || null;
  }

  /**
   * Find connection by ID
   */
  async findOne(id: string, accountId: string): Promise<MemoryConnectionRow> {
    const [row] = await this.db
      .select()
      .from(memoryConnections)
      .where(
        and(
          eq(memoryConnections.id, id),
          eq(memoryConnections.accountId, accountId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Memory connection ${id} not found`);
    }
    return row as unknown as MemoryConnectionRow;
  }

  /**
   * Create a new memory connection
   */
  async create(
    accountId: string,
    dto: CreateMemoryConnectionDto,
  ): Promise<MemoryConnectionRow> {
    const [row] = await this.db
      .insert(memoryConnections)
      .values({
        accountId,
        adapterSlug: dto.adapter_slug,
        name: dto.name,
        config: dto.config || {},
        isActive: dto.is_active ?? true,
        isAccountDefault: dto.is_account_default ?? false,
      })
      .returning();

    return row as unknown as MemoryConnectionRow;
  }

  /**
   * Update a memory connection
   */
  async update(
    id: string,
    accountId: string,
    dto: UpdateMemoryConnectionDto,
  ): Promise<MemoryConnectionRow> {
    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.config !== undefined) updates.config = dto.config;
    if (dto.is_active !== undefined) updates.isActive = dto.is_active;
    if (dto.is_account_default !== undefined) {
      updates.isAccountDefault = dto.is_account_default;
    }

    const [row] = await this.db
      .update(memoryConnections)
      .set(updates)
      .where(
        and(
          eq(memoryConnections.id, id),
          eq(memoryConnections.accountId, accountId),
        ),
      )
      .returning();

    return row as unknown as MemoryConnectionRow;
  }

  /**
   * Delete a memory connection
   */
  async remove(id: string, accountId: string): Promise<void> {
    await this.db
      .delete(memoryConnections)
      .where(
        and(
          eq(memoryConnections.id, id),
          eq(memoryConnections.accountId, accountId),
        ),
      );
  }
}
