import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessControlHelper } from './access-control.helper';
import { createCacheMock } from '../../__test__/mocks/cache.mock';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSupabaseClient(membershipResult: any, projectResult?: any) {
  const membershipQuery = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(membershipResult),
  };

  const client: any = {
    from: jest.fn((table: string) => {
      if (table === 'account_users') return membershipQuery;
      if (table === 'projects') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue(
              projectResult ?? { data: null, error: { message: 'not found' } },
            ),
        };
      }
      return membershipQuery;
    }),
  };

  return client;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AccessControlHelper', () => {
  let cacheMock: ReturnType<typeof createCacheMock>;
  const ACCOUNT_ID = 'account-1';
  const USER_ID = 'user-1';

  beforeEach(() => {
    cacheMock = createCacheMock();
  });

  // ── verifyAccountAccess() — cache miss ───────────────────────

  describe('verifyAccountAccess() — cache miss (DB lookup)', () => {
    it('returns role from DB on cache miss', async () => {
      const client = makeSupabaseClient({
        data: { role: 'owner' },
        error: null,
      });
      const helper = new AccessControlHelper(cacheMock as any);

      const result = await helper.verifyAccountAccess(
        client,
        ACCOUNT_ID,
        USER_ID,
      );

      expect(result.role).toBe('owner');
      expect(client.from).toHaveBeenCalledWith('account_users');
    });

    it('caches the role after DB lookup', async () => {
      const client = makeSupabaseClient({
        data: { role: 'member' },
        error: null,
      });
      const helper = new AccessControlHelper(cacheMock as any);

      await helper.verifyAccountAccess(client, ACCOUNT_ID, USER_ID);

      expect(cacheMock.set).toHaveBeenCalledWith(
        `account:${ACCOUNT_ID}:user:${USER_ID}:role`,
        'member',
        300,
      );
    });

    it('throws ForbiddenException when user is not in account', async () => {
      const client = makeSupabaseClient({
        data: null,
        error: { message: 'not found' },
      });
      const helper = new AccessControlHelper(cacheMock as any);

      await expect(
        helper.verifyAccountAccess(client, ACCOUNT_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── verifyAccountAccess() — cache hit ───────────────────────

  describe('verifyAccountAccess() — cache hit', () => {
    it('returns cached role without querying the DB', async () => {
      cacheMock.seed(`account:${ACCOUNT_ID}:user:${USER_ID}:role`, 'admin');
      const client = makeSupabaseClient({
        data: { role: 'owner' },
        error: null,
      });
      const helper = new AccessControlHelper(cacheMock as any);

      const result = await helper.verifyAccountAccess(
        client,
        ACCOUNT_ID,
        USER_ID,
      );

      expect(result.role).toBe('admin'); // from cache, not DB
      expect(client.from).not.toHaveBeenCalled(); // no DB call
    });
  });

  // ── verifyAccountAccess() — required roles ──────────────────

  describe('verifyAccountAccess() — required roles enforcement', () => {
    it('allows access when user role is in requiredRoles', async () => {
      const client = makeSupabaseClient({
        data: { role: 'admin' },
        error: null,
      });
      const helper = new AccessControlHelper(cacheMock as any);

      const result = await helper.verifyAccountAccess(
        client,
        ACCOUNT_ID,
        USER_ID,
        ['admin', 'owner'],
      );
      expect(result.role).toBe('admin');
    });

    it('throws ForbiddenException when user role is not in requiredRoles', async () => {
      const client = makeSupabaseClient({
        data: { role: 'member' },
        error: null,
      });
      const helper = new AccessControlHelper(cacheMock as any);

      await expect(
        helper.verifyAccountAccess(client, ACCOUNT_ID, USER_ID, [
          'admin',
          'owner',
        ]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows any role when requiredRoles is undefined', async () => {
      const client = makeSupabaseClient({
        data: { role: 'viewer' },
        error: null,
      });
      const helper = new AccessControlHelper(cacheMock as any);

      const result = await helper.verifyAccountAccess(
        client,
        ACCOUNT_ID,
        USER_ID,
      );
      expect(result.role).toBe('viewer');
    });
  });

  // ── verifyProjectAccess() ────────────────────────────────────

  describe('verifyProjectAccess()', () => {
    it('resolves project account_id and verifies account membership', async () => {
      const client = makeSupabaseClient(
        { data: { role: 'member' }, error: null },
        { data: { account_id: ACCOUNT_ID }, error: null },
      );
      const helper = new AccessControlHelper(cacheMock as any);

      const result = await helper.verifyProjectAccess(
        client,
        'project-1',
        USER_ID,
      );

      expect(result.accountId).toBe(ACCOUNT_ID);
      expect(result.role).toBe('member');
    });

    it('throws NotFoundException when project does not exist', async () => {
      const client = makeSupabaseClient(
        { data: { role: 'member' }, error: null },
        { data: null, error: { message: 'not found' } },
      );
      const helper = new AccessControlHelper(cacheMock as any);

      await expect(
        helper.verifyProjectAccess(client, 'nonexistent-project', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
