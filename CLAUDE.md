# TaskClaw — Claude Code Instructions

## Project Structure

- **Backend**: NestJS at `backend/src/` — runs in Docker on port 3003
- **Frontend**: Next.js at `frontend/src/` — runs locally on port 3002
- **Database**: plain **PostgreSQL** (pgvector) on port 5432, accessed via **Drizzle ORM**
- **Auth**: local NestJS JWT auth (bcrypt + refresh tokens) — `AUTH_LOCAL=true`, no GoTrue
- **Storage**: **MinIO** (S3-compatible) on port 9000 — knowledge/skill attachments
- **Realtime**: Postgres `LISTEN/NOTIFY` → NestJS SSE (`/events/stream`) → frontend `/api/events`

> TaskClaw was migrated off Supabase to a plain-Postgres stack. There is **no** Kong/GoTrue/
> PostgREST/Storage/Realtime/Studio. Data access is Drizzle (`backend/src/db/`); see
> `backend/docs/drizzle-conversion-guide.md` for the query patterns.

## Running Locally

1. Start Docker Desktop, then: `docker compose up -d`
2. Wait for services to be healthy (~30s):
   ```bash
   docker inspect --format='{{.State.Health.Status}}' taskclaw-db-1       # healthy
   docker inspect --format='{{.State.Health.Status}}' taskclaw-minio-1    # healthy
   docker inspect --format='{{.State.Health.Status}}' taskclaw-backend-1  # healthy
   ```
3. Frontend (local dev): `cd frontend && npm run dev`

The backend entrypoint applies `drizzle/*.sql` (schema + functions + auth + triggers) and
`drizzle/seed/*.sql` (integration defs, default boards, backbone defs) on boot, idempotently.
MinIO buckets are created by `StorageService` on startup.

Default dev login: `super@admin.com` / `password123`.

## Database / migrations

- Schema lives in `backend/src/db/schema.ts` (Drizzle). Change schema → `npm run db:generate`.
- Migrations: `backend/drizzle/*.sql` (0000 baseline … 0003 realtime). Seeds: `backend/drizzle/seed/`.
- Health check: `curl -s http://localhost:3003/health` → `{"status":"ok"}`.

## Troubleshooting

### Frontend port conflict (EADDRINUSE :::3002)
- A stale dev server is still running: `lsof -ti:3002 | xargs kill -9`

### "fetch failed" / ECONNREFUSED right after `docker compose up`
- Postgres/MinIO take ~10-20s to become healthy. The backend retries DB connect on boot;
  wait until `taskclaw-db-1` and `taskclaw-minio-1` report `healthy`, then retry.

### `[theme] Failed to fetch theme: 500`
- Non-critical SSR warning; resolves once the backend is fully ready. Safe to ignore.
