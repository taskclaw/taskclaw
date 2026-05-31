import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { aiProviderConfigs } from '../db/schema';
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
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
    @Inject(forwardRef(() => OpenClawService))
    private readonly openClawService: OpenClawService,
  ) {}

  /**
   * Re-key a Drizzle row (camelCase) to the snake_case column shape that
   * PostgREST returned, so the HTTP responses and internal consumers
   * (frontend reads `verified_at`/`provider_type`/...; openclaw.service reads
   * `api_url`/`api_key`/`agent_id`; the `is_active` gate) are byte-for-byte
   * compatible with the pre-migration behavior.
   */
  private toRow(data: typeof aiProviderConfigs.$inferSelect) {
    return {
      id: data.id,
      account_id: data.accountId,
      provider_type: data.providerType,
      api_url: data.apiUrl,
      api_key: data.apiKey,
      agent_id: data.agentId,
      is_active: data.isActive,
      verified_at: data.verifiedAt,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      openrouter_api_key: data.openrouterApiKey,
      telegram_bot_token: data.telegramBotToken,
      brave_search_api_key: data.braveSearchApiKey,
      migrated_to: data.migratedTo,
    };
  }

  /**
   * Get AI provider config for an account (with masked API key)
   */
  async findOne(userId: string, accountId: string, accessToken: string) {
    // Verify user has access to this account
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [data] = await this.db
      .select()
      .from(aiProviderConfigs)
      .where(eq(aiProviderConfigs.accountId, accountId))
      .limit(1);

    if (!data) {
      return null; // No AI provider configured yet
    }

    // Decrypt and mask sensitive fields for display
    return {
      ...this.toRow(data),
      api_url: decrypt(data.apiUrl),
      api_key: maskSensitiveValue(decrypt(data.apiKey)),
      api_key_masked: true, // Flag to indicate key is masked
      openrouter_api_key: data.openrouterApiKey
        ? maskSensitiveValue(decrypt(data.openrouterApiKey))
        : null,
      telegram_bot_token: data.telegramBotToken
        ? maskSensitiveValue(decrypt(data.telegramBotToken))
        : null,
      brave_search_api_key: data.braveSearchApiKey
        ? maskSensitiveValue(decrypt(data.braveSearchApiKey))
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
    // Verify user is owner/admin
    await this.accessControl.verifyAccountAccess(null, accountId, userId, [
      'owner',
      'admin',
    ]);

    // If api_key or api_url not provided, reuse existing encrypted values
    let existingEncrypted: typeof aiProviderConfigs.$inferSelect | null = null;
    if (!dto.api_key || !dto.api_url) {
      const [existing] = await this.db
        .select()
        .from(aiProviderConfigs)
        .where(eq(aiProviderConfigs.accountId, accountId))
        .limit(1);
      existingEncrypted = existing ?? null;
    }

    // Encrypt sensitive fields
    const encryptedData: Record<string, any> = {
      accountId: accountId,
      providerType: dto.provider_type || 'openclaw',
      apiUrl: dto.api_url ? encrypt(dto.api_url) : existingEncrypted?.apiUrl,
      apiKey: dto.api_key ? encrypt(dto.api_key) : existingEncrypted?.apiKey,
      agentId: dto.agent_id,
      isActive: dto.is_active ?? true,
    };

    if (!encryptedData.apiUrl || !encryptedData.apiKey) {
      throw new BadRequestException(
        'API URL and API key are required. Please provide them or ensure an existing configuration exists.',
      );
    }

    // Sprint 7: Extended OpenClaw credentials
    if (dto.openrouter_api_key !== undefined) {
      encryptedData.openrouterApiKey = dto.openrouter_api_key
        ? encrypt(dto.openrouter_api_key)
        : null;
    }
    if (dto.telegram_bot_token !== undefined) {
      encryptedData.telegramBotToken = dto.telegram_bot_token
        ? encrypt(dto.telegram_bot_token)
        : null;
    }
    if (dto.brave_search_api_key !== undefined) {
      encryptedData.braveSearchApiKey = dto.brave_search_api_key
        ? encrypt(dto.brave_search_api_key)
        : null;
    }

    const [data] = await this.db
      .insert(aiProviderConfigs)
      .values(encryptedData as typeof aiProviderConfigs.$inferInsert)
      .onConflictDoUpdate({
        target: [aiProviderConfigs.accountId, aiProviderConfigs.providerType],
        set: encryptedData,
      })
      .returning();

    this.logger.log(
      `AI provider config saved for account ${accountId}: ${dto.provider_type}`,
    );

    // Return with decrypted but masked values
    return {
      ...this.toRow(data),
      api_url: dto.api_url || decrypt(data.apiUrl),
      api_key: dto.api_key
        ? maskSensitiveValue(dto.api_key)
        : maskSensitiveValue(decrypt(data.apiKey)),
      api_key_masked: true,
      openrouter_api_key: dto.openrouter_api_key
        ? maskSensitiveValue(dto.openrouter_api_key)
        : data.openrouterApiKey
          ? maskSensitiveValue(decrypt(data.openrouterApiKey))
          : null,
      telegram_bot_token: dto.telegram_bot_token
        ? maskSensitiveValue(dto.telegram_bot_token)
        : data.telegramBotToken
          ? maskSensitiveValue(decrypt(data.telegramBotToken))
          : null,
      brave_search_api_key: dto.brave_search_api_key
        ? maskSensitiveValue(dto.brave_search_api_key)
        : data.braveSearchApiKey
          ? maskSensitiveValue(decrypt(data.braveSearchApiKey))
          : null,
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
    // Verify user is owner/admin
    await this.accessControl.verifyAccountAccess(null, accountId, userId, [
      'owner',
      'admin',
    ]);

    // Get existing config
    const existing = await this.findOneRaw(accountId, accessToken);
    if (!existing) {
      throw new NotFoundException('AI provider config not found');
    }

    // Encrypt updated fields
    const updateData: Partial<typeof aiProviderConfigs.$inferInsert> = {};
    if (dto.api_url) updateData.apiUrl = encrypt(dto.api_url);
    if (dto.api_key) updateData.apiKey = encrypt(dto.api_key);
    if (dto.agent_id !== undefined) updateData.agentId = dto.agent_id;
    if (dto.is_active !== undefined) updateData.isActive = dto.is_active;
    // Sprint 7: Extended OpenClaw credentials
    if (dto.openrouter_api_key !== undefined) {
      updateData.openrouterApiKey = dto.openrouter_api_key
        ? encrypt(dto.openrouter_api_key)
        : null;
    }
    if (dto.telegram_bot_token !== undefined) {
      updateData.telegramBotToken = dto.telegram_bot_token
        ? encrypt(dto.telegram_bot_token)
        : null;
    }
    if (dto.brave_search_api_key !== undefined) {
      updateData.braveSearchApiKey = dto.brave_search_api_key
        ? encrypt(dto.brave_search_api_key)
        : null;
    }

    const [data] = await this.db
      .update(aiProviderConfigs)
      .set(updateData)
      .where(eq(aiProviderConfigs.accountId, accountId))
      .returning();

    // Return with masked values
    return {
      ...this.toRow(data),
      api_url: dto.api_url || decrypt(data.apiUrl),
      api_key: dto.api_key
        ? maskSensitiveValue(dto.api_key)
        : maskSensitiveValue(decrypt(data.apiKey)),
      api_key_masked: true,
    };
  }

  /**
   * Delete AI provider config
   */
  async remove(userId: string, accountId: string, accessToken: string) {
    // Verify user is owner/admin
    await this.accessControl.verifyAccountAccess(null, accountId, userId, [
      'owner',
      'admin',
    ]);

    await this.db
      .delete(aiProviderConfigs)
      .where(eq(aiProviderConfigs.accountId, accountId));

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
    // Verify user has access to account
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

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
          message:
            'No API key provided and no stored key found. Please enter your API key.',
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
        throw new Error('WebSocket authentication failed — check your API key');
      }

      // Update verified_at if config exists
      await this.db
        .update(aiProviderConfigs)
        .set({ verifiedAt: new Date().toISOString() })
        .where(
          and(
            eq(aiProviderConfigs.accountId, accountId),
            eq(aiProviderConfigs.providerType, 'openclaw'),
          ),
        );

      this.logger.log(`AI provider verified for account ${accountId}`);

      return {
        success: true,
        message:
          'Connection to OpenClaw verified successfully (WebSocket + Auth)',
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
  private async findOneRaw(
    accountId: string,
    accessToken: string,
  ): Promise<any | null> {
    const [data] = await this.db
      .select()
      .from(aiProviderConfigs)
      .where(eq(aiProviderConfigs.accountId, accountId))
      .limit(1);

    if (!data) {
      return null;
    }

    // Decrypt sensitive fields. PostgREST returned snake_case columns; Drizzle
    // returns camelCase. Re-key (via toRow) the columns that downstream callers
    // (openclaw.service, openclaw-rpc.client, integrations.service, and the
    // `is_active` gate in getDecryptedConfig) read as snake_case.
    return {
      ...this.toRow(data),
      api_url: decrypt(data.apiUrl),
      api_key: decrypt(data.apiKey),
      openrouter_api_key: data.openrouterApiKey
        ? decrypt(data.openrouterApiKey)
        : null,
      telegram_bot_token: data.telegramBotToken
        ? decrypt(data.telegramBotToken)
        : null,
      brave_search_api_key: data.braveSearchApiKey
        ? decrypt(data.braveSearchApiKey)
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
