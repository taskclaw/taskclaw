import { Injectable, Inject, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable({ scope: Scope.REQUEST })
export class SupabaseService {
  private client: SupabaseClient;

  constructor(private configService: ConfigService) {}

  getClient(accessToken?: string) {
    // If we have an access token (authenticated request), we use the Service Role Key
    // to bypass RLS, because we will enforce access control in the Service Layer.
    // We do NOT pass the JWT to Supabase, because mixing Service Role + JWT is dangerous/broken.
    if (accessToken) {
      return createClient(
        this.configService.get<string>('SUPABASE_URL')!,
        this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );
    }

    // For public/unauthenticated requests, we can still use the Anon Key
    if (this.client) {
      return this.client;
    }

    this.client = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
    );

    return this.client;
  }

  getAuthClient(accessToken: string) {
    // For auth checks (getUser), we MUST use the Anon Key + JWT
    // This allows Supabase to validate the token and return the user session
    return createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      },
    );
  }
  getAdminClient() {
    return createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }
}
