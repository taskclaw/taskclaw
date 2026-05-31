/**
 * S0.4 verification — prove the curated Drizzle schema matches the live DB.
 * Run: DATABASE_URL=... npx ts-node scripts/db-smoke.ts
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as tables from '../src/db/schema';
import * as relations from '../src/db/relations';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { ...tables, ...relations } });

  // 1. plain select against a leaf table
  const cats = await db.select().from(tables.categories).limit(3);
  console.log(`categories rows: ${cats.length}`);

  // 2. select against the heaviest table
  const tasks = await db.select({ id: tables.tasks.id }).from(tables.tasks).limit(3);
  console.log(`tasks rows: ${tasks.length}`);

  // 3. relational query with an embedded select (self-join disambiguated relation)
  const withRel = await db.query.tasks.findMany({
    columns: { id: true, title: true },
    with: { category_categoryId: { columns: { id: true, name: true } }, account: { columns: { id: true } } },
    limit: 2,
  });
  console.log(`relational query rows: ${withRel.length}`);

  // 4. pgvector column is queryable (count non-null embeddings)
  const emb = await db.execute(
    sql`select count(*)::int as n from ${tables.users} where profile_embedding is not null`,
  );
  console.log(`users with embeddings: ${(emb.rows[0] as any).n}`);

  await pool.end();
  console.log('SMOKE OK');
}

main().catch((e) => {
  console.error('SMOKE FAIL:', e.message);
  process.exit(1);
});
