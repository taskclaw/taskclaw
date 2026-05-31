import {
  Injectable,
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { apiKeys } from '../../db/schema';

const KEY_PREFIX = 'tc_live_';

@Injectable()
export class ApiKeysService {
  constructor(@Inject(DB) private readonly db: Db) {}

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

    let data: typeof apiKeys.$inferSelect;
    try {
      const [row] = await this.db
        .insert(apiKeys)
        .values({
          accountId,
          userId,
          keyHash,
          keyPrefix,
          name,
          scopes,
          expiresAt: expiresAt || null,
        })
        .returning();
      data = row;
    } catch (e) {
      throw new Error(
        `Failed to create API key: ${e instanceof Error ? e.message : String(e)}`,
      );
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
    return this.db
      .select({
        id: apiKeys.id,
        account_id: apiKeys.accountId,
        user_id: apiKeys.userId,
        key_prefix: apiKeys.keyPrefix,
        name: apiKeys.name,
        scopes: apiKeys.scopes,
        last_used_at: apiKeys.lastUsedAt,
        expires_at: apiKeys.expiresAt,
        created_at: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.accountId, accountId))
      .orderBy(desc(apiKeys.createdAt));
  }

  /**
   * Delete/revoke an API key.
   */
  async remove(accountId: string, keyId: string) {
    const deleted = await this.db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.accountId, accountId)))
      .returning();

    if (deleted.length === 0) {
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

    const [data] = await this.db
      .select({
        id: apiKeys.id,
        account_id: apiKeys.accountId,
        user_id: apiKeys.userId,
        scopes: apiKeys.scopes,
        expires_at: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!data) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Update last_used_at (fire and forget)
    void this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, data.id))
      .catch(() => undefined);

    return {
      userId: data.user_id,
      accountId: data.account_id,
      scopes: (data.scopes as string[]) || [],
    };
  }
}
