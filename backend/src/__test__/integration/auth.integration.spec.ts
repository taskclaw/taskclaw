/**
 * Auth Integration Test
 *
 * Wires the (local-JWT) AuthGuard + the real CacheService together. JwtService and
 * the Drizzle DB status lookup are mocked. Tests the full auth path including real
 * cache TTL behavior.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CacheService } from '../../common/cache.service';
import { ApiKeysService } from '../../auth/api-keys/api-keys.service';
import { DB } from '../../db';
import { createDrizzleMock } from '../mocks/drizzle.mock';

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

describe('[Integration] AuthGuard + CacheService', () => {
  let module: TestingModule;
  let guard: AuthGuard;
  let cacheService: CacheService;
  let dbMock: ReturnType<typeof createDrizzleMock>;

  const mockUser = { id: 'user-integration-test', email: 'test@example.com' };

  const mockJwt = { verifyAsync: jest.fn() };
  const mockApiKeysService = { validate: jest.fn() };

  /** Configure the users.status lookup to return a given status. */
  const setStatus = (status: string) =>
    dbMock.select.mockReturnValue(dbMock.makeBuilder([{ status }]));

  beforeEach(async () => {
    dbMock = createDrizzleMock();
    module = await Test.createTestingModule({
      providers: [
        AuthGuard,
        CacheService, // real cache service — tests actual TTL behavior
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('secret') } },
        { provide: ApiKeysService, useValue: mockApiKeysService },
        { provide: DB, useValue: dbMock.db },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
    cacheService = module.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    await module?.close();
    jest.clearAllMocks();
  });

  describe('User status caching with real CacheService', () => {
    it('queries DB on first request, uses cache on second request', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: mockUser.id, email: mockUser.email });
      setStatus('active');

      await guard.canActivate(buildContext({ authorization: 'Bearer jwt-token' }));
      expect(dbMock.select).toHaveBeenCalledTimes(1);

      await guard.canActivate(buildContext({ authorization: 'Bearer jwt-token' }));
      expect(dbMock.select).toHaveBeenCalledTimes(1); // cache hit — no 2nd query
    });

    it('re-queries DB if cache entry is manually cleared', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: mockUser.id });
      setStatus('active');

      await guard.canActivate(buildContext({ authorization: 'Bearer jwt-token' }));
      expect(dbMock.select).toHaveBeenCalledTimes(1);

      cacheService.delete(`user:${mockUser.id}:status`);

      await guard.canActivate(buildContext({ authorization: 'Bearer jwt-token' }));
      expect(dbMock.select).toHaveBeenCalledTimes(2);
    });
  });

  describe('API key path with real cache (no caching for API key auth)', () => {
    it('validates API key and does not set a cache entry', async () => {
      mockApiKeysService.validate.mockResolvedValue({
        userId: 'api-user',
        accountId: 'api-account',
        scopes: ['read', 'write'],
      });

      await guard.canActivate(buildContext({ 'x-api-key': 'tc_live_testkey123' }));
      expect(cacheService.get('user:api-user:status')).toBeUndefined();
    });
  });

  describe('suspended user scenario', () => {
    it('blocks request when status is suspended and caches the status', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'suspended-user' });
      setStatus('suspended');

      await expect(
        guard.canActivate(buildContext({ authorization: 'Bearer jwt' })),
      ).rejects.toThrow(UnauthorizedException);

      expect(cacheService.get('user:suspended-user:status')).toBe('suspended');
    });
  });
});
