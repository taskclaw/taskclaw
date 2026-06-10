# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.1] - 2026-06-09

Patch release — three fixes found by the post-2.0.0 full-QA pass.

### Fixed

- **Security:** refresh-token rotation had a race window — parallel replays of the
  same refresh token could all mint new sessions. Rotation now atomically claims
  the token; a replay revokes the entire token family.
- `POST /api-keys` returned the raw database row, exposing the internal
  `key_hash` and camelCase column names. The response now matches the documented
  snake_case contract and includes the one-time `key` only.
- `GET /tasks/search` always returned 500 — the route was shadowed by the
  task-by-id route and never matched. Search works and is account-scoped.

### Changed

- Installer, CLI, and self-hosting docs caught up to the v2 plain-Postgres stack.

## [2.0.0] - 2026-05-31

Migrated TaskClaw off self-hosted **Supabase** onto a plain-PostgreSQL stack.
The end-state services are `postgres (pgvector) + minio + redis + backend + frontend + ollama` —
no Kong, GoTrue, PostgREST, Supabase Storage, Supabase Realtime, or Studio.

### Changed (BREAKING — self-host / deploy contract changed)

- **Data access:** `@supabase/supabase-js` PostgREST → **Drizzle ORM** (type-safe, native
  pgvector). RLS dropped; tenant isolation is app-level `account_id` scoping.
- **Auth:** GoTrue → **local NestJS JWT** (bcrypt — verifies existing GoTrue `$2a$` hashes, no
  password resets required) + refresh-token rotation, behind `AUTH_LOCAL=true`.
- **Storage:** Supabase Storage → **MinIO** (S3-compatible, `@aws-sdk/client-s3`).
- **Realtime:** `postgres_changes` → **Postgres `LISTEN/NOTIFY` → NestJS SSE** (`/events/stream`)
  with a frontend `/api/events` proxy.
- **Gateway:** Kong → **single-origin Next.js catch-all `/api/[...path]` proxy** that injects the
  Bearer from the httpOnly `auth_token` cookie server-side.
- **docker-compose** rewritten to the plain stack (no `--profile supabase`); the backend entrypoint
  applies `drizzle/*.sql` + `drizzle/seed/*.sql` and MinIO buckets auto-create on boot.

### Removed

- `@supabase/supabase-js` / `@supabase/ssr` from both `package.json`s; all `SUPABASE_*` /
  `ANON_KEY` / `SERVICE_ROLE_KEY` / `GOTRUE_*` / `NEXT_PUBLIC_SUPABASE_*` env vars.

### Migration notes

- New env: `DATABASE_URL`, `AUTH_LOCAL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `S3_*`, `REDIS_URL`,
  `INTERNAL_API_URL`, `SITE_URL`, `COOKIE_SECURE`. See `docs/configuration.md`.
- Self-hosters: stand up the new compose stack (no supabase profile); the entrypoint migrates +
  seeds on boot. Existing users keep their passwords (bcrypt hashes are reused).

## [1.0.0] - 2025-02-17

### Added

- Initial open-source release
- Kanban board with drag-and-drop task management
- AI chat assistant (OpenRouter / OpenClaw integration)
- Knowledge base for AI context
- Skills and categories for task organization
- Team collaboration
- Notion bidirectional sync
- ClickUp bidirectional sync
- Pomodoro timer
- Dark mode UI
- Docker Compose self-hosting with optional local Supabase
- Community edition with no usage limits
- Adapter system for community-contributed integrations
