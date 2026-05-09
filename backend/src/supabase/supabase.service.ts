import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Singleton Supabase service. Clients are created once at startup and reused,
 * avoiding the overhead of creating new HTTP connection pools per request.
 *
 * - anonClient: uses the Anon Key (for public requests)
 * - adminClient: uses the Service Role Key (bypasses RLS)
 * - getAuthClient(token): creates a short-lived client for JWT validation only
 */
@Injectable()
export class SupabaseService {
  private readonly anonClient: SupabaseClient;
  private readonly adminClient: SupabaseClient;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL')!;
    const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY')!;
    const serviceKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    )!;

    this.anonClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    this.adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /**
   * Returns the admin (service-role) client for bypassing RLS.
   * Pass accessToken only if you need RLS-aware queries (rare).
   */
  getClient(accessToken?: string): SupabaseClient {
    // accessToken param kept for backwards-compat but ignored —
    // the singleton admin client is used for all service-layer queries.
    return this.adminClient;
  }

  /**
   * For auth checks (getUser), we MUST use the Anon Key + JWT so Supabase
   * can validate the token against GoTrue and return the user session.
   * A new client is created per call here intentionally — it carries the JWT header.
   */
  getAuthClient(accessToken: string): SupabaseClient {
    return createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      },
    );
  }

  /** Returns the singleton admin client (same as getClient()). */
  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }
}
