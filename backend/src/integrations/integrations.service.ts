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
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
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

@Injectable()
export class IntegrationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationsService.name);
  private cronInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckLocks = new Map<string, boolean>();

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
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
  // DEFINITIONS CRUD
  // ═══════════════════════════════════════════════════════════

  async findAllDefinitions(userId: string, accountId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('integration_definitions')
      .select('*')
      .or(`account_id.eq.${accountId},is_system.eq.true`)
      .order('name', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch definitions: ${error.message}`);
      throw new Error(error.message);
    }

    return data || [];
  }

  async findOneDefinition(userId: string, accountId: string, defId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('integration_definitions')
      .select('*')
      .eq('id', defId)
      .or(`account_id.eq.${accountId},is_system.eq.true`)
      .single();

    if (error || !data) {
      throw new NotFoundException('Integration definition not found');
    }

    return data;
  }

  async createDefinition(
    userId: string,
    accountId: string,
    dto: CreateDefinitionDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('integration_definitions')
      .insert({
        account_id: accountId,
        slug: dto.slug,
        name: dto.name,
        description: dto.description || null,
        icon: dto.icon || null,
        categories: dto.categories || [],
        auth_type: dto.auth_type,
        auth_config: dto.auth_config || {},
        config_fields: dto.config_fields || [],
        skill_id: dto.skill_id || null,
        setup_guide: dto.setup_guide || null,
        proxy_base_url: dto.proxy_base_url || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException(
          `Integration with slug "${dto.slug}" already exists`,
        );
      }
      this.logger.error(`Failed to create definition: ${error.message}`);
      throw new Error(error.message);
    }

    return data;
  }

  async updateDefinition(
    userId: string,
    accountId: string,
    defId: string,
    dto: UpdateDefinitionDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify exists and is not system
    const existing = await this.findOneDefinition(userId, accountId, defId);
    if (existing.is_system) {
      throw new ForbiddenException(
        'Cannot modify system integration definitions',
      );
    }

    const updateData: Record<string, any> = {};
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.categories !== undefined) updateData.categories = dto.categories;
    if (dto.auth_type !== undefined) updateData.auth_type = dto.auth_type;
    if (dto.auth_config !== undefined) updateData.auth_config = dto.auth_config;
    if (dto.config_fields !== undefined)
      updateData.config_fields = dto.config_fields;
    if (dto.skill_id !== undefined) updateData.skill_id = dto.skill_id;
    if (dto.setup_guide !== undefined) updateData.setup_guide = dto.setup_guide;
    if (dto.proxy_base_url !== undefined)
      updateData.proxy_base_url = dto.proxy_base_url;

    const { data, error } = await client
      .from('integration_definitions')
      .update(updateData)
      .eq('id', defId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update definition: ${error.message}`);
      throw new Error(error.message);
    }

    return data;
  }

  async removeDefinition(userId: string, accountId: string, defId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const existing = await this.findOneDefinition(userId, accountId, defId);
    if (existing.is_system) {
      throw new ForbiddenException(
        'Cannot delete system integration definitions',
      );
    }

    const { error } = await client
      .from('integration_definitions')
      .delete()
      .eq('id', defId)
      .eq('account_id', accountId);

    if (error) {
      this.logger.error(`Failed to delete definition: ${error.message}`);
      throw new Error(error.message);
    }

    return { message: 'Integration definition deleted successfully' };
  }

  // ═══════════════════════════════════════════════════════════
  // CONNECTIONS CRUD
  // ═══════════════════════════════════════════════════════════

  async findAllConnections(userId: string, accountId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('integration_connections')
      .select('*, definition:integration_definitions(*)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch connections: ${error.message}`);
      throw new Error(error.message);
    }

    // Mask credentials on GET responses
    return (data || []).map((conn) => this.maskConnectionCredentials(conn));
  }

  async findOneConnection(userId: string, accountId: string, connId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('integration_connections')
      .select('*, definition:integration_definitions(*)')
      .eq('id', connId)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Integration connection not found');
    }

    return this.maskConnectionCredentials(data);
  }

  async createConnection(
    userId: string,
    accountId: string,
    dto: CreateConnectionDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify definition exists
    const { data: def, error: defError } = await client
      .from('integration_definitions')
      .select('id')
      .eq('id', dto.definition_id)
      .or(`account_id.eq.${accountId},is_system.eq.true`)
      .single();

    if (defError || !def) {
      throw new NotFoundException('Integration definition not found');
    }

    // Encrypt credentials blob
    const encryptedCredentials = dto.credentials
      ? this.encryptCredentials(dto.credentials)
      : null;

    const { data, error } = await client
      .from('integration_connections')
      .insert({
        account_id: accountId,
        definition_id: dto.definition_id,
        credentials: encryptedCredentials,
        scopes: dto.scopes || null,
        config: dto.config || {},
        external_account_name: dto.external_account_name || null,
        status: encryptedCredentials ? 'active' : 'pending',
      })
      .select('*, definition:integration_definitions(*)')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException(
          'Connection for this integration already exists',
        );
      }
      this.logger.error(`Failed to create connection: ${error.message}`);
      throw new Error(error.message);
    }

    return this.maskConnectionCredentials(data);
  }

  async updateConnection(
    userId: string,
    accountId: string,
    connId: string,
    dto: UpdateConnectionDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify connection exists
    const { data: existing, error: existError } = await client
      .from('integration_connections')
      .select('*')
      .eq('id', connId)
      .eq('account_id', accountId)
      .single();

    if (existError || !existing) {
      throw new NotFoundException('Integration connection not found');
    }

    const updateData: Record<string, any> = {};

    if (dto.credentials !== undefined) {
      updateData.credentials = dto.credentials
        ? this.encryptCredentials(dto.credentials)
        : null;
    }
    if (dto.scopes !== undefined) updateData.scopes = dto.scopes;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.config !== undefined) updateData.config = dto.config;
    if (dto.external_account_name !== undefined) {
      updateData.external_account_name = dto.external_account_name;
    }

    const { data, error } = await client
      .from('integration_connections')
      .update(updateData)
      .eq('id', connId)
      .eq('account_id', accountId)
      .select('*, definition:integration_definitions(*)')
      .single();

    if (error) {
      this.logger.error(`Failed to update connection: ${error.message}`);
      throw new Error(error.message);
    }

    return this.maskConnectionCredentials(data);
  }

  async removeConnection(userId: string, accountId: string, connId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { error } = await client
      .from('integration_connections')
      .delete()
      .eq('id', connId)
      .eq('account_id', accountId);

    if (error) {
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
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    let query = client
      .from('integration_definitions')
      .select('*')
      .or(`account_id.eq.${accountId},is_system.eq.true`)
      .order('name', { ascending: true });

    if (category) {
      query = query.contains('categories', [category]);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.error(
        `Failed to fetch definitions by category: ${error.message}`,
      );
      throw new Error(error.message);
    }
    return data || [];
  }

  async findAllConnectionsByCategory(
    userId: string,
    accountId: string,
    category?: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('integration_connections')
      .select(
        '*, definition:integration_definitions(*, skill:skills(instructions))',
      )
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch connections: ${error.message}`);
      throw new Error(error.message);
    }

    let filtered = data || [];
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
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data: conn, error: connError } = await client
      .from('integration_connections')
      .select('*, definition:integration_definitions(*)')
      .eq('id', connId)
      .eq('account_id', accountId)
      .single();

    if (connError || !conn) {
      throw new NotFoundException('Integration connection not found');
    }

    if (enabled) {
      // For comm tools: verify OpenClaw gateway is reachable
      const isCommTool = conn.definition?.categories?.includes('communication');
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
      const { data, error } = await client
        .from('integration_connections')
        .update({
          status: 'active',
          health_status: healthStatus,
          last_checked_at: isCommTool ? now : undefined,
          last_healthy_at: healthStatus === 'healthy' ? now : undefined,
          error_message: lastError,
        })
        .eq('id', connId)
        .select('*, definition:integration_definitions(*)')
        .single();

      if (error)
        throw new Error(`Failed to toggle connection: ${error.message}`);
      return this.maskConnectionCredentials(data);
    } else {
      const { data, error } = await client
        .from('integration_connections')
        .update({
          status: 'pending',
          health_status: 'unknown',
          error_message: null,
        })
        .eq('id', connId)
        .select('*, definition:integration_definitions(*)')
        .single();

      if (error)
        throw new Error(`Failed to toggle connection: ${error.message}`);
      return this.maskConnectionCredentials(data);
    }
  }

  async checkConnectionHealth(
    userId: string,
    accountId: string,
    connId: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Set status to checking
    await client
      .from('integration_connections')
      .update({ health_status: 'checking' })
      .eq('id', connId)
      .eq('account_id', accountId);

    const aiConfig = await this.getAiConfig(accountId);
    const now = new Date().toISOString();

    if (!aiConfig) {
      const { data } = await client
        .from('integration_connections')
        .update({
          health_status: 'unhealthy',
          last_checked_at: now,
          error_message: 'OpenClaw is not connected',
        })
        .eq('id', connId)
        .select('*, definition:integration_definitions(*)')
        .single();
      return this.maskConnectionCredentials(data);
    }

    const reachable = await this.checkGatewayReachable(aiConfig.api_url);

    const updateData = reachable
      ? {
          health_status: 'healthy',
          last_checked_at: now,
          last_healthy_at: now,
          error_message: null,
        }
      : {
          health_status: 'unhealthy',
          last_checked_at: now,
          error_message: 'OpenClaw gateway is not reachable',
        };

    const { data, error } = await client
      .from('integration_connections')
      .update(updateData)
      .eq('id', connId)
      .select('*, definition:integration_definitions(*)')
      .single();

    if (error)
      throw new Error(`Failed to update health status: ${error.message}`);
    return this.maskConnectionCredentials(data);
  }

  async getAvailableCommTools(accountId: string): Promise<string[]> {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('integration_connections')
      .select('definition:integration_definitions(slug, categories)')
      .eq('account_id', accountId)
      .eq('status', 'active')
      .eq('health_status', 'healthy');

    if (error) {
      this.logger.warn(
        `Failed to fetch available comm tools: ${error.message}`,
      );
      return [];
    }

    return (data || [])
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
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('integration_connections')
      .select('credentials')
      .eq('id', connectionId)
      .single();

    if (error || !data) {
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
        void client
          .from('integration_connections')
          .update({ credentials: encrypted })
          .eq('id', connectionId);
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
    const client = this.supabaseAdmin.getClient();

    // Find connections that are active, have health monitoring, and are due for check
    const { data: dueConnections, error } = await client
      .from('integration_connections')
      .select('*, definition:integration_definitions(categories)')
      .eq('status', 'active')
      .neq('health_status', 'unknown')
      .limit(20);

    if (error || !dueConnections || dueConnections.length === 0) return;

    // Filter to only comm tool connections that are due
    const now = Date.now();
    const commConnections = dueConnections.filter((conn: any) => {
      if (!conn.definition?.categories?.includes('communication')) return false;
      if (!conn.last_checked_at) return true;
      const elapsed = now - new Date(conn.last_checked_at).getTime();
      return elapsed >= (conn.check_interval_minutes || 5) * 60_000;
    });

    if (commConnections.length === 0) return;

    const aiConfigCache = new Map<string, any>();

    for (const conn of commConnections) {
      const lockKey = conn.id;
      if (this.healthCheckLocks.get(lockKey)) continue;

      this.healthCheckLocks.set(lockKey, true);
      try {
        let aiConfig = aiConfigCache.get(conn.account_id);
        if (aiConfig === undefined) {
          aiConfig = await this.getAiConfig(conn.account_id);
          aiConfigCache.set(conn.account_id, aiConfig);
        }

        const nowIso = new Date().toISOString();

        if (!aiConfig) {
          await client
            .from('integration_connections')
            .update({
              health_status: 'unhealthy',
              last_checked_at: nowIso,
              error_message: 'OpenClaw is not connected',
            })
            .eq('id', conn.id);
          continue;
        }

        const reachable = await this.checkGatewayReachable(aiConfig.api_url);

        if (reachable) {
          await client
            .from('integration_connections')
            .update({
              health_status: 'healthy',
              last_checked_at: nowIso,
              last_healthy_at: nowIso,
              error_message: null,
            })
            .eq('id', conn.id);
        } else {
          await client
            .from('integration_connections')
            .update({
              health_status: 'unhealthy',
              last_checked_at: nowIso,
              error_message: 'OpenClaw gateway is not reachable',
            })
            .eq('id', conn.id);
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
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('board_integration_refs')
      .select(
        '*, connection:integration_connections(*, definition:integration_definitions(*))',
      )
      .eq('board_id', boardId);

    if (error) {
      this.logger.error(
        `Failed to fetch board integration refs: ${error.message}`,
      );
      throw new Error(error.message);
    }

    // Mask credentials in nested connection data
    return (data || []).map((ref) => {
      if (ref.connection) {
        ref.connection = this.maskConnectionCredentials(ref.connection);
      }
      return ref;
    });
  }

  async addRef(
    userId: string,
    accountId: string,
    boardId: string,
    connectionId: string,
    isRequired = false,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify board belongs to account
    const { data: board, error: boardError } = await client
      .from('board_instances')
      .select('id')
      .eq('id', boardId)
      .eq('account_id', accountId)
      .single();

    if (boardError || !board) {
      throw new NotFoundException('Board not found');
    }

    // Verify connection belongs to account
    const { data: conn, error: connError } = await client
      .from('integration_connections')
      .select('id')
      .eq('id', connectionId)
      .eq('account_id', accountId)
      .single();

    if (connError || !conn) {
      throw new NotFoundException('Integration connection not found');
    }

    const { data, error } = await client
      .from('board_integration_refs')
      .insert({
        board_id: boardId,
        connection_id: connectionId,
        is_required: isRequired,
      })
      .select(
        '*, connection:integration_connections(*, definition:integration_definitions(*))',
      )
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException(
          'This integration is already linked to the board',
        );
      }
      this.logger.error(
        `Failed to add board integration ref: ${error.message}`,
      );
      throw new Error(error.message);
    }

    if (data.connection) {
      data.connection = this.maskConnectionCredentials(data.connection);
    }

    return data;
  }

  async removeRef(
    userId: string,
    accountId: string,
    boardId: string,
    refId: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { error } = await client
      .from('board_integration_refs')
      .delete()
      .eq('id', refId)
      .eq('board_id', boardId);

    if (error) {
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
    const client = this.supabaseAdmin.getClient();

    // Fetch board refs with connection + definition + linked skill
    const { data: refs, error } = await client
      .from('board_integration_refs')
      .select(
        `
        connection:integration_connections(
          id,
          credentials,
          status,
          config,
          external_account_name,
          definition:integration_definitions(
            name,
            slug,
            skill:skills(
              instructions
            )
          )
        )
      `,
      )
      .eq('board_id', boardId);

    if (error) {
      this.logger.error(
        `Failed to fetch integration context for board ${boardId}: ${error.message}`,
      );
      return [];
    }

    const contexts: IntegrationContext[] = [];

    for (const ref of refs || []) {
      const conn = ref.connection as any;
      if (!conn || !conn.definition) continue;

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
      void client
        .from('integration_connections')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', conn.id);

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
