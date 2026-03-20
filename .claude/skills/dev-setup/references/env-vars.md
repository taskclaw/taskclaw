# Environment Variables Reference

Complete list of environment variables used across TaskClaw services.

## Root `.env` (Docker Compose)

Used by `docker-compose.yml` for service configuration.

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL superuser password |
| `JWT_SECRET` | — | JWT signing secret (shared across all Supabase services) |
| `ANON_KEY` | — | Supabase anonymous role JWT |
| `SERVICE_ROLE_KEY` | — | Supabase service role JWT (admin access) |
| `DOMAIN` | `localhost` | Domain for cookie/CORS configuration |
| `BACKEND_PORT` | `3001` | Host port for backend |
| `FRONTEND_PORT` | `3000` | Host port for frontend |
| `KONG_HTTP_PORT` | `7431` | Host port for Supabase API gateway |
| `STUDIO_PORT` | `7430` | Host port for Supabase Studio |
| `POSTGRES_PORT` | `7433` | Host port for PostgreSQL |
| `REDIS_PORT` | `6379` | Host port for Redis |

## Backend `.env`

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | HTTP server port |
| `EDITION` | No | `community` | `community` or `cloud` |
| `SUPABASE_URL` | Yes | — | Supabase API URL. Docker: `http://kong:8000`, Cloud: `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | — | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Supabase service role key |
| `JWT_SECRET` | Yes | — | JWT signing secret (must match Supabase) |
| `ENCRYPTION_KEY` | Yes | — | 64-char hex for encrypting secrets at rest |
| `CORS_ORIGIN` | No | `http://localhost:3002` | Allowed CORS origin |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |
| `OPENROUTER_API_KEY` | No | — | OpenRouter API key for AI features |
| `LANGFUSE_PUBLIC_KEY` | No | — | Langfuse public key (cloud edition only) |
| `LANGFUSE_SECRET_KEY` | No | — | Langfuse secret key (cloud edition only) |
| `STRIPE_SECRET_KEY` | No | — | Stripe secret key (cloud edition only) |
| `STRIPE_WEBHOOK_SECRET` | No | — | Stripe webhook signing secret (cloud edition only) |

## Frontend `.env`

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_EDITION` | No | `community` | Edition flag (controls UI features) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | — | Supabase URL (must be accessible from browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | — | Supabase anonymous key |
| `NEXT_PUBLIC_API_URL` | Yes | — | Backend API URL (must be accessible from browser) |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3002` | Application URL |
| `NEXT_PUBLIC_SITE_URL` | No | `http://localhost:3002` | Site URL for auth redirects |
| `NEXT_PUBLIC_BRAND_NAME` | No | `TaskClaw` | Brand name shown in UI |
| `APP_THEME_NAME` | No | `commercial` | Theme identifier |

## Key Generation

```bash
# JWT Secret (32 bytes hex)
openssl rand -hex 32

# Encryption Key (32 bytes hex)
openssl rand -hex 32

# Supabase API keys (JWTs signed with JWT_SECRET)
# Generate at: https://supabase.com/docs/guides/self-hosting#api-keys
# Or use the Supabase CLI:
npx supabase start  # auto-generates matching keys
```

## Common Pitfalls

1. **SUPABASE_URL mismatch**: Backend uses Docker internal URL (`kong:8000`), frontend uses host-accessible URL (`localhost:7431`)
2. **Key consistency**: `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` must be identical across root `.env`, backend `.env`, and frontend `.env`
3. **CORS**: `CORS_ORIGIN` must match the frontend URL exactly (including port)
4. **Redis URL**: Use `redis:6379` in Docker, `localhost:6379` for local dev
