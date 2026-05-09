import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

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

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  /**
   * List all memory connections for an account
   */
  async findAll(accountId: string): Promise<MemoryConnectionRow[]> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('memory_connections')
      .select('*')
      .eq('account_id', accountId)
      .order('is_account_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`findAll() failed: ${error.message}`);
      throw new Error(error.message);
    }
    return data || [];
  }

  /**
   * Get the active default connection for an account (if any)
   */
  async findActive(accountId: string): Promise<MemoryConnectionRow | null> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('memory_connections')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .eq('is_account_default', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      this.logger.warn(`findActive() error: ${error.message}`);
    }
    return data || null;
  }

  /**
   * Find connection by ID
   */
  async findOne(id: string, accountId: string): Promise<MemoryConnectionRow> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('memory_connections')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Memory connection ${id} not found`);
    }
    return data;
  }

  /**
   * Create a new memory connection
   */
  async create(
    accountId: string,
    dto: CreateMemoryConnectionDto,
  ): Promise<MemoryConnectionRow> {
    const client = this.supabaseAdmin.getClient();
    const { data, error } = await client
      .from('memory_connections')
      .insert({
        account_id: accountId,
        adapter_slug: dto.adapter_slug,
        name: dto.name,
        config: dto.config || {},
        is_active: dto.is_active ?? true,
        is_account_default: dto.is_account_default ?? false,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`create() failed: ${error.message}`);
      throw new Error(error.message);
    }
    return data;
  }

  /**
   * Update a memory connection
   */
  async update(
    id: string,
    accountId: string,
    dto: UpdateMemoryConnectionDto,
  ): Promise<MemoryConnectionRow> {
    const client = this.supabaseAdmin.getClient();

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.config !== undefined) updates.config = dto.config;
    if (dto.is_active !== undefined) updates.is_active = dto.is_active;
    if (dto.is_account_default !== undefined) {
      updates.is_account_default = dto.is_account_default;
    }

    const { data, error } = await client
      .from('memory_connections')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      this.logger.error(`update() failed: ${error.message}`);
      throw new Error(error.message);
    }
    return data;
  }

  /**
   * Delete a memory connection
   */
  async remove(id: string, accountId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();
    const { error } = await client
      .from('memory_connections')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      this.logger.error(`remove() failed: ${error.message}`);
      throw new Error(error.message);
    }
  }
}
