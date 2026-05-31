# Configuration Reference

All TaskClaw configuration is done through environment variables. This document lists every variable, grouped by where it is used.

## Backend (`backend/.env`)

| Variable | Required | Default | Description | Edition |
|---|---|---|---|---|
| `PORT` | No | `3003` | Port the NestJS server listens on | All |
| `EDITION` | No | `community` | `community` for self-hosted, `cloud` for managed TaskClaw Cloud | All |
| `DATABASE_URL` | Yes | -- | PostgreSQL connection string (used by Drizzle ORM). In Docker this is overridden to reach the `db` service: `postgresql://postgres:postgres@db:5432/postgres` | All |
| `DB_POOL_MAX` | No | `10` | Connection pool size. Tune against Postgres `max_connections` | All |
| `AUTH_LOCAL` | No | `true` | Use local NestJS JWT auth (bcrypt + refresh tokens). Always `true` post-migration | All |
| `JWT_SECRET` | Yes | -- | Secret used to sign and verify access tokens. Generate with `openssl rand -hex 32` | All |
| `ENCRYPTION_KEY` | Yes | -- | 64-character hex string used to encrypt sensitive data at rest (e.g. integration API keys). Generate with `openssl rand -hex 32` | All |
| `SITE_URL` | No | `http://localhost:3002` | Base URL used in password-reset email links (`SITE_URL/update-password?token=...`) | All |
| `S3_ENDPOINT` | Yes | -- | MinIO / S3-compatible endpoint the backend connects to. In Docker overridden to `http://minio:9000` | All |
| `S3_PUBLIC_URL` | Yes | `http://localhost:9000` | Public base URL the browser uses to fetch uploaded files (knowledge/skill attachments) | All |
| `S3_ACCESS_KEY` | Yes | `minioadmin` | MinIO / S3 access key | All |
| `S3_SECRET_KEY` | Yes | `minioadmin` | MinIO / S3 secret key | All |
| `S3_REGION` | No | `us-east-1` | S3 region | All |
| `S3_FORCE_PATH_STYLE` | No | `true` | Use path-style S3 URLs (required for MinIO) | All |
| `CORS_ORIGIN` | No | `http://localhost:3002` | Comma-separated list of allowed CORS origins. Set to your frontend domain in production | All |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection URL for BullMQ job queues. Auto-configured in Docker | All |
| `OPENROUTER_API_KEY` | No | -- | API key from [OpenRouter](https://openrouter.ai/keys). Required only if you want AI chat features and no backbone connection is configured | All |
| `OPENROUTER_MODEL` | No | `openai/gpt-4o-mini` | Model identifier to use via OpenRouter (see [available models](https://openrouter.ai/models)) | All |
| `OPENCLAW_GATEWAY_URL` | No | -- | Base URL of the OpenClaw RPC gateway. Used by BackboneModule (OpenClawAdapter) and AgentSyncModule. Example: `https://gateway.openclaw.io` | All |
| `STRIPE_SECRET_KEY` | No | -- | Stripe secret key for billing | Cloud only |
| `STRIPE_WEBHOOK_SECRET` | No | -- | Stripe webhook signing secret | Cloud only |
| `LANGFUSE_PUBLIC_KEY` | No | -- | Langfuse public key for AI observability | Cloud only |
| `LANGFUSE_SECRET_KEY` | No | -- | Langfuse secret key for AI observability | Cloud only |
| `LANGFUSE_BASE_URL` | No | `https://us.cloud.langfuse.com` | Langfuse API base URL | Cloud only |

## Frontend (`frontend/.env`)

| Variable | Required | Default | Description | Edition |
|---|---|---|---|---|
| `NEXT_PUBLIC_EDITION` | No | `community` | `community` for self-hosted, `cloud` for managed TaskClaw Cloud | All |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3003` | URL of the TaskClaw backend API, as reachable from the browser. In Docker, the container-to-container URL (`http://backend:3003`) is set automatically | All |
| `INTERNAL_API_URL` | No | `http://backend:3003` | Backend URL used by the single-origin `/api/[...path]` proxy (server-side, over the Docker network). The proxy injects the Bearer token from the httpOnly `auth_token` cookie | All |
| `SITE_URL` | No | `http://localhost:3002` | Public URL of the frontend app. Used for redirects and link generation | All |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3002` | The public URL of the frontend app. Used for redirects and link generation | All |
| `NEXT_PUBLIC_SITE_URL` | No | `http://localhost:3002` | Site URL, used for SEO and Open Graph metadata | All |
| `COOKIE_SECURE` | No | `true` (prod) | Marks the auth session cookie `Secure`. Set to `false` to serve over plain HTTP on a remote host (browsers drop Secure cookies over HTTP; localhost is exempt) | All |
| `NEXT_PUBLIC_BRAND_NAME` | No | `TaskClaw` | Display name shown in the UI header and page titles | All |
| `APP_THEME_NAME` | No | `commercial` | UI color theme. Valid values: `commercial`, `corporate`, `funky`, `blue`, `red` | All |

## Docker Compose (`.env` at project root)

These variables configure the Docker Compose services themselves. They are only needed when running via `docker compose`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `TASKCLAW_VERSION` | No | `latest` | Docker image tag to pull. Pin to a release (e.g. `v1.2.0`) for reproducible deployments |
| `POSTGRES_PASSWORD` | Yes | `postgres` | Password for the PostgreSQL superuser |
| `POSTGRES_PORT` | No | `5432` | Host port mapped to PostgreSQL |
| `JWT_SECRET` | Yes | -- | Secret used to sign access tokens. Must be at least 32 characters. Generate with `openssl rand -hex 32` |
| `MINIO_ROOT_USER` | No | `minioadmin` | MinIO root user (becomes the backend's `S3_ACCESS_KEY`) |
| `MINIO_ROOT_PASSWORD` | No | `minioadmin` | MinIO root password (becomes the backend's `S3_SECRET_KEY`) |
| `MINIO_PORT` | No | `9000` | Host port mapped to the MinIO S3 API |
| `MINIO_CONSOLE_PORT` | No | `9001` | Host port mapped to the MinIO web console |
| `S3_PUBLIC_URL` | No | `http://localhost:9000` | Public base URL the browser uses to fetch uploaded files. Behind a proxy, use that URL |
| `SITE_URL` | No | `http://localhost:3002` | Passed to the frontend container; used for password-reset links and redirects |
| `COOKIE_SECURE` | No | `false` | Passed to the frontend container; set `false` to serve over plain HTTP |
| `BACKEND_PORT` | No | `3003` | Host port mapped to the backend container |
| `FRONTEND_PORT` | No | `3002` | Host port mapped to the frontend container |

## Edition Gating

The `EDITION` / `NEXT_PUBLIC_EDITION` variable controls which features are available:

- **`community`** (default): All core features are enabled. Cloud-only modules (Stripe billing, Langfuse observability, waitlist) are disabled. This is what you want for self-hosting.
- **`cloud`**: Enables cloud-only modules in `backend/src/ee/`. Requires Stripe and Langfuse credentials. Used by the managed TaskClaw Cloud service.

Self-hosted users should leave this set to `community` and can safely ignore all Cloud-only variables.

## Security Notes

- **Never commit `.env` files** to version control. They are listed in `.gitignore` by default.
- **`DATABASE_URL`** grants full access to your database. Keep it on the backend only; never expose it to the frontend.
- **`ENCRYPTION_KEY`** is used to encrypt integration credentials (API keys for Notion, ClickUp, etc.) at rest. Changing it will invalidate existing encrypted data.
- **`JWT_SECRET`** signs all access tokens. Keep it secret and stable — rotating it invalidates every active session. Tenant isolation is enforced at the application layer (`account_id` scoping); there is no row-level security.
- **`S3_SECRET_KEY` / `MINIO_ROOT_PASSWORD`** protect object storage (uploaded knowledge and skill attachments). Change the defaults before exposing MinIO beyond localhost.
