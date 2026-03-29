import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { AdapterRegistry } from '../adapters/adapter.registry';
import { CreateSourceDto } from './dto/create-source.dto';
import { UpdateSourceDto } from './dto/update-source.dto';

@Injectable()
export class SourcesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly accessControl: AccessControlHelper,
    private readonly adapterRegistry: AdapterRegistry,
  ) {}

  async findAll(userId: string, accountId: string) {
    await this.accessControl.verifyAccountAccess(
      this.supabase.getAdminClient(),
      accountId,
      userId,
    );

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('sources')
      .select('*, categories(*)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch sources: ${error.message}`);
    }

    // Mask sensitive config values in the response
    return data.map((source) => ({
      ...source,
      config: this.maskSensitiveConfig(source.config),
    }));
  }

  async findOne(userId: string, accountId: string, id: string) {
    await this.accessControl.verifyAccountAccess(
      this.supabase.getAdminClient(),
      accountId,
      userId,
    );

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('sources')
      .select('*, categories(*)')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Source with ID ${id} not found`);
    }

    return {
      ...data,
      config: this.maskSensitiveConfig(data.config),
    };
  }

  /**
   * Find a source without masking sensitive config values.
   * Used internally when we need the actual API keys (e.g. to fetch properties).
   */
  async findOneUnmasked(userId: string, accountId: string, id: string) {
    await this.accessControl.verifyAccountAccess(
      this.supabase.getAdminClient(),
      accountId,
      userId,
    );

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('sources')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Source with ID ${id} not found`);
    }

    return data;
  }

  async create(
    userId: string,
    accountId: string,
    createSourceDto: CreateSourceDto,
  ) {
    await this.accessControl.verifyAccountAccess(
      this.supabase.getAdminClient(),
      accountId,
      userId,
    );

    // Verify category exists and belongs to this account
    const { data: category, error: categoryError } = await this.supabase
      .getAdminClient()
      .from('categories')
      .select('id')
      .eq('id', createSourceDto.category_id)
      .eq('account_id', accountId)
      .single();

    if (categoryError || !category) {
      throw new BadRequestException('Invalid agent ID for this account');
    }

    // Validate config using the appropriate adapter
    const adapter = this.adapterRegistry.getAdapter(createSourceDto.provider);
    const validation = await adapter.validateConfig(createSourceDto.config);

    if (!validation.valid) {
      throw new BadRequestException(
        `Invalid ${createSourceDto.provider} configuration: ${validation.error}`,
      );
    }

    // Create the source
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('sources')
      .insert({
        account_id: accountId,
        category_id: createSourceDto.category_id,
        provider: createSourceDto.provider,
        config: createSourceDto.config,
        sync_interval_minutes: createSourceDto.sync_interval_minutes || 30,
        is_active: createSourceDto.is_active !== false, // Default to true
        sync_status: 'idle',
        connection_id: createSourceDto.connection_id || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create source: ${error.message}`);
    }

    return {
      ...data,
      config: this.maskSensitiveConfig(data.config),
    };
  }

  async update(
    userId: string,
    accountId: string,
    id: string,
    updateSourceDto: UpdateSourceDto,
  ) {
    await this.accessControl.verifyAccountAccess(
      this.supabase.getAdminClient(),
      accountId,
      userId,
    );

    // Verify source exists and belongs to account
    const existing = await this.findOne(userId, accountId, id);

    // If updating category, verify it belongs to this account
    if (updateSourceDto.category_id) {
      const { data: category, error: categoryError } = await this.supabase
        .getAdminClient()
        .from('categories')
        .select('id')
        .eq('id', updateSourceDto.category_id)
        .eq('account_id', accountId)
        .single();

      if (categoryError || !category) {
        throw new BadRequestException('Invalid agent ID for this account');
      }
    }

    // If updating config, validate it
    if (updateSourceDto.config) {
      const adapter = this.adapterRegistry.getAdapter(existing.provider);
      const validation = await adapter.validateConfig(updateSourceDto.config);

      if (!validation.valid) {
        throw new BadRequestException(
          `Invalid configuration: ${validation.error}`,
        );
      }
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('sources')
      .update(updateSourceDto)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update source: ${error.message}`);
    }

    return {
      ...data,
      config: this.maskSensitiveConfig(data.config),
    };
  }

  async remove(userId: string, accountId: string, id: string) {
    await this.accessControl.verifyAccountAccess(
      this.supabase.getAdminClient(),
      accountId,
      userId,
    );

    // Verify source exists and belongs to account
    await this.findOne(userId, accountId, id);

    const { error } = await this.supabase
      .getAdminClient()
      .from('sources')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to delete source: ${error.message}`);
    }

    return { message: 'Source deleted successfully' };
  }

  /**
   * Validate a source configuration without creating it
   */
  async validateSource(
    userId: string,
    accountId: string,
    provider: string,
    config: Record<string, any>,
  ) {
    await this.accessControl.verifyAccountAccess(
      this.supabase.getAdminClient(),
      accountId,
      userId,
    );

    const adapter = this.adapterRegistry.getAdapter(provider);
    return adapter.validateConfig(config);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private maskSensitiveConfig(
    config: Record<string, any>,
  ): Record<string, any> {
    const masked = { ...config };

    // Mask API keys, tokens, passwords
    const sensitiveKeys = [
      'api_key',
      'token',
      'password',
      'secret',
      'api_token',
    ];

    for (const key of Object.keys(masked)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        const value = String(masked[key] || '');
        masked[key] =
          value.length > 8
            ? `${value.slice(0, 4)}****${value.slice(-4)}`
            : '****';
      }
    }

    return masked;
  }
}
