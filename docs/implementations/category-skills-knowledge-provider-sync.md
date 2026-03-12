# Plan: Category-Linked Skills & Knowledge with Provider Sync via OpenClaw Plugin

## Context

Skills and Knowledge Base exist in TaskClaw's database but are loosely connected to categories. When a conversation starts, the full text of all relevant skills + the master knowledge doc are **injected into every API request** as part of the system prompt (`buildSystemPrompt` in [conversations.service.ts:590-695](../../backend/src/conversations/conversations.service.ts)). This means:

- 2-3 skills (~4-6KB) + 1 knowledge doc (~5-50KB) = **3,000-17,000 tokens re-sent on EVERY message**
- For 50 messages/day = up to **850,000 wasted tokens/day**

**The goal:** Store skills/knowledge on the OpenClaw server as SKILL.md files so they're loaded natively (not sent in every API payload), link them to categories in the UI, and keep everything in sync.

**Approach:** Build a **TaskClaw OpenClaw Plugin** that exposes RPC endpoints on the gateway. TaskClaw's backend calls these endpoints via HTTP (same connection as chat, same auth token) to push skill files. No SSH credentials needed.

---

## Phase 1: OpenClaw Plugin — `@taskclaw/openclaw-plugin`

### 1.1 Plugin structure

Create a new package at the repo root: `packages/openclaw-plugin/`

```
packages/openclaw-plugin/
├── package.json              # name: "@taskclaw/openclaw-plugin"
├── openclaw.plugin.json      # Plugin manifest
├── src/
│   ├── index.ts              # Plugin entry — register(api)
│   ├── rpc/
│   │   ├── sync-skill.ts     # taskclaw.syncSkill RPC handler
│   │   ├── delete-skill.ts   # taskclaw.deleteSkill RPC handler
│   │   ├── list-skills.ts    # taskclaw.listSkills RPC handler
│   │   ├── health.ts         # taskclaw.health RPC handler
│   │   └── verify-skill.ts   # taskclaw.verifySkill RPC handler
│   └── utils/
│       └── file-manager.ts   # Read/write SKILL.md files safely
└── tsconfig.json
```

### 1.2 Plugin manifest (`openclaw.plugin.json`)

```json
{
  "id": "taskclaw-sync",
  "configSchema": {
    "type": "object",
    "properties": {
      "skillsBasePath": {
        "type": "string",
        "default": "~/.openclaw/skills"
      },
      "authToken": {
        "type": "string",
        "description": "Shared secret for TaskClaw backend to authenticate RPC calls"
      }
    }
  }
}
```

### 1.3 RPC endpoints registered by the plugin

| RPC Method | Purpose | Payload |
|------------|---------|---------|
| `taskclaw.syncSkill` | Write/update a SKILL.md file | `{ categorySlug, content, hash }` |
| `taskclaw.deleteSkill` | Remove a category's skill file | `{ categorySlug }` |
| `taskclaw.listSkills` | List all taskclaw-* skill dirs | — |
| `taskclaw.verifySkill` | Read back a file and return its hash | `{ categorySlug }` |
| `taskclaw.health` | Plugin health + file system check | — |

**Example: `taskclaw.syncSkill` handler:**
```typescript
api.registerGatewayMethod("taskclaw.syncSkill", async ({ body, respond }) => {
  const { categorySlug, content, hash } = body;
  const dir = path.join(skillsBasePath, `taskclaw-${categorySlug}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
  respond(true, { ok: true, path: dir, hash });
});
```

### 1.4 Plugin installation on OpenClaw server

One-time setup (via SSH or manual):
```bash
# On the OpenClaw VPS
cd ~/.openclaw/extensions
# Copy or symlink the built plugin
openclaw plugins install /path/to/taskclaw-openclaw-plugin
openclaw plugins enable taskclaw-sync
```

After installation, no further SSH access is needed — all communication is via HTTP RPC.

---

## Phase 2: Backend — Agent Sync Module

### 2.1 New module: `backend/src/agent-sync/`

| File | Purpose |
|------|---------|
| `agent-sync.module.ts` | NestJS module wiring |
| `agent-sync.service.ts` | Orchestrates compilation + sync + cron + health |
| `agent-compiler.service.ts` | Compiles category's skills + knowledge into SKILL.md content |
| `openclaw-rpc.client.ts` | HTTP client for calling plugin RPC endpoints |
| `agent-sync.controller.ts` | REST endpoints for manual sync, status, health |

### 2.2 `OpenClawRpcClient` — Calls plugin RPC endpoints via HTTP

Uses the **same gateway URL + auth token** already stored in `ai_provider_configs`. No new credentials needed.

```typescript
@Injectable()
export class OpenClawRpcClient {
  // Call any taskclaw.* RPC method on the OpenClaw gateway
  async call(config: OpenClawConfig, method: string, body: any): Promise<any>

  // Convenience methods
  async syncSkill(config, categorySlug, content, hash): Promise<void>
  async deleteSkill(config, categorySlug): Promise<void>
  async verifySkill(config, categorySlug): Promise<{ hash: string } | null>
  async listSkills(config): Promise<string[]>
  async health(config): Promise<{ ok: boolean; pluginVersion: string }>
}
```

**RPC call format:**
```
POST {openClawUrl}/rpc/taskclaw.syncSkill
Headers: Authorization: Bearer {gatewayToken}
Body: { categorySlug: "work", content: "---\nname: ...", hash: "sha256..." }
```

### 2.3 `AgentCompilerService` — Build SKILL.md content

Takes a category ID and produces a complete SKILL.md file:

```markdown
---
name: taskclaw-{category-slug}
description: Skills and knowledge for {Category Name}
user-invocable: false
---

## Skills

### {Skill 1 Name}
{Skill 1 description}

{Skill 1 instructions}

## Knowledge Base

### {Master Doc Title}
{Master doc content}
```

**Methods:**
- `compileForCategory(accountId, categoryId)` → `{ content, hash, skillIds, knowledgeDocId }`
- `computeHash(content)` → SHA-256 string

### 2.4 `AgentSyncService` — Orchestration + Cron

**Core sync flow (`syncCategory`):**
1. Compile instructions via `AgentCompilerService`
2. Check stored hash in `provider_agents` table
3. If hash matches → skip (no change)
4. If different → call `OpenClawRpcClient.syncSkill()` with new content
5. Update `provider_agents` row (hash, sync_status, timestamp)
6. Log to `agent_sync_logs`

**Immediate sync** (called directly after skill/knowledge edits):
- Call `syncCategory()` right after the mutation
- If RPC fails, mark as `stale` for cron retry

**Cron job** (every 5 minutes):
- Picks up `stale` and `error` (with retry_count < 5) rows
- Retries with exponential backoff (30s, 60s, 120s, 240s, 480s)
- Verifies `synced` rows older than 30 minutes via `verifySkill` RPC
- Creates initial `provider_agents` rows for new categories that have linked skills/knowledge

**Health verification:**
- Calls `taskclaw.verifySkill` RPC → reads file hash from server
- If hash mismatch or file missing → re-sync
- If RPC unreachable → log warning, keep current status

### 2.5 Database migration

**New table: `provider_agents`**
```sql
id UUID PRIMARY KEY,
account_id UUID NOT NULL REFERENCES accounts(id),
category_id UUID NOT NULL REFERENCES categories(id),
provider_type TEXT DEFAULT 'openclaw',
remote_skill_path TEXT,           -- e.g. 'taskclaw-work'
instructions_hash TEXT,           -- SHA-256
compiled_instructions TEXT,       -- cached for debugging/preview
skill_ids_snapshot JSONB DEFAULT '[]',
knowledge_doc_id UUID,
sync_status TEXT DEFAULT 'pending'
  CHECK (sync_status IN ('pending','syncing','synced','error','stale')),
last_synced_at TIMESTAMPTZ,
last_sync_error TEXT,
retry_count INTEGER DEFAULT 0,
next_retry_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW(),
UNIQUE(account_id, category_id)
```

**New table: `agent_sync_logs`**
```sql
id UUID PRIMARY KEY,
provider_agent_id UUID REFERENCES provider_agents(id),
account_id UUID,
action TEXT CHECK (action IN ('create','update','delete','verify')),
status TEXT CHECK (status IN ('started','completed','failed')),
instructions_hash TEXT,
error_message TEXT,
duration_ms INTEGER,
created_at TIMESTAMPTZ DEFAULT NOW()
```

### 2.6 REST endpoints

```
GET  /accounts/:accountId/agent-sync/status        — Sync status dashboard
POST /accounts/:accountId/agent-sync/sync           — Sync all categories
POST /accounts/:accountId/agent-sync/sync/:catId    — Sync specific category
GET  /accounts/:accountId/agent-sync/health         — Health check via plugin
GET  /accounts/:accountId/agent-sync/:catId/preview — Preview compiled SKILL.md
DELETE /accounts/:accountId/agent-sync/:catId        — Remove skill from provider
```

---

## Phase 3: Wire Up Change Detection + Conversation Optimization

### 3.1 Modify `skills.service.ts`

After `create`, `update`, `remove`, `linkToCategory`, `unlinkFromCategory`:
- Find all categories linked to the affected skill via `category_skills` table
- Call `agentSyncService.syncCategory(accountId, categoryId)` for each affected category

### 3.2 Modify `knowledge.service.ts`

After `create`, `update`, `remove`, `setAsMaster`:
- If the doc is/was a master doc with a `category_id`, call `agentSyncService.syncCategory()`

### 3.3 Modify `conversations.service.ts` — The Critical Change

In `buildSystemPrompt()` (lines 590-695):

```
1. If task has a category → check provider_agents for (account, category)
2. If sync_status = 'synced':
   → SKIP inline skill injection (lines 607-631)
   → SKIP inline knowledge injection (lines 637-655)
   → Skills + knowledge are already loaded by OpenClaw from SKILL.md
3. If NOT synced → fallback to current inline injection (unchanged)
4. Task context section (lines 660-692) → ALWAYS included (task-specific)
```

No changes needed in `openclaw.service.ts` — the request format stays the same. The only difference is the system prompt is smaller (no skills/knowledge text).

---

## Phase 4: Frontend — Category-Skills-Knowledge UI

### 4.1 Categories page

File: `frontend/src/app/dashboard/settings/categories/page.tsx`

Add to each category card:
- **Linked Skills** section with skill chips + link/unlink actions
- **Knowledge Docs** count with link to knowledge page filtered by category
- **Sync Status** badge: green=synced, yellow=pending, red=error, gray=none
- **"Sync Now"** button

### 4.2 Skills page

File: `frontend/src/app/dashboard/settings/skills/page.tsx`

Add to each skill card:
- **Linked Categories** chips showing which categories use this skill
- **Category linking**: multi-select dropdown to assign/unassign categories
- Linking/unlinking triggers immediate sync

### 4.3 Knowledge page

File: `frontend/src/app/dashboard/knowledge/page.tsx`

- Add "Synced to provider" indicator on master docs in synced categories
- No major structural changes (category linking already exists)

### 4.4 AI Provider settings — Sync Status panel

File: `frontend/src/app/dashboard/settings/ai-provider/page.tsx`

New section below existing config:
- Plugin connection status (calls `taskclaw.health` RPC)
- Summary table: categories × sync status × last sync time × skill count
- "Sync All" button
- Error details expandable per category
- "Preview SKILL.md" modal per category

### 4.5 Frontend actions

File: `frontend/src/app/dashboard/settings/agent-sync/actions.ts`

- `getAgentSyncStatus()` — dashboard data
- `triggerSync(categoryId?)` — manual sync
- `previewInstructions(categoryId)` — preview compiled content
- `getPluginHealth()` — plugin connectivity

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `backend/src/conversations/conversations.service.ts` | Conditional skip of inline injection when synced |
| `backend/src/skills/skills.service.ts` | Add immediate sync triggers after mutations |
| `backend/src/knowledge/knowledge.service.ts` | Add immediate sync triggers after mutations |
| `backend/src/app.module.ts` | Import AgentSyncModule |
| `frontend/src/app/dashboard/settings/categories/page.tsx` | Linked skills/knowledge + sync status |
| `frontend/src/app/dashboard/settings/skills/page.tsx` | Category linking UI |
| `frontend/src/app/dashboard/settings/ai-provider/page.tsx` | Sync status panel |

## New Files to Create

| File | Purpose |
|------|---------|
| `packages/openclaw-plugin/src/index.ts` | Plugin entry point |
| `packages/openclaw-plugin/src/rpc/sync-skill.ts` | Sync RPC handler |
| `packages/openclaw-plugin/src/rpc/delete-skill.ts` | Delete RPC handler |
| `packages/openclaw-plugin/src/rpc/verify-skill.ts` | Verify RPC handler |
| `packages/openclaw-plugin/src/rpc/list-skills.ts` | List RPC handler |
| `packages/openclaw-plugin/src/rpc/health.ts` | Health RPC handler |
| `packages/openclaw-plugin/openclaw.plugin.json` | Plugin manifest |
| `backend/src/agent-sync/agent-sync.module.ts` | NestJS module |
| `backend/src/agent-sync/agent-sync.service.ts` | Sync orchestration + cron |
| `backend/src/agent-sync/agent-compiler.service.ts` | SKILL.md compilation |
| `backend/src/agent-sync/openclaw-rpc.client.ts` | HTTP client for plugin RPC |
| `backend/src/agent-sync/agent-sync.controller.ts` | REST endpoints |
| `backend/supabase/migrations/20260220000001_create_provider_agents.sql` | DB tables |
| `frontend/src/app/dashboard/settings/agent-sync/actions.ts` | Server actions |

## Verification Plan

1. **Plugin**: Install plugin on OpenClaw VPS → call `taskclaw.health` via HTTP → verify response
2. **Sync flow**: Create category + skill + knowledge → trigger sync → verify SKILL.md written on server via `taskclaw.verifySkill`
3. **Change detection**: Edit a skill → verify immediate re-sync → verify hash updated
4. **Token savings**: Start conversation for a synced category → verify system prompt does NOT contain skill/knowledge text
5. **AI quality**: Verify OpenClaw still answers with skill/knowledge context (loaded from file)
6. **Health monitor**: Manually delete SKILL.md on server → wait for cron → verify re-sync
7. **Fallback**: Stop the plugin → verify conversations still work with inline injection
8. **Frontend**: Verify sync status badges update in real-time, manual sync buttons work

## Design Note: Per-Category Skill Isolation

In single-agent OpenClaw mode, ALL `~/.openclaw/skills/` are loaded into every conversation. A "Work" skill would also appear in "Personal" conversations. Future solutions:

1. **Multi-agent setup**: Create per-category OpenClaw agents with separate workspaces, route via `agent_id`
2. **Plugin agent tool**: Register a `search_knowledge` agent tool in the plugin — AI queries knowledge on-demand (RAG-like) instead of loading everything. Most token-efficient long-term.

For now, global skill loading is accepted — the primary savings still apply (skills not in our API payload). Isolation is a follow-up.
