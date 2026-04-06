---
name: dev-setup
description: >
  Guide developers through setting up a local TaskClaw development environment.
  Covers Docker, Supabase, Redis, environment variables, database migrations,
  and running the development servers. Use when onboarding a new developer,
  setting up locally, or troubleshooting environment issues.
license: MIT
triggers:
  - setup dev environment
  - local development setup
  - dev setup
  - set up locally
  - onboard developer
  - docker setup
  - supabase local
  - environment setup
  - configure development
  - how to run locally
metadata:
  version: 2.0.0
  author: TaskClaw
  category: taskclaw-devtools
  domain: developer-experience
  updated: 2026-03-13
---

# Dev Setup

Guide developers through setting up a complete local TaskClaw development environment. Walks through prerequisites, environment configuration, Docker infrastructure, database setup, and running the dev servers.

---

## Key Architecture Facts

**IMPORTANT — Read these before executing any phase:**

### Environment Files Structure
The project has **two** `.env` files for the application, and an **optional third** for Docker Compose:

| File | Purpose | Always needed? |
|------|---------|----------------|
| `backend/.env` | Backend (NestJS) config: Supabase keys, JWT secret, Redis, API keys | Yes |
| `frontend/.env` | Frontend (Next.js) config: public Supabase URL/key, API URL, branding | Yes |
| `.env` (root) | Docker Compose variable substitution for Supabase services only | Only for local Supabase (`--profile supabase`) |

The root `.env` is **NOT** an application config file. It exists solely because `docker-compose.yml` references `${JWT_SECRET}`, `${ANON_KEY}`, `${SERVICE_ROLE_KEY}`, and `${POSTGRES_PASSWORD}` for the Supabase service containers (db, auth, rest, storage, studio). Without it, those services will get empty or default values and fail.

### Dev Server Commands
The backend and frontend use **different script names**:

| Package | Dev command | Notes |
|---------|------------|-------|
| `frontend/` | `npm run dev` / `next dev` | Has a `dev` script — Turborepo picks it up |
| `backend/` | `npm run start:dev` / `nest start --watch` | Has `start:dev`, **NOT** `dev` — Turborepo **skips** it |

**CRITICAL**: Running `pnpm run dev` from the project root (Turborepo) only starts the **frontend** and `@taskclaw/taskclaw-sync` packages. The backend must be started separately with `pnpm --filter taskclaw-backend run start:dev` or `cd backend && npm run start:dev`.

---

## Table of Contents

- [Execution Mode](#execution-mode)
- [Wizard Flow](#wizard-flow)
- [Environment Reference](#environment-reference)
- [Troubleshooting](#troubleshooting)

---

## Execution Mode

**IMPORTANT**: Run this setup as autonomously as possible. Only pause for the THREE required user decisions (Phase 2, 3, 4). Between decisions, execute everything back-to-back: run commands, check results, fix issues automatically.

**Flow overview**:
1. Prerequisites check (automatic)
2. **ASK**: Environment variables — user fills `backend/.env` and `frontend/.env`
3. **ASK**: Run mode — Docker containers vs local terminal for backend/frontend
4. **ASK**: Supabase — Cloud vs Local Docker
5. Execute everything else (install, Docker infra, migrations, super admin, verify)
6. Present a single summary table at the end

---

## Wizard Flow

### Phase 1: Prerequisites Check

Run all checks automatically in parallel using the Bash tool:

```bash
node --version       # Need 20+
pnpm --version       # Need 10+
docker --version     # Any version
docker compose version  # Need v2+
git --version        # Any version
```

**Required**: Node.js 20+ LTS, pnpm 10+, Git
**Required for local Supabase**: Docker Engine + Docker Compose v2+ (4GB+ RAM)

If anything is missing, guide the user to install it before continuing.

Present results as a table:

| Prerequisite | Required | Found | Status |
|---|---|---|---|
| Node.js | 20+ | vXX.X.X | OK/FAIL |
| pnpm | 10+ | XX.X.X | OK/FAIL |
| Docker | Any | XX.X.X | OK/FAIL |
| Docker Compose | v2+ | vX.X.X | OK/FAIL |
| Git | Any | X.X.X | OK/FAIL |

---

### Phase 2: Environment Variables

**IMPORTANT**: This step happens BEFORE any Supabase or Docker decisions, because the user may already have their own API keys, Supabase credentials, or specific configuration they want to use.

**Step 2a**: Check if `backend/.env` and `frontend/.env` already exist.

- If they **do NOT exist**, copy from `.env.example`:
  ```bash
  cp backend/.env.example backend/.env
  cp frontend/.env.example frontend/.env
  ```

- If they **already exist**, read and display them so the user knows the current state.

**Step 2b**: Ask the user to review/edit their env files using AskUserQuestion:

> "Please review and fill in your `backend/.env` and `frontend/.env` files before we continue. Key variables to check:
>
> **backend/.env**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`, `OPENROUTER_API_KEY`
>
> **frontend/.env**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
>
> Are your .env files ready, or do you need help configuring them?"

Options:
- **"My .env files are ready"** — Continue to Phase 3
- **"I need help configuring them"** — Guide them through the values (see [Environment Configuration Guide](#environment-configuration-guide) below)

**If user needs help**, walk them through each variable interactively. For local Supabase, the JWT keys need to be generated — see the [JWT Key Generation](#jwt-key-generation) section.

---

### Phase 3: Run Mode

Ask the user how they want to run the backend and frontend. Use AskUserQuestion:

> "How do you want to run the backend and frontend?"

Options:

**Option A: Local terminal (Recommended for development)**
- Run `pnpm run dev` (frontend) + `pnpm --filter taskclaw-backend run start:dev` (backend) — two separate processes
- Hot-reload, direct debugging, faster iteration
- Only Docker is used for infrastructure (Supabase, Redis)
- Ports 3000 and 3001 must be free on the host
- Note: the backend has `start:dev` not `dev`, so Turborepo doesn't pick it up — it must be started separately

**Option B: Docker containers**
- Backend and frontend run inside Docker via `docker compose up`
- More isolated, closer to production
- Slower feedback loop (requires image rebuild for code changes)
- Uses the `backend` and `frontend` services defined in docker-compose.yml

Recommend **Option A** for active development, **Option B** for testing production-like setup.

**IMPORTANT — If the user chooses Option A (local terminal)**:
- Check if ports 3000 and 3001 are already in use: `lsof -ti:3000` and `lsof -ti:3001`
- If occupied, inform the user and ask if they want to kill the existing processes
- The `SUPABASE_URL` in `backend/.env` must be `http://localhost:7431` (NOT `http://kong:8000`, which is for Docker-to-Docker networking)
- The `REDIS_URL` in `backend/.env` must be `redis://localhost:6379` (NOT `redis://redis:6379`)
- Auto-fix these values if they are wrong — read the file, check, and edit if needed

**IMPORTANT — If the user chooses Option B (Docker containers)**:
- The `SUPABASE_URL` in `backend/.env` must be `http://kong:8000` (Docker internal network)
- The `REDIS_URL` in `backend/.env` must be `redis://redis:6379`
- Auto-fix these values if they are wrong

---

### Phase 4: Supabase Setup Path

Ask the user which Supabase setup to use. Use AskUserQuestion:

> "Which Supabase setup do you want to use?"

**Option A: Local Supabase via Docker (Recommended)**
- Runs PostgreSQL, Auth, Storage, Studio all locally
- Zero external dependencies
- Best for full-stack development

**Option B: Cloud Supabase**
- Use an existing Supabase cloud project
- Faster startup, no Docker needed for database
- Requires Supabase account and project credentials

If the user picks **Cloud Supabase**, verify that `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` point to a real Supabase cloud URL (starts with `https://`). If not, ask for the values.

After this answer, execute ALL remaining phases without stopping.

---

### Phase 5: Install Dependencies

```bash
pnpm install
```

Check the output for errors. If `pnpm approve-builds` warnings appear, that's normal and non-blocking.

---

### Phase 6: Start Infrastructure

#### Option A: Cloud Supabase

```bash
# Only Redis is needed locally
docker compose up redis -d
```

#### Option B: Local Supabase

**Step 6a**: Create root `.env` for Docker Compose variable substitution.

The root `.env` is **NOT** an application config file — it only provides variable substitution for `docker-compose.yml`. The Supabase containers (db, auth, rest, storage, studio) reference `${JWT_SECRET}`, `${ANON_KEY}`, `${SERVICE_ROLE_KEY}`, and `${POSTGRES_PASSWORD}`. Without this file, those services get empty values and fail.

Read `backend/.env` to extract the values, then create the root `.env` with just these Docker Compose variables:

```env
POSTGRES_PASSWORD=postgres
JWT_SECRET=<JWT_SECRET from backend/.env>
ANON_KEY=<SUPABASE_ANON_KEY from backend/.env>
SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY from backend/.env>
```

**Do NOT add application variables here** — those belong in `backend/.env` and `frontend/.env`.

**CRITICAL — JWT Validation**: Before proceeding, verify that the `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` JWTs are actually signed with the `JWT_SECRET`. Run this check:

```bash
node -e "
const crypto = require('crypto');
const secret = '<JWT_SECRET>';
const token = '<SUPABASE_ANON_KEY>';
const [header, payload, sig] = token.split('.');
const expected = crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');
console.log(sig === expected ? 'JWT VALID' : 'JWT MISMATCH - tokens must be re-signed');
"
```

**If JWT MISMATCH**: The tokens were signed with a different secret. Regenerate them:

```bash
node -e "
const crypto = require('crypto');
const secret = '<JWT_SECRET>';
function sign(payload) {
  const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', secret).update(h+'.'+p).digest('base64url');
  return h+'.'+p+'.'+s;
}
console.log('ANON_KEY=' + sign({role:'anon',iss:'supabase',iat:1700000000,exp:2000000000}));
console.log('SERVICE_ROLE_KEY=' + sign({role:'service_role',iss:'supabase',iat:1700000000,exp:2000000000}));
"
```

Then update ALL files with the new tokens: root `.env`, `backend/.env` (SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY), and `frontend/.env` (NEXT_PUBLIC_SUPABASE_ANON_KEY).

**Step 6b**: Check for stale Docker volumes.

```bash
docker volume ls --filter name=taskclaw
```

If `taskclaw_db_data` already exists, the PostgreSQL init scripts (auth schema, roles, JWT settings) will NOT re-run. Ask the user if they want a fresh start:
- Fresh start: `docker compose --profile supabase down -v` then continue
- Keep data: skip volume cleanup (only works if the DB was previously initialized correctly)

**Step 6c**: Start the infrastructure services.

If the user chose **local terminal** (Phase 3 Option A), do NOT start the backend/frontend Docker containers — only start infrastructure:

```bash
# Start only Supabase infra + Redis (no backend/frontend containers)
docker compose --profile supabase up -d db redis imgproxy
# Wait for DB to be healthy
sleep 10
docker compose --profile supabase up -d kong auth rest meta
# Wait for auth to be healthy
sleep 15
docker compose --profile supabase up -d storage studio
```

If the user chose **Docker containers** (Phase 3 Option B), start everything:

```bash
docker compose --profile supabase up -d
```

**Step 6d**: Verify infrastructure health.

Wait for services to stabilize, then check each one:

```bash
# PostgreSQL
docker compose exec db pg_isready -U postgres -h localhost

# Auth (GoTrue) — this is the most fragile service
curl -sf http://localhost:7431/auth/v1/health

# Kong API gateway
curl -sf http://localhost:7431/rest/v1/ -H "apikey: <ANON_KEY>" | head -c 100

# Redis
docker compose exec redis redis-cli ping

# Storage
docker compose logs storage --tail 5
```

**If auth is failing**, check logs with `docker compose logs auth --tail 20`. Common causes:

1. **"must be owner of function uid"**: The `roles.sql` init script didn't transfer auth function ownership. This is already fixed in the current `roles.sql`, but if using stale volumes, run manually:
   ```bash
   docker compose exec db psql -U postgres -c "
   DO \$\$
   DECLARE r RECORD;
   BEGIN
     FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
              FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
              WHERE n.nspname = 'auth'
     LOOP
       EXECUTE format('ALTER FUNCTION auth.%I(%s) OWNER TO supabase_auth_admin', r.proname, r.args);
     END LOOP;
   END \$\$;"
   docker compose restart auth
   ```

2. **"schema auth does not exist"**: Init scripts didn't run. Must destroy volumes and recreate:
   ```bash
   docker compose --profile supabase down -v
   docker compose --profile supabase up -d
   ```

**If storage is failing with "password authentication failed"**: The `supabase_storage_admin` password wasn't set. Fix:
```bash
docker compose exec db psql -U postgres -c "ALTER USER supabase_storage_admin WITH PASSWORD 'postgres';"
docker compose exec db psql -U postgres -c "GRANT authenticator TO supabase_storage_admin;"
docker compose restart storage
```

---

### Phase 7: Database Migrations

Apply application migrations using `supabase db push`. The `PGSSLMODE=disable` env var is required for local connections:

```bash
cd backend
PGSSLMODE=disable npx supabase db push --db-url "postgresql://postgres:postgres@localhost:5432/postgres"
```

For **cloud Supabase**:
```bash
cd backend
npx supabase db push --db-url "postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
```

The command will list all pending migrations and auto-confirm. Verify it finishes with "Finished supabase db push."

---

### Phase 8: Create Super Admin User

Create the super admin via the Supabase Auth Admin API (NOT via a CLI script):

```bash
# 1. Create the auth user
curl -s -X POST http://localhost:7431/auth/v1/admin/users \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@taskclaw.local",
    "password": "admin123456",
    "email_confirm": true,
    "user_metadata": {"full_name": "Super Admin"},
    "app_metadata": {"provider": "email", "providers": ["email"], "role": "super_admin"}
  }'
```

Extract the user `id` from the response, then create the profile and account:

```bash
# 2. Create public.users profile
docker compose exec db psql -U postgres -c "
INSERT INTO public.users (id, email, name, status)
VALUES ('<USER_ID>', 'admin@taskclaw.local', 'Super Admin', 'active')
ON CONFLICT (id) DO UPDATE SET name = 'Super Admin', status = 'active';
"

# 3. Create default account
docker compose exec db psql -U postgres -c "
INSERT INTO public.accounts (name, owner_user_id, onboarding_completed)
VALUES ('Default Workspace', '<USER_ID>', false)
RETURNING id;
"

# 4. Add user as account owner (use the account ID from step 3)
docker compose exec db psql -U postgres -c "
INSERT INTO public.account_users (account_id, user_id, role)
VALUES ('<ACCOUNT_ID>', '<USER_ID>', 'owner')
ON CONFLICT DO NOTHING;
"
```

---

### Phase 9: Start Dev Servers (if local terminal mode)

If the user chose **local terminal** in Phase 3:

**IMPORTANT**: The backend does NOT have a `dev` script — it uses `start:dev`. Turborepo's `pnpm run dev` only starts the frontend and `@taskclaw/taskclaw-sync`. You must start the backend separately.

Start both in parallel (two separate background commands):

```bash
# Terminal 1: Frontend + taskclaw-sync via Turborepo
pnpm run dev

# Terminal 2: Backend (must be started separately — has `start:dev`, not `dev`)
pnpm --filter taskclaw-backend run start:dev
```

Wait for both to be ready:
- Frontend: look for "Ready in XXXms" in output
- Backend: look for "Nest application successfully started" in output, then verify with `curl -sf http://localhost:3003/health`

If the user chose **Docker containers**, they are already running from Phase 6.

---

### Phase 10: Final Verification

Run all checks automatically and report results:

```bash
# 1. Backend health
curl -sf http://localhost:3003/health

# 2. Frontend loads
curl -sf -o /dev/null -w "%{http_code}" http://localhost:3002

# 3. Auth service
curl -sf http://localhost:7431/auth/v1/health

# 4. Redis
docker compose exec redis redis-cli ping

# 5. PostgreSQL
docker compose exec db pg_isready -U postgres -h localhost
```

Present the final summary table:

| Service | Port | Status |
|---------|------|--------|
| Frontend (Next.js) | 3000 | OK / FAIL |
| Backend (NestJS) | 3001 | OK / FAIL |
| PostgreSQL | 5432 | OK / FAIL |
| Kong (API Gateway) | 7431 | OK / FAIL |
| GoTrue (Auth) | 7431/auth/v1 | OK / FAIL |
| Supabase Studio | 7430 | OK / FAIL |
| Redis | 6379 | OK / FAIL |
| Storage API | (internal) | OK / FAIL |

And the login credentials:

| | |
|---|---|
| **URL** | http://localhost:3002 |
| **Email** | `admin@taskclaw.local` |
| **Password** | `admin123456` |
| **Role** | `super_admin` |

---

## Environment Configuration Guide

### JWT Key Generation

For local Supabase, you need a `JWT_SECRET` and two JWT tokens (anon + service_role) signed with it:

```bash
# 1. Generate a JWT secret
openssl rand -hex 32

# 2. Generate signed tokens (replace <SECRET> with the output above)
node -e "
const crypto = require('crypto');
const secret = '<SECRET>';
function sign(payload) {
  const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', secret).update(h+'.'+p).digest('base64url');
  return h+'.'+p+'.'+s;
}
console.log('ANON_KEY=' + sign({role:'anon',iss:'supabase',iat:1700000000,exp:2000000000}));
console.log('SERVICE_ROLE_KEY=' + sign({role:'service_role',iss:'supabase',iat:1700000000,exp:2000000000}));
"
```

### Backend .env (Local Supabase + Local Terminal)

```env
PORT=3001
SUPABASE_URL=http://localhost:7431
SUPABASE_ANON_KEY=<generated-anon-jwt>
SUPABASE_SERVICE_ROLE_KEY=<generated-service-role-jwt>
JWT_SECRET=<your-jwt-secret>
ENCRYPTION_KEY=<run: openssl rand -hex 32>
CORS_ORIGIN=http://localhost:3002
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=<your-openrouter-key>
OPENROUTER_MODEL=openai/gpt-4o-mini
```

### Backend .env (Local Supabase + Docker Container)

```env
PORT=3001
SUPABASE_URL=http://kong:8000
SUPABASE_ANON_KEY=<generated-anon-jwt>
SUPABASE_SERVICE_ROLE_KEY=<generated-service-role-jwt>
JWT_SECRET=<your-jwt-secret>
ENCRYPTION_KEY=<run: openssl rand -hex 32>
CORS_ORIGIN=http://localhost:3002
REDIS_URL=redis://redis:6379
OPENROUTER_API_KEY=<your-openrouter-key>
OPENROUTER_MODEL=openai/gpt-4o-mini
```

### Frontend .env (both modes)

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:7431
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same-anon-jwt-as-backend>
NEXT_PUBLIC_API_URL=http://localhost:3003
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_SITE_URL=http://localhost:3002
NEXT_PUBLIC_BRAND_NAME="TaskClaw"
APP_THEME_NAME=commercial
```

**Key difference**: `SUPABASE_URL` in backend uses `kong:8000` (Docker network) when running in Docker, or `localhost:7431` when running locally. Frontend ALWAYS uses `localhost:7431` because it runs in the browser.

---

## Environment Reference

### Key Ports

| Service | Default Port | Env Var |
|---------|-------------|---------|
| Frontend | 3000 | `FRONTEND_PORT` |
| Backend | 3001 | `PORT` / `BACKEND_PORT` |
| Supabase Studio | 7430 | `SUPABASE_STUDIO_PORT` |
| Kong (API Gateway) | 7431 | `SUPABASE_API_PORT` |
| PostgreSQL | 5432 | `POSTGRES_PORT` |
| Redis | 6379 | `REDIS_PORT` |

### Docker Services

All containers are prefixed with `taskclaw-*` and use the `taskclaw_default` Docker network.

| Service | Image | Profile |
|---------|-------|---------|
| backend | Built from `./backend/Dockerfile` | default |
| frontend | Built from `./frontend/Dockerfile` | default |
| redis | `redis:7-alpine` | default |
| db | `supabase/postgres:15.8.1.085` | supabase |
| kong | `kong:2.8.1` | supabase |
| auth (GoTrue) | `supabase/gotrue:v2.186.0` | supabase |
| rest (PostgREST) | `postgrest/postgrest:v12.2.0` | supabase |
| studio | `supabase/studio:latest` | supabase |
| storage | `supabase/storage-api:v1.35.3` | supabase |
| imgproxy | `darthsim/imgproxy:v3.8.0` | supabase |
| meta | `supabase/postgres-meta:v0.84.2` | supabase |

---

## Troubleshooting

### Auth Service Issues (Most Common)

| Issue | Cause | Fix |
|-------|-------|-----|
| `must be owner of function uid` | `auth.uid()` owned by postgres, GoTrue needs ownership | The `roles.sql` init script handles this. If using stale volumes, run: `docker compose exec db psql -U postgres -c "DO \$\$ ... ALTER FUNCTION auth.%I ... OWNER TO supabase_auth_admin ..."` (see Phase 6d) |
| `schema auth does not exist` | Init scripts didn't run (stale volume) | `docker compose --profile supabase down -v` then `up -d` |
| Auth keeps restarting | Usually one of the above two issues | Check `docker compose logs auth --tail 30` |

### Storage Service Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `password authentication failed for supabase_storage_admin` | Password not set by init script | `docker compose exec db psql -U postgres -c "ALTER USER supabase_storage_admin WITH PASSWORD 'postgres';"` then restart |
| RLS policy violation on upload | Missing role grant | `docker compose exec db psql -U postgres -c "GRANT authenticator TO supabase_storage_admin;"` |
| Upload fails silently on macOS | Bind mount doesn't support xattr | Use named Docker volume (already configured in docker-compose.yml) |

### JWT / Auth Key Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| JWT mismatch between secret and tokens | Tokens were signed with a different secret | Regenerate tokens with the correct `JWT_SECRET` (see [JWT Key Generation](#jwt-key-generation)) |
| `invalid JWT` errors in PostgREST | `JWT_SECRET` in root `.env` (Docker Compose) doesn't match `backend/.env` | Ensure root `.env` `JWT_SECRET` matches `backend/.env` `JWT_SECRET` — both are used by different services |
| Login fails silently | Anon key mismatch between frontend and backend | Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `frontend/.env` matches `SUPABASE_ANON_KEY` in `backend/.env` |

### Port / Network Issues

| Issue | Fix |
|-------|-----|
| `Port 3001 already in use` | `lsof -ti:3001 \| xargs kill -9` |
| `Port 3000 already in use` | `lsof -ti:3000 \| xargs kill -9` |
| Backend can't connect to Supabase | Local terminal: use `localhost:7431`. Docker: use `kong:8000` |
| Frontend shows "Failed to fetch" | Verify `NEXT_PUBLIC_API_URL=http://localhost:3003` |

### Database Issues

| Issue | Fix |
|-------|-----|
| Migrations fail with TLS error | Add `PGSSLMODE=disable` env var before the command |
| `supabase_functions_admin does not exist` | Non-critical — this role doesn't exist in all Postgres image versions. The `roles.sql` handles it gracefully |
| Multiple stale NestJS processes | `lsof -ti:3001 \| xargs kill -9` then restart |

### Useful Commands

```bash
# View all service logs
docker compose --profile supabase logs -f

# View specific service logs
docker compose logs auth -f
docker compose logs storage -f

# Restart a specific service
docker compose restart auth

# Connect to local PostgreSQL
docker compose exec db psql -U postgres postgres

# Open Supabase Studio
open http://localhost:7430

# Full rebuild from scratch
docker compose --profile supabase down -v
rm -rf node_modules backend/node_modules frontend/node_modules
pnpm install
docker compose --profile supabase up -d

# Run backend tests
cd backend && pnpm test

# Run frontend type check
cd frontend && npx tsc --noEmit
```

### macOS-Specific Notes

- **Docker Desktop**: Allocate at least 4GB RAM in Docker Desktop → Settings → Resources
- **Storage volumes**: Must use named Docker volumes (not bind mounts) for Supabase Storage on macOS due to xattr limitations
- **Port conflicts**: macOS AirPlay Receiver uses port 5000 — not a conflict with TaskClaw defaults, but be aware if you customize ports
