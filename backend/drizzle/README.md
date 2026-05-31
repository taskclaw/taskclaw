# Drizzle migrations

This directory replaces `backend/supabase/migrations/` as the source of truth for
schema going forward. The old folder is kept as **read-only history**.

## Files

- `0000_baseline.sql` — the full `public` schema (61 tables), generated from
  `src/db/schema.ts`. **No RLS, no `auth.users` FK** (intentionally dropped).
- `0001_functions.sql` — app Postgres functions (vector search, `increment_agent_stats`,
  `get_newly_unblocked_tasks`, `exec_sql`, …) + the `updated_at`/timestamp triggers.
  pgvector internals come from `CREATE EXTENSION vector`; the RLS helper functions and
  `handle_new_user()` are intentionally omitted (Epic 1 adds `handle_new_public_user`).
- `meta/` — drizzle-kit journal.

## Fresh DB (new dev / CI)

```bash
# DB must have: CREATE EXTENSION IF NOT EXISTS vector; (and uuid-ossp)
npm run db:migrate          # applies 0000 + future migrations
psql "$DATABASE_URL" -f drizzle/0001_functions.sql
# then seed (integration definitions, default boards) — raw SQL seed step, see Epic 5
```

## Existing prod DB (adopt, do NOT re-run DDL)

The schema already exists on the VPS. Record the baseline as already-applied instead of
executing it:

1. Verify the curated schema matches prod (the S0.4 runtime smoke + a `drizzle-kit generate`
   that produces only RLS/auth-FK drops — nothing structural).
2. Insert the baseline hash into drizzle's `__drizzle_migrations` journal **without** running
   `0000_baseline.sql`.
3. From then on, `npm run db:migrate` applies only new migrations.

Take a full `pg_dump` backup before the first `db:migrate` touches prod.
