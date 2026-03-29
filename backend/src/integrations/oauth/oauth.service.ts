import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import { IntegrationsService } from '../integrations.service';
import { Cron, CronExpression } from '@nestjs/schedule';

interface OAuthState {
  accountId: string;
  definitionId: string;
  userId: string;
  codeVerifier: string;
  createdAt: number;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  // In-memory state storage (state -> OAuthState)
  private readonly stateStore = new Map<string, OAuthState>();
  // In-memory lock map for token refresh concurrency
  private readonly refreshLocks = new Map<string, boolean>();

  // Cleanup stale state entries older than 10 minutes
  private readonly STATE_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly integrationsService: IntegrationsService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // PKCE UTILITIES
  // ═══════════════════════════════════════════════════════════

  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  // ═══════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  storeState(state: string, data: OAuthState): void {
    this.stateStore.set(state, data);
  }

  validateAndConsumeState(state: string): OAuthState {
    const data = this.stateStore.get(state);
    if (!data) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    // Check TTL
    if (Date.now() - data.createdAt > this.STATE_TTL_MS) {
      this.stateStore.delete(state);
      throw new BadRequestException('OAuth state has expired');
    }

    this.stateStore.delete(state);
    return data;
  }

  // ═══════════════════════════════════════════════════════════
  // AUTHORIZE — Build redirect URL
  // ═══════════════════════════════════════════════════════════

  async buildAuthorizeUrl(
    userId: string,
    accountId: string,
    definitionId: string,
    callbackUrl: string,
  ): Promise<{ redirect_url: string }> {
    const client = this.supabaseAdmin.getClient();

    const { data: def, error } = await client
      .from('integration_definitions')
      .select('auth_type, auth_config')
      .eq('id', definitionId)
      .single();

    if (error || !def) {
      throw new BadRequestException('Integration definition not found');
    }

    if (def.auth_type !== 'oauth2') {
      throw new BadRequestException('This integration does not use OAuth2');
    }

    const authConfig = def.auth_config;
    if (!authConfig?.authorization_url) {
      throw new BadRequestException('OAuth2 authorization_url not configured');
    }

    // Generate PKCE
    const { codeVerifier, codeChallenge } = this.generatePKCE();

    // Generate state token
    const state = crypto.randomBytes(32).toString('hex');
    this.storeState(state, {
      accountId,
      definitionId,
      userId,
      codeVerifier,
      createdAt: Date.now(),
    });

    // Build authorization URL
    const url = new URL(authConfig.authorization_url);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', callbackUrl);

    if (authConfig.client_id) {
      url.searchParams.set('client_id', authConfig.client_id);
    }

    if (authConfig.default_scopes?.length) {
      const separator = authConfig.scope_separator || ' ';
      url.searchParams.set('scope', authConfig.default_scopes.join(separator));
    }

    if (authConfig.pkce !== false) {
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    return { redirect_url: url.toString() };
  }

  // ═══════════════════════════════════════════════════════════
  // CALLBACK — Exchange code for tokens
  // ═══════════════════════════════════════════════════════════

  async handleCallback(
    code: string,
    state: string,
    callbackUrl: string,
  ): Promise<{ accountId: string; definitionSlug: string }> {
    // Validate state
    const stateData = this.validateAndConsumeState(state);

    const client = this.supabaseAdmin.getClient();

    // Get definition auth_config
    const { data: def, error: defError } = await client
      .from('integration_definitions')
      .select('id, slug, auth_config')
      .eq('id', stateData.definitionId)
      .single();

    if (defError || !def) {
      throw new BadRequestException('Integration definition not found');
    }

    const authConfig = def.auth_config;

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCode(
      code,
      authConfig,
      stateData.codeVerifier,
      callbackUrl,
    );

    // Encrypt the entire token response as credentials blob
    const encryptedCredentials = this.integrationsService.encryptCredentials(
      tokenResponse.credentials,
    );

    // Calculate token expiry
    const tokenExpiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : null;

    // Upsert connection
    const { data: existingConn } = await client
      .from('integration_connections')
      .select('id')
      .eq('account_id', stateData.accountId)
      .eq('definition_id', stateData.definitionId)
      .single();

    if (existingConn) {
      await client
        .from('integration_connections')
        .update({
          credentials: encryptedCredentials,
          status: 'active',
          token_expires_at: tokenExpiresAt,
          scopes: tokenResponse.scope
            ? tokenResponse.scope.split(/[, ]+/)
            : null,
          verified_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', existingConn.id);
    } else {
      await client.from('integration_connections').insert({
        account_id: stateData.accountId,
        definition_id: stateData.definitionId,
        credentials: encryptedCredentials,
        status: 'active',
        token_expires_at: tokenExpiresAt,
        scopes: tokenResponse.scope ? tokenResponse.scope.split(/[, ]+/) : null,
        verified_at: new Date().toISOString(),
      });
    }

    return {
      accountId: stateData.accountId,
      definitionSlug: def.slug,
    };
  }

  private async exchangeCode(
    code: string,
    authConfig: any,
    codeVerifier: string,
    callbackUrl: string,
  ): Promise<{
    credentials: Record<string, string>;
    expires_in?: number;
    scope?: string;
  }> {
    if (!authConfig.token_url) {
      throw new BadRequestException('token_url not configured');
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', callbackUrl);

    if (authConfig.client_id) {
      body.set('client_id', authConfig.client_id);
    }
    if (authConfig.client_secret) {
      body.set('client_secret', authConfig.client_secret);
    }
    if (authConfig.pkce !== false) {
      body.set('code_verifier', codeVerifier);
    }

    const response = await fetch(authConfig.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `OAuth token exchange failed: ${response.status} - ${errorText}`,
      );
      throw new BadRequestException(
        'Failed to exchange authorization code for tokens',
      );
    }

    const tokenData = await response.json();

    return {
      credentials: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || '',
        token_type: tokenData.token_type || 'Bearer',
      },
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // TOKEN REFRESH (Cron)
  // ═══════════════════════════════════════════════════════════

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshExpiringSoonTokens() {
    const client = this.supabaseAdmin.getClient();

    // Find connections expiring within 10 minutes
    const tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: connections, error } = await client
      .from('integration_connections')
      .select(
        'id, credentials, definition:integration_definitions(auth_config)',
      )
      .eq('status', 'active')
      .not('token_expires_at', 'is', null)
      .lt('token_expires_at', tenMinFromNow);

    if (error || !connections?.length) return;

    for (const conn of connections) {
      // Concurrency lock
      if (this.refreshLocks.get(conn.id)) continue;
      this.refreshLocks.set(conn.id, true);

      try {
        await this.refreshToken(conn);
      } catch (err) {
        this.logger.error(
          `Failed to refresh token for connection ${conn.id}: ${err.message}`,
        );
      } finally {
        this.refreshLocks.delete(conn.id);
      }
    }
  }

  private async refreshToken(conn: any) {
    const authConfig = conn.definition?.auth_config;
    const refreshUrl = authConfig?.refresh_url || authConfig?.token_url;

    if (!refreshUrl || !conn.credentials) {
      return;
    }

    let decrypted: Record<string, string>;
    try {
      decrypted = this.integrationsService.decryptCredentials(conn.credentials);
    } catch {
      this.logger.warn(`Cannot decrypt credentials for connection ${conn.id}`);
      return;
    }

    if (!decrypted.refresh_token) {
      return;
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', decrypted.refresh_token);

    if (authConfig.client_id) body.set('client_id', authConfig.client_id);
    if (authConfig.client_secret)
      body.set('client_secret', authConfig.client_secret);

    try {
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const tokenData = await response.json();

      const newCredentials: Record<string, string> = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || decrypted.refresh_token,
        token_type: tokenData.token_type || 'Bearer',
      };

      const encryptedCredentials =
        this.integrationsService.encryptCredentials(newCredentials);
      const tokenExpiresAt = tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null;

      const client = this.supabaseAdmin.getClient();
      await client
        .from('integration_connections')
        .update({
          credentials: encryptedCredentials,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          error_message: null,
        })
        .eq('id', conn.id);

      this.logger.log(`Refreshed token for connection ${conn.id}`);
    } catch (err) {
      this.logger.error(
        `Token refresh failed for connection ${conn.id}: ${err.message}`,
      );

      const client = this.supabaseAdmin.getClient();
      await client
        .from('integration_connections')
        .update({
          status: 'expired',
          error_message: `Token refresh failed: ${err.message}`,
        })
        .eq('id', conn.id);
    }
  }

  // Cleanup stale state entries periodically
  @Cron(CronExpression.EVERY_10_MINUTES)
  cleanupStaleState() {
    const now = Date.now();
    for (const [key, value] of this.stateStore.entries()) {
      if (now - value.createdAt > this.STATE_TTL_MS) {
        this.stateStore.delete(key);
      }
    }
  }
}
