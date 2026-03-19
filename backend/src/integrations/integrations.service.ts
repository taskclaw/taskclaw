import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { encrypt, decrypt, maskSensitiveValue } from '../common/utils/encryption.util';
import { CreateDefinitionDto } from './dto/create-definition.dto';
import { UpdateDefinitionDto } from './dto/update-definition.dto';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { IntegrationContext } from './interfaces/integration.interfaces';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
  ) {}

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

  async createDefinition(userId: string, accountId: string, dto: CreateDefinitionDto) {
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
        throw new BadRequestException(`Integration with slug "${dto.slug}" already exists`);
      }
      this.logger.error(`Failed to create definition: ${error.message}`);
      throw new Error(error.message);
    }

    return data;
  }

  async updateDefinition(userId: string, accountId: string, defId: string, dto: UpdateDefinitionDto) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify exists and is not system
    const existing = await this.findOneDefinition(userId, accountId, defId);
    if (existing.is_system) {
      throw new ForbiddenException('Cannot modify system integration definitions');
    }

    const updateData: Record<string, any> = {};
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.categories !== undefined) updateData.categories = dto.categories;
    if (dto.auth_type !== undefined) updateData.auth_type = dto.auth_type;
    if (dto.auth_config !== undefined) updateData.auth_config = dto.auth_config;
    if (dto.config_fields !== undefined) updateData.config_fields = dto.config_fields;
    if (dto.skill_id !== undefined) updateData.skill_id = dto.skill_id;
    if (dto.setup_guide !== undefined) updateData.setup_guide = dto.setup_guide;
    if (dto.proxy_base_url !== undefined) updateData.proxy_base_url = dto.proxy_base_url;

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
      throw new ForbiddenException('Cannot delete system integration definitions');
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

  async createConnection(userId: string, accountId: string, dto: CreateConnectionDto) {
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
        throw new BadRequestException('Connection for this integration already exists');
      }
      this.logger.error(`Failed to create connection: ${error.message}`);
      throw new Error(error.message);
    }

    return this.maskConnectionCredentials(data);
  }

  async updateConnection(userId: string, accountId: string, connId: string, dto: UpdateConnectionDto) {
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
  // BOARD INTEGRATION REFS
  // ═══════════════════════════════════════════════════════════

  async getRefsForBoard(userId: string, accountId: string, boardId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('board_integration_refs')
      .select('*, connection:integration_connections(*, definition:integration_definitions(*))')
      .eq('board_id', boardId);

    if (error) {
      this.logger.error(`Failed to fetch board integration refs: ${error.message}`);
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

  async addRef(userId: string, accountId: string, boardId: string, connectionId: string, isRequired = false) {
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
      .select('*, connection:integration_connections(*, definition:integration_definitions(*))')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('This integration is already linked to the board');
      }
      this.logger.error(`Failed to add board integration ref: ${error.message}`);
      throw new Error(error.message);
    }

    if (data.connection) {
      data.connection = this.maskConnectionCredentials(data.connection);
    }

    return data;
  }

  async removeRef(userId: string, accountId: string, boardId: string, refId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { error } = await client
      .from('board_integration_refs')
      .delete()
      .eq('id', refId)
      .eq('board_id', boardId);

    if (error) {
      this.logger.error(`Failed to remove board integration ref: ${error.message}`);
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

  async getIntegrationContextForBoard(boardId: string): Promise<IntegrationContext[]> {
    const client = this.supabaseAdmin.getClient();

    // Fetch board refs with connection + definition + linked skill
    const { data: refs, error } = await client
      .from('board_integration_refs')
      .select(`
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
      `)
      .eq('board_id', boardId);

    if (error) {
      this.logger.error(`Failed to fetch integration context for board ${boardId}: ${error.message}`);
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
          this.logger.warn(`Failed to decrypt credentials for connection ${conn.id}`);
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
