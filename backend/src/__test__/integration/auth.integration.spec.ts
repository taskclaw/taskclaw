/**
 * Auth Integration Test
 *
 * Wires AuthGuard + CacheService together using real implementations.
 * Supabase's auth.getUser() and admin DB calls are mocked.
 *
 * Tests the full auth path including real cache TTL behavior.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CacheService } from '../../common/cache.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { ApiKeysService } from '../../auth/api-keys/api-keys.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildContext(headers: Record<string, string>): ExecutionContext {
  const request = {
    headers,
    user: undefined as any,
    accessToken: undefined as any,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('[Integration] AuthGuard + CacheService', () => {
  let module: TestingModule;
  let guard: AuthGuard;
  let cacheService: CacheService;

  const mockUser = { id: 'user-integration-test', email: 'test@example.com' };

  const mockSupabaseService = {
    getClient: jest.fn(),
    getAdminClient: jest.fn(),
  };

  const mockApiKeysService = {
    validate: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AuthGuard,
        CacheService, // real cache service — tests actual TTL behavior
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
    cacheService = module.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    await module?.close();
  });

  // ── JWT path: cache warms on first request, hits on second ──

  describe('User status caching with real CacheService', () => {
    it('queries DB on first request, uses cache on second request', async () => {
      const authClient = {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: mockUser }, error: null }),
      };
      const adminDb = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue({ data: { status: 'active' }, error: null }),
        }),
      };
      mockSupabaseService.getClient.mockReturnValue({ auth: authClient });
      mockSupabaseService.getAdminClient.mockReturnValue(adminDb);

      const context1 = buildContext({ authorization: 'Bearer jwt-token' });
      const context2 = buildContext({ authorization: 'Bearer jwt-token' });

      // First request — should query DB
      await guard.canActivate(context1);
      expect(adminDb.from).toHaveBeenCalledTimes(1);

      // Second request — should use cache (no second DB call)
      await guard.canActivate(context2);
      expect(adminDb.from).toHaveBeenCalledTimes(1); // still 1 — cache hit
    });

    it('re-queries DB if cache entry is manually cleared', async () => {
      const authClient = {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: mockUser }, error: null }),
      };
      const adminDb = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue({ data: { status: 'active' }, error: null }),
        }),
      };
      mockSupabaseService.getClient.mockReturnValue({ auth: authClient });
      mockSupabaseService.getAdminClient.mockReturnValue(adminDb);

      const context = buildContext({ authorization: 'Bearer jwt-token' });

      await guard.canActivate(context);
      expect(adminDb.from).toHaveBeenCalledTimes(1);

      // Simulate cache invalidation (e.g., admin updates user status)
      cacheService.delete(`user:${mockUser.id}:status`);

      await guard.canActivate(context);
      expect(adminDb.from).toHaveBeenCalledTimes(2); // DB queried again
    });
  });

  // ── API key path ─────────────────────────────────────────────

  describe('API key path with real cache (no caching for API key auth)', () => {
    it('validates API key and does not set a cache entry', async () => {
      mockApiKeysService.validate.mockResolvedValue({
        userId: 'api-user',
        accountId: 'api-account',
        scopes: ['read', 'write'],
      });

      const context = buildContext({ 'x-api-key': 'tc_live_testkey123' });
      await guard.canActivate(context);

      // No cache entry should have been set for API key auth
      expect(cacheService.get('user:api-user:status')).toBeUndefined();
    });
  });

  // ── Suspended user cached then changed ──────────────────────

  describe('suspended user scenario', () => {
    it('blocks request immediately when status is suspended', async () => {
      const suspendedUser = { id: 'suspended-user' };
      const authClient = {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: suspendedUser }, error: null }),
      };
      const adminDb = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue({ data: { status: 'suspended' }, error: null }),
        }),
      };
      mockSupabaseService.getClient.mockReturnValue({ auth: authClient });
      mockSupabaseService.getAdminClient.mockReturnValue(adminDb);

      const context = buildContext({ authorization: 'Bearer jwt' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );

      // Status was cached even for suspended (so subsequent requests are fast)
      expect(cacheService.get(`user:${suspendedUser.id}:status`)).toBe(
        'suspended',
      );
    });
  });
});
