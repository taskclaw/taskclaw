import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanLimitGuard } from './plan-limit.guard';
import { createDrizzleMock, type DrizzleMock } from '../../__test__/mocks/drizzle.mock';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildContext(params: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(resource: string | undefined): Reflector {
  return {
    get: jest.fn().mockReturnValue(resource),
  } as unknown as Reflector;
}

/**
 * Build a Drizzle mock wired for the guard's two queries:
 *   1. `db.query.subscriptions.findFirst` → the active subscription (or undefined)
 *   2. `db.select({ value: count() }).from(table).where(...)` → [{ value }]
 *      (or throws, to exercise the fail-open path).
 */
function makeDrizzle(
  planName: string | null,
  resourceCount: number,
  countError?: Error,
): DrizzleMock {
  const mock = createDrizzleMock();

  mock.query('subscriptions').findFirst.mockResolvedValue(
    planName ? { plan: { name: planName } } : undefined,
  );

  if (countError) {
    mock.select.mockReturnValue({
      from: jest.fn().mockReturnThis(),
      where: jest.fn(() => Promise.reject(countError)),
    } as any);
  } else {
    mock.select.mockReturnValue(mock.makeBuilder([{ value: resourceCount }]));
  }

  return mock;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PlanLimitGuard', () => {
  const originalEdition = process.env.EDITION;

  afterEach(() => {
    process.env.EDITION = originalEdition;
  });

  // ── Community edition ────────────────────────────────────────

  describe('community edition (non-cloud)', () => {
    it('skips all checks and returns true when EDITION !== cloud', async () => {
      process.env.EDITION = 'community';
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle('Hobby', 10).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('skips when EDITION is undefined', async () => {
      delete process.env.EDITION;
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle('Hobby', 10).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  // ── No decorator ─────────────────────────────────────────────

  describe('cloud edition — no @PlanResource decorator', () => {
    it('returns true when handler has no PlanResource decorator', async () => {
      process.env.EDITION = 'cloud';
      const guard = new PlanLimitGuard(
        makeReflector(undefined),
        makeDrizzle('Hobby', 0).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  // ── No accountId param ───────────────────────────────────────

  describe('cloud edition — no accountId in params', () => {
    it('returns true when accountId is missing from request params', async () => {
      process.env.EDITION = 'cloud';
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle('Hobby', 0).db,
      );
      const context = buildContext({}); // no accountId
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  // ── Hobby plan limits ────────────────────────────────────────

  describe('Hobby plan limits', () => {
    beforeEach(() => {
      process.env.EDITION = 'cloud';
    });

    it('blocks creation when sources count is at the Hobby limit (2)', async () => {
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle('Hobby', 2).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows creation when sources count is below the Hobby limit', async () => {
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle('Hobby', 1).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('blocks when tasks count is at the Hobby limit (500)', async () => {
      const guard = new PlanLimitGuard(
        makeReflector('tasks'),
        makeDrizzle('Hobby', 500).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('error message includes plan name and resource limit', async () => {
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle('Hobby', 2).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      const err = await guard.canActivate(context).catch((e) => e);
      expect(err.message).toContain('Hobby');
      expect(err.message).toContain('2');
      expect(err.message).toContain('sources');
    });
  });

  // ── Pro plan limits ──────────────────────────────────────────

  describe('Pro plan', () => {
    beforeEach(() => {
      process.env.EDITION = 'cloud';
    });

    it('allows unlimited conversations on Pro plan (-1)', async () => {
      const guard = new PlanLimitGuard(
        makeReflector('conversations'),
        makeDrizzle('Pro', 9999).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('blocks sources when at Pro limit (10)', async () => {
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle('Pro', 10).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── Enterprise plan ──────────────────────────────────────────

  describe('Enterprise plan', () => {
    beforeEach(() => {
      process.env.EDITION = 'cloud';
    });

    it('never blocks for any resource (all -1 unlimited)', async () => {
      for (const resource of ['sources', 'categories', 'tasks', 'skills']) {
        const guard = new PlanLimitGuard(
          makeReflector(resource),
          makeDrizzle('Enterprise', 99999).db,
        );
        const context = buildContext({ accountId: 'account-1' });
        await expect(guard.canActivate(context)).resolves.toBe(true);
      }
    });
  });

  // ── No active subscription → defaults to Hobby ───────────────

  describe('no active subscription', () => {
    beforeEach(() => {
      process.env.EDITION = 'cloud';
    });

    it('defaults to Hobby plan when no subscription found', async () => {
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle(null, 2).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      // Hobby limit for sources = 2, count = 2 → should block
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── Count query error → fail-open ────────────────────────────

  describe('count query error', () => {
    beforeEach(() => {
      process.env.EDITION = 'cloud';
    });

    it('returns true (fail-open) when the resource count query fails', async () => {
      const guard = new PlanLimitGuard(
        makeReflector('sources'),
        makeDrizzle('Hobby', 0, new Error('DB error')).db,
      );
      const context = buildContext({ accountId: 'account-1' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
