import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { createCacheMock } from '../../__test__/mocks/cache.mock';
import { createDrizzleMock } from '../../__test__/mocks/drizzle.mock';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** JwtService mock: resolves to `payload`, or rejects when payload is null. */
function makeJwt(payload: any) {
  return {
    verifyAsync: jest.fn(() =>
      payload ? Promise.resolve(payload) : Promise.reject(new Error('invalid')),
    ),
  };
}

const makeConfig = () => ({ get: jest.fn().mockReturnValue('test-secret') });

function makeApiKeysService(
  result: any = { userId: 'user-1', accountId: 'account-1', scopes: ['read'] },
) {
  return { validate: jest.fn().mockResolvedValue(result) };
}

/** Drizzle mock whose users status lookup returns `statusRow` (or [] for none). */
function makeDb(statusRow?: { status: string }) {
  const mock = createDrizzleMock();
  mock.select.mockReturnValue(mock.makeBuilder(statusRow ? [statusRow] : []));
  return mock;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthGuard', () => {
  let cacheMock: ReturnType<typeof createCacheMock>;

  beforeEach(() => {
    cacheMock = createCacheMock();
  });

  describe('API key authentication (X-API-Key header)', () => {
    it('validates api key and sets user/account/scopes on request', async () => {
      const apiKeysService = makeApiKeysService();
      const guard = new AuthGuard(
        makeJwt(null) as any,
        makeConfig() as any,
        apiKeysService as any,
        cacheMock as any,
        makeDb().db as any,
      );

      const context = buildContext({ 'x-api-key': 'tc_live_testkey' });
      expect(await guard.canActivate(context)).toBe(true);
      expect(apiKeysService.validate).toHaveBeenCalledWith('tc_live_testkey');

      const req = context.switchToHttp().getRequest();
      expect(req.user).toEqual({ id: 'user-1' });
      expect(req.apiKeyAccountId).toBe('account-1');
      expect(req.apiKeyScopes).toEqual(['read']);
      expect(req.accessToken).toBeNull();
    });

    it('ignores X-API-Key not starting with tc_live_ and falls through to JWT (none → 401)', async () => {
      const guard = new AuthGuard(
        makeJwt({ sub: 'u' }) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb({ status: 'active' }).db as any,
      );
      const context = buildContext({ 'x-api-key': 'sk-someotherkey' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('API key via Bearer token prefix', () => {
    it('detects tc_live_ Bearer token as API key', async () => {
      const apiKeysService = makeApiKeysService();
      const guard = new AuthGuard(
        makeJwt(null) as any,
        makeConfig() as any,
        apiKeysService as any,
        cacheMock as any,
        makeDb().db as any,
      );
      const context = buildContext({ authorization: 'Bearer tc_live_somekey' });
      expect(await guard.canActivate(context)).toBe(true);
      expect(apiKeysService.validate).toHaveBeenCalledWith('tc_live_somekey');
    });
  });

  describe('JWT Bearer token authentication', () => {
    it('authenticates a valid JWT and sets user + accessToken', async () => {
      const guard = new AuthGuard(
        makeJwt({ sub: 'jwt-user-id', email: 'test@example.com' }) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb({ status: 'active' }).db as any,
      );
      const context = buildContext({ authorization: 'Bearer valid.jwt.token' });
      expect(await guard.canActivate(context)).toBe(true);
      const req = context.switchToHttp().getRequest();
      expect(req.user).toEqual({ id: 'jwt-user-id', email: 'test@example.com' });
      expect(req.accessToken).toBe('valid.jwt.token');
    });

    it('throws when no authorization header is present', async () => {
      const guard = new AuthGuard(
        makeJwt(null) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb().db as any,
      );
      await expect(guard.canActivate(buildContext({}))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when JWT verification fails', async () => {
      const guard = new AuthGuard(
        makeJwt(null) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb().db as any,
      );
      const context = buildContext({ authorization: 'Bearer bad.jwt' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the user row does not exist', async () => {
      const guard = new AuthGuard(
        makeJwt({ sub: 'ghost' }) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb(undefined).db as any, // no row
      );
      const context = buildContext({ authorization: 'Bearer some.jwt' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('User status enforcement', () => {
    it('allows access when status is active', async () => {
      const guard = new AuthGuard(
        makeJwt({ sub: 'user-active' }) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb({ status: 'active' }).db as any,
      );
      await expect(
        guard.canActivate(buildContext({ authorization: 'Bearer jwt' })),
      ).resolves.toBe(true);
    });

    it('throws when status is suspended', async () => {
      const guard = new AuthGuard(
        makeJwt({ sub: 'user-suspended' }) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb({ status: 'suspended' }).db as any,
      );
      const error = await guard
        .canActivate(buildContext({ authorization: 'Bearer jwt' }))
        .catch((e) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toContain('pending approval or suspended');
    });

    it('throws when status is pending', async () => {
      const guard = new AuthGuard(
        makeJwt({ sub: 'user-pending' }) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb({ status: 'pending' }).db as any,
      );
      await expect(
        guard.canActivate(buildContext({ authorization: 'Bearer jwt' })),
      ).rejects.toThrow('pending approval or suspended');
    });
  });

  describe('User status caching', () => {
    it('skips DB lookup on cache hit', async () => {
      const db = makeDb({ status: 'active' });
      cacheMock.seed(`user:cached-user:status`, 'active');
      const guard = new AuthGuard(
        makeJwt({ sub: 'cached-user' }) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        db.db as any,
      );
      await guard.canActivate(buildContext({ authorization: 'Bearer jwt' }));
      expect(db.select).not.toHaveBeenCalled();
    });

    it('stores status in cache after a DB lookup', async () => {
      const guard = new AuthGuard(
        makeJwt({ sub: 'fresh-user' }) as any,
        makeConfig() as any,
        makeApiKeysService() as any,
        cacheMock as any,
        makeDb({ status: 'active' }).db as any,
      );
      await guard.canActivate(buildContext({ authorization: 'Bearer jwt' }));
      expect(cacheMock.set).toHaveBeenCalledWith(
        `user:fresh-user:status`,
        'active',
        300,
      );
    });
  });
});
