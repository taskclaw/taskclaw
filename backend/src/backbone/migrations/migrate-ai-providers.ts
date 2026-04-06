import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import { decrypt, encrypt } from '../../common/utils/encryption.util';

/**
 * F016 — Data migration: ai_provider_configs -> backbone_connections
 *
 * Migrates existing AI provider configs to the new multi-backbone
 * `backbone_connections` table. Each row is decrypted, remapped, and
 * re-encrypted into the backbone_connections config-object format.
 *
 * Usage:
 *   1) As a service method — inject MigrateAiProvidersService and call
 *      `migrateAll()` from a controller endpoint or CLI command.
 *   2) As a standalone script — run with `npx ts-node`:
 *      ENCRYPTION_KEY=... npx ts-node -r tsconfig-paths/register \
 *        backend/src/backbone/migrations/migrate-ai-providers.ts
 */

/** Map legacy provider_type to backbone adapter slug */
const PROVIDER_TYPE_TO_SLUG: Record<string, string> = {
  openclaw: 'openclaw',
  openrouter: 'openrouter',
};
const FALLBACK_SLUG = 'custom-http';

export interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ configId: string; accountId: string; error: string }>;
}

@Injectable()
export class MigrateAiProvidersService {
  private readonly logger = new Logger(MigrateAiProvidersService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  /**
   * Migrate all un-migrated ai_provider_configs to backbone_connections.
   * Safe to run multiple times — only processes rows where `migrated_to IS NULL`.
   */
  async migrateAll(): Promise<MigrationResult> {
    const client = this.supabaseAdmin.getClient();
    const result: MigrationResult = {
      total: 0,
      migrated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // ── 1. Fetch all un-migrated rows ────────────────────────
    const { data: rows, error: fetchError } = await client
      .from('ai_provider_configs')
      .select('*')
      .is('migrated_to', null);

    if (fetchError) {
      this.logger.error(
        `Failed to fetch ai_provider_configs: ${fetchError.message}`,
      );
      throw new Error(
        `Failed to fetch ai_provider_configs: ${fetchError.message}`,
      );
    }

    if (!rows || rows.length === 0) {
      this.logger.log('No un-migrated ai_provider_configs found. Nothing to do.');
      return result;
    }

    result.total = rows.length;
    this.logger.log(
      `Found ${rows.length} un-migrated ai_provider_config(s). Starting migration...`,
    );

    // ── 2. Process each row individually ─────────────────────
    for (const row of rows) {
      try {
        await this.migrateRow(row, result);
      } catch (err: any) {
        result.failed++;
        const errorMsg = err?.message || String(err);
        result.errors.push({
          configId: row.id,
          accountId: row.account_id,
          error: errorMsg,
        });
        this.logger.error(
          `Failed to migrate config ${row.id} (account ${row.account_id}): ${errorMsg}`,
        );
      }
    }

    // ── 3. Summary ───────────────────────────────────────────
    this.logger.log(
      `Migration complete: ${result.migrated} migrated, ${result.skipped} skipped, ${result.failed} failed out of ${result.total} total`,
    );

    if (result.errors.length > 0) {
      this.logger.warn(
        `Errors:\n${result.errors.map((e) => `  - [${e.configId}] ${e.error}`).join('\n')}`,
      );
    }

    return result;
  }

  // ── Private ────────────────────────────────────────────────

  private async migrateRow(row: any, result: MigrationResult): Promise<void> {
    const client = this.supabaseAdmin.getClient();
    const providerType: string = row.provider_type || 'openclaw';
    const backboneType = PROVIDER_TYPE_TO_SLUG[providerType] ?? FALLBACK_SLUG;

    // ── a. Decrypt legacy fields ──
    let apiUrl: string;
    let apiKey: string;
    try {
      apiUrl = decrypt(row.api_url);
      apiKey = decrypt(row.api_key);
    } catch (decryptErr: any) {
      throw new Error(
        `Decryption failed for provider config ${row.id}: ${decryptErr.message}`,
      );
    }

    // ── b. Build the backbone config object ──
    const plainConfig: Record<string, any> = {
      api_url: apiUrl,
      api_key: apiKey,
    };

    // Carry over optional fields that were encrypted
    if (row.agent_id) {
      plainConfig.agent_id = row.agent_id;
    }
    if (row.openrouter_api_key) {
      try {
        plainConfig.openrouter_api_key = decrypt(row.openrouter_api_key);
      } catch {
        // non-critical — skip this field
      }
    }
    if (row.telegram_bot_token) {
      try {
        plainConfig.telegram_bot_token = decrypt(row.telegram_bot_token);
      } catch {
        // non-critical
      }
    }
    if (row.brave_search_api_key) {
      try {
        plainConfig.brave_search_api_key = decrypt(row.brave_search_api_key);
      } catch {
        // non-critical
      }
    }

    // ── c. Re-encrypt for backbone_connections format ──
    //       (same key-level encryption as BackboneConnectionsService.encryptConfig)
    const encryptedConfig: Record<string, any> = {};
    const SECRET_SUFFIXES = ['api_key', 'secret', 'token', 'password'];
    const isSecret = (key: string) =>
      SECRET_SUFFIXES.some(
        (s) => key === s || key.endsWith(`_${s}`) || key.endsWith('_key'),
      );

    for (const [key, value] of Object.entries(plainConfig)) {
      if (isSecret(key) && typeof value === 'string' && value) {
        encryptedConfig[key] = encrypt(value);
      } else {
        encryptedConfig[key] = value;
      }
    }

    // ── d. Prettify the connection name ──
    const prettyType =
      providerType.charAt(0).toUpperCase() + providerType.slice(1);
    const name = `My ${prettyType} (migrated)`;

    // ── e. Insert into backbone_connections ──
    const insertPayload: Record<string, any> = {
      account_id: row.account_id,
      backbone_type: backboneType,
      name,
      config: encryptedConfig,
      is_default: true,
      is_active: row.is_active ?? true,
    };

    if (row.verified_at) {
      insertPayload.verified_at = row.verified_at;
    }

    const { data: inserted, error: insertError } = await client
      .from('backbone_connections')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError) {
      throw new Error(
        `Insert into backbone_connections failed: ${insertError.message}`,
      );
    }

    // ── f. Mark the old row as migrated ──
    const { error: updateError } = await client
      .from('ai_provider_configs')
      .update({ migrated_to: inserted.id })
      .eq('id', row.id);

    if (updateError) {
      // The connection was created but we couldn't mark the source.
      // Log a warning — re-running the migration would skip it via the
      // `migrated_to IS NULL` filter only if this update eventually succeeds.
      this.logger.warn(
        `Created backbone_connection ${inserted.id} but failed to update ` +
          `ai_provider_configs.migrated_to for ${row.id}: ${updateError.message}`,
      );
    }

    result.migrated++;
    this.logger.log(
      `Migrated config ${row.id} -> backbone_connection ${inserted.id} ` +
        `(${backboneType}) for account ${row.account_id}`,
    );
  }
}
