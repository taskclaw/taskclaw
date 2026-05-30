---
name: taskclaw-deploy
description: >
  Release a new version of TaskClaw to Docker Hub and npm. Runs pre-flight checks
  (lint, build, tests), bumps versions, creates a git tag, pushes to trigger CI/CD,
  and optionally publishes the CLI to npm. Use when ready to ship a new release.
license: MIT
triggers:
  - deploy
  - release
  - publish docker
  - new version
  - ship release
  - docker deploy
  - tag release
  - bump version
metadata:
  version: 1.0.0
  author: TaskClaw
  category: taskclaw-devtools
  domain: deployment
  updated: 2026-03-29
---

# TaskClaw Deploy

Orchestrate a full TaskClaw release: pre-flight checks, version bump, git tag, Docker Hub publish, and optional npm CLI update.

## Persona

You are a release engineer. Be methodical, verify each step before proceeding, and stop immediately if any check fails. Always confirm the version number with the user before tagging.

## Process

### Step 1: Pre-flight checks

Run all of these in parallel and report results:

1. **Confirm on `main` branch** — if not, ask the user to switch or merge first
2. **Check working tree is clean** — `git status` must show no uncommitted changes
3. **Pull latest** — `git pull origin main` to ensure we're up to date
4. **Backend lint** — `cd backend && npm run lint` — must exit 0 (warnings OK, errors NOT OK)
5. **Backend build** — `cd backend && npm run build` — must succeed
6. **Frontend build** — `cd frontend && npm run build` — must succeed
7. **Backend tests** — `cd backend && npm test` — report results (continue-on-error)

If any required check fails, stop and help the user fix it before continuing.

### Step 2: Determine version

1. Show the user the **current latest tag**: `git describe --tags --abbrev=0 2>/dev/null || echo "no tags yet"`
2. Show a **summary of changes** since the last tag: `git log $(git describe --tags --abbrev=0 2>/dev/null)..HEAD --oneline`
3. Based on the changes, **suggest a version** following semver:
   - `patch` (x.y.Z) — bug fixes, lint fixes, dependency updates
   - `minor` (x.Y.0) — new features, new integrations, new skills
   - `major` (X.0.0) — breaking changes, major architecture changes
4. **Ask the user to confirm** the version number (e.g., "v0.2.0")

### Step 3: Bump versions in code

Update version numbers in these files to match the new version (without the `v` prefix):

1. `packages/cli/package.json` — update `"version"` field
2. `backend/package.json` — update `"version"` field (if it has one)
3. `frontend/package.json` — update `"version"` field (if it has one)

Commit these changes:
```
git add packages/cli/package.json backend/package.json frontend/package.json
git commit -m "chore: bump version to vX.Y.Z"
git push origin main
```

### Step 4: Create and push git tag

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

This triggers two GitHub Actions workflows automatically:
- **`docker-publish.yml`** — builds multi-arch Docker images and pushes to Docker Hub
- **`release.yml`** — creates a GitHub Release with auto-generated release notes

### Step 5: Monitor CI/CD

1. Show the user the **Actions URL**: `https://github.com/taskclaw/taskclaw/actions`
2. Wait and check if the workflows are running: `gh run list --limit 5`
3. Optionally watch the Docker publish workflow: `gh run watch`

### Step 6: Publish CLI to npm (if version changed)

Ask the user if they want to publish the updated CLI to npm:

```bash
cd packages/cli
npm publish
```

This updates the `npx taskclaw` package so users get the latest version.

### Step 7: Post-release verification

1. **Docker Hub**: Check images are available — `docker pull taskclaw/backend:vX.Y.Z && docker pull taskclaw/frontend:vX.Y.Z`
2. **GitHub Release**: Confirm the release page exists at `https://github.com/taskclaw/taskclaw/releases/tag/vX.Y.Z`
3. **npm** (if published): Confirm with `npm view taskclaw version`

### Step 8: Summary

Print a release summary:

```
═══════════════════════════════════════
  TaskClaw vX.Y.Z released!
═══════════════════════════════════════

  Docker Hub:
    taskclaw/backend:vX.Y.Z   ✓
    taskclaw/frontend:vX.Y.Z  ✓

  GitHub Release:
    https://github.com/taskclaw/taskclaw/releases/tag/vX.Y.Z

  npm (if published):
    npx taskclaw@X.Y.Z

  Users can upgrade with:
    npx taskclaw upgrade
    # or
    TASKCLAW_VERSION=vX.Y.Z docker compose pull && docker compose up -d
═══════════════════════════════════════
```

## Important notes

- **Never force-push tags** — if a tag already exists and needs to be re-done, delete it first (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`) and then re-create it
- **Never skip pre-flight checks** — a failed Docker build wastes CI minutes and leaves broken images
- **Always confirm version with the user** — don't auto-tag without explicit approval
- The `release.yml` workflow also creates a GitHub Release automatically — no need to create one manually
- Both `docker-publish.yml` and `release.yml` trigger on tags, so both will run — this is expected (docker-publish does multi-arch, release creates the GitHub Release)

---

## Self-Hosting on a VPS (docker-compose)

Releasing (above) publishes images; this is how the full stack actually runs on a server. TaskClaw ships as docker-compose with self-hosted Supabase (`--profile supabase`). The hard-won, non-obvious parts:

### Build images on the box
The published `taskclaw/frontend` image **bakes `NEXT_PUBLIC_*` at build time** (pointing at localhost) — Next.js inlines them, so a runtime env override does nothing. For any host other than localhost, **rebuild the frontend** with the real public URLs:

```bash
docker build -t taskclaw/frontend:latest \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://<VPS_IP>:7431 \
  --build-arg NEXT_PUBLIC_API_URL=http://<VPS_IP>:3003 \
  --build-arg NEXT_PUBLIC_APP_URL=http://<VPS_IP>:3002 \
  --build-arg NEXT_PUBLIC_SITE_URL=http://<VPS_IP>:3002 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> ./frontend
docker build -t taskclaw/backend:latest ./backend
```

### Env files
Three files: root `.env`, `backend/.env`, `frontend/.env`. **`backend/.env` must include** `DATABASE_URL`, `GOTRUE_URL=http://auth:9999`, and `STORAGE_URL=http://kong:8000/storage/v1` — the backend entrypoint needs them to run migrations + initialize storage buckets on boot.

### `docker-compose.override.yml` for a remote/public deploy
- `auth.environment`: `GOTRUE_SITE_URL` + `API_EXTERNAL_URL` → the public host (base hardcodes localhost). `studio.environment.SUPABASE_PUBLIC_URL` → public host.
- If exposing **Redis** publicly: `requirepass` + an **authenticated healthcheck** (`redis-cli -a $PW ping`; the default `redis-cli ping` returns NOAUTH → unhealthy → backend never starts) + a password-bearing `REDIS_URL` for the backend.
- When using prebuilt images, drop the dev-only dist bind-mount: `backend.volumes: !override []` (it shadows the image's compiled `/app/dist` with an empty host dir → crash).

### Up + smoke test
`docker compose --profile supabase up -d` brings up backend, frontend, Redis, and the full Supabase stack. Verify: `curl :3003/health`, `:7431/auth/v1/health`, `:3002`. (Gotcha: `docker compose exec -T … </dev/null` — without `</dev/null` it steals stdin inside a `bash -s` heredoc and truncates the script.)

### Two first-login gotchas over plain HTTP
1. **Account approval** — new signups get `public.users.status='pending'`; the auth guard then returns *"pending approval or suspended."* Activate: `UPDATE users SET status='active' WHERE email='…';` then restart the backend (status is cached in-memory for 5 min).
2. **Secure cookie over HTTP** — the `auth_token` cookie is `Secure` in production, so browsers drop it over plain HTTP and `/dashboard` bounces to `/login`. Set `COOKIE_SECURE=false` in the frontend env (or serve HTTPS).

### Realtime (live updates)
The `supabase` profile includes a `realtime` service. If live updates don't connect, ensure Kong routes `/realtime/v1 → http://realtime-dev:4000/socket` (the upstream URL needs the `/socket` path, and the realtime service must be reachable as `realtime-dev` so the Host-derived tenant matches the self-host seed).

### Known non-blocking issues
A few legacy data-migrations are guarded no-ops on a fresh DB; `supabase/studio`'s healthcheck is flaky (reports unhealthy but works). Neither blocks the app.
