import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../supabase/supabase.service';
import { ApiKeysService } from '../../auth/api-keys/api-keys.service';
import { CacheService } from '../cache.service';

// Cache user active-status for 5 minutes to avoid a DB query on every request
const USER_STATUS_TTL_SECONDS = 300;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    private readonly apiKeysService: ApiKeysService,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Check for API key first (X-API-Key header or Bearer tc_live_*)
    const apiKey = this.extractApiKey(request);
    if (apiKey) {
      return this.validateApiKey(request, apiKey);
    }

    // Fall back to JWT Bearer token
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const supabase = this.supabaseService.getClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('AuthGuard Error:', error);
      throw new UnauthorizedException();
    }

    // Attach user and token to request object
    request['user'] = user;
    request['accessToken'] = token;

    // Enforce user approval status (public.users.status)
    // Cache the result for USER_STATUS_TTL_SECONDS to avoid a DB query on every request.
    const cacheKey = `user:${user.id}:status`;
    let cachedStatus = this.cacheService.get<string>(cacheKey);

    if (!cachedStatus) {
      try {
        const adminSupabase = this.supabaseService.getAdminClient();
        const { data: profile, error: profileError } = await adminSupabase
          .from('users')
          .select('status')
          .eq('id', user.id)
          .single();

        if (!profileError) {
          cachedStatus = String(profile?.status || 'active').toLowerCase();
          this.cacheService.set(
            cacheKey,
            cachedStatus,
            USER_STATUS_TTL_SECONDS,
          );
        } else {
          // Backwards-compat if migration wasn't applied yet
          const msg = (profileError as any)?.message?.toLowerCase?.() || '';
          if (!msg.includes('status')) {
            console.error('AuthGuard status lookup error:', profileError);
            throw new UnauthorizedException();
          }
          cachedStatus = 'active'; // assume active if column doesn't exist yet
        }
      } catch (e) {
        if (e instanceof UnauthorizedException) throw e;
        console.error('AuthGuard status check failed:', e);
        throw new UnauthorizedException();
      }
    }

    if (cachedStatus !== 'active') {
      throw new UnauthorizedException(
        'Your account is pending approval or suspended.',
      );
    }

    return true;
  }

  private async validateApiKey(request: any, apiKey: string): Promise<boolean> {
    const { userId, accountId, scopes } =
      await this.apiKeysService.validate(apiKey);

    // Construct a minimal user object compatible with what JWT auth provides
    request['user'] = { id: userId };
    request['accessToken'] = null;
    request['apiKeyAccountId'] = accountId;
    request['apiKeyScopes'] = scopes;

    return true;
  }

  private extractApiKey(request: any): string | undefined {
    // Check X-API-Key header
    const xApiKey = request.headers['x-api-key'];
    if (
      xApiKey &&
      typeof xApiKey === 'string' &&
      xApiKey.startsWith('tc_live_')
    ) {
      return xApiKey;
    }

    // Check Bearer token with tc_live_ prefix
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token?.startsWith('tc_live_')) {
        return token;
      }
    }

    return undefined;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
