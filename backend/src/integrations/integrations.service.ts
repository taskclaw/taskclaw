import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { forwardRef } from '@nestjs/common';
import { and, eq, ne, or, desc, asc, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  integrationDefinitions,
  integrationConnections,
  boardIntegrationRefs,
  boardInstances,
} from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import {
  encrypt,
  decrypt,
  maskSensitiveValue,
} from '../common/utils/encryption.util';
import { CreateDefinitionDto } from './dto/create-definition.dto';
import { UpdateDefinitionDto } from './dto/update-definition.dto';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { IntegrationContext } from './interfaces/integration.interfaces';
import { snakeKeys } from '../common/utils/snake-keys.util';

@Injectable()
export class IntegrationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationsService.name);
  private cronInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckLocks = new Map<string, boolean>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
    @Inject(forwardRef(() => AiProviderService))
    private readonly aiProviderService: AiProviderService,
  ) {}

  onModuleInit() {
    this.cronInterval = setInterval(() => {
      this.handleScheduledHealthChecks().catch((err) => {
        this.logger.error(
          `Integration health check sweep failed: ${err.message}`,
        );
      });
    }, 60_000);
    this.logger.log('Integration health check cron registered (every 60s)');
  }

  onModuleDestroy() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SHAPE HELPERS — re-key Drizzle relations to PostgREST aliases
  // ═══════════════════════════════════════════════════════════

  /**
   * Drizzle's relational query returns the joined definition under the relation
   * name (`integrationDefinition`); PostgREST returned it under the alias
   * `definition`. Re-key so the response shape callers depend on is unchanged.
   */
  private reKeyConnection(row: any): any {
    if (!row) return row;
    const { integrationDefinition, ...rest } = row;
    return { ...snakeKeys(rest), definition: integrationDefinition ?? null };
  }

  // ═══════════════════════════════════════════════════════════
  // DEFINITIONS CRUD
  // ═══════════════════════════════════════════════════════════

  async findAllDefinitions(userId: string, accountId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    try {
      return await this.db
        .select()
        .from(integrationDefinitions)
        .where(
          or(
            eq(integrationDefinitions.accountId, accountId),
            eq(integrationDefinitions.isSystem, true),
          ),
        )
        .orderBy(asc(integrationDefinitions.name));
    } catch (error: any) {
      this.logger.error(`Failed to fetch definitions: ${error.message}`);
      throw new Error(error.message);
    }
  }

  async findOneDefinition(userId: string, accountId: string, defId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [data] = await this.db
      .select()
      .from(integrationDefinitions)
      .where(
        and(
          eq(integrationDefinitions.id, defId),
          or(
            eq(integrationDefinitions.accountId, accountId),
            eq(integrationDefinitions.isSystem, true),
          ),
        ),
      )
      .limit(1);

    if (!data) {
      throw new NotFoundException('Integration definition not found');
    }

    return data;
  }

  async createDefinition(
    userId: string,
    accountId: string,
    dto: CreateDefinitionDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    try {
      const rows = await this.db
        .insert(integrationDefinitions)
        .values({
          accountId: accountId,
          slug: dto.slug,
          name: dto.name,
          description: dto.description || null,
          icon: dto.icon || null,
          categories: dto.categories || [],
          authType: dto.auth_type,
          authConfig: dto.auth_config || {},
          configFields: dto.config_fields || [],
          skillId: dto.skill_id || null,
          setupGuide: dto.setup_guide || null,
          proxyBaseUrl: dto.proxy_base_url || null,
        })
        .returning();
      return rows[0];
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new BadRequestException(
          `Integration with slug "${dto.slug}" already exists`,
        );
      }
      this.logger.error(`Failed to create definition: ${error.message}`);
      throw new Error(error.message);
    }
  }

  async updateDefinition(
    userId: string,
    accountId: string,
    defId: string,
    dto: UpdateDefinitionDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify exists and is not system
    const existing = await this.findOneDefinition(userId, accountId, defId);
    if (existing.isSystem) {
      throw new ForbiddenException(
        'Cannot modify system integration definitions',
      );
    }

    const updateData: Partial<typeof integrationDefinitions.$inferInsert> = {};
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.categories !== undefined) updateData.categories = dto.categories;
    if (dto.auth_type !== undefined) updateData.authType = dto.auth_type;
    if (dto.auth_config !== undefined) updateData.authConfig = dto.auth_config;
    if (dto.config_fields !== undefined)
      updateData.configFields = dto.config_fields;
    if (dto.skill_id !== undefined) updateData.skillId = dto.skill_id;
    if (dto.setup_guide !== undefined) updateData.setupGuide = dto.setup_guide;
    if (dto.proxy_base_url !== undefined)
      updateData.proxyBaseUrl = dto.proxy_base_url;

    try {
      const rows = await this.db
        .update(integrationDefinitions)
        .set(updateData)
        .where(
          and(
            eq(integrationDefinitions.id, defId),
            eq(integrationDefinitions.accountId, accountId),
          ),
        )
        .returning();
      return rows[0];
    } catch (error: any) {
      this.logger.error(`Failed to update definition: ${error.message}`);
      throw new Error(error.message);
    }
  }

  async removeDefinition(userId: string, accountId: string, defId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const existing = await this.findOneDefinition(userId, accountId, defId);
    if (existing.isSystem) {
      throw new ForbiddenException(
        'Cannot delete system integration definitions',
      );
    }

    try {
      await this.db
        .delete(integrationDefinitions)
        .where(
          and(
            eq(integrationDefinitions.id, defId),
            eq(integrationDefinitions.accountId, accountId),
          ),
        );
    } catch (error: any) {
      this.logger.error(`Failed to delete definition: ${error.message}`);
      throw new Error(error.message);
    }

    return { message: 'Integration definition deleted successfully' };
  }

  // ═══════════════════════════════════════════════════════════
  // CONNECTIONS CRUD
  // ═══════════════════════════════════════════════════════════

  async findAllConnections(userId: string, accountId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    let data: any[];
    try {
      data = await this.db.query.integrationConnections.findMany({
        where: eq(integrationConnections.accountId, accountId),
        orderBy: desc(integrationConnections.createdAt),
        with: { integrationDefinition: true },
      });
    } catch (error: any) {
      this.logger.error(`Failed to fetch connections: ${error.message}`);
      throw new Error(error.message);
    }

    // Mask credentials on GET responses
    return data.map((conn) =>
      this.maskConnectionCredentials(this.reKeyConnection(conn)),
    );
  }

  async findOneConnection(userId: string, accountId: string, connId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const data = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.id, connId),
        eq(integrationConnections.accountId, accountId),
      ),
      with: { integrationDefinition: true },
    });

    if (!data) {
      throw new NotFoundException('Integration connection not found');
    }

    return this.maskConnectionCredentials(this.reKeyConnection(data));
  }

  async createConnection(
    userId: string,
    accountId: string,
    dto: CreateConnectionDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify definition exists
    const [def] = await this.db
      .select({ id: integrationDefinitions.id })
      .from(integrationDefinitions)
      .where(
        and(
          eq(integrationDefinitions.id, dto.definition_id),
          or(
            eq(integrationDefinitions.accountId, accountId),
            eq(integrationDefinitions.isSystem, true),
          ),
        ),
      )
      .limit(1);

    if (!def) {
      throw new NotFoundException('Integration definition not found');
    }

    // Encrypt credentials blob
    const encryptedCredentials = dto.credentials
      ? this.encryptCredentials(dto.credentials)
      : null;

    let insertedId: string;
    try {
      const rows = await this.db
        .insert(integrationConnections)
        .values({
          accountId: accountId,
          definitionId: dto.definition_id,
          credentials: encryptedCredentials,
          scopes: dto.scopes || null,
          config: dto.config || {},
          externalAccountName: dto.external_account_name || null,
          status: encryptedCredentials ? 'active' : 'pending',
        })
        .returning({ id: integrationConnections.id });
      insertedId = rows[0].id;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new BadRequestException(
          'Connection for this integration already exists',
        );
      }
      this.logger.error(`Failed to create connection: ${error.message}`);
      throw new Error(error.message);
    }

    // Re-fetch with embedded definition to preserve the response shape.
    const data = await this.db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, insertedId),
      with: { integrationDefinition: true },
    });

    return this.maskConnectionCredentials(this.reKeyConnection(data));
  }

  async updateConnection(
    userId: string,
    accountId: string,
    connId: string,
    dto: UpdateConnectionDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify connection exists
    const [existing] = await this.db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, connId),
          eq(integrationConnections.accountId, accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Integration connection not found');
    }

    const updateData: Partial<typeof integrationConnections.$inferInsert> = {};

    if (dto.credentials !== undefined) {
      updateData.credentials = dto.credentials
        ? this.encryptCredentials(dto.credentials)
        : null;
    }
    if (dto.scopes !== undefined) updateData.scopes = dto.scopes;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.config !== undefined) updateData.config = dto.config;
    if (dto.external_account_name !== undefined) {
      updateData.externalAccountName = dto.external_account_name;
    }

    try {
      await this.db
        .update(integrationConnections)
        .set(updateData)
        .where(
          and(
            eq(integrationConnections.id, connId),
            eq(integrationConnections.accountId, accountId),
          ),
        );
    } catch (error: any) {
      this.logger.error(`Failed to update connection: ${error.message}`);
      throw new Error(error.message);
    }

    const data = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.id, connId),
        eq(integrationConnections.accountId, accountId),
      ),
      with: { integrationDefinition: true },
    });

    return this.maskConnectionCredentials(this.reKeyConnection(data));
  }

  async removeConnection(userId: string, accountId: string, connId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    try {
      await this.db
        .delete(integrationConnections)
        .where(
          and(
            eq(integrationConnections.id, connId),
            eq(integrationConnections.accountId, accountId),
          ),
        );
    } catch (error: any) {
      this.logger.error(`Failed to delete connection: ${error.message}`);
      throw new Error(error.message);
    }

    return { message: 'Integration connection deleted successfully' };
  }

  // ═══════════════════════════════════════════════════════════
  // CATEGORY-BASED QUERIES
  // ═══════════════════════════════════════════════════════════

  async findAllDefinitionsByCategory(
    userId: string,
    accountId: string,
    category?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    try {
      const conditions = [
        or(
          eq(integrationDefinitions.accountId, accountId),
          eq(integrationDefinitions.isSystem, true),
        ),
      ];

      if (category) {
        conditions.push(
          sql`${integrationDefinitions.categories} @> ARRAY[${category}]::text[]`,
        );
      }

      return await this.db
        .select()
        .from(integrationDefinitions)
        .where(and(...conditions))
        .orderBy(asc(integrationDefinitions.name));
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch definitions by category: ${error.message}`,
      );
      throw new Error(error.message);
    }
  }

  async findAllConnectionsByCategory(
    userId: string,
    accountId: string,
    category?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    let data: any[];
    try {
      data = await this.db.query.integrationConnections.findMany({
        where: eq(integrationConnections.accountId, accountId),
        orderBy: desc(integrationConnections.createdAt),
        with: {
          integrationDefinition: {
            with: { skill: { columns: { instructions: true } } },
          },
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to fetch connections: ${error.message}`);
      throw new Error(error.message);
    }

    let filtered = data.map((conn) => this.reKeyConnection(conn));
    if (category) {
      filtered = filtered.filter((conn: any) =>
        conn.definition?.categories?.includes(category),
      );
    }

    return filtered.map((conn: any) => this.maskConnectionCredentials(conn));
  }

  // ═══════════════════════════════════════════════════════════
  // COMMUNICATION TOOL TOGGLE & HEALTH CHECK
  // ═══════════════════════════════════════════════════════════

  async toggleConnection(
    userId: string,
    accountId: string,
    connId: string,
    enabled: boolean,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const conn = await this.db.query.integrationConnections.findFirst({
      where: and(
        eq(integrationConnections.id, connId),
        eq(integrationConnections.accountId, accountId),
      ),
      with: { integrationDefinition: true },
    });

    if (!conn) {
      throw new NotFoundException('Integration connection not found');
    }

    const connRe = this.reKeyConnection(conn);

    if (enabled) {
      // For comm tools: verify OpenClaw gateway is reachable
      const isCommTool =
        connRe.definition?.categories?.includes('communication');
      let healthStatus = 'unknown';
      let lastError: string | null = null;

      if (isCommTool) {
        const aiConfig = await this.getAiConfig(accountId);
        if (!aiConfig) {
          throw new BadRequestException(
            'OpenClaw must be connected and verified before enabling communication tools. Go to Settings > AI Provider to connect.',
          );
        }
        const reachable = await this.checkGatewayReachable(aiConfig.api_url);
        healthStatus = reachable ? 'healthy' : 'unhealthy';
        lastError = reachable ? null : 'OpenClaw gateway is not reachable';
      }

      const now = new Date().toISOString();
      try {
        await this.db
          .update(integrationConnections)
          .set({
            status: 'active',
            healthStatus: healthStatus,
            lastCheckedAt: isCommTool ? now : undefined,
            lastHealthyAt: healthStatus === 'healthy' ? now : undefined,
            errorMessage: lastError,
          })
          .where(eq(integrationConnections.id, connId));
      } catch (error: any) {
        throw new Error(`Failed to toggle connection: ${error.message}`);
      }

      const data = await this.db.query.integrationConnections.findFirst({
        where: eq(integrationConnections.id, connId),
        with: { integrationDefinition: true },
      });
      return this.maskConnectionCredentials(this.reKeyConnection(data));
    } else {
      try {
        await this.db
          .update(integrationConnections)
          .set({
            status: 'pending',
            healthStatus: 'unknown',
            errorMessage: null,
          })
          .where(eq(integrationConnections.id, connId));
      } catch (error: any) {
        throw new Error(`Failed to toggle connection: ${error.message}`);
      }

      const data = await this.db.query.integrationConnections.findFirst({
        where: eq(integrationConnections.id, connId),
        with: { integrationDefinition: true },
      });
      return this.maskConnectionCredentials(this.reKeyConnection(data));
    }
  }

  async checkConnectionHealth(
    userId: string,
    accountId: string,
    connId: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Set status to checking
    await this.db
      .update(integrationConnections)
      .set({ healthStatus: 'checking' })
      .where(
        and(
          eq(integrationConnections.id, connId),
          eq(integrationConnections.accountId, accountId),
        ),
      );

    const aiConfig = await this.getAiConfig(accountId);
    const now = new Date().toISOString();

    if (!aiConfig) {
      await this.db
        .update(integrationConnections)
        .set({
          healthStatus: 'unhealthy',
          lastCheckedAt: now,
          errorMessage: 'OpenClaw is not connected',
        })
        .where(eq(integrationConnections.id, connId));

      const data = await this.db.query.integrationConnections.findFirst({
        where: eq(integrationConnections.id, connId),
        with: { integrationDefinition: true },
      });
      return this.maskConnectionCredentials(this.reKeyConnection(data));
    }

    const reachable = await this.checkGatewayReachable(aiConfig.api_url);

    const updateData = reachable
      ? {
          healthStatus: 'healthy',
          lastCheckedAt: now,
          lastHealthyAt: now,
          errorMessage: null,
        }
      : {
          healthStatus: 'unhealthy',
          lastCheckedAt: now,
          errorMessage: 'OpenClaw gateway is not reachable',
        };

    try {
      await this.db
        .update(integrationConnections)
        .set(updateData)
        .where(eq(integrationConnections.id, connId));
    } catch (error: any) {
      throw new Error(`Failed to update health status: ${error.message}`);
    }

    const data = await this.db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, connId),
      with: { integrationDefinition: true },
    });
    return this.maskConnectionCredentials(this.reKeyConnection(data));
  }

  async getAvailableCommTools(accountId: string): Promise<string[]> {
    let data: any[];
    try {
      data = await this.db.query.integrationConnections.findMany({
        where: and(
          eq(integrationConnections.accountId, accountId),
          eq(integrationConnections.status, 'active'),
          eq(integrationConnections.healthStatus, 'healthy'),
        ),
        columns: {},
        with: {
          integrationDefinition: {
            columns: { slug: true, categories: true },
          },
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch available comm tools: ${error.message}`,
      );
      return [];
    }

    return data
      .map((r: any) => this.reKeyConnection(r))
      .filter((r: any) => r.definition?.categories?.includes('communication'))
      .map((r: any) => {
        // Map slug back to tool name (telegram-comm → telegram)
        const slug = r.definition?.slug || '';
        return slug.replace('-comm', '');
      });
  }

  async getConnectionCredentialsDecrypted(
    connectionId: string,
  ): Promise<Record<string, string>> {
    const [data] = await this.db
      .select({ credentials: integrationConnections.credentials })
      .from(integrationConnections)
      .where(eq(integrationConnections.id, connectionId))
      .limit(1);

    if (!data) {
      throw new NotFoundException('Connection not found');
    }

    if (!data.credentials) return {};

    try {
      return this.decryptCredentials(data.credentials);
    } catch {
      // May be unencrypted JSON from migration — try parsing directly
      try {
        const parsed = JSON.parse(data.credentials);
        // Re-encrypt for next time
        const encrypted = this.encryptCredentials(parsed);
        void this.db
          .update(integrationConnections)
          .set({ credentials: encrypted })
          .where(eq(integrationConnections.id, connectionId));
        return parsed;
      } catch {
        this.logger.warn(
          `Failed to decrypt credentials for connection ${connectionId}`,
        );
        return {};
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HEALTH CHECK SCHEDULER (for comm tools)
  // ═══════════════════════════════════════════════════════════

  private async handleScheduledHealthChecks(): Promise<void> {
    // Find connections that are active, have health monitoring, and are due for check
    let dueConnections: any[];
    try {
      dueConnections = await this.db.query.integrationConnections.findMany({
        where: and(
          eq(integrationConnections.status, 'active'),
          ne(integrationConnections.healthStatus, 'unknown'),
        ),
        limit: 20,
        with: {
          integrationDefinition: { columns: { categories: true } },
        },
      });
    } catch {
      return;
    }

    if (!dueConnections || dueConnections.length === 0) return;

    const reKeyed = dueConnections.map((conn) => this.reKeyConnection(conn));

    // Filter to only comm tool connections that are due
    const now = Date.now();
    const commConnections = reKeyed.filter((conn: any) => {
      if (!conn.definition?.categories?.includes('communication')) return false;
      if (!conn.lastCheckedAt) return true;
      const elapsed = now - new Date(conn.lastCheckedAt).getTime();
      return elapsed >= (conn.checkIntervalMinutes || 5) * 60_000;
    });

    if (commConnections.length === 0) return;

    const aiConfigCache = new Map<string, any>();

    for (const conn of commConnections) {
      const lockKey = conn.id;
      if (this.healthCheckLocks.get(lockKey)) continue;

      this.healthCheckLocks.set(lockKey, true);
      try {
        let aiConfig = aiConfigCache.get(conn.accountId);
        if (aiConfig === undefined) {
          aiConfig = await this.getAiConfig(conn.accountId);
          aiConfigCache.set(conn.accountId, aiConfig);
        }

        const nowIso = new Date().toISOString();

        if (!aiConfig) {
          await this.db
            .update(integrationConnections)
            .set({
              healthStatus: 'unhealthy',
              lastCheckedAt: nowIso,
              errorMessage: 'OpenClaw is not connected',
            })
            .where(eq(integrationConnections.id, conn.id));
          continue;
        }

        const reachable = await this.checkGatewayReachable(aiConfig.api_url);

        if (reachable) {
          await this.db
            .update(integrationConnections)
            .set({
              healthStatus: 'healthy',
              lastCheckedAt: nowIso,
              lastHealthyAt: nowIso,
              errorMessage: null,
            })
            .where(eq(integrationConnections.id, conn.id));
        } else {
          await this.db
            .update(integrationConnections)
            .set({
              healthStatus: 'unhealthy',
              lastCheckedAt: nowIso,
              errorMessage: 'OpenClaw gateway is not reachable',
            })
            .where(eq(integrationConnections.id, conn.id));
        }
      } catch (err: any) {
        this.logger.error(
          `Health check failed for connection ${conn.id}: ${err.message}`,
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

  // ═══════════════════════════════════════════════════════════
  // BOARD INTEGRATION REFS
  // ═══════════════════════════════════════════════════════════

  async getRefsForBoard(userId: string, accountId: string, boardId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    let data: any[];
    try {
      data = await this.db.query.boardIntegrationRefs.findMany({
        where: eq(boardIntegrationRefs.boardId, boardId),
        with: {
          integrationConnection: {
            with: { integrationDefinition: true },
          },
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch board integration refs: ${error.message}`,
      );
      throw new Error(error.message);
    }

    // Mask credentials in nested connection data
    return data.map((ref) => {
      const { integrationConnection, ...rest } = ref;
      const connection = integrationConnection ?? null;
      if (connection) {
        return {
          ...snakeKeys(rest),
          connection: this.maskConnectionCredentials(
            this.reKeyConnection(connection),
          ),
        };
      }
      return { ...snakeKeys(rest), connection };
    });
  }

  async addRef(
    userId: string,
    accountId: string,
    boardId: string,
    connectionId: string,
    isRequired = false,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify board belongs to account
    const [board] = await this.db
      .select({ id: boardInstances.id })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      )
      .limit(1);

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    // Verify connection belongs to account
    const [conn] = await this.db
      .select({ id: integrationConnections.id })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.accountId, accountId),
        ),
      )
      .limit(1);

    if (!conn) {
      throw new NotFoundException('Integration connection not found');
    }

    let insertedId: string;
    try {
      const rows = await this.db
        .insert(boardIntegrationRefs)
        .values({
          boardId: boardId,
          connectionId: connectionId,
          isRequired: isRequired,
        })
        .returning({ id: boardIntegrationRefs.id });
      insertedId = rows[0].id;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new BadRequestException(
          'This integration is already linked to the board',
        );
      }
      this.logger.error(
        `Failed to add board integration ref: ${error.message}`,
      );
      throw new Error(error.message);
    }

    const ref = await this.db.query.boardIntegrationRefs.findFirst({
      where: eq(boardIntegrationRefs.id, insertedId),
      with: {
        integrationConnection: {
          with: { integrationDefinition: true },
        },
      },
    });

    const { integrationConnection, ...rest } = ref as any;
    const connection = integrationConnection ?? null;
    if (connection) {
      return {
        ...snakeKeys(rest),
        connection: this.maskConnectionCredentials(
          this.reKeyConnection(connection),
        ),
      };
    }
    return { ...snakeKeys(rest), connection };
  }

  async removeRef(
    userId: string,
    accountId: string,
    boardId: string,
    refId: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    try {
      await this.db
        .delete(boardIntegrationRefs)
        .where(
          and(
            eq(boardIntegrationRefs.id, refId),
            eq(boardIntegrationRefs.boardId, boardId),
          ),
        );
    } catch (error: any) {
      this.logger.error(
        `Failed to remove board integration ref: ${error.message}`,
      );
      throw new Error(error.message);
    }

    return { message: 'Integration removed from board successfully' };
  }

  // ═══════════════════════════════════════════════════════════
  // CREDENTIAL ENCRYPTION
  // ═══════════════════════════════════════════════════════════

  encryptCredentials(credentials: Record<string, string>): string {
    const json = JSON.stringify(credentials);
    return encrypt(json);
  }

  decryptCredentials(encrypted: string): Record<string, string> {
    const json = decrypt(encrypted);
    return JSON.parse(json);
  }

  maskCredentials(credentials: Record<string, string>): Record<string, string> {
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      masked[key] = maskSensitiveValue(value);
    }
    return masked;
  }

  private maskConnectionCredentials(connection: any): any {
    if (!connection || !connection.credentials) {
      return { ...connection, credentials_masked: null };
    }

    try {
      const decrypted = this.decryptCredentials(connection.credentials);
      return {
        ...connection,
        credentials: undefined, // Remove encrypted blob from response
        credentials_masked: this.maskCredentials(decrypted),
      };
    } catch {
      return {
        ...connection,
        credentials: undefined,
        credentials_masked: null,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EXECUTION BRIDGE — Integration context for board prompts
  // ═══════════════════════════════════════════════════════════

  async getIntegrationContextForBoard(
    boardId: string,
  ): Promise<IntegrationContext[]> {
    // Fetch board refs with connection + definition + linked skill
    let refs: any[];
    try {
      refs = await this.db.query.boardIntegrationRefs.findMany({
        where: eq(boardIntegrationRefs.boardId, boardId),
        columns: {},
        with: {
          integrationConnection: {
            columns: {
              id: true,
              credentials: true,
              status: true,
              config: true,
              externalAccountName: true,
            },
            with: {
              integrationDefinition: {
                columns: { name: true, slug: true },
                with: {
                  skill: { columns: { instructions: true } },
                },
              },
            },
          },
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch integration context for board ${boardId}: ${error.message}`,
      );
      return [];
    }

    const contexts: IntegrationContext[] = [];

    for (const ref of refs || []) {
      const rawConn = ref.integrationConnection as any;
      if (!rawConn) continue;

      // Re-key definition alias and normalize external_account_name to the
      // PostgREST snake_case shape the rest of this method consumes.
      const definition = rawConn.integrationDefinition ?? null;
      if (!definition) continue;

      const conn = {
        ...rawConn,
        definition,
        external_account_name: rawConn.externalAccountName,
      };

      let credentials: Record<string, string> = {};
      if (conn.credentials && conn.status === 'active') {
        try {
          credentials = this.decryptCredentials(conn.credentials);
        } catch (err) {
          this.logger.warn(
            `Failed to decrypt credentials for connection ${conn.id}`,
          );
        }
      }

      // Update last_used_at (fire-and-forget)
      void this.db
        .update(integrationConnections)
        .set({ lastUsedAt: new Date().toISOString() })
        .where(eq(integrationConnections.id, conn.id));

      contexts.push({
        name: conn.definition.name,
        slug: conn.definition.slug,
        status: conn.status,
        external_account_name: conn.external_account_name || undefined,
        skill_instructions: conn.definition.skill?.instructions || undefined,
        credentials,
        config: conn.config || {},
      });
    }

    return contexts;
  }
}
