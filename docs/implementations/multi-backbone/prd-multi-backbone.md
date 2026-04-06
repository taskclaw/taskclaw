# TaskClaw Multi-Backbone Architecture — PRD

## 1. Executive Summary

TaskClaw currently communicates with a single AI backbone per account: an OpenClaw instance configured in `ai_provider_configs`. Every conversation — regardless of board, step, or task type — routes through the same OpenClaw WebSocket connection (or OpenRouter HTTP fallback).

This PRD introduces a **multi-backbone architecture** that allows users to connect multiple AI runtimes (OpenClaw, Claude Code, Codex, ZeroClaw, PinaClaw, and future providers) and assign them at the **board level**, **step level**, or **category (agent) level**. A development board can use Claude Code as its backbone while a marketing board uses OpenClaw — all within the same account.

This is the foundational layer for TaskClaw's vision of becoming a **full autonomous AI company platform with transparency**, where each board represents a person/activity in an organization and different roles require different AI capabilities.

---

## 2. Core Concepts

### 2.1 Terminology

| Concept | Definition |
|---------|-----------|
| **Backbone** | An AI runtime that can execute work: OpenClaw, Claude Code, Codex, ZeroClaw, PinaClaw, OpenRouter, or any future provider. |
| **Backbone Definition** | A system-level catalog entry describing a backbone type: its protocol, capabilities, configuration schema, and UI metadata. |
| **Backbone Connection** | A user's configured instance of a backbone: encrypted credentials, endpoint URL, health status. One user can have multiple connections of the same type (e.g., two OpenClaw instances). |
| **Backbone Adapter** | A backend class implementing the `BackboneAdapter` interface for a specific backbone type. Handles protocol translation (WebSocket, HTTP, CLI, MCP). |
| **Backbone Assignment** | The linkage between a backbone connection and a board, step, or category. Determines which backbone processes a given conversation/task. |
| **Resolution Cascade** | The priority order for determining which backbone to use: Step → Board → Category → Account default. |

### 2.2 Backbone Types (Launch Set)

| Backbone | Protocol | Use Case | Streaming | Heartbeat | Agent Mode |
|----------|----------|----------|-----------|-----------|------------|
| **OpenClaw** | WebSocket | General-purpose AI agent, chat, content | Yes | Native | Yes |
| **Claude Code** | MCP / CLI | Software development, code generation, debugging | Yes | Via TaskClaw | Yes |
| **Codex (OpenAI)** | HTTP REST | Code review, analysis, alternative perspective | Yes | Via TaskClaw | No |
| **OpenRouter** | HTTP REST | Model-agnostic fallback, cost optimization | Yes | Via TaskClaw | No |
| **ZeroClaw** | WebSocket | Lightweight tasks, high-throughput processing | Yes | Native | Yes |
| **PinaClaw** | WebSocket | Specialized domain agent | Yes | Native | Yes |
| **Custom HTTP** | HTTP REST | Any OpenAI-compatible endpoint | Yes | Via TaskClaw | No |

> Additional backbones can be added by implementing the `BackboneAdapter` interface — no core changes required.

---

## 3. Current Architecture Analysis

### 3.1 Current AI Communication Flow

```
User message
  → ConversationsService.sendMessageBackground()
    → AiProviderService.getDecryptedConfig(accountId)        # Single config per account
      → returns { provider_type, api_url, api_key, agent_id }
    → OpenClawService.sendMessage(messages, systemPrompt)
      → if provider_type === 'openclaw': executeOpenClawWebSocket()
      → else: executeOpenRouterRequest()                     # HTTP fallback
    → Store AI response
    → handlePostAiRouting()
```

**Key limitation:** `getDecryptedConfig(accountId)` returns ONE config. There is no way to say "use Claude Code for this board but OpenClaw for that one."

### 3.2 Files That Will Change

| File | Current Role | Change |
|------|-------------|--------|
| `backend/src/ai-provider/ai-provider.service.ts` | Single provider CRUD, encryption | Becomes **BackboneConnectionService** — multi-connection CRUD |
| `backend/src/conversations/openclaw.service.ts` | Hardcoded OpenClaw + OpenRouter | Becomes one of many **BackboneAdapters** behind an interface |
| `backend/src/conversations/conversations.service.ts` | Calls `openclawService.sendMessage()` directly | Calls `BackboneRouter.send()` with resolution cascade |
| `backend/src/conversations/conversations.module.ts` | Imports OpenClawService directly | Imports BackboneModule |
| `backend/src/boards/boards.service.ts` | No backbone awareness | Gains `default_backbone_connection_id` field |
| `frontend/src/app/dashboard/settings/ai-provider/` | Single provider config page | Multi-connection management UI |
| `frontend/src/app/dashboard/boards/` | No backbone selection | Backbone picker in board settings |

### 3.3 Files That Stay Unchanged

| File | Reason |
|------|--------|
| `backend/src/conversations/conversations.controller.ts` | API shape doesn't change — same endpoints, backbone resolved internally |
| `backend/src/skills/` | Skills are backbone-agnostic content |
| `backend/src/knowledge/` | Knowledge docs are backbone-agnostic content |
| `backend/src/categories/` | Categories gain an optional backbone field, but service logic stays |
| `backend/src/adapters/` (source adapters) | Task source sync is unrelated to backbone |
| `frontend/src/components/tasks/task-ai-chat.tsx` | Chat UI doesn't change — it polls messages regardless of backbone |
| `backend/src/mcp/` | MCP server exposes TaskClaw TO external tools, not the reverse |

---

## 4. Data Model

### 4.1 New Tables

```sql
-- ============================================================
-- BACKBONE DEFINITIONS (System Catalog)
-- ============================================================
-- Pre-seeded rows for each supported backbone type.
-- Users don't create these — they're shipped with TaskClaw.
-- ============================================================
CREATE TABLE backbone_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,                          -- 'OpenClaw', 'Claude Code', 'Codex'
  slug TEXT NOT NULL UNIQUE,                   -- 'openclaw', 'claude-code', 'codex'
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'bot',            -- Lucide icon name
  color TEXT NOT NULL DEFAULT '#6366f1',

  -- Protocol
  protocol TEXT NOT NULL CHECK (protocol IN ('websocket', 'http', 'mcp', 'cli')),

  -- Capabilities (what this backbone can do)
  supports_streaming BOOLEAN DEFAULT TRUE,
  supports_heartbeat BOOLEAN DEFAULT FALSE,    -- native heartbeat support
  supports_agent_mode BOOLEAN DEFAULT FALSE,   -- can run autonomously
  supports_tool_use BOOLEAN DEFAULT FALSE,     -- can call external tools
  supports_file_access BOOLEAN DEFAULT FALSE,  -- can read/write files (Claude Code, Codex)
  supports_code_execution BOOLEAN DEFAULT FALSE,

  -- Configuration schema (JSON Schema for the credential form)
  -- Rendered dynamically in the frontend connection dialog
  config_schema JSONB NOT NULL DEFAULT '{}',

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,              -- can be disabled to hide from UI
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BACKBONE CONNECTIONS (User Instances)
-- ============================================================
-- Each row is a user's configured connection to a backbone.
-- One account can have multiple connections, even of the same type.
-- ============================================================
CREATE TABLE backbone_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  definition_id UUID NOT NULL REFERENCES backbone_definitions(id),

  -- Identity (user-defined)
  name TEXT NOT NULL,                          -- 'My OpenClaw Production', 'Local Claude Code'
  description TEXT,

  -- Connection config (encrypted at rest)
  config_encrypted TEXT NOT NULL,              -- AES-256-GCM encrypted JSON
  -- Decrypted shape varies by definition. Examples:
  -- OpenClaw:    { api_url, api_key, agent_id }
  -- Claude Code: { api_url, api_key, workspace_path }
  -- Codex:       { api_key, model, organization_id }
  -- OpenRouter:  { api_key, default_model }
  -- Custom HTTP: { api_url, api_key, model, headers }

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,           -- account-level default backbone
  health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'checking', 'unknown')),
  last_health_check TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,                    -- last successful connection test

  -- Usage tracking
  total_messages_sent BIGINT DEFAULT 0,
  total_tokens_used BIGINT DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one default per account
  UNIQUE (account_id, is_default) WHERE is_default = TRUE
);

CREATE INDEX idx_backbone_connections_account ON backbone_connections(account_id);
CREATE INDEX idx_backbone_connections_definition ON backbone_connections(definition_id);
```

### 4.2 Modified Tables

```sql
-- ============================================================
-- BOARD INSTANCES — add backbone assignment
-- ============================================================
ALTER TABLE board_instances
  ADD COLUMN default_backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

-- A board can override the account default backbone.
-- NULL = use account default.
COMMENT ON COLUMN board_instances.default_backbone_connection_id IS
  'Override backbone for all steps in this board. NULL = use account default.';

-- ============================================================
-- BOARD STEPS — add step-level backbone override
-- ============================================================
ALTER TABLE board_steps
  ADD COLUMN backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

-- A step can override the board-level backbone.
-- NULL = use board default → account default.
COMMENT ON COLUMN board_steps.backbone_connection_id IS
  'Override backbone for this specific step. NULL = inherit from board.';

-- ============================================================
-- CATEGORIES (AGENTS) — add preferred backbone
-- ============================================================
ALTER TABLE categories
  ADD COLUMN preferred_backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

-- When an agent (category) is assigned to a step, its preferred backbone
-- is used as a hint — but step/board explicit overrides take priority.
COMMENT ON COLUMN categories.preferred_backbone_connection_id IS
  'Preferred backbone for this agent. Used as fallback in resolution cascade.';

-- ============================================================
-- CONVERSATIONS — track which backbone was used
-- ============================================================
ALTER TABLE conversations
  ADD COLUMN backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

-- Records which backbone actually handled this conversation.
-- Set at conversation creation time via resolution cascade.
COMMENT ON COLUMN conversations.backbone_connection_id IS
  'The backbone connection that handled/is handling this conversation.';

-- ============================================================
-- MESSAGES — track per-message backbone (for mid-conversation switches)
-- ============================================================
ALTER TABLE messages
  ADD COLUMN backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

-- Optional: track if backbone changed mid-conversation.
-- Useful for debugging and cost attribution.
```

### 4.3 Migration: Existing ai_provider_configs → backbone_connections

```sql
-- ============================================================
-- DATA MIGRATION
-- ============================================================
-- Migrate existing ai_provider_configs rows into backbone_connections.
-- This preserves all existing user configurations.
-- ============================================================

-- Step 1: Insert seed backbone definitions
INSERT INTO backbone_definitions (name, slug, protocol, config_schema, supports_streaming, supports_heartbeat, supports_agent_mode, supports_tool_use, icon, color)
VALUES
  ('OpenClaw', 'openclaw', 'websocket', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "Server URL", "description": "Your OpenClaw instance URL" },
      "api_key": { "type": "string", "title": "API Token", "format": "password" },
      "agent_id": { "type": "string", "title": "Agent ID", "description": "The OpenClaw agent to use" }
    },
    "required": ["api_url", "api_key", "agent_id"]
  }', TRUE, TRUE, TRUE, TRUE, 'brain-circuit', '#10b981'),

  ('Claude Code', 'claude-code', 'mcp', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "API URL", "description": "Claude Code API endpoint" },
      "api_key": { "type": "string", "title": "API Key", "format": "password" },
      "workspace_path": { "type": "string", "title": "Workspace Path", "description": "Local workspace directory for file access" }
    },
    "required": ["api_url", "api_key"]
  }', TRUE, FALSE, TRUE, TRUE, 'terminal', '#f97316'),

  ('Codex (OpenAI)', 'codex', 'http', '{
    "type": "object",
    "properties": {
      "api_key": { "type": "string", "title": "OpenAI API Key", "format": "password" },
      "model": { "type": "string", "title": "Model", "default": "codex-mini-latest" },
      "organization_id": { "type": "string", "title": "Organization ID (optional)" }
    },
    "required": ["api_key"]
  }', TRUE, FALSE, FALSE, TRUE, 'code', '#000000'),

  ('OpenRouter', 'openrouter', 'http', '{
    "type": "object",
    "properties": {
      "api_key": { "type": "string", "title": "OpenRouter API Key", "format": "password" },
      "default_model": { "type": "string", "title": "Default Model", "default": "anthropic/claude-sonnet-4-20250514" }
    },
    "required": ["api_key"]
  }', TRUE, FALSE, FALSE, FALSE, 'router', '#6366f1'),

  ('ZeroClaw', 'zeroclaw', 'websocket', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "Server URL" },
      "api_key": { "type": "string", "title": "API Token", "format": "password" },
      "agent_id": { "type": "string", "title": "Agent ID" }
    },
    "required": ["api_url", "api_key", "agent_id"]
  }', TRUE, TRUE, TRUE, TRUE, 'zap', '#eab308'),

  ('PinaClaw', 'pinaclaw', 'websocket', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "Server URL" },
      "api_key": { "type": "string", "title": "API Token", "format": "password" },
      "agent_id": { "type": "string", "title": "Agent ID" }
    },
    "required": ["api_url", "api_key", "agent_id"]
  }', TRUE, TRUE, TRUE, TRUE, 'pine-cone', '#84cc16'),

  ('Custom HTTP', 'custom-http', 'http', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "API URL (OpenAI-compatible)" },
      "api_key": { "type": "string", "title": "API Key", "format": "password" },
      "model": { "type": "string", "title": "Model ID" },
      "headers": { "type": "object", "title": "Custom Headers" }
    },
    "required": ["api_url", "api_key", "model"]
  }', TRUE, FALSE, FALSE, FALSE, 'globe', '#8b5cf6');

-- Step 2: Migrate existing ai_provider_configs → backbone_connections
-- (Run as a backend migration script, not raw SQL, because decryption is needed)
-- Pseudocode:
--   for each row in ai_provider_configs where is_active = true:
--     decryptedConfig = decrypt(row.config)
--     definitionId = lookup backbone_definitions where slug = row.provider_type
--     insert into backbone_connections(
--       account_id = row.account_id,
--       definition_id = definitionId,
--       name = 'My ' + row.provider_type + ' (migrated)',
--       config_encrypted = encrypt({ api_url, api_key, agent_id }),
--       is_active = true,
--       is_default = true,
--       verified_at = row.verified_at
--     )

-- Step 3: Keep ai_provider_configs table for backward compat during transition
-- Add a deprecation column:
ALTER TABLE ai_provider_configs ADD COLUMN migrated_to UUID REFERENCES backbone_connections(id);
```

---

## 5. Backend Architecture

### 5.1 New Module: `backend/src/backbone/`

```
backend/src/backbone/
├── backbone.module.ts                    # Module definition
├── backbone-definitions.service.ts       # CRUD for backbone_definitions (read-only for users)
├── backbone-connections.service.ts       # CRUD for backbone_connections (user-facing)
├── backbone-connections.controller.ts    # REST API endpoints
├── backbone-router.service.ts            # Resolution cascade + dispatch
├── backbone-health.service.ts            # Connection health checks (cron)
├── dto/
│   ├── create-backbone-connection.dto.ts
│   ├── update-backbone-connection.dto.ts
│   └── backbone-connection-response.dto.ts
└── adapters/
    ├── backbone-adapter.interface.ts     # The universal interface
    ├── backbone-adapter.registry.ts      # Registry + factory
    ├── openclaw.adapter.ts               # Extracted from current openclaw.service.ts
    ├── openrouter.adapter.ts             # Extracted from current openclaw.service.ts
    ├── claude-code.adapter.ts            # New
    ├── codex.adapter.ts                  # New
    └── custom-http.adapter.ts            # New (generic OpenAI-compatible)
```

### 5.2 BackboneAdapter Interface

```typescript
// backend/src/backbone/adapters/backbone-adapter.interface.ts

export interface BackboneMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BackboneSendOptions {
  messages: BackboneMessage[];
  systemPrompt: string;
  connectionConfig: Record<string, any>;  // Decrypted config from backbone_connections
  conversationId: string;
  taskId?: string;
  streaming?: boolean;
  onChunk?: (chunk: string) => void;       // For streaming responses
  abortSignal?: AbortSignal;
  traceMetadata?: {                        // Langfuse tracing
    accountId: string;
    userId: string;
    boardId?: string;
    stepId?: string;
  };
}

export interface BackboneSendResult {
  content: string;                          // Full response text
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model?: string;                           // Actual model used
  finishReason?: string;
  metadata?: Record<string, any>;           // Backbone-specific metadata
}

export interface BackboneHealthResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  metadata?: Record<string, any>;           // e.g., { version: '1.2.0', models: [...] }
}

export interface BackboneAdapter {
  /**
   * Unique slug matching backbone_definitions.slug
   */
  readonly slug: string;

  /**
   * Send a message and get a response.
   * Must handle retries internally.
   */
  sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult>;

  /**
   * Test connection health.
   * Called by cron and on user-triggered verify.
   */
  healthCheck(connectionConfig: Record<string, any>): Promise<BackboneHealthResult>;

  /**
   * Validate connection config before saving.
   * Throws descriptive error if invalid.
   */
  validateConfig(config: Record<string, any>): Promise<void>;

  /**
   * Optional: Transform system prompt for this backbone's format.
   * Some backbones need prompts structured differently.
   * Default: pass through unchanged.
   */
  transformSystemPrompt?(systemPrompt: string, skills: string[], knowledgeDocs: string[]): string;

  /**
   * Optional: Whether this backbone supports native skill/knowledge injection.
   * If true, ConversationsService skips inline prompt injection.
   * Default: false (inject everything in system prompt).
   */
  supportsNativeSkillInjection?(): boolean;
}
```

### 5.3 BackboneRouter — Resolution Cascade

```typescript
// backend/src/backbone/backbone-router.service.ts

@Injectable()
export class BackboneRouterService {
  constructor(
    private readonly connectionsService: BackboneConnectionsService,
    private readonly adapterRegistry: BackboneAdapterRegistry,
  ) {}

  /**
   * Resolution cascade (highest priority first):
   *
   * 1. Step-level override    → board_steps.backbone_connection_id
   * 2. Board-level override   → board_instances.default_backbone_connection_id
   * 3. Category preference    → categories.preferred_backbone_connection_id
   * 4. Account default        → backbone_connections WHERE is_default = TRUE
   * 5. Legacy fallback        → ai_provider_configs (during migration period)
   *
   * Returns the resolved BackboneAdapter + decrypted connection config.
   */
  async resolve(context: {
    accountId: string;
    boardId?: string;
    stepId?: string;
    categoryId?: string;
    accessToken: string;
  }): Promise<{
    adapter: BackboneAdapter;
    connection: BackboneConnection;
    config: Record<string, any>;
    resolvedFrom: 'step' | 'board' | 'category' | 'account_default' | 'legacy';
  }> {
    // 1. Step-level
    if (context.stepId) {
      const step = await this.getStepBackbone(context.stepId);
      if (step?.backbone_connection_id) {
        return this.buildResult(step.backbone_connection_id, 'step', context.accessToken);
      }
    }

    // 2. Board-level
    if (context.boardId) {
      const board = await this.getBoardBackbone(context.boardId);
      if (board?.default_backbone_connection_id) {
        return this.buildResult(board.default_backbone_connection_id, 'board', context.accessToken);
      }
    }

    // 3. Category preference
    if (context.categoryId) {
      const category = await this.getCategoryBackbone(context.categoryId);
      if (category?.preferred_backbone_connection_id) {
        return this.buildResult(category.preferred_backbone_connection_id, 'category', context.accessToken);
      }
    }

    // 4. Account default
    const defaultConnection = await this.connectionsService.getAccountDefault(context.accountId, context.accessToken);
    if (defaultConnection) {
      return this.buildResult(defaultConnection.id, 'account_default', context.accessToken);
    }

    // 5. Legacy fallback (removed after migration)
    return this.legacyFallback(context.accountId, context.accessToken);
  }

  /**
   * Send a message through the resolved backbone.
   */
  async send(
    context: ResolveContext,
    options: Omit<BackboneSendOptions, 'connectionConfig'>,
  ): Promise<BackboneSendResult & { resolvedFrom: string }> {
    const { adapter, connection, config, resolvedFrom } = await this.resolve(context);

    const result = await adapter.sendMessage({
      ...options,
      connectionConfig: config,
    });

    // Update usage tracking
    await this.connectionsService.trackUsage(connection.id, {
      messagesSent: 1,
      tokensUsed: result.tokensUsed?.total ?? 0,
    });

    return { ...result, resolvedFrom };
  }
}
```

### 5.4 Adapter Registry

```typescript
// backend/src/backbone/adapters/backbone-adapter.registry.ts

@Injectable()
export class BackboneAdapterRegistry {
  private adapters = new Map<string, BackboneAdapter>();

  register(adapter: BackboneAdapter): void {
    this.adapters.set(adapter.slug, adapter);
  }

  get(slug: string): BackboneAdapter {
    const adapter = this.adapters.get(slug);
    if (!adapter) {
      throw new NotFoundException(`Backbone adapter '${slug}' not found. Available: ${[...this.adapters.keys()].join(', ')}`);
    }
    return adapter;
  }

  getAll(): BackboneAdapter[] {
    return [...this.adapters.values()];
  }
}
```

### 5.5 OpenClaw Adapter (Extracted from current code)

```typescript
// backend/src/backbone/adapters/openclaw.adapter.ts

@Injectable()
export class OpenClawAdapter implements BackboneAdapter {
  readonly slug = 'openclaw';

  // All existing OpenClaw WebSocket logic from openclaw.service.ts
  // moves here with ZERO behavioral changes.

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    // Existing executeOpenClawWebSocket() logic
    // - WebSocket connect with challenge-response auth
    // - chat.send with sessionKey, message, idempotencyKey
    // - Stream 'agent' events, wait for 'chat' final
    // - 120s timeout, 3 retries with exponential backoff
    // - Langfuse tracing
  }

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    // Existing verifyConnection() WebSocket handshake logic
  }

  async validateConfig(config: Record<string, any>): Promise<void> {
    if (!config.api_url || !config.api_key || !config.agent_id) {
      throw new BadRequestException('OpenClaw requires api_url, api_key, and agent_id');
    }
  }

  supportsNativeSkillInjection(): boolean {
    return true;  // OpenClaw can load SKILL.md files natively via plugin
  }
}
```

### 5.6 Claude Code Adapter (New)

```typescript
// backend/src/backbone/adapters/claude-code.adapter.ts

@Injectable()
export class ClaudeCodeAdapter implements BackboneAdapter {
  readonly slug = 'claude-code';

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    // Claude Code communication via its HTTP API or MCP bridge
    //
    // Option A: Claude Code exposes an HTTP API (if available)
    //   POST {api_url}/v1/messages
    //   Body: { messages, system, model, max_tokens, stream }
    //
    // Option B: MCP bridge — TaskClaw acts as MCP client
    //   Connect to Claude Code's MCP server
    //   Call tools or send prompts through MCP protocol
    //
    // Option C: CLI subprocess (local only)
    //   Spawn `claude` CLI process with --print flag
    //   Pipe system prompt + message
    //   Capture stdout as response
    //
    // Implementation will depend on Claude Code's external API surface.
    // For v1, use Option A (HTTP) with fallback to Option C (CLI).
  }

  transformSystemPrompt(systemPrompt: string, skills: string[], knowledgeDocs: string[]): string {
    // Claude Code works best with CLAUDE.md-style instructions.
    // Transform TaskClaw skills/knowledge into a structured CLAUDE.md format.
    return [
      '# TaskClaw Context',
      '',
      systemPrompt,
      '',
      ...skills.map(s => `## Skill: ${s}`),
      '',
      ...knowledgeDocs.map(d => `## Reference: ${d}`),
    ].join('\n');
  }

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    // Test connectivity to Claude Code endpoint
  }

  async validateConfig(config: Record<string, any>): Promise<void> {
    if (!config.api_url || !config.api_key) {
      throw new BadRequestException('Claude Code requires api_url and api_key');
    }
  }
}
```

### 5.7 OpenRouter Adapter (Extracted from current code)

```typescript
// backend/src/backbone/adapters/openrouter.adapter.ts

@Injectable()
export class OpenRouterAdapter implements BackboneAdapter {
  readonly slug = 'openrouter';

  async sendMessage(options: BackboneSendOptions): Promise<BackboneSendResult> {
    // Existing executeOpenRouterRequest() logic from openclaw.service.ts
    // - POST to https://openrouter.ai/api/v1/chat/completions
    // - OpenAI-compatible payload
    // - Stream support via SSE
    // - Retry logic
  }

  async healthCheck(config: Record<string, any>): Promise<BackboneHealthResult> {
    // GET https://openrouter.ai/api/v1/models with API key
  }

  async validateConfig(config: Record<string, any>): Promise<void> {
    if (!config.api_key) {
      throw new BadRequestException('OpenRouter requires api_key');
    }
  }
}
```

### 5.8 API Endpoints

```
# Backbone Definitions (read-only catalog)
GET    /accounts/:accountId/backbone/definitions              # List all available backbone types

# Backbone Connections (user CRUD)
GET    /accounts/:accountId/backbone/connections               # List user's connections
GET    /accounts/:accountId/backbone/connections/:id           # Get connection details (masked creds)
POST   /accounts/:accountId/backbone/connections               # Create connection
PATCH  /accounts/:accountId/backbone/connections/:id           # Update connection
DELETE /accounts/:accountId/backbone/connections/:id           # Delete connection
POST   /accounts/:accountId/backbone/connections/:id/verify    # Test connection health
POST   /accounts/:accountId/backbone/connections/:id/default   # Set as account default

# Backbone Assignment (board/step level)
PATCH  /accounts/:accountId/boards/:boardId                    # Update board.default_backbone_connection_id
PATCH  /accounts/:accountId/boards/:boardId/steps/:stepId      # Update step.backbone_connection_id
```

### 5.9 ConversationsService Changes

The main change in `conversations.service.ts` is replacing direct `OpenClawService` calls with `BackboneRouterService`:

```typescript
// BEFORE (current):
const providerConfig = await this.aiProviderService.getDecryptedConfig(accountId, accessToken);
const aiResponse = await this.openClawService.sendMessage(messages, systemPrompt);

// AFTER (multi-backbone):
const resolveContext = {
  accountId,
  boardId: conversation.board_id,
  stepId: task?.current_step_id,
  categoryId: resolvedCategoryId,
  accessToken,
};

const { adapter, config, resolvedFrom } = await this.backboneRouter.resolve(resolveContext);

// Check if this backbone handles skills natively
const shouldInjectSkills = !adapter.supportsNativeSkillInjection?.();
const finalSystemPrompt = shouldInjectSkills
  ? this.buildSystemPromptWithSkills(context)
  : this.buildSystemPromptWithoutSkills(context);

// Transform prompt if adapter needs it
const transformedPrompt = adapter.transformSystemPrompt
  ? adapter.transformSystemPrompt(finalSystemPrompt, skillContents, knowledgeContents)
  : finalSystemPrompt;

const result = await adapter.sendMessage({
  messages,
  systemPrompt: transformedPrompt,
  connectionConfig: config,
  conversationId: conversation.id,
  taskId: task?.id,
  traceMetadata: { accountId, userId, boardId: conversation.board_id, stepId: task?.current_step_id },
});

// Store which backbone was used
await this.updateConversationBackbone(conversation.id, resolvedConnection.id);
```

### 5.10 Backbone Health Checks (Cron)

```typescript
// backend/src/backbone/backbone-health.service.ts

@Injectable()
export class BackboneHealthService {
  private readonly logger = new Logger(BackboneHealthService.name);

  constructor(
    private readonly connectionsService: BackboneConnectionsService,
    private readonly adapterRegistry: BackboneAdapterRegistry,
  ) {}

  // Run every 60 seconds for active connections
  @Cron(CronExpression.EVERY_MINUTE)
  async checkHealth(): Promise<void> {
    const connections = await this.connectionsService.findAllActive();

    for (const conn of connections) {
      try {
        const adapter = this.adapterRegistry.get(conn.definition_slug);
        const config = this.connectionsService.decryptConfig(conn.config_encrypted);
        const result = await adapter.healthCheck(config);

        await this.connectionsService.updateHealth(conn.id, {
          health_status: result.healthy ? 'healthy' : 'unhealthy',
          last_health_check: new Date(),
        });
      } catch (err) {
        await this.connectionsService.updateHealth(conn.id, {
          health_status: 'unhealthy',
          last_health_check: new Date(),
        });
        this.logger.warn(`Health check failed for ${conn.name}: ${err.message}`);
      }
    }
  }
}
```

### 5.11 Module Definition

```typescript
// backend/src/backbone/backbone.module.ts

@Module({
  imports: [
    forwardRef(() => ConversationsModule),  // Circular dep resolved
    CommonModule,
  ],
  controllers: [BackboneConnectionsController],
  providers: [
    BackboneDefinitionsService,
    BackboneConnectionsService,
    BackboneRouterService,
    BackboneHealthService,
    BackboneAdapterRegistry,

    // Adapters (auto-registered)
    OpenClawAdapter,
    OpenRouterAdapter,
    ClaudeCodeAdapter,
    CodexAdapter,
    CustomHttpAdapter,
  ],
  exports: [
    BackboneRouterService,
    BackboneConnectionsService,
    BackboneDefinitionsService,
  ],
})
export class BackboneModule implements OnModuleInit {
  constructor(
    private readonly registry: BackboneAdapterRegistry,
    private readonly openclawAdapter: OpenClawAdapter,
    private readonly openrouterAdapter: OpenRouterAdapter,
    private readonly claudeCodeAdapter: ClaudeCodeAdapter,
    private readonly codexAdapter: CodexAdapter,
    private readonly customHttpAdapter: CustomHttpAdapter,
  ) {}

  onModuleInit() {
    this.registry.register(this.openclawAdapter);
    this.registry.register(this.openrouterAdapter);
    this.registry.register(this.claudeCodeAdapter);
    this.registry.register(this.codexAdapter);
    this.registry.register(this.customHttpAdapter);
  }
}
```

---

## 6. Frontend Architecture

### 6.1 New Pages & Components

```
frontend/src/
├── app/dashboard/settings/backbones/
│   ├── page.tsx                          # Backbone connections management page
│   └── actions.ts                        # Server actions for backbone CRUD
├── components/backbones/
│   ├── backbone-connection-card.tsx       # Card showing connection name, type, health
│   ├── backbone-connection-dialog.tsx     # Create/edit dialog with dynamic form from config_schema
│   ├── backbone-picker.tsx               # Dropdown selector used in board/step settings
│   ├── backbone-health-badge.tsx         # Health status indicator (green/red/yellow dot)
│   └── backbone-definition-icon.tsx      # Icon renderer for backbone types
├── hooks/
│   ├── use-backbone-definitions.ts       # React Query: list backbone types
│   ├── use-backbone-connections.ts       # React Query: list/create/update/delete connections
│   └── use-backbone-resolver.ts          # Utility: resolve which backbone a board/step uses
└── types/
    └── backbone.ts                       # TypeScript types
```

### 6.2 TypeScript Types

```typescript
// frontend/src/types/backbone.ts

export interface BackboneDefinition {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  protocol: 'websocket' | 'http' | 'mcp' | 'cli';
  supports_streaming: boolean;
  supports_heartbeat: boolean;
  supports_agent_mode: boolean;
  supports_tool_use: boolean;
  supports_file_access: boolean;
  supports_code_execution: boolean;
  config_schema: Record<string, any>;     // JSON Schema for the credential form
  is_active: boolean;
}

export interface BackboneConnection {
  id: string;
  account_id: string;
  definition_id: string;
  definition?: BackboneDefinition;        // Joined
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  health_status: 'healthy' | 'unhealthy' | 'checking' | 'unknown';
  last_health_check: string | null;
  verified_at: string | null;
  total_messages_sent: number;
  total_tokens_used: number;
  last_used_at: string | null;
  created_at: string;
  // Note: config_encrypted is NEVER sent to frontend
  // Frontend receives masked preview: { api_url: "https://my-oc....", api_key: "****key" }
  config_preview?: Record<string, string>;
}
```

### 6.3 Backbone Connection Dialog (Dynamic Form)

The create/edit dialog renders its form fields dynamically from `backbone_definitions.config_schema` (JSON Schema):

```
┌─────────────────────────────────────────────┐
│  Add Backbone Connection                     │
│                                              │
│  Type: [▼ OpenClaw          ]               │
│                                              │
│  ┌─ Connection Details ──────────────────┐  │
│  │  Name: [My Production OpenClaw      ] │  │
│  │                                       │  │
│  │  Server URL: [https://oc.example.com] │  │  ← Rendered from config_schema
│  │  API Token:  [••••••••••••••••••••• ] │  │  ← format: "password" → masked
│  │  Agent ID:   [agent_abc123          ] │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  [Test Connection]  [Cancel]  [Save]         │
└─────────────────────────────────────────────┘
```

When the user changes the "Type" dropdown, the form fields re-render based on the selected definition's `config_schema`.

### 6.4 Backbone Picker (Board/Step Settings)

Reusable dropdown component used in board settings and step settings:

```
┌──────────────────────────────────────────┐
│  AI Backbone: [▼ My Production OpenClaw ●] │  ← Green dot = healthy
│               ┌──────────────────────────┐ │
│               │ ● My Production OpenClaw │ │
│               │ ● Local Claude Code      │ │
│               │ ○ Codex (unhealthy)      │ │
│               │ ── Inherit from board ── │ │  ← For step-level picker
│               │ ── Inherit from account ─│ │  ← For board-level picker
│               └──────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 6.5 Settings Page Layout

The existing AI Provider settings page at `/dashboard/settings/ai-provider` is replaced with a richer backbone management page at `/dashboard/settings/backbones`:

```
┌─────────────────────────────────────────────────────────┐
│  Settings > AI Backbones                                │
│                                                         │
│  Your backbone connections determine which AI runtimes  │
│  power your boards and agents.            [+ Add New]   │
│                                                         │
│  ┌─────────────────────────┐ ┌─────────────────────────┐│
│  │ ● My Production OpenClaw│ │ ● Local Claude Code     ││
│  │   openclaw · healthy    │ │   claude-code · healthy  ││
│  │   ★ Default             │ │   2 boards using this   ││
│  │   142 msgs · 1.2M tokens│ │   38 msgs · 450K tokens ││
│  │   [Edit] [Test] [···]   │ │   [Edit] [Test] [···]   ││
│  └─────────────────────────┘ └─────────────────────────┘│
│                                                         │
│  ┌─────────────────────────┐                           │
│  │ ○ Codex (OpenAI)        │                           │
│  │   codex · unhealthy     │                           │
│  │   Last check: 5m ago    │                           │
│  │   [Edit] [Test] [···]   │                           │
│  └─────────────────────────┘                           │
│                                                         │
│  Available backbone types:                              │
│  [OpenClaw] [Claude Code] [Codex] [OpenRouter]         │
│  [ZeroClaw] [PinaClaw] [Custom HTTP]                   │
└─────────────────────────────────────────────────────────┘
```

### 6.6 Board Settings Integration

In the existing board settings panel, add a "Backbone" section:

```
Board Settings: LinkedIn Post Pipeline
├── General (name, description, icon)
├── AI Backbone                              ← NEW SECTION
│   ├── Default backbone: [▼ My Production OpenClaw ●]
│   └── Per-step overrides:
│       ├── 💡 Idea:        Inherits (OpenClaw)
│       ├── 🤖 AI Generate: Inherits (OpenClaw)
│       ├── 👀 Review:      Inherits (OpenClaw)
│       └── 📤 Publish:     [▼ Local Claude Code ●]   ← Step override
├── Agents & Skills
├── Automation
└── Danger Zone
```

### 6.7 Navigation Update

Update the sidebar settings menu to replace "AI Provider" with "AI Backbones":

```typescript
// In sidebar settings nav items:
// BEFORE:
{ title: 'AI Provider', url: '/dashboard/settings/ai-provider', icon: Brain }
// AFTER:
{ title: 'AI Backbones', url: '/dashboard/settings/backbones', icon: BrainCircuit }
```

---

## 7. Board Manifest Extension

The board manifest JSON schema gains a `backbone` section:

```jsonc
{
  "manifest_version": "1.1",  // Bumped from 1.0
  // ... existing fields ...

  "settings": {
    // ... existing settings ...
    "default_backbone": "openclaw",           // Backbone slug (resolved at install time)
  },

  "steps": [
    {
      "id": "ai_generate",
      // ... existing fields ...
      "ai_config": {
        // ... existing fields ...
        "backbone_override": "claude-code",   // Step-level backbone slug (optional)
      }
    }
  ]
}
```

When importing a board manifest:
1. Read `settings.default_backbone` slug
2. Look up user's `backbone_connections` with matching `definition.slug`
3. If found: auto-assign. If not found: prompt user to create a connection for that backbone type.
4. Same resolution for per-step `backbone_override` slugs.

---

## 8. Execution Plan

### Phase 1: Foundation (Backend — Database + Interface)

| # | Task | Status | Files |
|---|------|--------|-------|
| 1.1 | Create `backbone_definitions` table migration | ⬜ | `backend/supabase/migrations/20260330000001_create_backbone_tables.sql` |
| 1.2 | Create `backbone_connections` table migration | ⬜ | Same migration file |
| 1.3 | Add `backbone_connection_id` columns to board_instances, board_steps, categories, conversations, messages | ⬜ | `backend/supabase/migrations/20260330000002_add_backbone_refs.sql` |
| 1.4 | Seed backbone_definitions with launch set (OpenClaw, Claude Code, Codex, OpenRouter, ZeroClaw, PinaClaw, Custom HTTP) | ⬜ | `backend/supabase/migrations/20260330000003_seed_backbone_definitions.sql` |
| 1.5 | Define `BackboneAdapter` interface | ⬜ | `backend/src/backbone/adapters/backbone-adapter.interface.ts` |
| 1.6 | Implement `BackboneAdapterRegistry` | ⬜ | `backend/src/backbone/adapters/backbone-adapter.registry.ts` |
| 1.7 | Extract OpenClaw logic into `OpenClawAdapter` | ⬜ | `backend/src/backbone/adapters/openclaw.adapter.ts` |
| 1.8 | Extract OpenRouter logic into `OpenRouterAdapter` | ⬜ | `backend/src/backbone/adapters/openrouter.adapter.ts` |

### Phase 2: Services + API (Backend)

| # | Task | Status | Files |
|---|------|--------|-------|
| 2.1 | Create `BackboneDefinitionsService` (read-only CRUD) | ⬜ | `backend/src/backbone/backbone-definitions.service.ts` |
| 2.2 | Create `BackboneConnectionsService` (full CRUD + encryption) | ⬜ | `backend/src/backbone/backbone-connections.service.ts` |
| 2.3 | Create `BackboneRouterService` (resolution cascade) | ⬜ | `backend/src/backbone/backbone-router.service.ts` |
| 2.4 | Create `BackboneHealthService` (cron health checks) | ⬜ | `backend/src/backbone/backbone-health.service.ts` |
| 2.5 | Create DTOs (create, update, response) | ⬜ | `backend/src/backbone/dto/` |
| 2.6 | Create `BackboneConnectionsController` (REST endpoints) | ⬜ | `backend/src/backbone/backbone-connections.controller.ts` |
| 2.7 | Create `BackboneModule` with adapter registration | ⬜ | `backend/src/backbone/backbone.module.ts` |
| 2.8 | Write data migration script: `ai_provider_configs` → `backbone_connections` | ⬜ | `backend/src/backbone/migrations/migrate-ai-providers.ts` |

### Phase 3: Integration (Backend — Wire into Conversations)

| # | Task | Status | Files |
|---|------|--------|-------|
| 3.1 | Update `ConversationsModule` to import `BackboneModule` | ⬜ | `backend/src/conversations/conversations.module.ts` |
| 3.2 | Refactor `ConversationsService.sendMessageBackground()` to use `BackboneRouterService` | ⬜ | `backend/src/conversations/conversations.service.ts` |
| 3.3 | Refactor `ConversationsService.sendMessage()` (sync) to use `BackboneRouterService` | ⬜ | Same file |
| 3.4 | Update `buildSystemPrompt()` to check `adapter.supportsNativeSkillInjection()` | ⬜ | Same file |
| 3.5 | Store `backbone_connection_id` on conversation and message creation | ⬜ | Same file |
| 3.6 | Update `BoardsService` to accept `default_backbone_connection_id` on create/update | ⬜ | `backend/src/boards/boards.service.ts` |
| 3.7 | Update `BoardStepsService` to accept `backbone_connection_id` on create/update | ⬜ | `backend/src/boards/board-steps.service.ts` |
| 3.8 | Update board manifest import to resolve backbone slugs | ⬜ | `backend/src/boards/boards.service.ts` |

### Phase 4: New Adapters (Backend)

| # | Task | Status | Files |
|---|------|--------|-------|
| 4.1 | Implement `ClaudeCodeAdapter` | ⬜ | `backend/src/backbone/adapters/claude-code.adapter.ts` |
| 4.2 | Implement `CodexAdapter` | ⬜ | `backend/src/backbone/adapters/codex.adapter.ts` |
| 4.3 | Implement `CustomHttpAdapter` (generic OpenAI-compatible) | ⬜ | `backend/src/backbone/adapters/custom-http.adapter.ts` |
| 4.4 | Add adapter-specific prompt transformation for each new adapter | ⬜ | Each adapter file |

### Phase 5: Frontend

| # | Task | Status | Files |
|---|------|--------|-------|
| 5.1 | Create backbone TypeScript types | ⬜ | `frontend/src/types/backbone.ts` |
| 5.2 | Create React Query hooks (`use-backbone-definitions`, `use-backbone-connections`) | ⬜ | `frontend/src/hooks/` |
| 5.3 | Create server actions for backbone CRUD | ⬜ | `frontend/src/app/dashboard/settings/backbones/actions.ts` |
| 5.4 | Build `BackboneConnectionCard` component | ⬜ | `frontend/src/components/backbones/backbone-connection-card.tsx` |
| 5.5 | Build `BackboneConnectionDialog` with dynamic JSON Schema form | ⬜ | `frontend/src/components/backbones/backbone-connection-dialog.tsx` |
| 5.6 | Build `BackbonePicker` dropdown component | ⬜ | `frontend/src/components/backbones/backbone-picker.tsx` |
| 5.7 | Build `BackboneHealthBadge` component | ⬜ | `frontend/src/components/backbones/backbone-health-badge.tsx` |
| 5.8 | Create settings page at `/dashboard/settings/backbones` | ⬜ | `frontend/src/app/dashboard/settings/backbones/page.tsx` |
| 5.9 | Integrate `BackbonePicker` into board settings panel | ⬜ | `frontend/src/components/boards/board-settings-panel.tsx` |
| 5.10 | Integrate `BackbonePicker` into step settings (per-column config) | ⬜ | `frontend/src/components/boards/step-settings-dialog.tsx` |
| 5.11 | Update sidebar navigation: "AI Provider" → "AI Backbones" | ⬜ | `frontend/src/components/app-sidebar.tsx` |
| 5.12 | Show active backbone badge in board header / step column header | ⬜ | `frontend/src/components/boards/board-kanban-view.tsx` |

### Phase 6: Migration & Cleanup

| # | Task | Status | Files |
|---|------|--------|-------|
| 6.1 | Run data migration: existing `ai_provider_configs` → `backbone_connections` | ⬜ | Migration script |
| 6.2 | Add backward-compat: if no backbone_connections exist, fall back to ai_provider_configs | ⬜ | `backbone-router.service.ts` |
| 6.3 | Update MCP server to expose backbone info in board/task responses | ⬜ | `backend/src/mcp/` |
| 6.4 | Update board manifest export to include backbone slugs | ⬜ | `backend/src/boards/boards.service.ts` |
| 6.5 | Deprecate `ai_provider_configs` table (keep but mark deprecated) | ⬜ | Documentation |
| 6.6 | Update onboarding flow to set up first backbone connection | ⬜ | `frontend/src/app/onboarding/` |

---

## 9. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Resolution cascade order | Step → Board → Category → Account | Most specific wins. Users configure at the level they need — most won't touch step-level. |
| Backbone definitions are system-seeded | Read-only for users | Prevents misconfiguration. New backbone types added via migrations/code, not user input. |
| One interface for all protocols | `BackboneAdapter` | Simplicity. Protocol details hidden inside each adapter. ConversationsService doesn't care if it's WebSocket or HTTP. |
| Dynamic form from JSON Schema | `config_schema` on backbone_definitions | Avoids hardcoded forms per backbone type. Adding a new backbone = seed a row + implement adapter. Frontend auto-renders. |
| Encrypted config as single blob | `config_encrypted` TEXT | Consistent with existing `ai_provider_configs` pattern. One decrypt call returns full config object. |
| Health checks are opt-in cron | 60s interval | Balance between freshness and API cost. Users can also trigger manual verify. |
| Conversations track backbone | `backbone_connection_id` on conversations + messages | Enables cost attribution, debugging ("which backbone answered this?"), and future analytics. |
| Legacy fallback during migration | `ai_provider_configs` still works | Zero downtime. Existing users see no change until they opt into multi-backbone. |
| Board manifest stores slugs not IDs | `"default_backbone": "openclaw"` | Manifests are portable across accounts. IDs are instance-specific; slugs are universal. |

---

## 10. Future Considerations (Out of Scope for This PRD)

| Feature | Why Deferred | Dependency |
|---------|-------------|------------|
| **Heartbeat orchestration** | Requires backbone-agnostic scheduler + state machine. Complex. OpenClaw covers basic heartbeats for now. | Multi-backbone must land first |
| **Departments / Managers** | Organizational layer above boards. Needs inter-board communication first. | Multi-board + multi-backbone |
| **Inter-board communication** | Board A output → Board B input. Needs event bus + routing rules. | Multi-board architecture |
| **CEO Agent** | Top-level orchestrator. Needs departments + heartbeats. | Departments + heartbeat |
| **Per-backbone budget limits** | Monthly spending caps per connection. Requires token tracking accuracy. | Token tracking (Phase 2 provides foundation) |
| **Backbone marketplace** | Community-contributed adapter packages. | Plugin system |
| **Multi-backbone per conversation** | Switch backbone mid-conversation (e.g., start with OpenClaw, hand off to Claude Code). | Stable multi-backbone foundation |
| **Backbone-specific tool injection** | Claude Code gets file tools, Codex gets code execution. Per-adapter tool sets. | Adapter maturity |
