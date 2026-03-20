# AI-First Agent Access Layer — Progress

## Status
- **Project:** AI-First Agent Access Layer
- **Started:** 2026-03-19
- **Features:** 31 / 40 completed
- **Last session:** 2026-03-19
- **Current blocker:** none

## Phases
1. MCP Server (F001-F010, F017) — 11 features
2. API Key Auth (F011-F016) — 6 features
3. OpenAPI/Swagger (F018-F023) — 6 features
4. Webhook Events (F024-F031) — 8 features
5. Missing Endpoints (F032-F036) — 5 features
6. Documentation (F037-F040) — 4 features

## Session Log

### 2026-03-19 — Phase 1: MCP Server (F001-F010)
- Installed `@modelcontextprotocol/sdk` dependency (F001)
- Created HTTP API client with JWT login, token caching, auto-refresh at `backend/src/mcp/api-client.ts` (F002)
- Implemented 27 MCP tools across 7 tool files:
  - Board tools (7): list, get, create, update, delete, import, export (F003)
  - Board step tools (4): list, create, update, reorder (F004)
  - Task tools (8): list, get, create, update, move, complete, delete, bulk_create (F005)
  - Conversation tools (3): list, create, send_message (F006)
  - Skill/knowledge tools (3): list_skills, list_categories, list_knowledge_docs (F007)
  - Integration tools (2): list_integrations, trigger_sync (F008)
  - Account tools (2): get_account, list_members (F009)
- Created MCP server bootstrap (`mcp-server.ts`) and standalone entry point (`mcp-entry.ts`) (F010)
- Created `tsconfig.mcp.json` and `build:mcp` npm script
- Both MCP and NestJS TypeScript builds pass with zero errors

### 2026-03-19 — Phase 2: API Key Authentication (F011-F014)
- Created `api_keys` table migration with RLS policies (`backend/supabase/migrations/20260319100001_create_api_keys.sql`) (F011)
- Created `ApiKeysService` with create (tc_live_ + SHA-256 hash), validate, list (masked), remove (F012)
- Updated `AuthGuard` to accept both JWT and API keys (X-API-Key header or Bearer tc_live_*) (F013)
- Created `ApiKeysController` with GET/POST/DELETE endpoints at `/accounts/:id/api-keys` (F014)
- Created `ApiKeysModule` (global) and registered in `AuthModule`
- Added `X-API-Key` to CORS allowed headers
- TypeScript compiles cleanly

### 2026-03-19 — Phase 3: OpenAPI/Swagger (F018-F023)
- Installed `@nestjs/swagger` and `swagger-ui-express` (F018)
- Configured SwaggerModule in `main.ts` with JWT + API Key auth schemes, serving at `/api/docs` (UI) and `/api/docs-json` (JSON spec) (F019)
- Enabled Swagger CLI plugin in `nest-cli.json` for auto `@ApiProperty` from class-validator
- Added `@ApiTags` and `@ApiOperation` decorators to all controllers:
  - Auth, Boards, Tasks, Conversations, Skills, Categories, Knowledge, Integrations, Sources, Sync, Accounts, Users, API Keys, Board Templates, Teams, AI Provider, Admin (F020-F023)
- TypeScript compiles cleanly

### 2026-03-19 — Phase 4: Webhook Events (F024-F029)
- Created `webhooks` and `webhook_deliveries` tables migration with RLS policies (`backend/supabase/migrations/20260319100002_create_webhooks.sql`) (F024)
- Created `WebhooksService` (CRUD) and `WebhookEmitterService` (HMAC-SHA256 signed delivery, 3 retries with exponential backoff) (F025)
- Created `WebhooksController` with GET/POST/PATCH/DELETE + deliveries endpoint (F026)
- Created `WebhooksModule` (global) exporting `WebhookEmitterService`, registered in `AppModule`
- Injected `WebhookEmitterService` into `TasksService` — emits task.created, task.updated, task.completed, task.deleted (F027)
- Injected `WebhookEmitterService` into `BoardsService` — emits board.created, board.updated, board.deleted (F028)
- Injected `WebhookEmitterService` into `ConversationsService` — emits conversation.created, message.created (F029)
- TypeScript compiles cleanly (both NestJS and MCP builds)

### 2026-03-19 — Phase 5: Missing Endpoints (F032-F036)
- Added `DELETE /accounts/:id/members/:memberId` — removes member with owner/self protection (F032)
- Added `POST /accounts/:id/invitations/:invId/accept` — accepts invitation, adds user to account (F033)
- Added `GET /users/me/preferences` and `PATCH /users/me/preferences` — user preferences with upsert (F034)
- Created `user_preferences` table migration with RLS policies
- Added `GET /accounts/:id/tasks/search?q=` — full-text search on title and notes with ILIKE (F035)
- Added `PATCH /accounts/:id/tasks/bulk` — bulk update up to 100 tasks, emits webhooks per task (F036)
- TypeScript compiles cleanly
