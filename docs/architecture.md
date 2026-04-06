# Architecture Overview

This document describes the high-level architecture of TaskClaw, including how the major components interact.

## Monorepo Layout

TaskClaw is a monorepo managed with **npm**. Each package has its own `package.json` and is installed independently:

```
taskclaw/
├── backend/    → NestJS 11 API server (port 3003)
├── frontend/   → Next.js 15 web application (port 3002)
├── docker/     → Docker support files (Kong config, DB init)
└── docs/       → Documentation
```

The root `package.json` provides workspace-level scripts. Each package is managed independently with `npm install`, `npm run dev`, `npm run build`, etc.

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  Next.js App (React, TanStack Query, Zustand, @dnd-kit)    │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (REST)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   NestJS Backend                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  Tasks   │ │  Auth    │ │  Sync    │ │ Conversations │  │
│  │  Module  │ │  Module  │ │  Module  │ │    Module     │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Sources  │ │ Adapters │ │Knowledge │ │  AI Provider  │  │
│  │  Module  │ │  Module  │ │  Module  │ │    Module     │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│  ┌──────────────────┐ ┌──────────┐ ┌──────────────────┐    │
│  │  Integrations    │ │  Skills  │ │     Boards       │    │
│  │     Module       │ │  Module  │ │     Module       │    │
│  └──────────────────┘ └──────────┘ └──────────────────┘    │
│  ┌──────────────────┐ ┌──────────────────────────────────┐  │
│  │ BackboneModule   │ │       AgentSyncModule            │  │
│  │ (Multi-AI Route) │ │  (Skills+Knowledge → OpenClaw)   │  │
│  └──────────────────┘ └──────────────────────────────────┘  │
└──────┬─────────────┬────────────┬───────────────┬───────────┘
       │             │            │               │
       ▼             ▼            ▼               ▼
┌────────────┐ ┌──────────┐ ┌──────────┐  ┌─────────────┐
│  Supabase  │ │  Redis   │ │ External │  │  OpenRouter  │
│ (Postgres  │ │ (BullMQ) │ │   APIs   │  │  / OpenClaw  │
│  + Auth    │ │          │ │ (Notion, │  │   Gateway    │
│  + Storage)│ │          │ │ ClickUp) │  │              │
└────────────┘ └──────────┘ └──────────┘  └─────────────┘
```

## Backend Modules

The backend follows NestJS module-based architecture. Each module is a self-contained feature area with its own controller, service, DTOs, and module definition.

### Core Modules

| Module | Path | Purpose |
|---|---|---|
| **TasksModule** | `src/tasks/` | CRUD operations for tasks. The central data model of the application |
| **AuthModule** | `src/auth/` | Authentication via Supabase JWT. Provides guards that protect all API routes |
| **AccountsModule** | `src/accounts/` | Multi-tenant account management. Users belong to accounts |
| **UsersModule** | `src/users/` | User profile management |
| **ProjectsModule** | `src/projects/` | Project organization for grouping tasks |
| **TeamsModule** | `src/teams/` | Team management within accounts |
| **CategoriesModule** | `src/categories/` | Task categories and labels |
| **SearchModule** | `src/search/` | Full-text search across tasks and other entities |
| **SystemSettingsModule** | `src/system-settings/` | System-wide configuration and feature flags |
| **SupabaseModule** | `src/supabase/` | Supabase client provider, shared across all modules |
| **CommonModule** | `src/common/` | Shared utilities, middleware (correlation ID, request logging), guards, and pipes |

### Integration Modules

| Module | Path | Purpose |
|---|---|---|
| **IntegrationsModule** | `src/integrations/` | Unified integration system. Manages `integration_definitions` (catalog of available integrations) and `integration_connections` (user-configured instances with encrypted credentials). Handles health checks for communication tools, category-based filtering, toggle/health-check endpoints, and board-level integration refs. Provides credential decryption for downstream consumers |
| **AdaptersModule** | `src/adapters/` | Registry of source adapters (Notion, ClickUp, etc.). Auto-discovers adapters via the `@Adapter()` decorator |
| **SourcesModule** | `src/sources/` | CRUD for external source configurations. Sources link to `integration_connections` via `connection_id` FK for centralized credential management |
| **SyncModule** | `src/sync/` | Background sync engine using BullMQ. Processes inbound (fetch from external) and outbound (push to external) sync jobs. Reads credentials from linked `integration_connections` when available |
| **WebhooksModule** | `src/webhooks/` | Webhook event system. Allows external applications to subscribe to TaskClaw events and receive HTTP POST callbacks |

### AI Modules

| Module | Path | Purpose |
|---|---|---|
| **ConversationsModule** | `src/conversations/` | Chat conversation management. Stores message history and orchestrates AI responses |
| **AiProviderModule** | `src/ai-provider/` | Abstraction layer over AI providers. Reads provider config from DB or environment |
| **AiAssistantModule** | `src/ai-assistant/` | AI assistant orchestration layer using **LangGraph** with a **ReAct (Reasoning + Acting)** pattern. Tools available: `query_tasks`, `create_task`, `update_category`, `invoke_skill`. Uses **EmbeddingService** (pgvector cosine similarity) for knowledge base retrieval. AI model selection goes through **BackboneRouterService** cascade |
| **KnowledgeModule** | `src/knowledge/` | Knowledge base management. Allows uploading documents that provide context to the AI assistant |
| **SkillsModule** | `src/skills/` | AI skill definitions. Configurable capabilities the AI assistant can use |
| **BackboneModule** | `src/backbone/` | Multi-AI-provider support with cascade routing. Users can configure different AI providers (OpenRouter, OpenClaw) at the step, board, category, or account level. Maintains `backbone_definitions` (provider catalog) and `backbone_connections` (user-configured instances with encrypted credentials). `BackboneRouterService` resolves the correct provider via cascade: step → board → category → account → env var fallback |
| **AgentSyncModule** | `src/agent-sync/` | Cron-based sync (every 5 minutes) that pushes each category's skills and knowledge documents to the OpenClaw RPC gateway (`POST /rpc/update-agent`). Keeps OpenClaw agents updated with the latest configuration |

### Board Modules

| Module | Path | Purpose |
|---|---|---|
| **BoardsModule** | `src/boards/` | Multi-board workflow engine. Manages `board_templates` (shareable JSON manifests), `board_instances` (user's active boards), and `board_steps` (pipeline stages/columns with AI config). Templates can be installed (creating a snapshot), exported, and imported as bundles |

### Cloud-Only Modules (`ee/`)

These modules are loaded only when `EDITION=cloud`. Self-hosted users can ignore them.

| Module | Path | Purpose |
|---|---|---|
| **StripeModule** | `src/ee/stripe/` | Stripe payment integration for billing |
| **PlansModule** | `src/ee/plans/` | Subscription plan definitions |
| **SubscriptionsModule** | `src/ee/subscriptions/` | Subscription lifecycle management |
| **LangfuseModule** | `src/ee/langfuse/` | AI observability and tracing via Langfuse |
| **WaitlistModule** | `src/ee/waitlist/` | Waitlist management for cloud launch |

When running in community edition, a `LangfuseNoopModule` is loaded instead, providing a no-op stub so the rest of the codebase can inject the Langfuse service without conditional logic.

## Frontend Architecture

The frontend is built with **Next.js 15** using the **App Router**.

### Key Routes

| Route | Description |
|---|---|
| `/dashboard/tasks` | Main Kanban board with drag-and-drop task management |
| `/dashboard/chat` | AI chat interface for conversations with the assistant |
| `/dashboard/knowledge` | Knowledge base management (upload and manage documents) |
| `/dashboard/projects` | Project list and project-specific views |
| `/dashboard/boards` | Multi-board list view |
| `/dashboard/boards/:boardId` | Specific board view |
| `/dashboard/agents` | Agent management (category-based) |
| `/dashboard/import` | Import board bundles |
| `/dashboard/settings/general` | General account settings |
| `/dashboard/settings/integrations` | Unified integrations page: Integration Marketplace, Task Sources, and Communication Tools. All use the same IntegrationSetupDialog with test chat |
| `/dashboard/settings/ai-provider` | Configure AI provider (OpenRouter model selection) |
| `/dashboard/settings/categories` | Manage task categories and labels |
| `/dashboard/settings/skills` | Configure AI skills |
| `/dashboard/settings/team` | Team member management |
| `/dashboard/settings/billing` | Subscription and billing (cloud edition only) |
| `/dashboard/settings/usage` | Usage analytics and quotas |
| `/onboarding` | New user onboarding flow |

### Frontend Technology Stack

- **React 18** with the Next.js App Router (server components + client components)
- **TanStack React Query** for server state management, caching, and optimistic updates
- **Zustand** for client-side state (with persist middleware for cross-session state)
- **@dnd-kit** for drag-and-drop Kanban board interactions
- **Radix UI** primitives for accessible, unstyled UI components
- **Tailwind CSS 4** for styling
- **react-hook-form** + **Zod** for form handling and validation
- **i18next** for internationalization
- **Recharts** for data visualization
- **Lucide React** for icons

### Frontend Directory Structure

```
frontend/src/
├── app/           # Next.js App Router (pages, layouts, route handlers)
├── components/    # Shared React components
├── config/        # Application configuration
├── features/      # Feature-specific components and business logic
├── hooks/         # Custom React hooks
├── kit/           # UI kit / design system primitives
├── lib/           # Utility libraries (API client, Supabase client, etc.)
├── theme/         # Theme configuration and CSS variables
└── types/         # Shared TypeScript type definitions
```

## Data Flow

### Standard CRUD Flow

```
Browser (React)
  → TanStack Query mutation
    → HTTP POST/PUT/DELETE to backend API
      → NestJS Controller
        → Service layer (business logic)
          → Supabase client (database operation)
        ← Response
      ← JSON response
    ← Query cache invalidation
  ← UI update
```

### Sync Flow (External Integrations)

```
Inbound Sync (external → TaskClaw):
  SyncModule (BullMQ job)
    → If source.connection_id → decrypt credentials from integration_connections
    → Merge credentials into effective config
    → AdapterRegistry.getAdapter(provider)
      → Adapter.fetchTasks(effectiveConfig, filters)
        → External API (Notion, ClickUp, etc.)
      ← ExternalTask[]
    → Upsert into tasks table (match by external_id)

Outbound Sync (TaskClaw → external):
  Task update in UI
    → Backend TasksService
      → Detect source association
        → SyncModule enqueues outbound job
          → Adapter.pushTaskUpdate(config, update)
            → External API
```

The sync engine uses **BullMQ** with Redis to process jobs asynchronously. Jobs are queued when:
- A scheduled sync fires (inbound)
- A user manually triggers a sync (inbound)
- A task linked to an external source is updated (outbound)

### Authentication Flow

```
Browser
  → Supabase Auth (email/password, OAuth, magic link)
    → Supabase returns JWT (access_token + refresh_token)
  → Frontend stores JWT in cookies via @supabase/ssr
  → Every API request includes Authorization: Bearer <JWT>
    → Backend AuthGuard validates JWT against Supabase
      → Extracts user ID, attaches to request
      → Route handler executes with authenticated context
```

The frontend uses the **BFF (Backend For Frontend) pattern** -- it communicates with Supabase Auth directly for login/signup, but all data operations go through the NestJS backend, which validates the JWT and enforces authorization.

### AI Chat Flow

```
User sends message in /dashboard/chat
  → Frontend POST /conversations/:id/messages
    → ConversationsModule stores user message
      → AiAssistantModule (LangGraph ReAct agent):
        - BackboneRouterService resolves provider (step → board → category → account → env var)
        - EmbeddingService retrieves knowledge base context (pgvector RAG)
        - Available tools: query_tasks, create_task, update_category, invoke_skill
        - AI model call via resolved provider adapter
        ← AI model response (streamed or full)
      → Store assistant message
    ← Stream or return response
  ← Display in chat UI
```

## Backbone System

The Backbone system enables routing AI requests to different providers depending on the context. Rather than a single global AI provider, each step, board, category, or account can be configured to use a different AI backend.

### Purpose

- Different workflow stages can use the most cost-effective or capable model
- Teams can mix OpenRouter and OpenClaw within the same account
- Fallback to a global env var when no explicit configuration is set

### Database Tables

| Table | Purpose |
|---|---|
| `backbone_definitions` | Catalog of available AI providers. Each entry has a `slug`, `name`, `adapter_class`, and a JSON schema describing the required credential fields |
| `backbone_connections` | User-configured instances of a backbone definition. Stores encrypted credentials, linked to an account. Users can have multiple connections to the same provider |

### Cascade Resolver

`BackboneRouterService.resolve()` walks the following chain and returns the first configured connection:

```
board_step.backbone_connection_id
  → board_instance.backbone_connection_id
    → category.backbone_connection_id
      → account.default_backbone_connection_id
        → OPENROUTER_API_KEY env var (legacy fallback)
```

Code path: `ConversationsService` → `BackboneRouterService.resolve()` → returns `{ adapter, config }` → adapter called by `AiAssistantModule`.

### Provider Adapters (`backbone/adapters/`)

| Adapter | Description |
|---|---|
| `OpenRouterAdapter` | Calls the OpenRouter API using an OpenAI-compatible client |
| `OpenClawAdapter` | Calls the OpenClaw RPC gateway |

## Agent Sync

The AgentSyncModule keeps OpenClaw gateway agents up to date with the latest skills and knowledge configured in TaskClaw.

### Schedule

A NestJS `@Cron` job runs every 5 minutes.

### Process Flow

```
AgentSyncService (every 5 min)
  → Iterate through account's categories
    → Fetch skills linked to each category
    → Fetch knowledge documents linked to each category
    → Compile AgentConfig JSON
    → OpenClawRpcClient.updateAgent(agentConfig)
      → POST <gateway_url>/rpc/update-agent
         (authenticated with account API key)
```

### Error Handling

Errors are logged per category. A failure in one category does not stop the sync for subsequent categories.

### Gateway URL Resolution

The gateway URL is resolved from `AiProviderService`, which reads it from the account's backbone connection config or falls back to the `OPENCLAW_GATEWAY_URL` environment variable.

## Edition Gating

The `EDITION` environment variable controls which modules are loaded at startup:

```typescript
// backend/src/app.module.ts
const isCloudEdition = process.env.EDITION === 'cloud';

const editionModules = isCloudEdition
  ? [LangfuseModule, StripeModule, PlansModule, SubscriptionsModule, WaitlistModule]
  : [LangfuseNoopModule];
```

- **Community edition**: Core modules only. No billing, no telemetry. Free and open source.
- **Cloud edition**: Adds Stripe billing, Langfuse AI observability, subscription management, and waitlist functionality.

The `ee/` directory contains all cloud-only code. Community contributors do not need to touch this directory.

## MCP Server

TaskClaw provides a **Model Context Protocol (MCP) server** that allows AI agents to programmatically access the TaskClaw API. The MCP server is a standalone Node.js process that communicates with AI assistants (Claude Code, Cursor, Windsurf) via stdio and with the TaskClaw backend via HTTP.

### Architecture

```
┌────────────────────────────────────────┐
│    AI Agent (Claude Code, Cursor)     │
└───────────────┬────────────────────────┘
                │ stdio (MCP Protocol)
                ▼
┌────────────────────────────────────────┐
│        TaskClaw MCP Server             │
│  (standalone Node.js process)          │
│                                        │
│  27 Tools:                             │
│  - Board tools (7)                     │
│  - Task tools (8)                      │
│  - Conversation tools (3)              │
│  - Skill/knowledge tools (3)           │
│  - Integration tools (2)               │
│  - Account tools (2)                   │
│  - Board step tools (4)                │
└───────────────┬────────────────────────┘
                │ HTTP (REST API)
                │ JWT or API Key auth
                ▼
┌────────────────────────────────────────┐
│        TaskClaw Backend (NestJS)       │
│          http://localhost:3003         │
└────────────────────────────────────────┘
```

### Key Files

- `backend/mcp-entry.ts` — MCP server entry point
- `backend/src/mcp/tools/` — Tool implementations
- `~/.claude/mcp.json` — User config (Claude Code)

The MCP server authenticates using either:
- **JWT** (email/password login) — automatic token refresh
- **API Key** (recommended for agents) — persistent, scoped access

See [MCP Server Documentation](./mcp-server.md) for full details.

## Webhook Event System

TaskClaw supports webhooks for real-time event notifications. External applications can subscribe to events (task created, board updated, sync completed, etc.) and receive HTTP POST callbacks when they occur.

### Architecture

```
┌────────────────────────────────────────┐
│         TaskClaw Backend               │
│                                        │
│  ┌──────────────┐  Event emitted      │
│  │ TasksService │──────────┐          │
│  └──────────────┘          │          │
│                            ▼          │
│  ┌──────────────────────────────────┐ │
│  │   WebhookEmitterService          │ │
│  │  - Find matching webhooks        │ │
│  │  - Queue delivery jobs           │ │
│  └──────────────┬───────────────────┘ │
└─────────────────┼─────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      BullMQ Delivery Queue (Redis)      │
│  - HMAC-SHA256 signature generation     │
│  - Exponential backoff retry (3 tries)  │
└─────────────────┬───────────────────────┘
                  │ POST /webhook
                  ▼
┌─────────────────────────────────────────┐
│         External Application            │
│  - Verify HMAC signature                │
│  - Process event                        │
│  - Return 200 OK                        │
└─────────────────────────────────────────┘
```

### Supported Events

| Event | Description |
|-------|-------------|
| `task.created` | Task created |
| `task.updated` | Task fields updated |
| `task.moved` | Task moved to different step |
| `task.completed` | Task marked complete |
| `task.deleted` | Task deleted |
| `board.created` | Board created |
| `board.updated` | Board updated |
| `board.deleted` | Board deleted |
| `conversation.created` | Conversation started |
| `message.created` | Message sent |
| `sync.completed` | Sync job succeeded |
| `sync.failed` | Sync job failed |

### Delivery Guarantees

- **At-least-once delivery**: Events may be delivered multiple times
- **HMAC-SHA256 signatures**: All payloads signed with webhook secret
- **Retry logic**: 3 attempts with exponential backoff (0s, 60s, 5min)
- **Timeout**: 10 seconds per delivery
- **Idempotency**: Consumer must handle duplicate deliveries

See [Webhook Documentation](./documentation/webhooks.md) for full details.

## Unified Integration System

All external integrations — marketplace integrations (Discord, GitHub, etc.), communication tools (Telegram, WhatsApp, Slack), and task sources (Notion, ClickUp) — share a single unified data model:

### Database Tables

| Table | Purpose |
|---|---|
| `integration_definitions` | Catalog of available integrations. Each has a `slug`, `categories` (e.g. `['communication']`, `['source']`), `auth_type`, `key_fields` schema, and a linked `skill_id`. System definitions (`is_system = true`) are seeded; users can also create custom definitions |
| `integration_connections` | User-configured instances of definitions. Stores encrypted `credentials`, `status`, `config`, `health_status`, and health check metadata. One connection per account per definition |
| `board_integration_refs` | Links connections to boards for context injection into AI prompts |
| `sources` | Task sync-specific configuration (category, sync interval, filters). Links to `integration_connections` via `connection_id` FK for credential management |
| `skills` | Integration-linked skills (`skill_type = 'integration'`) provide AI instructions for each integration |

### Board System Database Tables

| Table | Purpose |
|---|---|
| `board_templates` | Shareable JSON manifests describing a board layout (steps, AI config, integrations). Can be exported and imported as bundles |
| `board_instances` | A user's active board, created by installing a template or directly. Stores `backbone_connection_id` for board-level AI provider override |
| `board_steps` | Pipeline stages/columns within a board instance. Each step has `position`, AI config, and optional `backbone_connection_id` for step-level override |
| `board_step_integrations` | Links integration connections to specific board steps |

### Backbone System Database Tables

| Table | Purpose |
|---|---|
| `backbone_definitions` | Catalog of AI provider definitions. Each has a `slug`, `name`, `adapter_class`, and credential JSON schema |
| `backbone_connections` | User-configured provider instances with encrypted credentials, linked to an account |

### Category-Based Routing

The `categories` text array on `integration_definitions` determines where each integration appears in the UI:

| Category | UI Section | Examples |
|---|---|---|
| `communication` | Communication Tools | Telegram, WhatsApp, Slack |
| `source` | Task Sources | Notion, ClickUp |
| *(other/none)* | Integration Marketplace | Discord, GitHub, Linear, Jira |

### Integration Flow

```
User opens Settings > Integrations
  → IntegrationManager shows marketplace (excludes communication + source categories)
  → CommToolsSection shows communication tools (category = 'communication')
  → Task Sources section shows source integrations (category = 'source')

User clicks "Connect" on any integration:
  → IntegrationSetupDialog opens (60% credentials, 40% test chat)
    → Left panel: credential fields from definition.key_fields schema
    → Right panel: live test chat with OpenClaw to verify the integration works
  → On save: creates integration_connection with encrypted credentials
  → For sources: additional wizard steps (database/list selection, category assignment)
```

### Health Monitoring (Communication Tools)

Communication tools use health checks to verify OpenClaw gateway reachability:

- `IntegrationsService` runs a 60-second cron that checks due connections
- Each connection has `health_status` (`healthy`/`unhealthy`/`checking`/`unknown`), `last_checked_at`, and `check_interval_minutes`
- The `ConversationsService` reads active+healthy comm tools to inject into AI system prompts

### Credential Encryption

All credentials are stored encrypted using AES-256-GCM via `encrypt()`/`decrypt()` from `common/utils/encryption.util.ts`. Credentials migrated from legacy tables may be stored as plain JSON initially and are auto-encrypted on first read.

## Adapter Pattern (Source Sync)

Task source adapters (Notion, ClickUp, and any future providers) follow a consistent adapter pattern:

1. Each adapter implements the `SourceAdapter` interface (`src/adapters/interfaces/source-adapter.interface.ts`)
2. Adapters are decorated with `@Adapter('providerName')` for auto-discovery
3. The `AdaptersModule` uses NestJS `DiscoveryService` to find and register all adapters at startup
4. The `AdapterRegistry` provides a factory to retrieve adapters by provider name
5. The `SourcesModule` manages the CRUD for source configurations, linked to `integration_connections` via `connection_id`
6. The `SyncModule` reads credentials from the linked `integration_connection` (falling back to `source.config` for backward compatibility) and dispatches sync jobs to the correct adapter

To add a new integration, see [Adding an Integration](./integrations/adding-an-integration.md).

## Key Dependencies

| Package | Purpose |
|---|---|
| `@nestjs/*` | NestJS 11 framework (core, config, passport, bullmq, schedule) |
| `@supabase/supabase-js` | Supabase client for Postgres, Auth, and Storage |
| `bullmq` + `ioredis` | Job queue for background sync processing |
| `openai` | OpenAI-compatible client (used for OpenRouter API) |
| `@langchain/langgraph` | LangGraph for ReAct AI agent orchestration |
| `@notionhq/client` | Official Notion API client |
| `passport` + `passport-jwt` | JWT authentication strategy |
| `stripe` | Stripe billing integration (cloud edition) |
| `langfuse` | AI observability (cloud edition) |
| `zod` | Schema validation |
| `next` | Next.js 15 framework |
| `@tanstack/react-query` | Server state management |
| `zustand` | Client state management |
| `@dnd-kit/*` | Drag-and-drop toolkit |
| `@radix-ui/*` | Accessible UI primitives |
| `tailwindcss` | Utility-first CSS framework |
