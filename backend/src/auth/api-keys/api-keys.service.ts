import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';

const KEY_PREFIX = 'tc_live_';

@Injectable()
export class ApiKeysService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private getClient() {
    return this.supabaseAdmin.getClient();
  }

  private hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  /**
   * Create a new API key. Returns the full raw key ONCE.
   */
  async create(
    accountId: string,
    userId: string,
    name: string,
    scopes: string[] = [],
    expiresAt?: string,
  ) {
    const randomPart = randomBytes(32).toString('hex');
    const rawKey = `${KEY_PREFIX}${randomPart}`;
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12);

    const { data, error } = await this.getClient()
      .from('api_keys')
      .insert({
        account_id: accountId,
        user_id: userId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name,
        scopes,
        expires_at: expiresAt || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create API key: ${error.message}`);
    }

    // Return the full key only on creation
    return {
      ...data,
      key: rawKey,
    };
  }

  /**
   * List API keys for an account (masked — never returns full key or hash).
   */
  async findAll(accountId: string) {
    const { data, error } = await this.getClient()
      .from('api_keys')
      .select('id, account_id, user_id, key_prefix, name, scopes, last_used_at, expires_at, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list API keys: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete/revoke an API key.
   */
  async remove(accountId: string, keyId: string) {
    const { data, error } = await this.getClient()
      .from('api_keys')
      .delete()
      .eq('id', keyId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('API key not found');
    }

    return { success: true };
  }

  /**
   * Validate an API key and return the associated user/account info.
   * Used by the auth guard.
   */
  async validate(rawKey: string): Promise<{
    userId: string;
    accountId: string;
    scopes: string[];
  }> {
    if (!rawKey.startsWith(KEY_PREFIX)) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const keyHash = this.hashKey(rawKey);

    const { data, error } = await this.getClient()
      .from('api_keys')
      .select('id, account_id, user_id, scopes, expires_at')
      .eq('key_hash', keyHash)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Update last_used_at (fire and forget)
    this.getClient()
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then();

    return {
      userId: data.user_id,
      accountId: data.account_id,
      scopes: data.scopes || [],
    };
  }
}
