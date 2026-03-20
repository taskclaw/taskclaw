import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { OpenClawService } from '../conversations/openclaw.service';
import { CreateAiProviderDto } from './dto/create-ai-provider.dto';
import { UpdateAiProviderDto } from './dto/update-ai-provider.dto';
import { VerifyConnectionDto } from './dto/verify-connection.dto';
import {
  encrypt,
  decrypt,
  maskSensitiveValue,
} from '../common/utils/encryption.util';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
    @Inject(forwardRef(() => OpenClawService))
    private readonly openClawService: OpenClawService,
  ) {}

  /**
   * Get AI provider config for an account (with masked API key)
   */
  async findOne(userId: string, accountId: string, accessToken: string) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access to this account
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('ai_provider_configs')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch AI provider config: ${error.message}`);
    }

    if (!data) {
      return null; // No AI provider configured yet
    }

    // Decrypt and mask sensitive fields for display
    return {
      ...data,
      api_url: decrypt(data.api_url),
      api_key: maskSensitiveValue(decrypt(data.api_key)),
      api_key_masked: true, // Flag to indicate key is masked
      openrouter_api_key: data.openrouter_api_key
        ? maskSensitiveValue(decrypt(data.openrouter_api_key))
        : null,
      telegram_bot_token: data.telegram_bot_token
        ? maskSensitiveValue(decrypt(data.telegram_bot_token))
        : null,
      brave_search_api_key: data.brave_search_api_key
        ? maskSensitiveValue(decrypt(data.brave_search_api_key))
        : null,
    };
  }

  /**
   * Create or update AI provider config
   */
  async upsert(
    userId: string,
    accountId: string,
    dto: CreateAiProviderDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user is owner/admin
    await this.accessControl.verifyAccountAccess(client, accountId, userId, [
      'owner',
      'admin',
    ]);

    // If api_key or api_url not provided, reuse existing encrypted values
    let existingEncrypted: Record<string, any> | null = null;
    if (!dto.api_key || !dto.api_url) {
      const { data: existing } = await client
        .from('ai_provider_configs')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();
      existingEncrypted = existing;
    }

    // Encrypt sensitive fields
    const encryptedData: Record<string, any> = {
      account_id: accountId,
      provider_type: dto.provider_type || 'openclaw',
      api_url: dto.api_url ? encrypt(dto.api_url) : existingEncrypted?.api_url,
      api_key: dto.api_key ? encrypt(dto.api_key) : existingEncrypted?.api_key,
      agent_id: dto.agent_id,
      is_active: dto.is_active ?? true,
    };

    if (!encryptedData.api_url || !encryptedData.api_key) {
      throw new BadRequestException(
        'API URL and API key are required. Please provide them or ensure an existing configuration exists.',
      );
    }

    // Sprint 7: Extended OpenClaw credentials
    if (dto.openrouter_api_key !== undefined) {
      encryptedData.openrouter_api_key = dto.openrouter_api_key
        ? encrypt(dto.openrouter_api_key)
        : null;
    }
    if (dto.telegram_bot_token !== undefined) {
      encryptedData.telegram_bot_token = dto.telegram_bot_token
        ? encrypt(dto.telegram_bot_token)
        : null;
    }
    if (dto.brave_search_api_key !== undefined) {
      encryptedData.brave_search_api_key = dto.brave_search_api_key
        ? encrypt(dto.brave_search_api_key)
        : null;
    }

    const { data, error } = await client
      .from('ai_provider_configs')
      .upsert(encryptedData, {
        onConflict: 'account_id,provider_type',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save AI provider config: ${error.message}`);
    }

    this.logger.log(
      `AI provider config saved for account ${accountId}: ${dto.provider_type}`,
    );

    // Return with decrypted but masked values
    return {
      ...data,
      api_url: dto.api_url || decrypt(data.api_url),
      api_key: dto.api_key
        ? maskSensitiveValue(dto.api_key)
        : maskSensitiveValue(decrypt(data.api_key)),
      api_key_masked: true,
      openrouter_api_key: dto.openrouter_api_key
        ? maskSensitiveValue(dto.openrouter_api_key)
        : data.openrouter_api_key ? maskSensitiveValue(decrypt(data.openrouter_api_key)) : null,
      telegram_bot_token: dto.telegram_bot_token
        ? maskSensitiveValue(dto.telegram_bot_token)
        : data.telegram_bot_token ? maskSensitiveValue(decrypt(data.telegram_bot_token)) : null,
      brave_search_api_key: dto.brave_search_api_key
        ? maskSensitiveValue(dto.brave_search_api_key)
        : data.brave_search_api_key ? maskSensitiveValue(decrypt(data.brave_search_api_key)) : null,
    };
  }

  /**
   * Update AI provider config
   */
  async update(
    userId: string,
    accountId: string,
    dto: UpdateAiProviderDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user is owner/admin
    await this.accessControl.verifyAccountAccess(client, accountId, userId, [
      'owner',
      'admin',
    ]);

    // Get existing config
    const existing = await this.findOneRaw(accountId, accessToken);
    if (!existing) {
      throw new NotFoundException('AI provider config not found');
    }

    // Encrypt updated fields
    const updateData: any = {};
    if (dto.api_url) updateData.api_url = encrypt(dto.api_url);
    if (dto.api_key) updateData.api_key = encrypt(dto.api_key);
    if (dto.agent_id !== undefined) updateData.agent_id = dto.agent_id;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
    // Sprint 7: Extended OpenClaw credentials
    if (dto.openrouter_api_key !== undefined) {
      updateData.openrouter_api_key = dto.openrouter_api_key
        ? encrypt(dto.openrouter_api_key)
        : null;
    }
    if (dto.telegram_bot_token !== undefined) {
      updateData.telegram_bot_token = dto.telegram_bot_token
        ? encrypt(dto.telegram_bot_token)
        : null;
    }
    if (dto.brave_search_api_key !== undefined) {
      updateData.brave_search_api_key = dto.brave_search_api_key
        ? encrypt(dto.brave_search_api_key)
        : null;
    }

    const { data, error } = await client
      .from('ai_provider_configs')
      .update(updateData)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update AI provider config: ${error.message}`);
    }

    // Return with masked values
    return {
      ...data,
      api_url: dto.api_url || decrypt(data.api_url),
      api_key: dto.api_key
        ? maskSensitiveValue(dto.api_key)
        : maskSensitiveValue(decrypt(data.api_key)),
      api_key_masked: true,
    };
  }

  /**
   * Delete AI provider config
   */
  async remove(userId: string, accountId: string, accessToken: string) {
    const client = this.supabaseAdmin.getClient();

    // Verify user is owner/admin
    await this.accessControl.verifyAccountAccess(client, accountId, userId, [
      'owner',
      'admin',
    ]);

    const { error } = await client
      .from('ai_provider_configs')
      .delete()
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to delete AI provider config: ${error.message}`);
    }

    this.logger.log(`AI provider config deleted for account ${accountId}`);

    return { message: 'AI provider config deleted successfully' };
  }

  /**
   * Verify connection to OpenClaw instance
   * Uses the /v1/responses endpoint (OpenAI-compatible) with a minimal test prompt.
   * If no api_key is provided in the DTO, falls back to the stored (decrypted) key.
   */
  async verifyConnection(
    userId: string,
    accountId: string,
    dto: VerifyConnectionDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access to account
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Resolve API key: use provided key, or fall back to stored key
    let resolvedApiKey = dto.api_key;
    const apiUrl = dto.api_url;

    if (!resolvedApiKey || resolvedApiKey.includes('***')) {
      // No key provided or masked key — try to use stored config
      const stored = await this.findOneRaw(accountId, accessToken);
      if (stored?.api_key) {
        resolvedApiKey = stored.api_key;
        this.logger.log('Using stored API key for verification');
      } else {
        return {
          success: false,
          message: 'No API key provided and no stored key found. Please enter your API key.',
        };
      }
    }

    try {
      // Step 1: Quick HTTP reachability check
      const connectivityCheck = await fetch(apiUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });

      if (!connectivityCheck.ok) {
        throw new Error(
          `Cannot reach OpenClaw at ${apiUrl} (HTTP ${connectivityCheck.status})`,
        );
      }

      this.logger.log(`OpenClaw reachable at ${apiUrl}`);

      // Step 2: WebSocket auth check — OpenClaw uses WebSocket protocol
      const wsResult = await this.openClawService.testConnection({
        api_url: apiUrl,
        api_key: resolvedApiKey!,
        agent_id: dto.agent_id,
      });

      if (!wsResult) {
        throw new Error(
          'WebSocket authentication failed — check your API key',
        );
      }

      // Update verified_at if config exists
      await client
        .from('ai_provider_configs')
        .update({ verified_at: new Date().toISOString() })
        .eq('account_id', accountId)
        .eq('provider_type', 'openclaw');

      this.logger.log(`AI provider verified for account ${accountId}`);

      return {
        success: true,
        message: 'Connection to OpenClaw verified successfully (WebSocket + Auth)',
        verified_at: new Date().toISOString(),
        assistant_name: 'Ottimus Claw',
      };
    } catch (error) {
      this.logger.error(
        `AI provider verification failed for account ${accountId}:`,
        error.message,
      );

      return {
        success: false,
        message: error.message || 'Failed to connect to OpenClaw instance',
        error: error.message,
      };
    }
  }

  /**
   * Get raw config with decrypted values (for internal use)
   */
  private async findOneRaw(accountId: string, accessToken: string) {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('ai_provider_configs')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch AI provider config: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // Decrypt sensitive fields
    return {
      ...data,
      api_url: decrypt(data.api_url),
      api_key: decrypt(data.api_key),
      openrouter_api_key: data.openrouter_api_key
        ? decrypt(data.openrouter_api_key)
        : null,
      telegram_bot_token: data.telegram_bot_token
        ? decrypt(data.telegram_bot_token)
        : null,
      brave_search_api_key: data.brave_search_api_key
        ? decrypt(data.brave_search_api_key)
        : null,
    };
  }

  /**
   * Get decrypted config for making API calls (internal use only)
   */
  async getDecryptedConfig(accountId: string, accessToken: string) {
    const config = await this.findOneRaw(accountId, accessToken);

    if (!config || !config.is_active) {
      throw new NotFoundException('No active AI provider configured');
    }

    return config;
  }
}
