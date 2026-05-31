/** Epic 2 — live proof of the Drizzle relational query (embedded select) for sources. */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as tables from '../src/db/schema';
import * as relations from '../src/db/relations';
import { SourcesService } from '../src/sources/sources.service';

function assert(c: any, m: string) { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓ ' + m); }

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { ...tables, ...relations } }) as any;

  const accountId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const categoryId = '33333333-3333-3333-3333-333333333333';
  await db.execute(sql`insert into users (id,email,name,status) values (${userId},'s@t.com','S','active') on conflict do nothing`);
  await db.execute(sql`insert into accounts (id,name,owner_user_id) values (${accountId},'A',${userId}) on conflict do nothing`);
  await db.execute(sql`insert into categories (id,account_id,name) values (${categoryId},${accountId},'Bug') on conflict do nothing`);

  const access = { verifyAccountAccess: async () => ({ role: 'owner' }) } as any;
  const adapterRegistry = { getAdapter: () => ({ validateConfig: async () => ({ valid: true }) }) } as any;
  const svc = new SourcesService(db, access, adapterRegistry);

  console.log('1) create source under category');
  const created: any = await svc.create(userId, accountId, {
    category_id: categoryId, provider: 'notion', config: { api_key: 'sk-supersecretvalue' },
  });
  assert(created.id, 'create returns id');
  assert(created.config.api_key.includes('****'), 'config masked on create');

  console.log('2) findOne returns embedded categories (relational with)');
  const one: any = await svc.findOne(userId, accountId, created.id);
  assert(one.categories?.id === categoryId, 'findOne embeds categories under the `categories` key');
  assert(one.categories?.name === 'Bug', 'embedded category name correct');
  assert(!('category' in one), 're-keyed to categories (no leftover `category`)');
  assert(one.config.api_key.includes('****'), 'config masked on findOne');

  console.log('3) findAll embeds + masks');
  const all: any[] = await svc.findAll(userId, accountId);
  assert(all.length === 1 && all[0].categories?.id === categoryId, 'findAll embeds categories');

  await pool.end();
  console.log('\nSOURCES PILOT OK');
}
main().catch((e) => { console.error('\nSOURCES PILOT FAIL:', e.message); process.exit(1); });
