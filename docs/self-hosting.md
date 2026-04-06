# Self-Hosting TaskClaw

This guide walks you through deploying TaskClaw on your own infrastructure using Docker Compose.

## Prerequisites

- **Docker** and **Docker Compose v2+** (ships with Docker Desktop)
- A **Supabase instance** -- either [Supabase Cloud](https://supabase.com) (easiest) or the local Supabase profile included in this repo
- An **OpenRouter API key** (optional, required only for AI chat features -- get one at [openrouter.ai/keys](https://openrouter.ai/keys))

## Fastest Start (Zero Config)

Get TaskClaw running with a single command -- no cloning, no configuration:

```bash
npx taskclaw
```

Or without Node.js:

```bash
curl -fsSL https://raw.githubusercontent.com/taskclaw/taskclaw/main/scripts/install.sh | sh
```

This downloads the quickstart compose file, pulls Docker images, and starts everything on **http://localhost:3002**. Login with `super@admin.com` / `password123`.

Manage with: `npx taskclaw stop`, `npx taskclaw logs`, `npx taskclaw upgrade`, `npx taskclaw reset`.

## Quick Start -- BYO Supabase

Use this path if you already have a Supabase Cloud project or an existing self-hosted Supabase instance.

```bash
# 1. Clone the repo
git clone https://github.com/taskclaw/taskclaw.git
cd taskclaw

# 2. Copy and fill in environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Edit backend/.env
#    - Set SUPABASE_URL to your Supabase project URL (e.g. https://abc123.supabase.co)
#    - Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
#    - Set JWT_SECRET (openssl rand -hex 32)
#    - Set ENCRYPTION_KEY (openssl rand -hex 32)
#    - (Optional) Set OPENROUTER_API_KEY for AI features

# 4. Edit frontend/.env
#    - Set NEXT_PUBLIC_SUPABASE_URL to match your Supabase project URL
#    - Set NEXT_PUBLIC_SUPABASE_ANON_KEY to match your anon key

# 5. Start the stack
docker compose up -d

# 6. Open the app
open http://localhost:3002
```

The BYO Supabase stack starts three containers:

| Service   | Port | Description              |
|-----------|------|--------------------------|
| frontend  | 3002 | Next.js web app          |
| backend   | 3003 | NestJS API server        |
| redis     | 6379 | BullMQ job queue (internal) |

## Quick Start -- All-in-One (Local Supabase)

Use this path if you want zero external dependencies. Docker Compose will spin up a full Supabase stack alongside TaskClaw.

```bash
# 1. Clone the repo
git clone https://github.com/taskclaw/taskclaw.git
cd taskclaw

# 2. Copy the root .env (configures Supabase containers)
cp .env.example .env

# 3. Edit .env
#    - Set POSTGRES_PASSWORD
#    - Set JWT_SECRET (openssl rand -hex 32)
#    - Generate ANON_KEY and SERVICE_ROLE_KEY signed with that JWT_SECRET
#      (see https://supabase.com/docs/guides/self-hosting#api-keys)

# 4. Copy app-level env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 5. Update backend/.env to point at the local Supabase Kong gateway:
#    SUPABASE_URL=http://kong:8000
#    SUPABASE_ANON_KEY=<same ANON_KEY from step 3>
#    SUPABASE_SERVICE_ROLE_KEY=<same SERVICE_ROLE_KEY from step 3>

# 6. Update frontend/.env to point at the local Supabase public URL:
#    NEXT_PUBLIC_SUPABASE_URL=http://localhost:7431
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=<same ANON_KEY from step 3>

# 7. Start everything (the `supabase` profile brings up Postgres, Kong, GoTrue, etc.)
docker compose --profile supabase up -d

# 8. Open the app
open http://localhost:3002
```

The All-in-One stack starts the following services:

| Service   | Port | Description                        |
|-----------|------|------------------------------------|
| frontend  | 3002 | Next.js web app                    |
| backend   | 3003 | NestJS API server                  |
| redis     | 6379 | BullMQ job queue (internal)        |
| kong      | 7431 | Supabase API gateway               |
| studio    | 7430 | Supabase Studio (database admin)   |
| db        | 5432 | PostgreSQL 17                      |
| auth      | --   | Supabase GoTrue (auth, internal)   |
| rest      | --   | PostgREST (internal)               |
| meta      | --   | Postgres Meta (internal)           |

After startup, you can access:
- **TaskClaw app**: [http://localhost:3002](http://localhost:3002)
- **Supabase Studio**: [http://localhost:7430](http://localhost:7430)

## Generating Supabase API Keys

The ANON_KEY and SERVICE_ROLE_KEY are JWTs signed with your JWT_SECRET. You can generate them using the official Supabase tooling:

1. Go to [https://supabase.com/docs/guides/self-hosting#api-keys](https://supabase.com/docs/guides/self-hosting#api-keys)
2. Enter your JWT_SECRET
3. Copy the generated `anon` and `service_role` keys
4. Paste them into both `.env` (root) and `backend/.env` / `frontend/.env`

## Upgrading

To upgrade to a new release:

```bash
# Pull the latest images (or pin a specific version)
TASKCLAW_VERSION=v1.2.0 docker compose pull

# Restart with the new images
docker compose up -d
```

To use the latest development build:

```bash
TASKCLAW_VERSION=latest docker compose pull && docker compose up -d
```

## Backup and Restore

### Database Backup

If you are running the local Supabase profile, back up the Postgres data:

```bash
# Create a backup
docker compose exec db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# Restore from a backup
docker compose exec -T db psql -U postgres postgres < backup_20260101.sql
```

If you are using Supabase Cloud, use the backup features in your Supabase dashboard or connect directly with `pg_dump`:

```bash
pg_dump "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" > backup.sql
```

### Redis Data

Redis stores BullMQ job queues. Data here is transient and will be recreated automatically. No backup is typically needed.

### Volume Data

Docker volumes store persistent data. To see them:

```bash
docker volume ls | grep taskclaw
```

## Custom Ports

Override default ports via environment variables or by editing `docker-compose.yml`:

```bash
BACKEND_PORT=8080 FRONTEND_PORT=8081 docker compose up -d
```

For the Supabase profile:

```bash
SUPABASE_API_PORT=9000 SUPABASE_STUDIO_PORT=9001 POSTGRES_PORT=9002 docker compose --profile supabase up -d
```

## Running Behind a Reverse Proxy

If you place TaskClaw behind nginx, Caddy, or Traefik:

1. Set `CORS_ORIGIN` in `backend/.env` to your public domain (e.g., `https://tasks.example.com`)
2. Set `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` in `frontend/.env` to your public domain
3. Set `NEXT_PUBLIC_API_URL` in `frontend/.env` to your backend's public URL (e.g., `https://api.tasks.example.com`)
4. Ensure your proxy forwards WebSocket connections if you plan to use real-time features

## Troubleshooting

**Backend won't start / health check fails**
- Check logs: `docker compose logs backend`
- Verify Supabase URL and keys are correct in `backend/.env`
- Ensure Redis is healthy: `docker compose exec redis redis-cli ping`

**Frontend shows "Failed to fetch" errors**
- Verify `NEXT_PUBLIC_API_URL` points to the backend from the browser's perspective
- In Docker, the frontend container uses `http://backend:3003` internally, but your browser needs `http://localhost:3003`

**Supabase Studio won't load (All-in-One)**
- Check that the `db` container is healthy: `docker compose ps`
- Verify `POSTGRES_PASSWORD` matches across `.env` and all services

**Port conflicts**
- Another process may be using port 3002, 3003, or 5432
- Use the custom port variables described above, or stop conflicting services

## Configuration Reference

For a complete list of all environment variables, see [configuration.md](./configuration.md).
