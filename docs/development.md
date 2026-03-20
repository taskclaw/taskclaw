# Development Guide

This guide covers how to set up a local development environment for TaskClaw.

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **pnpm 10+** (the repo uses pnpm as its package manager)
- **A Supabase instance** -- either a free [Supabase Cloud](https://supabase.com) project or a local instance via Docker
- **Docker and Docker Compose v2+** (optional, only needed if running Supabase locally or Redis)

## Clone and Install

```bash
git clone https://github.com/your-org/taskclaw.git
cd taskclaw

# Install dependencies for the entire monorepo
pnpm install
```

If you don't have pnpm installed:

```bash
npm install -g pnpm
```

## Set Up Environment Variables

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

Edit each file and fill in your Supabase credentials. See [configuration.md](./configuration.md) for a full reference of every variable.

### Using Supabase Cloud (Recommended for Development)

1. Create a free project at [supabase.com](https://supabase.com)
2. Copy the project URL, anon key, and service role key from the Supabase dashboard (Settings > API)
3. Paste them into `backend/.env` and `frontend/.env`

### Using Local Supabase via Docker

If you prefer to run Supabase locally:

```bash
# Copy the root .env for Docker Compose
cp .env.example .env
# Fill in POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY

# Start Supabase services only
docker compose --profile supabase up -d
```

Then update your env files:
- `backend/.env`: set `SUPABASE_URL=http://localhost:7431`
- `frontend/.env`: set `NEXT_PUBLIC_SUPABASE_URL=http://localhost:7431`

Supabase Studio will be available at [http://localhost:7430](http://localhost:7430).

### Redis

The backend uses Redis for BullMQ job queues (sync processing). For local development:

```bash
# Option A: Use Docker
docker run -d --name taskclaw-redis -p 6379:6379 redis:7-alpine

# Option B: Use the docker compose Redis service
docker compose up redis -d
```

Set `REDIS_URL=redis://localhost:6379` in `backend/.env`.

## Start Development Servers

Open two terminal windows (or use a terminal multiplexer):

```bash
# Terminal 1: Backend (NestJS, port 3001)
cd backend
pnpm run start:dev

# Terminal 2: Frontend (Next.js, port 3000)
cd frontend
pnpm run dev
```

Or use Turborepo from the project root to start both at once:

```bash
pnpm run dev
```

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
│   │   ├── ai-assistant/       # AI assistant orchestration
│   │   ├── ai-provider/        # AI provider abstraction (OpenRouter)
│   │   ├── auth/               # Authentication (Supabase JWT guards)
│   │   ├── categories/         # Task categories / labels
│   │   ├── common/             # Shared utilities, middleware, guards
│   │   ├── conversations/      # AI chat conversations
│   │   ├── ee/                 # Cloud-edition modules (Stripe, Langfuse, etc.)
│   │   ├── knowledge/          # Knowledge base (file uploads, context for AI)
│   │   ├── projects/           # Project management
│   │   ├── search/             # Full-text search
│   │   ├── skills/             # AI skills / capabilities
│   │   ├── sources/            # External source CRUD (connects adapters to accounts)
│   │   ├── supabase/           # Supabase client module
│   │   ├── sync/               # Background sync engine (BullMQ)
│   │   ├── system-settings/    # System-wide configuration
│   │   ├── tasks/              # Task CRUD and business logic
│   │   ├── teams/              # Team management
│   │   ├── users/              # User profiles
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
├── docker/                     # Docker support files (Kong config, DB init scripts)
├── docs/                       # Documentation (you are here)
├── docker-compose.yml          # Docker Compose configuration
├── turbo.json                  # Turborepo configuration
├── pnpm-workspace.yaml         # pnpm workspace definition
└── package.json                # Root package.json (Turborepo scripts)
```

## Running Tests

### Backend Unit Tests

```bash
cd backend
pnpm test              # Run all tests once
pnpm test:watch        # Run in watch mode
pnpm test:cov          # Run with coverage report
```

### Backend E2E Tests

```bash
cd backend
pnpm test:e2e
```

## Code Quality

### Linting

```bash
# Lint the entire monorepo
pnpm run lint

# Lint backend only
cd backend
pnpm run lint

# Lint frontend only
cd frontend
pnpm run lint
```

### Formatting

```bash
cd backend
pnpm run format        # Prettier formatting for backend code
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

1. Start the backend: `cd backend && pnpm run start:dev`
2. Open [http://localhost:3003/api/docs](http://localhost:3003/api/docs) in your browser
3. Browse all API endpoints with schemas, parameters, and responses
4. Click "Try it out" to test endpoints directly from the UI
5. Download the OpenAPI JSON spec from [http://localhost:3003/api/docs-json](http://localhost:3003/api/docs-json)

**Tip**: You can use the Swagger UI to explore all available endpoints, test authentication with API keys or JWTs, and generate client SDKs for other languages.

### Killing Stale Processes

If the backend port is occupied by a stale process:

```bash
lsof -ti:3001 | xargs kill -9
```

### Rebuilding from Scratch

```bash
# Remove node_modules and reinstall
rm -rf node_modules backend/node_modules frontend/node_modules
pnpm install
```

### Working with the Database

If using local Supabase, connect directly to Postgres:

```bash
# Via Docker
docker compose exec db psql -U postgres

# Or use Supabase Studio at http://localhost:7430
```

## Tips

- The backend uses **NestJS 11** with module-based architecture. Each feature (tasks, sync, adapters, etc.) is its own NestJS module.
- The frontend uses **Next.js 15** with the App Router. Pages are in `frontend/src/app/` and follow Next.js file-based routing conventions.
- **@dnd-kit** powers the Kanban drag-and-drop board on the tasks page.
- **TanStack React Query** manages server state and caching in the frontend.
- **Zustand** is used for client-side state that needs to persist across page navigation.
- When working with flex layouts, remember to add `min-h-0` to flex parents to prevent scroll freezing (a common CSS pitfall).
