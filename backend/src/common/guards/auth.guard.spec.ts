import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { createCacheMock } from '../../__test__/mocks/cache.mock';

// ─── Helper: build a minimal ExecutionContext from request headers ───────────

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

// ─── Supabase mock helpers ──────────────────────────────────────────────────

function makeSupabaseService(getUserResult: any, profileResult?: any) {
  const adminClient = {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn()
        .mockResolvedValue(
          profileResult ?? { data: { status: 'active' }, error: null },
        ),
    }),
  };

  return {
    getClient: jest.fn().mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue(getUserResult),
      },
    }),
    getAdminClient: jest.fn().mockReturnValue(adminClient),
  };
}

function makeApiKeysService(
  result: any = { userId: 'user-1', accountId: 'account-1', scopes: ['read'] },
) {
  return { validate: jest.fn().mockResolvedValue(result) };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AuthGuard', () => {
  let cacheMock: ReturnType<typeof createCacheMock>;

  beforeEach(() => {
    cacheMock = createCacheMock();
  });

  // ── API key via X-API-Key header ─────────────────────────────

  describe('API key authentication (X-API-Key header)', () => {
    it('validates api key and sets user, apiKeyAccountId, apiKeyScopes on request', async () => {
      const apiKeysService = makeApiKeysService();
      const supabaseService = makeSupabaseService({});
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        apiKeysService as any,
        cacheMock as any,
      );

      const context = buildContext({ 'x-api-key': 'tc_live_testkey' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(apiKeysService.validate).toHaveBeenCalledWith('tc_live_testkey');

      const req = context.switchToHttp().getRequest();
      expect(req.user).toEqual({ id: 'user-1' });
      expect(req.apiKeyAccountId).toBe('account-1');
      expect(req.apiKeyScopes).toEqual(['read']);
      expect(req.accessToken).toBeNull();
    });

    it('ignores X-API-Key header that does not start with tc_live_', async () => {
      const supabaseService = makeSupabaseService({
        data: { user: { id: 'jwt-user' } },
        error: null,
      });
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      // No Authorization header either → should throw
      const context = buildContext({ 'x-api-key': 'sk-someotherkey' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── API key via Bearer tc_live_ prefix ───────────────────────

  describe('API key via Bearer token prefix', () => {
    it('detects tc_live_ Bearer token as API key', async () => {
      const apiKeysService = makeApiKeysService();
      const supabaseService = makeSupabaseService({});
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        apiKeysService as any,
        cacheMock as any,
      );

      const context = buildContext({ authorization: 'Bearer tc_live_somekey' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(apiKeysService.validate).toHaveBeenCalledWith('tc_live_somekey');
    });
  });

  // ── JWT Bearer token path ────────────────────────────────────

  describe('JWT Bearer token authentication', () => {
    it('authenticates a valid JWT and sets user + accessToken', async () => {
      const mockUser = { id: 'jwt-user-id', email: 'test@example.com' };
      const supabaseService = makeSupabaseService(
        { data: { user: mockUser }, error: null },
        { data: { status: 'active' }, error: null },
      );
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      const context = buildContext({ authorization: 'Bearer valid.jwt.token' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      const req = context.switchToHttp().getRequest();
      expect(req.user).toEqual(mockUser);
      expect(req.accessToken).toBe('valid.jwt.token');
    });

    it('throws UnauthorizedException when no authorization header is present', async () => {
      const supabaseService = makeSupabaseService({
        data: { user: null },
        error: null,
      });
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      const context = buildContext({});
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when JWT is invalid (getUser returns error)', async () => {
      const supabaseService = makeSupabaseService({
        data: { user: null },
        error: { message: 'invalid jwt' },
      });
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      const context = buildContext({ authorization: 'Bearer bad.jwt' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when getUser returns no user', async () => {
      const supabaseService = makeSupabaseService({
        data: { user: null },
        error: null,
      });
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      const context = buildContext({ authorization: 'Bearer some.jwt' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── User status enforcement ──────────────────────────────────

  describe('User status enforcement', () => {
    it('allows access when user status is active', async () => {
      const mockUser = { id: 'user-active' };
      const supabaseService = makeSupabaseService(
        { data: { user: mockUser }, error: null },
        { data: { status: 'active' }, error: null },
      );
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      const context = buildContext({ authorization: 'Bearer jwt' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('throws UnauthorizedException when user status is suspended', async () => {
      const mockUser = { id: 'user-suspended' };
      const supabaseService = makeSupabaseService(
        { data: { user: mockUser }, error: null },
        { data: { status: 'suspended' }, error: null },
      );
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      const context = buildContext({ authorization: 'Bearer jwt' });
      const error = await guard.canActivate(context).catch((e) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toContain('pending approval or suspended');
    });

    it('throws UnauthorizedException when user status is pending', async () => {
      const mockUser = { id: 'user-pending' };
      const supabaseService = makeSupabaseService(
        { data: { user: mockUser }, error: null },
        { data: { status: 'pending' }, error: null },
      );
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      const context = buildContext({ authorization: 'Bearer jwt' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        'pending approval or suspended',
      );
    });
  });

  // ── Cache behavior ──────────────────────────────────────────

  describe('User status caching', () => {
    it('skips DB lookup on cache hit and uses cached status', async () => {
      const mockUser = { id: 'cached-user' };
      const supabaseService = makeSupabaseService({
        data: { user: mockUser },
        error: null,
      });
      // Pre-seed the cache
      cacheMock.seed(`user:${mockUser.id}:status`, 'active');

      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );
      const context = buildContext({ authorization: 'Bearer jwt' });
      await guard.canActivate(context);

      // Admin client should NOT be called since we had a cache hit
      expect(supabaseService.getAdminClient).not.toHaveBeenCalled();
    });

    it('stores status in cache after a DB lookup', async () => {
      const mockUser = { id: 'fresh-user' };
      const supabaseService = makeSupabaseService(
        { data: { user: mockUser }, error: null },
        { data: { status: 'active' }, error: null },
      );
      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );

      const context = buildContext({ authorization: 'Bearer jwt' });
      await guard.canActivate(context);

      expect(cacheMock.set).toHaveBeenCalledWith(
        `user:${mockUser.id}:status`,
        'active',
        300,
      );
    });

    it('assumes active status when status column missing (migration backward compat)', async () => {
      const mockUser = { id: 'compat-user' };
      const adminClient = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'column users.status does not exist' },
          }),
        }),
      };
      const supabaseService = {
        getClient: jest.fn().mockReturnValue({
          auth: {
            getUser: jest
              .fn()
              .mockResolvedValue({ data: { user: mockUser }, error: null }),
          },
        }),
        getAdminClient: jest.fn().mockReturnValue(adminClient),
      };

      const guard = new AuthGuard(
        supabaseService as any,
        {} as any,
        makeApiKeysService() as any,
        cacheMock as any,
      );
      const context = buildContext({ authorization: 'Bearer jwt' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
