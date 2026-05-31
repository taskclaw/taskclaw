import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration (S0.5).
 *
 * - `schema`   : the curated canonical schema (built in S0.4).
 * - `out`      : new migration dir; replaces `supabase/migrations/` going forward.
 *                The old folder becomes read-only history.
 * - `schemaFilter: ['public']` : we manage only the `public` schema. Supabase's
 *                `auth`, `storage`, and `realtime` schemas are intentionally ignored
 *                (they go away with the Supabase services in Epic 5).
 *
 * Workflow:
 *   - `drizzle-kit pull`     → introspect the live DB once to seed schema.ts (S0.4)
 *   - `drizzle-kit generate` → author 0000_baseline from the curated schema
 *   - `drizzle-kit migrate`  → apply on fresh DBs; on prod the baseline is recorded
 *                              as already-applied (adopt existing schema, no DDL re-run)
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres',
  },
  // Keep the generated SQL explicit and reviewable.
  verbose: true,
  strict: true,
});
