import {
  Injectable,
  Inject,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { backboneConnections } from '../db/schema';
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
 * config fields.  Data access uses Drizzle; sensitive config fields are
 * encrypted with AES-256-GCM (same pattern used by AiProviderService).
 */
@Injectable()
export class BackboneConnectionsService {
  private readonly logger = new Logger(BackboneConnectionsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
    private readonly registry: BackboneAdapterRegistry,
  ) {}

  // ─── Queries ─────────────────────────────────────────────

  /**
   * List all connections for an account (masked config).
   */
  async findAll(userId: string, accountId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const data = await this.db
      .select()
      .from(backboneConnections)
      .where(eq(backboneConnections.accountId, accountId))
      .orderBy(desc(backboneConnections.createdAt));

    return data.map((row) => this.toMaskedResponse(row));
  }

  /**
   * Get a single connection by ID (masked config).
   */
  async findById(userId: string, accountId: string, connectionId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const row = await this.findRowOrFail(accountId, connectionId);
    return this.toMaskedResponse(row);
  }

  /**
   * Fetch a single connection as a raw snake_case row (config left encrypted),
   * matching the shape the health checker (`checkOne`) consumes. Throws
   * NotFoundException when the connection does not exist for the account.
   */
  async getRawConnection(accountId: string, connectionId: string) {
    const row = await this.findRowOrFail(accountId, connectionId);
    return this.toRawRow(row);
  }

  /**
   * Find all active connections for an account (internal use).
   *
   * Returns raw rows re-keyed to snake_case (config left encrypted) so callers
   * like BackboneRouterService — which read `conn.backbone_type` / `conn.config`
   * and then call `decryptConfig` — keep the exact shape PostgREST gave them.
   */
  async findAllActive(accountId: string) {
    const rows = await this.db
      .select()
      .from(backboneConnections)
      .where(
        and(
          eq(backboneConnections.accountId, accountId),
          eq(backboneConnections.isActive, true),
        ),
      )
      .orderBy(desc(backboneConnections.createdAt));

    return rows.map((row) => this.toRawRow(row));
  }

  /**
   * Get the account-level default backbone connection (internal use).
   *
   * Returns the raw row re-keyed to snake_case (config left encrypted) so
   * callers keep the exact shape PostgREST gave them; `null` when none.
   */
  async getAccountDefault(accountId: string) {
    const [row] = await this.db
      .select()
      .from(backboneConnections)
      .where(
        and(
          eq(backboneConnections.accountId, accountId),
          eq(backboneConnections.isDefault, true),
          eq(backboneConnections.isActive, true),
        ),
      )
      .limit(1);

    return row ? this.toRawRow(row) : null;
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId, [
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

    const [data] = await this.db
      .insert(backboneConnections)
      .values({
        accountId,
        backboneType: dto.backbone_type,
        name: dto.name,
        description: dto.description || null,
        config: encryptedConfig,
        isDefault: dto.is_default ?? false,
        isActive: dto.is_active ?? true,
      })
      .returning();

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
    await this.accessControl.verifyAccountAccess(null, accountId, userId, [
      'owner',
      'admin',
    ]);

    const existing = await this.findRowOrFail(accountId, connectionId);

    // If backbone_type changes, validate with the new adapter
    const backboneType = dto.backbone_type || existing.backboneType;
    if (dto.config) {
      const adapter = this.registry.get(backboneType);
      adapter.validateConfig(dto.config);
    }

    // If setting as default, clear existing defaults
    if (dto.is_default) {
      await this.clearAccountDefault(accountId);
    }

    const updateData: Partial<typeof backboneConnections.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.backbone_type !== undefined)
      updateData.backboneType = dto.backbone_type;
    if (dto.is_default !== undefined) updateData.isDefault = dto.is_default;
    if (dto.is_active !== undefined) updateData.isActive = dto.is_active;
    if (dto.config) {
      // Merge: keep existing encrypted values for keys not provided
      const existingDecrypted = this.decryptConfig(
        existing.config as Record<string, any>,
      );
      const merged = { ...existingDecrypted, ...dto.config };
      updateData.config = this.encryptConfig(merged);
    }

    const [data] = await this.db
      .update(backboneConnections)
      .set(updateData)
      .where(
        and(
          eq(backboneConnections.id, connectionId),
          eq(backboneConnections.accountId, accountId),
        ),
      )
      .returning();

    this.logger.log(
      `Updated backbone connection ${connectionId} for account ${accountId}`,
    );

    return this.toMaskedResponse(data);
  }

  /**
   * Delete a backbone connection.
   */
  async remove(userId: string, accountId: string, connectionId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId, [
      'owner',
      'admin',
    ]);

    await this.findRowOrFail(accountId, connectionId);

    await this.db
      .delete(backboneConnections)
      .where(
        and(
          eq(backboneConnections.id, connectionId),
          eq(backboneConnections.accountId, accountId),
        ),
      );

    this.logger.log(
      `Deleted backbone connection ${connectionId} from account ${accountId}`,
    );

    return { message: 'Backbone connection deleted successfully' };
  }

  /**
   * Set a connection as the account default.
   */
  async setDefault(userId: string, accountId: string, connectionId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId, [
      'owner',
      'admin',
    ]);

    await this.findRowOrFail(accountId, connectionId);
    await this.clearAccountDefault(accountId);

    const [data] = await this.db
      .update(backboneConnections)
      .set({ isDefault: true })
      .where(
        and(
          eq(backboneConnections.id, connectionId),
          eq(backboneConnections.accountId, accountId),
        ),
      )
      .returning();

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
    await this.db
      .update(backboneConnections)
      .set({
        healthStatus: status,
        healthCheckedAt: new Date().toISOString(),
        healthError: error || null,
      })
      .where(eq(backboneConnections.id, connectionId));
  }

  /**
   * Increment usage counters after a successful request.
   */
  async trackUsage(connectionId: string, tokens: number) {
    // Use raw SQL via rpc if available; otherwise read-modify-write
    const [row] = await this.db
      .select({
        totalRequests: backboneConnections.totalRequests,
        totalTokens: backboneConnections.totalTokens,
      })
      .from(backboneConnections)
      .where(eq(backboneConnections.id, connectionId))
      .limit(1);

    if (row) {
      await this.db
        .update(backboneConnections)
        .set({
          totalRequests: (row.totalRequests || 0) + 1,
          totalTokens: (row.totalTokens || 0) + tokens,
        })
        .where(eq(backboneConnections.id, connectionId));
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
    const [data] = await this.db
      .select()
      .from(backboneConnections)
      .where(
        and(
          eq(backboneConnections.id, connectionId),
          eq(backboneConnections.accountId, accountId),
        ),
      )
      .limit(1);

    if (!data) {
      throw new NotFoundException(
        `Backbone connection ${connectionId} not found`,
      );
    }

    return data;
  }

  private async clearAccountDefault(accountId: string) {
    await this.db
      .update(backboneConnections)
      .set({ isDefault: false })
      .where(
        and(
          eq(backboneConnections.accountId, accountId),
          eq(backboneConnections.isDefault, true),
        ),
      );
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

  /**
   * Re-key a raw Drizzle row to the snake_case shape PostgREST returned for
   * `select('*')`, leaving `config` in its stored (encrypted) form. Used by the
   * internal-use query methods whose consumers read snake_case keys.
   */
  private toRawRow(row: typeof backboneConnections.$inferSelect) {
    return {
      id: row.id,
      account_id: row.accountId,
      backbone_type: row.backboneType,
      name: row.name,
      description: row.description,
      config: row.config as Record<string, any>,
      is_default: row.isDefault,
      is_active: row.isActive,
      health_status: row.healthStatus,
      health_checked_at: row.healthCheckedAt,
      health_error: row.healthError,
      verified_at: row.verifiedAt,
      total_requests: row.totalRequests || 0,
      total_tokens: row.totalTokens || 0,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  private toMaskedResponse(row: typeof backboneConnections.$inferSelect) {
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
      account_id: row.accountId,
      backbone_type: row.backboneType,
      name: row.name,
      description: row.description,
      config: maskedConfig,
      is_default: row.isDefault,
      is_active: row.isActive,
      health_status: row.healthStatus,
      health_checked_at: row.healthCheckedAt,
      verified_at: row.verifiedAt,
      total_requests: row.totalRequests || 0,
      total_tokens: row.totalTokens || 0,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }
}
