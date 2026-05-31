import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessControlHelper } from './access-control.helper';
import { createCacheMock } from '../../__test__/mocks/cache.mock';
import { createDrizzleMock } from '../../__test__/mocks/drizzle.mock';

// The legacy `supabase` arg is ignored by the Drizzle-backed helper; pass null.

describe('AccessControlHelper', () => {
  let cacheMock: ReturnType<typeof createCacheMock>;
  let db: ReturnType<typeof createDrizzleMock>;
  const ACCOUNT_ID = 'account-1';
  const USER_ID = 'user-1';

  beforeEach(() => {
    cacheMock = createCacheMock();
    db = createDrizzleMock();
  });

  /** Configure the next db.select(...) chain to resolve to `rows`. */
  const nextSelect = (rows: any[]) =>
    db.select.mockReturnValueOnce(db.makeBuilder(rows));

  const helper = () =>
    new AccessControlHelper(cacheMock as any, db.db as any);

  describe('verifyAccountAccess() — cache miss (DB lookup)', () => {
    it('returns role from DB on cache miss', async () => {
      nextSelect([{ role: 'owner' }]);
      const result = await helper().verifyAccountAccess(null, ACCOUNT_ID, USER_ID);
      expect(result.role).toBe('owner');
      expect(db.select).toHaveBeenCalled();
    });

    it('caches the role after DB lookup', async () => {
      nextSelect([{ role: 'member' }]);
      await helper().verifyAccountAccess(null, ACCOUNT_ID, USER_ID);
      expect(cacheMock.set).toHaveBeenCalledWith(
        `account:${ACCOUNT_ID}:user:${USER_ID}:role`,
        'member',
        300,
      );
    });

    it('throws ForbiddenException when user is not in account', async () => {
      nextSelect([]); // no membership row
      await expect(
        helper().verifyAccountAccess(null, ACCOUNT_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyAccountAccess() — cache hit', () => {
    it('returns cached role without querying the DB', async () => {
      cacheMock.seed(`account:${ACCOUNT_ID}:user:${USER_ID}:role`, 'admin');
      const result = await helper().verifyAccountAccess(null, ACCOUNT_ID, USER_ID);
      expect(result.role).toBe('admin');
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('verifyAccountAccess() — required roles enforcement', () => {
    it('allows access when role is in requiredRoles', async () => {
      nextSelect([{ role: 'admin' }]);
      const result = await helper().verifyAccountAccess(null, ACCOUNT_ID, USER_ID, [
        'admin',
        'owner',
      ]);
      expect(result.role).toBe('admin');
    });

    it('throws ForbiddenException when role is not in requiredRoles', async () => {
      nextSelect([{ role: 'member' }]);
      await expect(
        helper().verifyAccountAccess(null, ACCOUNT_ID, USER_ID, ['admin', 'owner']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows any role when requiredRoles is undefined', async () => {
      nextSelect([{ role: 'viewer' }]);
      const result = await helper().verifyAccountAccess(null, ACCOUNT_ID, USER_ID);
      expect(result.role).toBe('viewer');
    });
  });

  describe('verifyProjectAccess()', () => {
    it('resolves project account_id and verifies account membership', async () => {
      nextSelect([{ accountId: ACCOUNT_ID }]); // projects lookup
      nextSelect([{ role: 'member' }]); // account_users lookup
      const result = await helper().verifyProjectAccess(null, 'project-1', USER_ID);
      expect(result.accountId).toBe(ACCOUNT_ID);
      expect(result.role).toBe('member');
    });

    it('throws NotFoundException when project does not exist', async () => {
      nextSelect([]); // no project row
      await expect(
        helper().verifyProjectAccess(null, 'nonexistent-project', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
