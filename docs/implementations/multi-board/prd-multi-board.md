# TaskClaw Multi-Board Workflow Engine — Architecture Document

## 1. Executive Summary

TaskClaw evolves from a single-board Kanban with AI chat into a **multi-board workflow engine** where each board is a configurable, automatable pipeline. Boards are defined as portable JSON manifests (like N8N workflows), can be published to a marketplace, imported/exported, and instantiated into a user's workspace.

Each board column becomes a **pipeline step** with its own AI configuration, input/output schema, triggers, error routing, and required tools — turning TaskClaw from a task tracker into a lightweight AI-powered orchestration platform.

---

## 2. Core Concepts

### 2.1 Terminology

| Concept | Definition |
|---------|-----------|
| **Board Template** | A reusable JSON manifest defining a workflow: its steps, AI configs, required tools, input/output schemas. Shareable, versionable, installable. |
| **Board Instance** | A user's active copy of a board template. Holds actual cards and runtime state. Users can customize step configs after installation. |
| **Step Definition** | A single column/stage in the pipeline. Contains all config: skills, prompt, knowledge, triggers, fields, AI-first flag, routing. |
| **Card** | A work item that flows through steps. Carries structured data (fields), conversation history, and execution logs. |
| **Board Manifest** | The portable JSON file that fully describes a board template. Import/export/publish unit. |
| **Required Tools** | External integrations a board depends on (e.g., WhatsApp, LinkedIn, Google Sheets). Validated at install time. |

### 2.2 Board Manifest (JSON Schema)

The manifest is the single source of truth for a board's structure. Inspired by N8N's workflow JSON but purpose-built for TaskClaw's step-based model.

```jsonc
{
  "manifest_version": "1.0",
  "id": "linkedin-post-pipeline",
  "name": "LinkedIn Post Pipeline",
  "description": "End-to-end content creation for LinkedIn",
  "version": "1.2.0",
  "author": "fernando@taskclaw.co",
  "tags": ["content", "social-media", "linkedin"],
  "icon": "linkedin",
  "color": "#0077B5",

  // Tools the board requires — validated at install time
  "required_tools": [
    {
      "tool_id": "linkedin",
      "name": "LinkedIn API",
      "reason": "Required to publish posts in the final step",
      "optional": false
    },
    {
      "tool_id": "dall-e",
      "name": "DALL-E Image Generation",
      "reason": "Used to generate post images",
      "optional": true  // board works without it, just no auto-images
    }
  ],

  // Global board-level config
  "settings": {
    "default_ai_model": "anthropic/claude-sonnet-4-20250514",
    "max_concurrent_ai_jobs": 3,
    "card_retention_days": 90,  // auto-archive after N days in "Done"
    "allow_manual_column_move": true  // can users drag cards freely or must follow flow?
  },

  // Step definitions — ordered array = the pipeline
  "steps": [
    {
      "id": "idea",
      "name": "💡 Idea",
      "type": "input",          // step types: input | ai_process | human_review | action | done
      "position": 0,

      // Input/Output schema
      "fields": {
        "inputs": [
          { "key": "topic", "label": "Topic / Idea", "type": "text", "required": true },
          { "key": "target_audience", "label": "Target Audience", "type": "text", "required": false },
          { "key": "reference_urls", "label": "Reference URLs", "type": "url_list", "required": false }
        ],
        "outputs": []  // input steps just pass through
      },

      // AI config for this step
      "ai_config": {
        "enabled": false  // no AI on the input step
      },

      // Routing
      "on_complete": "ai_generate",  // explicit next step
      "on_error": null               // no error routing for input
    },
    {
      "id": "ai_generate",
      "name": "🤖 AI Generate",
      "type": "ai_process",
      "position": 1,

      "fields": {
        "inputs": [],  // inherits from previous step
        "outputs": [
          { "key": "post_content", "label": "Post Content", "type": "rich_text", "required": true },
          { "key": "hashtags", "label": "Hashtags", "type": "tag_list", "required": true },
          { "key": "post_image_url", "label": "Generated Image", "type": "image", "required": false }
        ]
      },

      "ai_config": {
        "enabled": true,
        "ai_first": true,  // auto-run AI when card enters this step
        "system_prompt": "You are a LinkedIn content specialist. Generate engaging, professional posts...",
        "skills": ["linkedin-writing", "hashtag-strategy"],
        "knowledge_bases": ["brand-voice-guide", "linkedin-best-practices"],
        "model_override": null,  // use board default
        "temperature": 0.8,
        "max_retries": 2,
        "timeout_seconds": 120
      },

      "triggers": {
        "on_enter": "auto",   // auto | manual | schedule | webhook
        "schedule": null,
        "webhook_config": null
      },

      "on_complete": "human_review",
      "on_error": "idea"  // send back to idea if generation fails
    },
    {
      "id": "human_review",
      "name": "👀 Review",
      "type": "human_review",
      "position": 2,

      "fields": {
        "inputs": [],
        "outputs": [
          { "key": "review_notes", "label": "Review Notes", "type": "text", "required": false },
          { "key": "approved", "label": "Approved", "type": "boolean", "required": true }
        ]
      },

      "ai_config": {
        "enabled": true,
        "ai_first": false,   // AI available but waits for user
        "system_prompt": "Help the user review and refine this LinkedIn post...",
        "skills": ["content-review"],
        "knowledge_bases": ["brand-voice-guide"]
      },

      "triggers": {
        "on_enter": "manual"
      },

      // Conditional routing — simple field→step mapping (UI = dropdown pairs)
      "routing_rules": [
        { "field": "approved", "value": true, "target": "publish" },
        { "field": "approved", "value": false, "target": "ai_generate" }
      ],
      "on_complete": "publish",  // default if no routing rule matches
      "on_error": null
    },
    {
      "id": "publish",
      "name": "📤 Publish",
      "type": "action",
      "position": 3,

      "fields": {
        "inputs": [],
        "outputs": [
          { "key": "linkedin_post_url", "label": "Published URL", "type": "url", "required": true },
          { "key": "published_at", "label": "Published At", "type": "datetime", "required": true }
        ]
      },

      "ai_config": {
        "enabled": true,
        "ai_first": true,
        "system_prompt": "Publish the approved post to LinkedIn using the linkedin tool...",
        "skills": [],
        "knowledge_bases": [],
        "required_tools": ["linkedin"]  // step-level tool requirement
      },

      "on_complete": "done",
      "on_error": "human_review"  // if publish fails, go back to review
    },
    {
      "id": "done",
      "name": "✅ Done",
      "type": "done",
      "position": 4,
      "ai_config": { "enabled": false },
      "fields": { "inputs": [], "outputs": [] }
    }
  ]
}
```

### 2.3 Step Types

| Type | Behavior | AI-First allowed? |
|------|----------|------------------|
| `input` | Entry point. User creates card, fills required fields. | No |
| `ai_process` | AI performs work. Generates output fields. | Yes |
| `human_review` | Human reviews/edits. Can approve/reject with conditional routing. | No (AI assists on demand) |
| `action` | Executes an external action (API call, integration). | Yes |
| `done` | Terminal state. Card archived. | No |

---

## 3. Current Architecture Analysis (Codebase Insights)

> This section documents the existing codebase state to ensure we build on top of existing patterns and avoid unnecessary rewrites.

### 3.1 Backend Architecture (NestJS)

**Module structure** at `backend/src/`:
- 20+ modules following pattern: `module.ts`, `controller.ts`, `service.ts`, `dto/`
- Controllers are account-scoped: `@Controller('accounts/:accountId/...')`
- Auth: JWT + Supabase. Service role bypasses RLS; access control enforced in service layer via `AccessControlHelper.verifyAccountAccess()`
- Two Supabase clients: `SupabaseService` (request-scoped, uses user token) and `SupabaseAdminService` (singleton, service role for cron jobs)

**Existing task data model** (`backend/supabase/migrations/`):
```
tasks table:
  id UUID, account_id UUID, category_id UUID, source_id UUID (nullable)
  external_id TEXT, title TEXT, status TEXT, priority TEXT
  completed BOOLEAN, notes TEXT, metadata JSONB
  external_url TEXT, due_date TIMESTAMPTZ
  completed_at, last_synced_at, created_at, updated_at

  Status CHECK: 'To-Do' | 'Today' | 'In Progress' | 'AI Running' | 'In Review' | 'Done' | 'Blocked'
  Priority CHECK: 'High' | 'Medium' | 'Low' | 'Urgent'
```

**Key services to extend** (not replace):
- `TasksService` (`backend/src/tasks/tasks.service.ts`): `findAll()`, `create()`, `update()` — must gain `board_instance_id` filter + `current_step_id` support
- `CategoriesService`: Pattern reference for CRUD service implementation
- `SyncService` + `OutboundSyncService`: Bidirectional sync via adapter pattern — board tasks with `source_id` must continue syncing

**Existing API endpoints** (tasks):
| Method | Path | Notes |
|--------|------|-------|
| GET | `/accounts/:accountId/tasks` | Filters: category_id, source_id, status, priority, completed |
| GET | `/accounts/:accountId/tasks/:id` | Includes relations: categories(*), sources(id, provider) |
| GET | `/accounts/:accountId/tasks/:id/content` | Fetches Notion page blocks |
| POST | `/accounts/:accountId/tasks` | CreateTaskDto |
| PATCH | `/accounts/:accountId/tasks/:id` | UpdateTaskDto |
| DELETE | `/accounts/:accountId/tasks/:id` | Deletes task |

**Sync architecture** (must remain compatible):
- Inbound: Cron every 5 min → BullMQ → `SyncService.syncSource()` → `NotionAdapter.fetchTasks()` → UPSERT by (source_id + external_id)
- Outbound: `TasksService.update()` → `OutboundSyncService.syncTaskToSource()` if source_id exists
- Adapter pattern: `SourceAdapter` interface, `AdapterRegistry.getAdapter('notion')`, Notion v5 SDK (`dataSources.query()`)

### 3.2 Frontend Architecture (Next.js 15)

**Current Kanban implementation**:
- `frontend/src/components/tasks/kanban-board.tsx` (102 lines) — DndContext + PointerSensor + closestCorners
- `frontend/src/components/tasks/kanban-column.tsx` (86 lines) — useDroppable + SortableContext + verticalListSortingStrategy
- `frontend/src/components/tasks/task-card.tsx` (169 lines) — useSortable with CSS.Transform
- **Hardcoded**: `KANBAN_COLUMNS = ['To-Do', 'Today', 'In Progress', 'AI Running', 'In Review', 'Done']` in `frontend/src/types/task.ts:45`

**State management**:
- Zustand: `useTaskFilters` (view mode, category/priority/source filters), `useTaskStore` (selectedTaskId), `usePomodoroStore`
- React Query: `useTasks()` (queryKey: ['tasks'], staleTime: 30s, refetchInterval: 60s), `useMoveTask()` with optimistic updates
- Server actions: `frontend/src/app/dashboard/tasks/actions.ts` — pattern for all API calls

**Sidebar** (`frontend/src/components/app-sidebar.tsx`):
- Shadcn `Sidebar` with `collapsible="icon"`
- `NavMain` component renders static nav items from `data.navMain` array
- `NavProjects` component renders dynamic project list with context menus — **exact pattern to reuse for NavBoards**
- Layout: `TeamSwitcher` → `NavMain` → `NavProjects` → `OnboardingChecklist` → `NavUser`

**Task detail panel** (`frontend/src/components/tasks/task-detail-panel.tsx`, 609 lines):
- Status dropdown currently uses hardcoded `KANBAN_COLUMNS` — must accept board steps dynamically
- Editable title, category dropdown, priority badge, markdown notes, comments (from Notion), AI chat

### 3.3 Reusable Patterns

| Pattern | Location | Reuse For |
|---------|----------|-----------|
| `NavProjects` | `frontend/src/components/nav-projects.tsx` | **NavBoards** — sidebar CRUD list with context menu, delete confirmation, dynamic items |
| `DataViewLayout` | `frontend/src/components/data-view-layout.tsx` | **Board management dashboard** — grid/list toggle, filters, actions, pagination |
| `ViewToggle` | `frontend/src/components/view-toggle.tsx` | Grid/list toggle on boards page |
| `CreateProjectDialog` | `frontend/src/app/dashboard/projects/` | **CreateBoardDialog** — form dialog pattern |
| `TeamSwitcher` | `frontend/src/components/team-switcher.tsx` | Dropdown selector pattern |
| `KanbanBoard` + `KanbanColumn` | `frontend/src/components/tasks/` | DnD patterns for **BoardKanbanView** |
| Server actions | `frontend/src/app/dashboard/tasks/actions.ts` | Board API server actions |
| React Query hooks | `frontend/src/hooks/use-tasks.ts` | Board query hooks with optimistic updates |
| Dashboard layout | `frontend/src/app/dashboard/layout.tsx` | Server-side data fetching for sidebar props |

### 3.4 Critical Flexbox Scroll Pattern

The codebase uses a specific pattern for scrollable areas within flex layouts that MUST be followed:
```
flex-1 + min-h-0 on all flex parents in the chain
h-screen (not min-h-screen) for viewport-locked layouts
overflow-y: auto on the scrollable child
```

---

## 4. Data Model

### 4.1 New Tables

```sql
-- ============================================================
-- BOARD TEMPLATES
-- ============================================================
CREATE TABLE board_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),       -- NULL = marketplace/system template

  -- Identity
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'layout-grid',
  color TEXT DEFAULT '#6366f1',
  tags TEXT[] DEFAULT '{}',

  -- The manifest JSON (source of truth for structure)
  manifest JSONB NOT NULL,
  manifest_version TEXT NOT NULL DEFAULT '1.0',

  -- Versioning
  version TEXT NOT NULL DEFAULT '1.0.0',
  changelog TEXT,

  -- Publishing
  is_published BOOLEAN DEFAULT FALSE,            -- visible in marketplace
  is_system BOOLEAN DEFAULT FALSE,               -- shipped with TaskClaw
  published_at TIMESTAMPTZ,
  author_name TEXT,
  author_email TEXT,

  -- Stats
  install_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, slug)
);

-- ============================================================
-- BOARD INSTANCES (user's active boards)
-- ============================================================
CREATE TABLE board_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  template_id UUID REFERENCES board_templates(id),  -- NULL if created from scratch

  -- Identity (user can rename)
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'layout-grid',
  color TEXT DEFAULT '#6366f1',
  tags TEXT[] DEFAULT '{}',

  -- User customization
  is_favorite BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,

  -- Instance-level settings (merged over template defaults)
  settings_override JSONB DEFAULT '{}',

  -- Snapshot of manifest at install time (for diff/upgrade detection)
  installed_manifest JSONB,
  installed_version TEXT,
  latest_available_version TEXT,    -- updated when marketplace is checked

  -- Status
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_board_instances_account ON board_instances(account_id) WHERE NOT is_archived;
CREATE INDEX idx_board_instances_favorite ON board_instances(account_id, is_favorite) WHERE NOT is_archived;

-- ============================================================
-- BOARD STEPS (instantiated from manifest, per board instance)
-- ============================================================
CREATE TABLE board_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_instance_id UUID NOT NULL REFERENCES board_instances(id) ON DELETE CASCADE,

  -- From manifest
  step_key TEXT NOT NULL,             -- e.g. "ai_generate" (matches manifest step.id)
  name TEXT NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('input','ai_process','human_review','action','done')),
  position INTEGER NOT NULL,
  color TEXT,

  -- AI Configuration
  ai_enabled BOOLEAN DEFAULT FALSE,
  ai_first BOOLEAN DEFAULT FALSE,
  system_prompt TEXT,
  model_override TEXT,
  temperature FLOAT,
  max_retries INTEGER DEFAULT 2,
  timeout_seconds INTEGER DEFAULT 120,

  -- Linked resources (resolved at runtime from manifest skill/knowledge slugs)
  skill_ids UUID[] DEFAULT '{}',
  knowledge_base_ids UUID[] DEFAULT '{}',
  required_tool_ids TEXT[] DEFAULT '{}',

  -- Field schemas (from manifest, can be customized)
  input_fields JSONB DEFAULT '[]',
  output_fields JSONB DEFAULT '[]',

  -- Triggers
  trigger_type TEXT DEFAULT 'manual' CHECK (trigger_type IN ('auto','manual','schedule','webhook')),
  trigger_config JSONB DEFAULT '{}',

  -- Routing
  on_complete_step_key TEXT,          -- NULL = next by position
  on_error_step_key TEXT,             -- NULL = stay in current step
  routing_rules JSONB DEFAULT '[]',   -- [{field, value, target}] dropdown pairs

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(board_instance_id, step_key)
);

-- ============================================================
-- EXTEND TASKS TABLE (add board context)
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN board_instance_id UUID REFERENCES board_instances(id) ON DELETE SET NULL,
  ADD COLUMN current_step_id UUID REFERENCES board_steps(id) ON DELETE SET NULL,
  ADD COLUMN card_data JSONB DEFAULT '{}',         -- structured field values per step
  ADD COLUMN step_history JSONB DEFAULT '[]';       -- audit trail of step transitions

-- Remove hardcoded status constraint (board steps have arbitrary names)
-- Legacy tasks (board_instance_id IS NULL) continue using existing status values
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Indexes for board task queries
CREATE INDEX idx_tasks_board ON tasks(board_instance_id) WHERE board_instance_id IS NOT NULL;
CREATE INDEX idx_tasks_step ON tasks(current_step_id) WHERE current_step_id IS NOT NULL;

-- ============================================================
-- CARD EXECUTIONS (AI job log per step transition — future phase)
-- ============================================================
CREATE TABLE card_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  board_step_id UUID NOT NULL REFERENCES board_steps(id),

  -- Execution details
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- AI interaction
  system_prompt_used TEXT,
  ai_request JSONB,                -- sanitized request payload
  ai_response JSONB,               -- sanitized response
  tokens_used JSONB,               -- { prompt: N, completion: N }

  -- Output
  output_data JSONB,               -- structured output fields produced
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Routing decision
  routed_to_step_key TEXT,
  routing_reason TEXT,             -- "on_complete" | "on_error" | "routing_rule: approved=true"

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_card_executions_card ON card_executions(card_id);
```

### 4.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tasks → Boards** | Direct FK (`board_instance_id` on tasks) | A task belongs to exactly one board. Simpler than junction table. |
| **Legacy coexistence** | `board_instance_id = NULL` = legacy task at `/dashboard/tasks` | Zero migration risk. Existing workflow unchanged. |
| **Status dual-write** | Keep `status` text synced with step name via service layer | Backward-compatible queries. Existing filters work for board tasks too. |
| **Status CHECK removed** | Free-form text instead of enum | Board steps have arbitrary names. Service layer validates for legacy tasks. |
| **New components** | `board-kanban-view.tsx` separate from `kanban-board.tsx` | Avoids breaking working legacy view. Unify later when stable. |
| **Step cascade** | `ON DELETE CASCADE` from board_instances → steps; `ON DELETE SET NULL` from board → tasks | Deleting a board cleans steps but preserves tasks (they become boardless). |
| **Card data accumulation** | Append per step — each step writes to `card_data[step_key]` | Allows any step to reference outputs from any prior step. |

### 4.3 Entity Relationships

```
board_templates (marketplace/system)
    │
    ├──▶ board_instances (user's active boards)
    │        │
    │        ├──▶ board_steps (pipeline columns)
    │        │        │
    │        │        └──▶ card_executions (AI job log)
    │        │
    │        ├──▶ tasks/cards (work items)
    │        │        │
    │        │        └──▶ card_executions
    │        │
    │        └── settings_override JSONB
    │
    └── manifest JSON (portable, import/export)

accounts (1) ──── (N) board_instances (1) ──── (N) board_steps
                        │                              │
                        │ board_instance_id (nullable)  │ current_step_id (nullable)
                        └──────── tasks ───────────────┘
                              │
accounts (1) ──── (N) categories ──── (N) tasks
accounts (1) ──── (N) sources ──── (N) tasks
```

---

## 5. API Design

### 5.1 New Endpoints — Board Instances

Base: `/accounts/:accountId/boards`

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/` | List boards | `?archived=false&favorite=true` |
| GET | `/:boardId` | Get board with steps + task counts per step | — |
| POST | `/` | Create board (with inline steps array) | — |
| PATCH | `/:boardId` | Update board metadata | — |
| DELETE | `/:boardId` | Delete board (tasks become boardless) | — |
| POST | `/:boardId/duplicate` | Deep copy board (steps only, no tasks) | — |
| GET | `/:boardId/export` | Export as JSON manifest | — |

### 5.2 New Endpoints — Board Steps

Base: `/accounts/:accountId/boards/:boardId/steps`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List steps ordered by position |
| POST | `/` | Create step |
| PATCH | `/:stepId` | Update step (name, position, AI config) |
| DELETE | `/:stepId` | Delete step (tasks in step move to adjacent) |
| POST | `/reorder` | Bulk reorder `{ step_ids: string[] }` |

### 5.3 New Endpoints — Board Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/board-templates` | List published/system templates (no account scope) |
| GET | `/board-templates/:id` | Get template details + manifest |
| POST | `/accounts/:accountId/boards/install` | Install template → create board + steps |

### 5.4 Extended Task Endpoints

Existing endpoints at `/accounts/:accountId/tasks` gain:

| Change | Detail |
|--------|--------|
| GET `/tasks?board_id=xxx` | Filter tasks by board instance |
| POST `/tasks` body | Accepts optional `board_instance_id` + `current_step_id` |
| PATCH `/tasks/:id` body | Accepts `current_step_id` (move between steps; auto-syncs `status`) |

**Service behavior**: When `current_step_id` changes, `TasksService.update()` auto-sets `status = step.name` for backward compatibility.

### 5.5 Backend Module Structure

New module at `backend/src/boards/`:
```
boards/
  boards.module.ts          ← imports SupabaseModule, CommonModule
  boards.controller.ts      ← CRUD for board instances + steps
  boards.service.ts         ← board CRUD logic (follows CategoriesService pattern)
  board-templates.controller.ts
  board-templates.service.ts
  board-steps.service.ts
  dto/
    create-board.dto.ts
    update-board.dto.ts
    create-board-step.dto.ts
    update-board-step.dto.ts
    install-template.dto.ts
```

Register in `backend/src/app.module.ts` after `TasksModule`.

---

## 6. Frontend Architecture

### 6.1 New Routes

| Route | Purpose |
|-------|---------|
| `/dashboard/boards` | Board management dashboard (grid/list of all boards) |
| `/dashboard/boards/[boardId]` | Board-specific Kanban view |
| `/dashboard/boards/[boardId]/settings` | Board settings (steps, AI config) |
| `/dashboard/boards/marketplace` | Template marketplace (deferred) |

### 6.2 New Components

| Component | Location | Based On |
|-----------|----------|----------|
| `NavBoards` | `frontend/src/components/nav-boards.tsx` | `NavProjects` pattern |
| `BoardKanbanView` | `frontend/src/components/boards/board-kanban-view.tsx` | `KanbanBoard` pattern |
| `BoardKanbanColumn` | `frontend/src/components/boards/board-kanban-column.tsx` | `KanbanColumn` pattern |
| `BoardHeader` | `frontend/src/components/boards/board-header.tsx` | New (breadcrumb + actions) |
| `BoardCard` | `frontend/src/components/boards/board-card.tsx` | New (from mockup) |
| `BoardTableRow` | `frontend/src/components/boards/board-table-row.tsx` | New |
| `CreateBoardDialog` | `frontend/src/components/boards/create-board-dialog.tsx` | `CreateProjectDialog` pattern |
| `BoardSettingsForm` | `frontend/src/components/boards/board-settings-form.tsx` | New |
| `StepEditor` | `frontend/src/components/boards/step-editor.tsx` | New (inline reorder + edit) |

### 6.3 New Types (`frontend/src/types/board.ts`)

```typescript
interface Board {
  id: string; account_id: string; template_id: string | null
  name: string; description: string | null; icon: string; color: string
  tags: string[]; is_favorite: boolean; display_order: number; is_archived: boolean
  settings_override: Record<string, any>
  installed_version: string | null; latest_available_version: string | null
  steps?: BoardStep[]; task_count?: number
  created_at: string; updated_at: string
}

interface BoardStep {
  id: string; board_instance_id: string; step_key: string
  name: string; step_type: 'input' | 'ai_process' | 'human_review' | 'action' | 'done'
  position: number; color: string | null
  ai_enabled: boolean; ai_first: boolean
  created_at: string; updated_at: string
}

interface BoardTemplate {
  id: string; name: string; slug: string; description: string | null
  icon: string; color: string; tags: string[]; version: string
  is_system: boolean; is_published: boolean; author_name: string | null
  install_count: number; manifest: BoardManifest
}

interface BoardManifest {
  manifest_version: string; id: string; name: string; version: string
  steps: ManifestStep[]; settings?: Record<string, any>
}
```

### 6.4 New Hooks & State

| Hook/Store | File | Purpose |
|-----------|------|---------|
| `useBoards(filters?)` | `frontend/src/hooks/use-boards.ts` | React Query — list boards |
| `useBoard(id)` | `frontend/src/hooks/use-boards.ts` | React Query — single board + steps |
| `useBoardTasks(id)` | `frontend/src/hooks/use-boards.ts` | React Query — tasks filtered by board |
| `useCreateBoard()` | `frontend/src/hooks/use-boards.ts` | Mutation — create board |
| `useUpdateBoard()` | `frontend/src/hooks/use-boards.ts` | Mutation — update board |
| `useDeleteBoard()` | `frontend/src/hooks/use-boards.ts` | Mutation — delete board |
| `useMoveTaskToStep()` | `frontend/src/hooks/use-boards.ts` | Mutation — optimistic step move |
| `useBoardStore` | `frontend/src/hooks/use-board-store.ts` | Zustand (persisted) — activeBoardId |

### 6.5 Sidebar Refactoring

**Current layout**:
```
TeamSwitcher
NavMain (Task Board, AI Chat, Knowledge Base, Categories, Skills, Integrations, Settings)
NavProjects (dynamic)
```

**New layout**:
```
TeamSwitcher
NavBoards (BOARDS section — favorites, recent, "See all", "+" create)
── separator ──
NavMain (AI Chat, Knowledge Base, Categories, Skills, Integrations, Settings)  ← "Task Board" removed
NavProjects (dynamic)
```

**NavBoards behavior** (from mockup):
1. Favorited boards shown first (star icon), sorted by `display_order`
2. Recent unfavorited boards below, sorted by `updated_at`
3. Max ~5 visible; "See all (N)" link when more exist
4. Context menu: Favorite/Unfavorite, Rename, Duplicate, Export JSON, Archive
5. "+" button creates new board
6. Active board highlighted based on current URL

**Files to modify**:
- `frontend/src/components/app-sidebar.tsx` — add `NavBoards`, remove "Task Board" from navMain
- `frontend/src/app/dashboard/layout.tsx` — fetch boards server-side, pass to sidebar

### 6.6 Task Detail Panel Changes

`frontend/src/components/tasks/task-detail-panel.tsx` gains optional `boardSteps?: BoardStep[]` prop:
- When present: status dropdown shows board step names + colors
- When absent: falls back to existing `KANBAN_COLUMNS`
- Status change on board task updates both `current_step_id` and `status`

---

## 7. Execution Engine (Future Phase)

> This section documents the full execution engine design. Implementation is deferred to after core boards are stable.

### 7.1 Card State Machine

```
                    ┌─────────────┐
                    │   Created   │  (card enters input step)
                    └──────┬──────┘
                           │ user fills required fields
                           ▼
                    ┌─────────────┐
              ┌─────│    Idle     │◀──── (waiting in any step)
              │     └──────┬──────┘
              │            │ trigger fires (auto/manual/schedule/webhook)
              │            ▼
              │     ┌─────────────┐
              │     │   Queued    │  → BullMQ job created
              │     └──────┬──────┘
              │            │ worker picks up
              │            ▼
              │     ┌──────────────┐
              │     │  Processing  │  → AI executing / action running
              │     └──────┬───────┘
              │            │
              │     ┌──────┴──────┐
              │     ▼             ▼
              │ ┌──────────┐ ┌─────────┐
              │ │Completed │ │  Error   │
              │ └────┬─────┘ └────┬─────┘
              │      │            │ retry or route to on_error
              │      │ evaluate   │
              │      │ routing    │
              │      ▼            │
              │ ┌──────────┐     │
              │ │  Route    │     │
              │ │ Decision  │     │
              │ └────┬──────┘     │
              │      │            │
              │      ▼            ▼
              └──── Move card to next step (back to Idle)
```

### 7.2 Step Prompt Assembly

Replaces monolithic `buildSystemPrompt()` with per-step version:
1. Step-specific system prompt
2. Skills (loaded from DB by `skill_ids`)
3. Knowledge bases (loaded by `knowledge_base_ids`)
4. Card context — accumulated `card_data` from previous steps
5. Expected output schema (from `output_fields`)
6. Available tools (from `required_tool_ids`)

---

## 8. Backward Compatibility

### What Stays Unchanged
- `/dashboard/tasks` route and all components (TasksDashboard, KanbanBoard, CategoryList)
- Legacy tasks with `board_instance_id = NULL` use hardcoded `KANBAN_COLUMNS`
- All existing API endpoints and response shapes
- Sync system (Notion/ClickUp) — synced tasks remain boardless unless explicitly added
- Pomodoro, AI Chat, Knowledge Base, Categories, Skills features

### What Changes
- Sidebar: "Task Board" nav item replaced by "BOARDS" section
- Tasks table: 4 new nullable columns (no existing data affected)
- Status CHECK constraint removed (existing values still valid, service validates for legacy)

### Migration Path (Future)
Users can optionally "Convert to Board" from `/dashboard/tasks`, which creates a board with the standard 6 columns and moves legacy tasks into it. Not in initial scope.

---

## 9. Security & Access Control

- Board instances scoped to accounts (same as tasks, categories, sources)
- RLS policies: users access only boards in their accounts; system templates (account_id = NULL) readable by all
- Service role bypasses RLS; access enforced in service layer via `AccessControlHelper`
- Board steps inherit access from their board instance (RLS via subquery)

---

## 10. Mockup References

| Screen | File | Key Features |
|--------|------|-------------|
| Sidebar + Board Kanban | `mockup-multi-board/refactored_sidebar_&_boards_nav/` | BOARDS section, favorites, recent, context menu, board-specific columns |
| Board Management Dashboard | `mockup-multi-board/board_management_dashboard/` | Grid/list view, search, filters (All/Active/Archived), tags, board cards with stats |
| Template Marketplace | `mockup-multi-board/board_template_marketplace/` | Featured hero, category filters, template cards, install flow (DEFERRED) |
