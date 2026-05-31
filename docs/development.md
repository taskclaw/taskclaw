# Development Guide

This guide covers how to set up a local development environment for TaskClaw.

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **npm** (bundled with Node.js — the repo uses npm as its package manager)
- **Docker and Docker Compose v2+** — runs the backing services (PostgreSQL/pgvector, MinIO, Redis) and, optionally, the full stack

## Clone and Install

```bash
git clone https://github.com/taskclaw/taskclaw.git
cd taskclaw

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

## Set Up Environment Variables

```bash
# Root (Docker Compose)
cp .env.example .env

# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

The defaults work out of the box for local development. Generate real secrets for `JWT_SECRET` and `ENCRYPTION_KEY` (`openssl rand -hex 32`) before exposing the instance. See [configuration.md](./configuration.md) for a full reference of every variable.

## Start the Backing Services

TaskClaw's backing services — PostgreSQL (pgvector), MinIO (S3-compatible storage), and Redis (BullMQ queues) — run in Docker:

```bash
docker compose up -d
```

This is the recommended workflow: it brings up the full stack (Postgres, MinIO, Redis, backend, frontend). The backend entrypoint applies the Drizzle migrations (`backend/drizzle/*.sql`) and seeds (`backend/drizzle/seed/*.sql`) **idempotently on boot**, and `StorageService` creates the required MinIO buckets on startup. Wait ~30s for services to become healthy:

```bash
docker inspect --format='{{.State.Health.Status}}' taskclaw-db-1       # healthy
docker inspect --format='{{.State.Health.Status}}' taskclaw-minio-1    # healthy
docker inspect --format='{{.State.Health.Status}}' taskclaw-backend-1  # healthy
```

| Service | URL | Notes |
|---|---|---|
| PostgreSQL | `localhost:5432` | `postgres` / `POSTGRES_PASSWORD` (default `postgres`) |
| MinIO API | [http://localhost:9000](http://localhost:9000) | S3-compatible object storage |
| MinIO Console | [http://localhost:9001](http://localhost:9001) | `minioadmin` / `minioadmin` by default |
| Redis | `localhost:6379` | BullMQ job queues |

## Start Development Servers

For active development you typically run the backend and frontend from source against the Dockerized Postgres/MinIO/Redis. Open two terminal windows (or use a terminal multiplexer):

```bash
# Terminal 1: Backend (NestJS, port 3003)
cd backend
npm run start:dev

# Terminal 2: Frontend (Next.js, port 3002)
cd frontend
npm run dev
```

When running the backend from source, point `DATABASE_URL`, `S3_ENDPOINT`, and `REDIS_URL` in `backend/.env` at `localhost` (e.g. `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres`, `S3_ENDPOINT=http://localhost:9000`, `REDIS_URL=redis://localhost:6379`) instead of the Docker service hostnames.

The default dev login is **`super@admin.com`** / **`password123`**.

Once running:
- **Frontend**: [http://localhost:3002](http://localhost:3002)
- **Backend API**: [http://localhost:3003](http://localhost:3003)
- **Health check**: [http://localhost:3003/health](http://localhost:3003/health)
- **OpenAPI Docs (Swagger UI)**: [http://localhost:3003/api/docs](http://localhost:3003/api/docs)
- **OpenAPI JSON Spec**: [http://localhost:3003/api/docs-json](http://localhost:3003/api/docs-json)

## Project Structure

```
taskclaw/
├── backend/                    # NestJS API server
│   ├── src/
│   │   ├── accounts/           # Account management (multi-tenant)
│   │   ├── adapters/           # Source integration adapters (Notion, ClickUp, etc.)
│   │   │   ├── __template__/   # Template for new adapters
│   │   │   ├── clickup/        # ClickUp adapter
│   │   │   ├── interfaces/     # SourceAdapter interface definition
│   │   │   └── notion/         # Notion adapter
│   │   ├── agent-sync/         # OpenClaw agent sync (skills+knowledge, every 5 min)
│   │   ├── ai-assistant/       # AI assistant orchestration (LangGraph ReAct)
│   │   ├── ai-provider/        # AI provider abstraction
│   │   ├── auth/               # Local NestJS JWT auth (bcrypt + refresh tokens)
│   │   ├── backbone/           # Multi-AI-provider routing (cascade resolver)
│   │   ├── boards/             # Multi-board workflow engine (templates/instances/steps)
│   │   ├── categories/         # Task categories / labels
│   │   ├── common/             # Shared utilities, middleware, guards
│   │   ├── conversations/      # AI chat conversations
│   │   ├── db/                 # Drizzle ORM client, schema, and DB token
│   │   ├── ee/                 # Cloud-edition modules (Stripe, Langfuse, etc.)
│   │   ├── events/             # Postgres LISTEN/NOTIFY → SSE realtime (/events/stream)
│   │   ├── knowledge/          # Knowledge base (file uploads, context for AI)
│   │   ├── mcp/                # MCP server tools and handlers
│   │   ├── projects/           # Project management
│   │   ├── search/             # Full-text search
│   │   ├── skills/             # AI skills / capabilities
│   │   ├── sources/            # External source CRUD (connects adapters to accounts)
│   │   ├── storage/            # MinIO / S3-compatible object storage
│   │   ├── sync/               # Background sync engine (BullMQ)
│   │   ├── system-settings/    # System-wide configuration
│   │   ├── tasks/              # Task CRUD and business logic
│   │   ├── teams/              # Team management
│   │   ├── users/              # User profiles
│   │   ├── webhooks/           # Webhook event system
│   │   ├── app.module.ts       # Root module (imports everything)
│   │   └── main.ts             # Application entry point
│   ├── test/                   # E2E tests
│   ├── .env.example            # Environment variable template
│   └── package.json
├── frontend/                   # Next.js web application
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   │   ├── (auth)/         # Auth route group (login, signup)
│   │   │   ├── (marketing)/    # Marketing pages
│   │   │   ├── admin/          # Admin panel
│   │   │   ├── dashboard/      # Main app routes
│   │   │   │   ├── tasks/      # Kanban board and task views
│   │   │   │   ├── chat/       # AI chat interface
│   │   │   │   ├── knowledge/  # Knowledge base UI
│   │   │   │   ├── projects/   # Project views
│   │   │   │   ├── boards/     # Multi-board views
│   │   │   │   ├── agents/     # Agent management (category-based)
│   │   │   │   ├── import/     # Import board bundles
│   │   │   │   └── settings/   # Settings pages
│   │   │   │       ├── general/
│   │   │   │       ├── integrations/
│   │   │   │       ├── ai-provider/
│   │   │   │       ├── categories/
│   │   │   │       ├── skills/
│   │   │   │       ├── team/
│   │   │   │       ├── billing/
│   │   │   │       └── usage/
│   │   │   └── onboarding/     # New user onboarding flow
│   │   ├── components/         # Shared React components
│   │   ├── config/             # App configuration
│   │   ├── features/           # Feature-specific components and logic
│   │   ├── hooks/              # Custom React hooks
│   │   ├── kit/                # UI kit / design system primitives
│   │   ├── lib/                # Utility libraries
│   │   ├── theme/              # Theme configuration
│   │   └── types/              # TypeScript type definitions
│   ├── .env.example            # Environment variable template
│   └── package.json
├── backend/drizzle/            # Drizzle SQL migrations + seeds (applied on boot)
├── docker/                     # Docker support files (DB init scripts, volumes)
├── docs/                       # Documentation (you are here)
├── docker-compose.yml          # Docker Compose configuration
└── package.json                # Root package.json (workspace scripts)
```

## Running Tests

### Backend Unit Tests

```bash
cd backend
npm test              # Run all tests once
npm run test:watch    # Run in watch mode
npm run test:cov      # Run with coverage report
```

### Backend E2E Tests

```bash
cd backend
npm run test:e2e
```

## Code Quality

### Linting

```bash
# Lint backend
cd backend
npm run lint

# Lint frontend
cd frontend
npm run lint
```

### Formatting

```bash
cd backend
npm run format        # Prettier formatting for backend code
```

## Common Development Tasks

### Building the MCP Server

The MCP (Model Context Protocol) server allows AI agents to access TaskClaw programmatically.

```bash
cd backend
npm run build:mcp
```

This compiles the MCP server to `backend/dist/mcp-entry.js`. You can then configure it in your AI IDE (Claude Code, Cursor, Windsurf) to access TaskClaw tools.

See [MCP Server Documentation](./mcp-server.md) for configuration and usage.

### Accessing Swagger UI (OpenAPI Docs)

TaskClaw exposes a full OpenAPI specification at `/api/docs`:

1. Start the backend: `cd backend && npm run start:dev`
2. Open [http://localhost:3003/api/docs](http://localhost:3003/api/docs) in your browser
3. Browse all API endpoints with schemas, parameters, and responses
4. Click "Try it out" to test endpoints directly from the UI
5. Download the OpenAPI JSON spec from [http://localhost:3003/api/docs-json](http://localhost:3003/api/docs-json)

**Tip**: You can use the Swagger UI to explore all available endpoints, test authentication with API keys or JWTs, and generate client SDKs for other languages.

### Killing Stale Processes

If the backend port is occupied by a stale process:

```bash
lsof -ti:3003 | xargs kill -9
```

If the frontend port is occupied:

```bash
lsof -ti:3002 | xargs kill -9
```

### Rebuilding from Scratch

```bash
# Remove node_modules and reinstall
rm -rf backend/node_modules frontend/node_modules
cd backend && npm install
cd ../frontend && npm install
```

### Working with the Database

Connect directly to Postgres:

```bash
# Via the Docker `db` service
docker compose exec db psql -U postgres
```

The schema is defined with Drizzle in `backend/src/db/schema.ts`. After changing it, generate a new migration:

```bash
cd backend
npm run db:generate
```

Migrations live in `backend/drizzle/*.sql` (`0000` baseline … `0003` realtime) and seeds in `backend/drizzle/seed/`. The backend entrypoint applies both idempotently on every boot, so a fresh `docker compose up` produces a fully migrated and seeded database. See [`backend/docs/drizzle-conversion-guide.md`](../backend/docs/drizzle-conversion-guide.md) for the query patterns.

### Inspecting Object Storage

Uploaded files (knowledge documents, skill attachments) are stored in MinIO. Browse them via the MinIO console at [http://localhost:9001](http://localhost:9001) (default credentials `minioadmin` / `minioadmin`).

## Tips

- The backend uses **NestJS 11** with module-based architecture. Each feature (tasks, sync, adapters, etc.) is its own NestJS module.
- The frontend uses **Next.js 15** with the App Router. Pages are in `frontend/src/app/` and follow Next.js file-based routing conventions.
- **@dnd-kit** powers the Kanban drag-and-drop board on the tasks page.
- **TanStack React Query** manages server state and caching in the frontend.
- **Zustand** is used for client-side state that needs to persist across page navigation.
- When working with flex layouts, remember to add `min-h-0` to flex parents to prevent scroll freezing (a common CSS pitfall).
