import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { JwtAuthService } from './jwt-auth.service';
import { createDrizzleMock } from '../__test__/mocks/drizzle.mock';

// Minimal stubs for the collaborators the local path touches.
const config = (local = true) =>
  ({ get: (k: string) => (k === 'AUTH_LOCAL' ? local : 'secret') }) as any;
const jwt = () => ({ verify: jest.fn().mockReturnValue({ sub: 'u1' }) }) as any;
const mailer = () => ({ sendPasswordReset: jest.fn() }) as any;
const cache = () => ({ delete: jest.fn() }) as any;

function makeTokens(): JwtAuthService {
  return {
    issueSession: jest.fn().mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: 'u1', email: 'a@b.com' },
    }),
    signAccess: jest.fn().mockResolvedValue('access'),
    rotateRefresh: jest.fn(),
    revokeAllForUser: jest.fn(),
    revoke: jest.fn(),
  } as unknown as JwtAuthService;
}

describe('AuthService (local path)', () => {
  describe('login', () => {
    it('issues a session for a valid active user (bcrypt verifies)', async () => {
      const hash = await bcrypt.hash('correct-pw', 10);
      const db = createDrizzleMock();
      db.select.mockReturnValueOnce(
        db.makeBuilder([
          { id: 'u1', email: 'a@b.com', name: 'A', passwordHash: hash, status: 'active' },
        ]),
      );
      const tokens = makeTokens();
      const svc = new AuthService(
        config(),
        jwt(),
        tokens,
        mailer(),
        cache(),
        db.db as any,
      );

      const res: any = await svc.login({ email: 'a@b.com', password: 'correct-pw' });
      expect(res.access_token).toBe('access');
      // tokens is cast to the real JwtAuthService type, so the jest mock reads
      // as an unbound class method — a known false positive for this rule.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tokens.issueSession).toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      const hash = await bcrypt.hash('correct-pw', 10);
      const db = createDrizzleMock();
      db.select.mockReturnValueOnce(
        db.makeBuilder([
          { id: 'u1', email: 'a@b.com', name: 'A', passwordHash: hash, status: 'active' },
        ]),
      );
      const svc = new AuthService(
        config(), jwt(), makeTokens(), mailer(), cache(), db.db as any,
      );
      await expect(
        svc.login({ email: 'a@b.com', password: 'WRONG' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email (runs dummy compare, no leak)', async () => {
      const db = createDrizzleMock();
      db.select.mockReturnValueOnce(db.makeBuilder([])); // no user
      const svc = new AuthService(
        config(), jwt(), makeTokens(), mailer(), cache(), db.db as any,
      );
      await expect(
        svc.login({ email: 'nobody@b.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('blocks a pending user even with the right password', async () => {
      const hash = await bcrypt.hash('pw', 10);
      const db = createDrizzleMock();
      db.select.mockReturnValueOnce(
        db.makeBuilder([
          { id: 'u1', email: 'a@b.com', name: 'A', passwordHash: hash, status: 'pending' },
        ]),
      );
      const svc = new AuthService(
        config(), jwt(), makeTokens(), mailer(), cache(), db.db as any,
      );
      await expect(
        svc.login({ email: 'a@b.com', password: 'pw' }),
      ).rejects.toThrow('pending approval or suspended');
    });
  });

  describe('signup', () => {
    it('hashes the password and inserts a pending user', async () => {
      const db = createDrizzleMock();
      const svc = new AuthService(
        config(), jwt(), makeTokens(), mailer(), cache(), db.db as any,
      );
      const res: any = await svc.signup({ email: 'New@B.com', password: 'pw123456', name: 'New' });
      expect(res).toEqual({ success: true, status: 'pending' });
      expect(db.insert).toHaveBeenCalled();
    });

    it('maps a unique-violation to 400', async () => {
      const db = createDrizzleMock();
      db.insert.mockReturnValueOnce({
        values: jest.fn().mockRejectedValue({ code: '23505' }),
      } as any);
      const svc = new AuthService(
        config(), jwt(), makeTokens(), mailer(), cache(), db.db as any,
      );
      await expect(
        svc.signup({ email: 'dup@b.com', password: 'pw123456', name: 'Dup' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refresh', () => {
    it('rotates and returns a new session', async () => {
      const db = createDrizzleMock();
      db.select.mockReturnValueOnce(
        db.makeBuilder([{ id: 'u1', email: 'a@b.com', name: 'A' }]),
      );
      const tokens = makeTokens();
      (tokens.rotateRefresh as jest.Mock).mockResolvedValue({
        userId: 'u1',
        refresh: 'newRefresh',
      });
      const svc = new AuthService(
        config(), jwt(), tokens, mailer(), cache(), db.db as any,
      );
      const res: any = await svc.refresh('oldRefresh');
      expect(res.refresh_token).toBe('newRefresh');
      expect(res.access_token).toBe('access');
    });
  });
});
