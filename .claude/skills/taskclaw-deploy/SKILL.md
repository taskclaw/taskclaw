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
