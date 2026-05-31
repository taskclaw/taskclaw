/**
 * S1.8 — live end-to-end proof of the local auth stack against real Postgres.
 * Exercises AuthService + JwtAuthService with a real Drizzle DB (no Nest, no mocks
 * for the DB). Run: DATABASE_URL=... npx ts-node scripts/auth-e2e-smoke.ts
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { JwtService } from '@nestjs/jwt';
import * as tables from '../src/db/schema';
import * as relations from '../src/db/relations';
import { JwtAuthService } from '../src/auth/jwt-auth.service';
import { AuthService } from '../src/auth/auth.service';

const JWT_SECRET = 'test-secret-at-least-32-chars-long-xxxxx';

function assert(cond: any, msg: string) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  console.log('  ✓ ' + msg);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { ...tables, ...relations } }) as any;

  const config = {
    get: (k: string) =>
      k === 'AUTH_LOCAL' ? true : k === 'JWT_SECRET' ? JWT_SECRET : k === 'SITE_URL' ? 'http://x' : undefined,
  } as any;
  const jwt = new JwtService({ secret: JWT_SECRET });
  const tokens = new JwtAuthService(db, jwt, config);
  const mailer = { sendPasswordReset: async () => {}, isConfigured: false } as any;
  const cache = { delete: () => {}, get: () => undefined, set: () => {} } as any;
  const svc = new AuthService(config, jwt, tokens, mailer, cache, db);

  const email = `e2e_${Date.now()}@test.com`;

  console.log('1) signup → pending + trigger provisions account');
  const signup: any = await svc.signup({ email, password: 'hunter2pw', name: 'E2E' });
  assert(signup.status === 'pending', 'signup returns pending');
  const [u] = await db.select().from(tables.users).where(eq(tables.users.email, email)).limit(1);
  assert(u && u.passwordHash?.startsWith('$2'), 'user row has a bcrypt hash');
  const acctUsers = await db
    .select()
    .from(tables.accountUsers)
    .where(eq(tables.accountUsers.userId, u.id));
  assert(acctUsers.length === 1 && acctUsers[0].role === 'owner', 'trigger created owner account_users row');

  console.log('2) login blocked while pending');
  let blocked = false;
  try { await svc.login({ email, password: 'hunter2pw' }); } catch { blocked = true; }
  assert(blocked, 'pending user cannot log in');

  console.log('3) approve → login issues a session');
  await db.update(tables.users).set({ status: 'active' }).where(eq(tables.users.id, u.id));
  const session: any = await svc.login({ email, password: 'hunter2pw' });
  assert(session.access_token && session.refresh_token, 'login returns access + refresh tokens');

  console.log('4) access token verifies with the shared secret (guard contract)');
  const payload: any = jwt.verify(session.access_token, { secret: JWT_SECRET });
  assert(payload.sub === u.id, 'JWT sub === user id (req.user.id contract)');

  console.log('5) wrong password rejected');
  let wrong = false;
  try { await svc.login({ email, password: 'nope' }); } catch { wrong = true; }
  assert(wrong, 'wrong password rejected');

  console.log('6) refresh rotates; old token is single-use (reuse detected)');
  const refreshed: any = await svc.refresh(session.refresh_token);
  assert(refreshed.refresh_token !== session.refresh_token, 'rotation returns a new refresh token');
  let reuse = false;
  try { await svc.refresh(session.refresh_token); } catch { reuse = true; }
  assert(reuse, 'replaying the rotated refresh token is rejected');

  await pool.end();
  console.log('\nAUTH E2E OK');
}

main().catch((e) => {
  console.error('\nAUTH E2E FAIL:', e.message);
  process.exit(1);
});
