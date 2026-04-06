# Configuration Reference

All TaskClaw configuration is done through environment variables. This document lists every variable, grouped by where it is used.

## Backend (`backend/.env`)

| Variable | Required | Default | Description | Edition |
|---|---|---|---|---|
| `PORT` | No | `3003` | Port the NestJS server listens on | All |
| `EDITION` | No | `community` | `community` for self-hosted, `cloud` for managed TaskClaw Cloud | All |
| `SUPABASE_URL` | Yes | -- | URL of your Supabase instance. Use `http://kong:8000` for the local Docker profile, or your Supabase Cloud project URL (e.g. `https://abc123.supabase.co`) | All |
| `SUPABASE_ANON_KEY` | Yes | -- | Supabase anonymous/public API key | All |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | -- | Supabase service role key (has full database access -- keep secret) | All |
| `JWT_SECRET` | Yes | -- | Secret used to sign and verify JWTs. Must match the Supabase JWT secret. Generate with `openssl rand -hex 32` | All |
| `ENCRYPTION_KEY` | Yes | -- | 64-character hex string used to encrypt sensitive data at rest (e.g. integration API keys). Generate with `openssl rand -hex 32` | All |
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
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | -- | Public Supabase URL, accessible from the browser. Use `http://localhost:7431` for the local Docker profile, or your Supabase Cloud project URL | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | -- | Supabase anonymous/public API key (safe to expose to browsers) | All |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3003` | URL of the TaskClaw backend API, as reachable from the browser. In Docker, the container-to-container URL (`http://backend:3003`) is set automatically | All |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3002` | The public URL of the frontend app. Used for redirects and link generation | All |
| `NEXT_PUBLIC_SITE_URL` | No | `http://localhost:3002` | Site URL, used for SEO and Open Graph metadata | All |
| `NEXT_PUBLIC_BRAND_NAME` | No | `TaskClaw` | Display name shown in the UI header and page titles | All |
| `APP_THEME_NAME` | No | `commercial` | UI color theme. Valid values: `commercial`, `corporate`, `funky`, `blue`, `red` | All |

## Docker Compose (`.env` at project root)

These variables configure the Docker Compose services themselves. They are only needed when running via `docker compose`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `TASKCLAW_VERSION` | No | `latest` | Docker image tag to pull. Pin to a release (e.g. `v1.2.0`) for reproducible deployments |
| `POSTGRES_PASSWORD` | Yes (supabase profile) | `postgres` | Password for the PostgreSQL superuser |
| `JWT_SECRET` | Yes (supabase profile) | -- | JWT secret shared across all Supabase services. Must be at least 32 characters |
| `ANON_KEY` | Yes (supabase profile) | -- | Supabase anon key, signed with the JWT_SECRET above |
| `SERVICE_ROLE_KEY` | Yes (supabase profile) | -- | Supabase service role key, signed with the JWT_SECRET above |
| `DOMAIN` | No | `localhost` | Domain used by Supabase services |
| `BACKEND_PORT` | No | `3003` | Host port mapped to the backend container |
| `FRONTEND_PORT` | No | `3002` | Host port mapped to the frontend container |
| `SUPABASE_API_PORT` | No | `7431` | Host port mapped to the Supabase Kong API gateway |
| `SUPABASE_STUDIO_PORT` | No | `7430` | Host port mapped to Supabase Studio |
| `POSTGRES_PORT` | No | `5432` | Host port mapped to PostgreSQL |

## Edition Gating

The `EDITION` / `NEXT_PUBLIC_EDITION` variable controls which features are available:

- **`community`** (default): All core features are enabled. Cloud-only modules (Stripe billing, Langfuse observability, waitlist) are disabled. This is what you want for self-hosting.
- **`cloud`**: Enables cloud-only modules in `backend/src/ee/`. Requires Stripe and Langfuse credentials. Used by the managed TaskClaw Cloud service.

Self-hosted users should leave this set to `community` and can safely ignore all Cloud-only variables.

## Security Notes

- **Never commit `.env` files** to version control. They are listed in `.gitignore` by default.
- **`SUPABASE_SERVICE_ROLE_KEY`** has full access to your database. Keep it on the backend only; never expose it to the frontend.
- **`ENCRYPTION_KEY`** is used to encrypt integration credentials (API keys for Notion, ClickUp, etc.) at rest. Changing it will invalidate existing encrypted data.
- **`JWT_SECRET`** must be identical across Supabase and the backend. A mismatch will cause authentication failures (HTTP 500 on login).
