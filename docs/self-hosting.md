# Self-Hosting TaskClaw

This guide walks you through running TaskClaw on your own machine or server.

TaskClaw is fully self-contained: the Docker Compose stack ships its own PostgreSQL
(with pgvector), MinIO object storage, and Redis. There are **no external service
dependencies** — auth is built into the backend (local JWT), and realtime updates
flow over Postgres `LISTEN/NOTIFY` → Server-Sent Events.

## Prerequisites

- **Docker** and **Docker Compose v2+** (ships with Docker Desktop)
- **Node.js** (only if you use the `npx taskclaw` launcher — the curl installer works without it)

AI chat features use OpenRouter (bring your own key). You configure the key in-app
under **Settings → AI Provider** after logging in — no environment variable required.

## Fastest Start (Local, Zero Config)

Get TaskClaw running on your machine with a single command — no cloning, no configuration:

```bash
npx taskclaw
```

Or without Node.js:

```bash
curl -fsSL https://raw.githubusercontent.com/taskclaw/taskclaw/main/scripts/install.sh | sh
```

This downloads the quickstart compose file (into `~/taskclaw` by default), pulls the
Docker images, and starts everything on **http://localhost:3000**. Log in with:

| | |
|---|---|
| **Email** | `super@admin.com` |
| **Password** | `password123` |

Manage the install with:

```bash
npx taskclaw stop       # Stop TaskClaw
npx taskclaw status     # Container status
npx taskclaw logs       # Tail logs
npx taskclaw upgrade    # Pull latest images & restart
npx taskclaw reset      # Stop + delete all data
```

Set `TASKCLAW_DIR=./my-dir` to use a custom install directory.

## Deploy to a Server (One Command)

To run TaskClaw on a remote VPS that others can reach, point one command at any
fresh Ubuntu/Debian host:

```bash
npx taskclaw remote --host <your-server-ip>
```

This connects over SSH, installs Docker if missing, **generates unique secrets**
(JWT secret, encryption key, database password, MinIO credentials), points
`S3_PUBLIC_URL` at the server so attachments load in the browser, opens the
firewall for the public port and MinIO's `9000` (the MinIO admin console on
`9001` stays bound to localhost), brings up the full stack, and saves the
generated secrets locally as `taskclaw-<host>.credentials.json` (chmod 600).
The default public port is **80**, so the app is served at `http://<your-server-ip>`.

Options:

```
--host <ip>          Target server IP or hostname        (alias: ip=<ip>)
--user <name>        SSH user (default: root)            (alias: login=<name>)
--key <path>         SSH private key to authenticate with
--password [pw]      Use password auth. Bare flag => hidden prompt.
--domain <example>   Serve at https://<domain> instead of http://<ip>
--port <n>           Public HTTP port on the server (default: 80)
--ssh-port <n>       SSH port if not 22
```

SSH key (or ssh-agent) auth is preferred; with no key, you get a hidden password
prompt. For `--domain`, point a DNS A-record at the host and terminate TLS with a
reverse proxy in front before HTTPS will resolve.

To completely remove an install (local or remote):

```bash
npx taskclaw destroy                   # local
npx taskclaw destroy --host <ip>       # remote, same SSH options as `remote`
```

`destroy` is deliberately gated: it deletes all containers, all volumes (**all
data**), and the install directory, and requires you to type two exact
confirmation sentences at an interactive terminal. Add `--purge-images` to also
remove the Docker images.

## What's in the Stack

The quickstart compose (`docker-compose.quickstart.yml`) starts five services:

| Service  | Image                   | Exposed port        | Role |
|----------|-------------------------|---------------------|------|
| frontend | `taskclaw/frontend`     | `3000` (configurable via `EXTERNAL_PORT`) | Next.js app — the **single public origin**; proxies `/api` to the backend over the Docker network |
| backend  | `taskclaw/backend`      | — (internal `3003`) | NestJS API server |
| db       | `pgvector/pgvector:pg16`| — (internal `5432`) | PostgreSQL with pgvector |
| minio    | `minio/minio`           | `9000` (API), `9001` (console) | S3-compatible storage for attachments |
| redis    | `redis:7-alpine`        | — (internal `6379`) | BullMQ job queue |

Notes:

- **Auth is built in.** The backend handles signup/login with local JWT auth
  (bcrypt + refresh tokens). No external identity provider.
- **Realtime is SSE.** Live board updates flow over Postgres `LISTEN/NOTIFY` →
  NestJS SSE; no WebSocket gateway is required.
- **Migrations run automatically.** The backend entrypoint applies schema
  migrations and seed data idempotently on boot, and creates the MinIO buckets.
- **Host portability via one variable.** `SITE_URL` drives CORS, the Server
  Actions allowed-origin, and auth links — set it once and the same images run on
  localhost, a raw IP, or a domain.
- **MinIO port 9000 must be browser-reachable** on non-localhost installs (see
  `S3_PUBLIC_URL` below), or attachment downloads won't load.

## Manual Install (Docker Compose)

```bash
git clone https://github.com/taskclaw/taskclaw.git
cd taskclaw
docker compose -f docker-compose.quickstart.yml up -d
```

Open **http://localhost:3000** and log in with `super@admin.com` / `password123`.

Running on a non-localhost host? Set `SITE_URL` (everything else derives from it)
and point `S3_PUBLIC_URL` at a browser-reachable MinIO URL:

```bash
SITE_URL=http://<your-server-ip>:3000 \
S3_PUBLIC_URL=http://<your-server-ip>:9000 \
docker compose -f docker-compose.quickstart.yml up -d
```

Over plain HTTP, `COOKIE_SECURE` must be `false` (the quickstart default) — a
`Secure` cookie is silently dropped by browsers on http:// origins and login never
completes. Serve HTTPS in production and set `COOKIE_SECURE=true`.

Other useful variables: `EXTERNAL_PORT` (public port, default 3000),
`POSTGRES_PASSWORD`, `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, `JWT_SECRET`,
`ENCRYPTION_KEY`, `TASKCLAW_VERSION` (pin an image tag).

Stop and reset:

```bash
docker compose -f docker-compose.quickstart.yml down      # stop
docker compose -f docker-compose.quickstart.yml down -v   # stop + delete all data
```

## Production Checklist

The quickstart compose ships **hardcoded development secrets** so it works with
zero config. Before exposing an install to the internet:

1. **Regenerate secrets** — set strong values for `JWT_SECRET`, `ENCRYPTION_KEY`
   (`openssl rand -hex 32` each), `POSTGRES_PASSWORD`, and the MinIO credentials
   (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`). The `npx taskclaw remote`
   installer does this automatically and writes the values to the credentials file.
2. **Change the default admin password** after first login.
3. **Serve HTTPS** — put a TLS-terminating reverse proxy (nginx, Caddy, Traefik)
   in front of the frontend port, or install with `npx taskclaw remote --domain`.
   Then set `SITE_URL=https://...` and `COOKIE_SECURE=true`.
4. **Back up the volumes** — `db_data` (Postgres) and `minio_data` (attachments)
   hold all persistent state:

   ```bash
   # Database dump (run from the install directory)
   docker compose exec db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

   # Restore
   docker compose exec -T db psql -U postgres postgres < backup_20260101.sql
   ```

5. **Redis** holds transient BullMQ job state; it persists to the `redis_data`
   volume but needs no backup — queues are recreated automatically.

## Upgrading

With the CLI:

```bash
npx taskclaw upgrade
```

Or manually, from the directory containing the compose file:

```bash
docker compose -f docker-compose.quickstart.yml pull
docker compose -f docker-compose.quickstart.yml up -d
```

Pin a specific release with `TASKCLAW_VERSION`:

```bash
TASKCLAW_VERSION=v2.0.0 docker compose -f docker-compose.quickstart.yml pull && \
TASKCLAW_VERSION=v2.0.0 docker compose -f docker-compose.quickstart.yml up -d
```

Database migrations are applied automatically by the backend on startup.

## Troubleshooting

**Services still starting / health check fails**
- The stack takes 30-60 seconds on first boot. Check progress with
  `docker compose ps` and `docker compose logs -f backend`.
- The app is ready when `curl -sf http://localhost:3000/api/health` succeeds.

**Login succeeds but immediately bounces back to the sign-in page**
- You are serving plain HTTP with `COOKIE_SECURE=true`. Set `COOKIE_SECURE=false`
  (or serve HTTPS) and restart the frontend container.

**Attachments won't download or images don't load**
- `S3_PUBLIC_URL` must be a URL the *browser* can reach (e.g.
  `http://<your-server-ip>:9000`), and port 9000 must be open in any firewall.

**Port conflict on 3000**
- Another process is using the port. Start with a different one:
  `EXTERNAL_PORT=8080 SITE_URL=http://localhost:8080 docker compose -f docker-compose.quickstart.yml up -d`

## Configuration Reference

For a complete list of environment variables, see [configuration.md](./configuration.md).
