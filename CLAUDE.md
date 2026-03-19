# TaskClaw — Claude Code Instructions

## Project Structure

- **Backend**: NestJS at `backend/src/` — runs in Docker on port 3003
- **Frontend**: Next.js at `frontend/src/` — runs locally on port 3002
- **Database**: Supabase (Postgres + Auth + PostgREST) — runs in Docker on port 7431

## Running Locally

1. Start Docker Desktop
2. Wait for all services to be healthy (~30s):
   ```bash
   docker inspect --format='{{.State.Health.Status}}' taskclaw-backend-1  # healthy
   docker inspect --format='{{.State.Health.Status}}' taskclaw-kong-1     # healthy
   docker inspect --format='{{.State.Health.Status}}' taskclaw-auth-1     # healthy
   ```
3. Then start the frontend: `cd frontend && npm run dev`

## Troubleshooting

### "Something went wrong" / "fetch failed" after Docker restart
- **Symptom**: Login succeeds but dashboard shows "Something went wrong". Backend logs show `ECONNREFUSED` or `SyncService Failed to fetch sources`.
- **Cause**: Docker services (Supabase auth, PostgREST, Kong) take 10-30s to become fully healthy after restart. The backend container may report "healthy" before its internal Supabase dependencies are ready.
- **Fix**: Wait ~30s, then verify:
  ```bash
  curl -s http://localhost:7431/auth/v1/health  # Should return GoTrue JSON
  curl -s http://localhost:3003/health           # Should return {"status":"ok"}
  ```
  Refresh the browser once both return OK.

### Frontend port conflict (EADDRINUSE :::3002)
- A stale dev server is still running. Kill it:
  ```bash
  lsof -ti:3002 | xargs kill -9
  ```

### `[theme] Failed to fetch theme: 500`
- Non-critical warning during SSR. Resolves once the backend is fully ready. Safe to ignore.
