import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { ApiKeysService } from '../../auth/api-keys/api-keys.service';
import { CacheService } from '../cache.service';
import { DB, type Db } from '../../db';
import { users } from '../../db/schema';

// Cache user active-status for 5 minutes to avoid a DB query on every request
const USER_STATUS_TTL_SECONDS = 300;

/**
 * Auth guard (Epic 1).
 *
 * - API-key path: unchanged (X-API-Key / Bearer tc_live_*).
 * - JWT path: local `jwt.verify` with the shared JWT_SECRET. This validates BOTH
 *   locally-issued tokens and any in-flight GoTrue tokens (same secret), so no flag
 *   branch is needed here during the cutover.
 * - Status gate: reads public.users.status via Drizzle, cached 5 min.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly configService: ConfigService,
    private readonly apiKeysService: ApiKeysService,
    private readonly cacheService: CacheService,
    @Inject(DB) private readonly db: Db,
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

    let payload: { sub?: string; email?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    // Preserve the downstream contract exactly: request.user.id
    request['user'] = { id: payload.sub, email: payload.email };
    request['accessToken'] = token;

    // Enforce user approval status (public.users.status), cached to avoid a per-request query.
    const cacheKey = `user:${payload.sub}:status`;
    let cachedStatus = this.cacheService.get<string>(cacheKey);

    if (!cachedStatus) {
      const [profile] = await this.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (!profile) {
        throw new UnauthorizedException();
      }
      cachedStatus = String(profile.status || 'active').toLowerCase();
      this.cacheService.set(cacheKey, cachedStatus, USER_STATUS_TTL_SECONDS);
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
