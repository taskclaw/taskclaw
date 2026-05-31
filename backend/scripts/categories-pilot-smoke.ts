/**
 * Epic 2 pilot — live CRUD proof of the Drizzle CategoriesService against real
 * Postgres. Run against a throwaway DB seeded with one account.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as tables from '../src/db/schema';
import * as relations from '../src/db/relations';
import { CategoriesService } from '../src/categories/categories.service';

function assert(c: any, m: string) {
  if (!c) throw new Error('ASSERT FAILED: ' + m);
  console.log('  ✓ ' + m);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { ...tables, ...relations } }) as any;

  // seed an account + owner membership
  const accountId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  await db.execute(sql`insert into users (id, email, name, status) values (${userId}, 'pilot@test.com', 'Pilot', 'active') on conflict do nothing`);
  await db.execute(sql`insert into accounts (id, name, owner_user_id) values (${accountId}, 'Pilot Acct', ${userId}) on conflict do nothing`);
  await db.execute(sql`insert into account_users (account_id, user_id, role) values (${accountId}, ${userId}, 'owner') on conflict do nothing`);

  const access = { verifyAccountAccess: async () => ({ role: 'owner' }) } as any;
  const svc = new CategoriesService(db, access);

  console.log('1) create');
  const created: any = await svc.create(userId, accountId, { name: 'Bug', color: '#f00', icon: 'bug' });
  assert(created?.id && created.name === 'Bug', 'create returns the row with an id');
  assert(created.accountId === accountId, 'account_id scoped on insert');

  console.log('2) findAll');
  const all = await svc.findAll(userId, accountId);
  assert(all.length === 1, 'findAll returns the created category');

  console.log('3) findOne');
  const one: any = await svc.findOne(userId, accountId, created.id);
  assert(one.id === created.id, 'findOne returns by id');

  console.log('4) createBulk dedupes on (account_id, name)');
  const bulk = await svc.createBulk(userId, accountId, [
    { name: 'Bug' }, // duplicate → ignored
    { name: 'Feature' },
  ]);
  assert(bulk.length === 1 && bulk[0].name === 'Feature', 'onConflictDoNothing skipped the duplicate');

  console.log('5) update');
  const updated: any = await svc.update(userId, accountId, created.id, { name: 'Defect' });
  assert(updated.name === 'Defect', 'update returns the renamed row');

  console.log('6) remove + 404 after');
  const del = await svc.remove(userId, accountId, created.id);
  assert(del.message?.includes('deleted'), 'remove succeeds');
  let gone = false;
  try { await svc.findOne(userId, accountId, created.id); } catch { gone = true; }
  assert(gone, 'findOne throws after delete');

  await pool.end();
  console.log('\nCATEGORIES PILOT OK');
}

main().catch((e) => { console.error('\nPILOT FAIL:', e.message); process.exit(1); });
