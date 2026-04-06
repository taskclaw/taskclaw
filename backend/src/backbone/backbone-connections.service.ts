import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { BackboneAdapterRegistry } from './adapters/backbone-adapter.registry';
import { CreateBackboneConnectionDto } from './dto/create-backbone-connection.dto';
import { UpdateBackboneConnectionDto } from './dto/update-backbone-connection.dto';
import {
  encrypt,
  decrypt,
  maskSensitiveValue,
} from '../common/utils/encryption.util';

/** Keys inside the config object that are always treated as secrets */
const SECRET_CONFIG_KEYS = ['api_key', 'secret', 'token', 'password'];

function isSecretKey(key: string): boolean {
  return SECRET_CONFIG_KEYS.some(
    (s) => key === s || key.endsWith(`_${s}`) || key.endsWith(`_key`),
  );
}

/**
 * BackboneConnectionsService (F010)
 *
 * CRUD operations for backbone connections with encryption for sensitive
 * config fields.  Follows the same Supabase + AES-256-GCM pattern used
 * by AiProviderService.
 */
@Injectable()
export class BackboneConnectionsService {
  private readonly logger = new Logger(BackboneConnectionsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
    private readonly registry: BackboneAdapterRegistry,
  ) {}

  // ─── Queries ─────────────────────────────────────────────

  /**
   * List all connections for an account (masked config).
   */
  async findAll(userId: string, accountId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('backbone_connections')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch backbone connections: ${error.message}`);
    }

    return (data || []).map((row) => this.toMaskedResponse(row));
  }

  /**
   * Get a single connection by ID (masked config).
   */
  async findById(userId: string, accountId: string, connectionId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const row = await this.findRowOrFail(accountId, connectionId);
    return this.toMaskedResponse(row);
  }

  /**
   * Find all active connections for an account (internal use).
   */
  async findAllActive(accountId: string) {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('backbone_connections')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(
        `Failed to fetch active backbone connections: ${error.message}`,
      );
    }

    return data || [];
  }

  /**
   * Get the account-level default backbone connection (internal use).
   */
  async getAccountDefault(accountId: string) {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('backbone_connections')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to fetch default backbone connection: ${error.message}`,
      );
    }

    return data;
  }

  // ─── Mutations ───────────────────────────────────────────

  /**
   * Create a new backbone connection.
   */
  async create(
    userId: string,
    accountId: string,
    dto: CreateBackboneConnectionDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId, [
      'owner',
      'admin',
    ]);

    // Validate adapter exists
    const adapter = this.registry.get(dto.backbone_type);
    adapter.validateConfig(dto.config);

    // If this is set as default, clear existing defaults
    if (dto.is_default) {
      await this.clearAccountDefault(accountId);
    }

    const encryptedConfig = this.encryptConfig(dto.config);

    const { data, error } = await client
      .from('backbone_connections')
      .insert({
        account_id: accountId,
        backbone_type: dto.backbone_type,
        name: dto.name,
        description: dto.description || null,
        config: encryptedConfig,
        is_default: dto.is_default ?? false,
        is_active: dto.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to create backbone connection: ${error.message}`,
      );
    }

    this.logger.log(
      `Created backbone connection "${dto.name}" (${dto.backbone_type}) for account ${accountId}`,
    );

    return this.toMaskedResponse(data);
  }

  /**
   * Update an existing backbone connection.
   */
  async update(
    userId: string,
    accountId: string,
    connectionId: string,
    dto: UpdateBackboneConnectionDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId, [
      'owner',
      'admin',
    ]);

    const existing = await this.findRowOrFail(accountId, connectionId);

    // If backbone_type changes, validate with the new adapter
    const backboneType = dto.backbone_type || existing.backbone_type;
    if (dto.config) {
      const adapter = this.registry.get(backboneType);
      adapter.validateConfig(dto.config);
    }

    // If setting as default, clear existing defaults
    if (dto.is_default) {
      await this.clearAccountDefault(accountId);
    }

    const updateData: Record<string, any> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined)
      updateData.description = dto.description;
    if (dto.backbone_type !== undefined)
      updateData.backbone_type = dto.backbone_type;
    if (dto.is_default !== undefined) updateData.is_default = dto.is_default;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
    if (dto.config) {
      // Merge: keep existing encrypted values for keys not provided
      const existingDecrypted = this.decryptConfig(existing.config);
      const merged = { ...existingDecrypted, ...dto.config };
      updateData.config = this.encryptConfig(merged);
    }

    const { data, error } = await client
      .from('backbone_connections')
      .update(updateData)
      .eq('id', connectionId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to update backbone connection: ${error.message}`,
      );
    }

    this.logger.log(
      `Updated backbone connection ${connectionId} for account ${accountId}`,
    );

    return this.toMaskedResponse(data);
  }

  /**
   * Delete a backbone connection.
   */
  async remove(userId: string, accountId: string, connectionId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId, [
      'owner',
      'admin',
    ]);

    await this.findRowOrFail(accountId, connectionId);

    const { error } = await client
      .from('backbone_connections')
      .delete()
      .eq('id', connectionId)
      .eq('account_id', accountId);

    if (error) {
      throw new Error(
        `Failed to delete backbone connection: ${error.message}`,
      );
    }

    this.logger.log(
      `Deleted backbone connection ${connectionId} from account ${accountId}`,
    );

    return { message: 'Backbone connection deleted successfully' };
  }

  /**
   * Set a connection as the account default.
   */
  async setDefault(userId: string, accountId: string, connectionId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId, [
      'owner',
      'admin',
    ]);

    await this.findRowOrFail(accountId, connectionId);
    await this.clearAccountDefault(accountId);

    const { data, error } = await client
      .from('backbone_connections')
      .update({ is_default: true })
      .eq('id', connectionId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to set default backbone connection: ${error.message}`,
      );
    }

    this.logger.log(
      `Set backbone connection ${connectionId} as default for account ${accountId}`,
    );

    return this.toMaskedResponse(data);
  }

  // ─── Health / Usage (internal) ───────────────────────────

  /**
   * Update health status for a connection (called by BackboneHealthService).
   */
  async updateHealth(
    connectionId: string,
    status: 'healthy' | 'degraded' | 'down',
    error?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await client
      .from('backbone_connections')
      .update({
        health_status: status,
        health_checked_at: new Date().toISOString(),
        health_error: error || null,
      })
      .eq('id', connectionId);
  }

  /**
   * Increment usage counters after a successful request.
   */
  async trackUsage(
    connectionId: string,
    tokens: number,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Use raw SQL via rpc if available; otherwise read-modify-write
    const { data: row } = await client
      .from('backbone_connections')
      .select('total_requests, total_tokens')
      .eq('id', connectionId)
      .single();

    if (row) {
      await client
        .from('backbone_connections')
        .update({
          total_requests: (row.total_requests || 0) + 1,
          total_tokens: (row.total_tokens || 0) + tokens,
        })
        .eq('id', connectionId);
    }
  }

  /**
   * Decrypt the config for a raw DB row (internal use by router / health).
   */
  decryptConfig(encryptedConfig: Record<string, any>): Record<string, any> {
    const decrypted: Record<string, any> = {};
    for (const [key, value] of Object.entries(encryptedConfig)) {
      if (isSecretKey(key) && typeof value === 'string') {
        try {
          decrypted[key] = decrypt(value);
        } catch {
          decrypted[key] = value; // already plain or corrupt — pass through
        }
      } else {
        decrypted[key] = value;
      }
    }
    return decrypted;
  }

  // ─── Private helpers ─────────────────────────────────────

  private async findRowOrFail(accountId: string, connectionId: string) {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('backbone_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to fetch backbone connection: ${error.message}`,
      );
    }

    if (!data) {
      throw new NotFoundException(
        `Backbone connection ${connectionId} not found`,
      );
    }

    return data;
  }

  private async clearAccountDefault(accountId: string) {
    const client = this.supabaseAdmin.getClient();

    await client
      .from('backbone_connections')
      .update({ is_default: false })
      .eq('account_id', accountId)
      .eq('is_default', true);
  }

  private encryptConfig(config: Record<string, any>): Record<string, any> {
    const encrypted: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      if (isSecretKey(key) && typeof value === 'string' && value) {
        encrypted[key] = encrypt(value);
      } else {
        encrypted[key] = value;
      }
    }
    return encrypted;
  }

  private toMaskedResponse(row: any) {
    const maskedConfig: Record<string, any> = {};
    if (row.config && typeof row.config === 'object') {
      for (const [key, value] of Object.entries(row.config)) {
        if (isSecretKey(key) && typeof value === 'string') {
          try {
            maskedConfig[key] = maskSensitiveValue(decrypt(value));
          } catch {
            maskedConfig[key] = '****';
          }
        } else {
          maskedConfig[key] = value;
        }
      }
    }

    return {
      id: row.id,
      account_id: row.account_id,
      backbone_type: row.backbone_type,
      name: row.name,
      description: row.description,
      config: maskedConfig,
      is_default: row.is_default,
      is_active: row.is_active,
      health_status: row.health_status,
      health_checked_at: row.health_checked_at,
      verified_at: row.verified_at,
      total_requests: row.total_requests || 0,
      total_tokens: row.total_tokens || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
