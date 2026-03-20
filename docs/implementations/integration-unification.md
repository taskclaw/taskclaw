# Integration Unification

## Context

TaskClaw had three separate integration systems that evolved independently:

1. **Integration Marketplace** (newest) — `integration_definitions` + `integration_connections` tables with a full setup dialog (credentials + test chat via OpenClaw). 17 seeded definitions for services like Discord, GitHub, Slack, etc.
2. **Communication Tools** (legacy) — `comm_tool_integrations` table. Simple toggle on/off + health check against the OpenClaw gateway. No credentials needed (tools live on OpenClaw). No test chat.
3. **Task Sources** (legacy) — `sources` table with credentials stored in `config` JSONB. Multi-step wizard (credentials → database/list selection → category). Adapter pattern for sync (Notion, ClickUp).

Each system had its own:
- Database table(s)
- Backend module/service/controller
- Frontend components and server actions
- Credential storage approach

## Goal

Unify all three systems into the `integration_definitions` + `integration_connections` tables while preserving source sync features and communication tool health monitoring.

## Implementation

### Database Migrations

Six migrations applied in sequence:

| Migration | Purpose |
|---|---|
| `20260320000001_integration_unification_schema.sql` | Added `connection_id` FK to `sources`, health monitoring columns to `integration_connections` (`health_status`, `last_checked_at`, `last_healthy_at`, `check_interval_minutes`) |
| `20260320000002_seed_comm_source_definitions.sql` | Seeded 5 new system definitions + linked skills: `notion-source`, `clickup-source`, `telegram-comm`, `whatsapp-comm`, `slack-comm` |
| `20260320000003_migrate_comm_tools_data.sql` | Migrated `comm_tool_integrations` rows into `integration_connections` |
| `20260320000004_migrate_source_credentials.sql` | Extracted credentials from `sources.config`, created `integration_connections`, linked via `connection_id` |
| `20260320000005_drop_comm_tool_integrations.sql` | Dropped the `comm_tool_integrations` table |
| `20260320000006_update_comm_tool_definitions.sql` | Added detailed `setup_guide` markdown and optional `config_fields` to Telegram, WhatsApp, and Slack comm tool definitions |

### Backend Changes

**IntegrationsService** (`backend/src/integrations/integrations.service.ts`):
- Added `findAllDefinitionsByCategory()` and `findAllConnectionsByCategory()` for category-filtered queries
- Added `toggleConnection()` — enables/disables connections with gateway reachability check for comm tools
- Added `checkConnectionHealth()` — on-demand health check against OpenClaw gateway
- Added `getAvailableCommTools()` — returns slugs of active+healthy comm tool connections (replaces `CommToolsService.getAvailableTools()`)
- Added `getConnectionCredentialsDecrypted()` — decrypts credentials with fallback for unencrypted migration data
- Added 60-second health check cron via `OnModuleInit` lifecycle hook with lock-based concurrency control
- Injected `AiProviderService` (via `forwardRef`) for gateway URL resolution

**IntegrationsController** (`backend/src/integrations/integrations.controller.ts`):
- Added `?category=` query parameter to `GET /definitions` and `GET /connections`
- Added `POST /connections/:connId/toggle` endpoint
- Added `POST /connections/:connId/health-check` endpoint

**ConversationsService** (`backend/src/conversations/conversations.service.ts`):
- Replaced `this.commToolsService.getAvailableTools()` with `this.integrationsService.getAvailableCommTools()`
- Removed `CommToolsService` from constructor injection

**SyncService** (`backend/src/sync/sync.service.ts`):
- Added credential resolution from `integration_connections` when `source.connection_id` is set
- Merges decrypted credentials into effective config before calling adapter
- Falls back to `source.config` when no `connection_id` (backward compatibility)
- Added `getConnectionCredentials()` helper with decrypt + auto-re-encrypt logic

**SourcesService** (`backend/src/sources/sources.service.ts`):
- Accepts optional `connection_id` in `create()` method

**Deleted**: Entire `backend/src/comm-tools/` directory (service, controller, module, DTOs)

**Module updates**:
- `app.module.ts`: Removed `CommToolsModule`
- `conversations.module.ts`: Removed `CommToolsModule`, added `IntegrationsModule`
- `integrations.module.ts`: Added `AiProviderModule` with `forwardRef`

### Frontend Changes

**Server Actions** (`frontend/src/app/dashboard/settings/integrations/integration-actions.ts`):
- Added `toggleConnection(connId, enabled)` — POST to toggle endpoint
- Added `checkConnectionHealth(connId)` — POST to health-check endpoint
- Added `getConnectionsByCategory(category)` — GET with `?category=` filter
- Added `getDefinitionsByCategory(category)` — GET with `?category=` filter

**Types** (`frontend/src/types/integration.ts`):
- Added health monitoring fields to `IntegrationConnection`: `health_status`, `last_checked_at`, `last_healthy_at`, `check_interval_minutes`

**CommToolsSection** (`frontend/src/components/settings/comm-tools-section.tsx`):
- Full rewrite to use unified `integration_connections` instead of `comm_tool_integrations`
- Now uses `getConnectionsByCategory('communication')` and `getDefinitionsByCategory('communication')`
- Toggle calls `toggleConnection()` / `createConnection()`
- Health check calls `checkConnectionHealth()`
- Clicking card name/icon opens `IntegrationSetupDialog` with test chat
- Added visible "Configure" button (Settings2 icon) next to toggle switch for discoverability

**IntegrationManager** (`frontend/src/components/integrations/integration-manager.tsx`):
- Added `excludeCategories?: string[]` prop
- Passes prop down to `IntegrationCatalog` and filters connections list

**IntegrationCatalog** (`frontend/src/components/integrations/integration-catalog.tsx`):
- Added `excludeCategories` filtering to items and category dropdown
- Excluded categories don't appear as filter options

**Integrations Page** (`frontend/src/app/dashboard/settings/integrations/page.tsx`):
- Marketplace section now passes `excludeCategories={['communication', 'source']}`
- `AddSourceDialog` rewritten with 4-step flow: provider selection → `IntegrationSetupDialog` (credentials + test chat) → database/list selection → category assignment
- Source `createSource` action now accepts optional `connection_id` to link to `integration_connections`

**IntegrationSetupDialog** (`frontend/src/components/integrations/integration-setup-dialog.tsx`):
- Refactored from two-column layout to tabbed left panel (60%) + test chat right panel (40%)
- Tabs: "Setup Guide" (rendered markdown), "Settings" (credentials + config fields), "Test" (mobile fallback)
- Default tab is "Setup Guide" when a guide exists, otherwise "Settings"

**SetupGuideRenderer** (`frontend/src/components/integrations/setup-guide-renderer.tsx`):
- New component — lightweight markdown-to-JSX parser for setup guides
- Supports: `##` headings, `###` centered section dividers, `####` sub-headings, numbered lists (circular step badges), bullet lists (with indent support), `**bold**`, `` `code` ``, `[links](url)` with external link icons
- Used in the "Setup Guide" tab of IntegrationSetupDialog

**Deleted**: `frontend/src/app/dashboard/settings/comm-tools/actions.ts`

## Data Model

```
integration_definitions (catalog)
  ├── slug, name, description, icon
  ├── categories: text[]  (e.g. ['communication'], ['source'])
  ├── auth_type: 'api_key' | 'oauth2' | 'none'
  ├── auth_config: jsonb  (contains key_fields array for credential form)
  ├── config_fields: jsonb  (non-credential settings)
  ├── setup_guide: text  (markdown rendered by SetupGuideRenderer)
  └── skill_id → skills.id  (linked AI instructions)

integration_connections (user instances)
  ├── account_id, definition_id
  ├── credentials: text  (AES-256-GCM encrypted JSON)
  ├── status: 'pending' | 'active' | 'error'
  ├── health_status: 'healthy' | 'unhealthy' | 'checking' | 'unknown'
  ├── last_checked_at, last_healthy_at, check_interval_minutes
  └── config, error_message, test_conversation_id

sources (task sync specific)
  ├── provider, config, category_id
  ├── sync_interval_minutes, sync_status, sync_filters
  └── connection_id → integration_connections.id  (credential link)

board_integration_refs (board context)
  ├── board_id → board_instances.id
  └── connection_id → integration_connections.id
```

## Slug Conventions

Communication tool definitions use `-comm` suffix to avoid conflicts with existing marketplace definitions:

| Slug | Category | Notes |
|---|---|---|
| `telegram-comm` | communication | Distinct from potential `telegram` API integration |
| `whatsapp-comm` | communication | Distinct from potential `whatsapp` API integration |
| `slack-comm` | communication | Distinct from existing `slack` marketplace definition |
| `notion-source` | source | Distinct from potential `notion` marketplace definition |
| `clickup-source` | source | Distinct from potential `clickup` marketplace definition |

## Backward Compatibility

- Sources without `connection_id` continue to work — `SyncService` falls back to reading credentials from `source.config`
- Credentials migrated as plain JSON from `sources.config` are auto-encrypted on first read
- Existing marketplace integrations are unaffected (different category)
