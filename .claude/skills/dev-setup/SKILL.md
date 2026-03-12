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
  version: 1.0.0
  author: TaskClaw
  category: taskclaw-devtools
  domain: developer-experience
  updated: 2026-03-12
---

# Dev Setup

Guide developers through setting up a complete local TaskClaw development environment. Walks through prerequisites, Docker services, environment configuration, database setup, and running the dev servers.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Wizard Flow](#wizard-flow)
- [Environment Reference](#environment-reference)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

1. Ask the developer about their current setup (OS, Docker, Node version)
2. Determine setup path: Cloud Supabase vs Local Supabase (Docker)
3. Walk through each step, verifying success before moving on
4. Get all services running and verified

---

## Wizard Flow

### Phase 1: Prerequisites Check

Ask the user (or check automatically using the Bash tool):

```bash
# Check Node.js version (need 20+)
node --version

# Check pnpm (need 10+)
pnpm --version

# Check Docker
docker --version
docker compose version

# Check git
git --version
```

**Required**:
- Node.js 20+ LTS
- pnpm 10+ (`npm install -g pnpm` if missing)
- Git

**Required for local Supabase**:
- Docker Engine + Docker Compose v2+
- At least 4GB RAM allocated to Docker

If any prerequisite is missing, guide the user through installing it before proceeding.

### Phase 2: Setup Path

Ask: "How do you want to run Supabase?"

**Option A: Cloud Supabase** (faster, simpler)
- User needs a Supabase project (free tier works)
- Get URL, anon key, and service role key from Supabase dashboard
- No Docker needed for database

**Option B: Local Supabase via Docker** (zero external dependencies)
- Runs PostgreSQL, Auth, Storage, Studio all locally
- Requires Docker with sufficient resources
- More representative of production

Recommend **Option B** for full-stack development, **Option A** for frontend-only work.

### Phase 3: Clone & Install

```bash
# Clone the repository
git clone https://github.com/taskclaw/taskclaw.git
cd taskclaw

# Install all dependencies (turborepo monorepo)
pnpm install
```

Verify installation succeeded — check for errors in the output.

### Phase 4: Environment Configuration

Copy all `.env.example` files:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

#### Option A: Cloud Supabase `.env` values

Edit `backend/.env`:
```env
PORT=3001
EDITION=community
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=<run: openssl rand -hex 32>
ENCRYPTION_KEY=<run: openssl rand -hex 32>
CORS_ORIGIN=http://localhost:3000
REDIS_URL=redis://localhost:6379
```

Edit `frontend/.env`:
```env
NEXT_PUBLIC_EDITION=community
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BRAND_NAME=TaskClaw
APP_THEME_NAME=commercial
```

#### Option B: Local Supabase `.env` values

First, generate keys:
```bash
JWT_SECRET=$(openssl rand -hex 32)
echo "JWT_SECRET=$JWT_SECRET"
```

The anon key and service role key must be JWTs signed with the JWT_SECRET. Generate them from [supabase.com/docs/guides/self-hosting#api-keys](https://supabase.com/docs/guides/self-hosting#api-keys) or use the values from `.env.example` if they match your JWT_SECRET.

Edit root `.env`:
```env
POSTGRES_PASSWORD=postgres
JWT_SECRET=<your-generated-secret>
ANON_KEY=<generated-jwt>
SERVICE_ROLE_KEY=<generated-jwt>
DOMAIN=localhost
```

Edit `backend/.env`:
```env
PORT=3001
EDITION=community
SUPABASE_URL=http://kong:8000
SUPABASE_ANON_KEY=<same-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<same-service-role-key>
JWT_SECRET=<same-jwt-secret>
ENCRYPTION_KEY=<run: openssl rand -hex 32>
CORS_ORIGIN=http://localhost:3000
REDIS_URL=redis://redis:6379
```

Edit `frontend/.env`:
```env
NEXT_PUBLIC_EDITION=community
NEXT_PUBLIC_SUPABASE_URL=http://localhost:7431
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same-anon-key>
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BRAND_NAME=TaskClaw
APP_THEME_NAME=commercial
```

**Important**: `SUPABASE_URL` for backend uses `kong:8000` (Docker internal network) while frontend uses `localhost:7431` (browser access through host port mapping).

### Phase 5: Start Services

#### Option A: Cloud Supabase

```bash
# Start Redis (needed for BullMQ job queue)
docker compose up redis -d

# Start development servers
pnpm run dev
```

#### Option B: Local Supabase

```bash
# Start all services including Supabase
docker compose --profile supabase up -d

# Wait for services to be healthy
docker compose ps
```

Verify all services are running:

| Service | Port | How to verify |
|---------|------|---------------|
| Frontend | 3000 | Open http://localhost:3000 |
| Backend | 3001 | `curl http://localhost:3001/health` |
| Supabase Studio | 7430 | Open http://localhost:7430 |
| Kong (API Gateway) | 7431 | `curl http://localhost:7431/rest/v1/` |
| PostgreSQL | 7433 | `docker compose exec db psql -U postgres` |
| Redis | 6379 | `docker compose exec redis redis-cli ping` |

### Phase 6: Database Setup

If using **local Supabase**, migrations run automatically on container startup.

If using **cloud Supabase**, apply migrations:
```bash
cd backend
npx supabase db push --db-url "postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
```

Create a super admin user:
```bash
cd backend
pnpm run setup:super-admin
# Follow the interactive prompts
# Default: admin@ott.dev / admin123456
```

### Phase 7: Verify

Run through this checklist:

1. **Backend health**: `curl http://localhost:3001/health` → `{ "status": "ok" }`
2. **Frontend loads**: Open http://localhost:3000 → login page appears
3. **Database connected**: Backend logs show successful Supabase connection
4. **Login works**: Sign in with the super admin credentials
5. **Kanban loads**: Tasks page shows the Kanban board

If any step fails, see the [Troubleshooting](#troubleshooting) section.

---

## Environment Reference

See `references/env-vars.md` for the complete list of environment variables.

### Key Ports

| Service | Default Port | Env Var |
|---------|-------------|---------|
| Frontend | 3000 | `FRONTEND_PORT` |
| Backend | 3001 | `PORT` / `BACKEND_PORT` |
| Supabase Studio | 7430 | `STUDIO_PORT` |
| Kong (API Gateway) | 7431 | `KONG_HTTP_PORT` |
| PostgreSQL | 7433 | `POSTGRES_PORT` |
| Redis | 6379 | `REDIS_PORT` |

### Docker Services

All containers are prefixed with `ott-supabase-*` and use the `supabase_network_ott-dashboard` Docker network.

| Service | Image | Profile |
|---------|-------|---------|
| backend | Built from `./backend/Dockerfile` | default |
| frontend | Built from `./frontend/Dockerfile` | default |
| redis | `redis:7-alpine` | default |
| db | `supabase/postgres:17` | supabase |
| kong | `kong:2` | supabase |
| auth (GoTrue) | `supabase/gotrue` | supabase |
| rest (PostgREST) | `postgrest/postgrest` | supabase |
| studio | `supabase/studio` | supabase |
| storage | `supabase/storage-api` | supabase |
| imgproxy | `darthsim/imgproxy` | supabase |
| meta | `supabase/postgres-meta` | supabase |

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `Port 3001 already in use` | Kill stale processes: `lsof -ti:3001 \| xargs kill -9` |
| `Port 3000 already in use` | Kill stale processes: `lsof -ti:3000 \| xargs kill -9` |
| Backend can't connect to Supabase | Check `SUPABASE_URL` — use `kong:8000` for Docker, cloud URL otherwise |
| Frontend shows "Failed to fetch" | Verify `NEXT_PUBLIC_API_URL=http://localhost:3001` (must be accessible from browser) |
| Supabase Studio won't load | Check db container: `docker compose ps`, verify `POSTGRES_PASSWORD` consistency |
| Storage upload fails with RLS error | Run: `GRANT authenticator TO supabase_storage_admin;` in PostgreSQL |
| Storage upload fails silently | Storage volume must be a named Docker volume (not bind mount) on macOS |
| `Cannot find module` errors | Run `pnpm install` from the project root |
| Migrations fail | Check `POSTGRES_PASSWORD` matches across `.env` files |
| Flexbox scroll freeze in UI | Add `min-h-0` to flex parents (known Tailwind/flex issue) |
| Multiple NestJS processes | `lsof -ti:3001 \| xargs kill -9` then restart |

### Useful Commands

```bash
# View all service logs
docker compose logs -f

# View specific service logs
docker compose logs backend -f
docker compose logs db -f

# Restart a specific service
docker compose restart backend

# Connect to local PostgreSQL
docker compose exec db psql -U postgres postgres

# Open Supabase Studio
open http://localhost:7430

# Rebuild from scratch
docker compose down -v
rm -rf node_modules backend/node_modules frontend/node_modules
pnpm install
docker compose --profile supabase up -d

# Run backend tests
cd backend && pnpm test

# Run frontend type check
cd frontend && npx tsc --noEmit

# Build everything
pnpm run build
```

### macOS-Specific Notes

- **Docker Desktop**: Allocate at least 4GB RAM in Docker Desktop → Settings → Resources
- **Storage volumes**: Must use named Docker volumes (not bind mounts) for Supabase Storage on macOS due to xattr limitations
- **Port conflicts**: macOS AirPlay Receiver uses port 5000 — not a conflict with TaskClaw defaults, but be aware if you customize ports
