# TaskClaw Organizational Layer — PRD
## Divisions, Inter-Board Connections, Heartbeat & Scheduler

---

## 1. Executive Summary

TaskClaw today is a collection of independent boards. Each board is a powerful AI-driven pipeline, but boards don't talk to each other, there's no organizational hierarchy, and AI only runs when a human triggers it. This PRD introduces three interconnected systems that transform TaskClaw from a task management tool into an **autonomous AI company platform with full human transparency**.

### Three systems, one vision:

1. **Divisions & The Pilot** — An organizational layer above boards. Boards are grouped into Divisions (marketing, engineering, operations). Each Division has an AI manager. A top-level AI agent — the **Pilot** — oversees all Divisions and delegates work across the company.

2. **Board Connections** — Boards can be wired together: the output of one board feeds into the input of another. Visually represented as a flow graph. This turns isolated pipelines into a connected organization.

3. **Heartbeat & Scheduler** — A backbone-agnostic orchestration layer that proactively wakes AI agents on schedules, triggers, and events. Works with any backbone (OpenClaw, Claude Code, Codex) — TaskClaw owns the scheduler, not the backbone.

### Why not copy Paperclip's model?

Paperclip models everything as agents in a tree with `reportsTo` pointers. The org chart IS the product. TaskClaw's core insight is different: **a Board is a person/role/activity**. The Kanban view IS the transparency layer. We don't need to reinvent org charts — we need to connect our boards into a living organization where the human can SEE everything happening at every level.

---

## 2. Naming & Terminology

### Why new terms?

Paperclip uses "company", "agents", "teams", "board member". We intentionally diverge to establish TaskClaw's identity and because our metaphor is different — we think in boards and flows, not org charts and agents.

| Paperclip Term | TaskClaw Term | Rationale |
|----------------|---------------|-----------|
| Company | **Organization** | Neutral, familiar. The top-level container. |
| Team / Department | **Division** | Clear grouping concept. Not overloaded like "team" (which we use for user membership). |
| CEO Agent | **Pilot** | The one who sees the whole picture and steers. Avoids corporate jargon. Implies oversight + direction, not just authority. |
| Board Member (human) | **Founder** | The human operator. Solo founder running the AI company. Implies ownership + vision. |
| Agent | **Board** (unchanged) | A board already IS an agent in TaskClaw's model. Each board = one role/activity. |
| Heartbeat | **Pulse** | TaskClaw's backbone-agnostic wake-up system. Distinct from OpenClaw's native heartbeat. |
| Routine | **Routine** | Same term — it's clear and universal. |

### Full Terminology Table

| Concept | Definition |
|---------|-----------|
| **Organization** | Top-level container. One per TaskClaw account. Has one Pilot and zero or more Divisions. |
| **Division** | A group of related boards under a shared AI manager. Examples: "Marketing", "Engineering", "Operations". Has its own AI agent (the Division Lead), knowledge base, and dashboard. |
| **Division Lead** | The AI agent managing a Division. Sees all boards within the Division, can create tasks across them, delegates, and reports status upward to the Pilot. Powered by a category (agent) with skills. |
| **Pilot** | The top-level AI agent overseeing the entire Organization. Receives goals from the Founder, delegates to Division Leads, monitors progress, and escalates. |
| **Founder** | The human operator. Sets goals, approves strategic decisions, reviews dashboards, and can intervene at any level. |
| **Board Connection** | A directional link between two boards: the output of Board A's step feeds into Board B's input step. |
| **Pulse** | TaskClaw's scheduled wake-up system. Triggers AI processing on a board/step at a configured interval. Backbone-agnostic. |
| **Routine** | A recurring workflow: a Pulse-triggered sequence that runs on a schedule, webhook, or event. |

---

## 3. Current Architecture Analysis

### 3.1 What Exists Today

| Component | Status | Location |
|-----------|--------|----------|
| Board instances with multi-step pipelines | ✅ Exists | `board_instances`, `board_steps` tables |
| Full AI pipeline routing (on_success/on_error) | ✅ Exists | `conversations.service.ts:handlePostAiRouting` |
| Trigger types on steps (on_entry, manual, schedule, webhook) | ⚠️ Schema exists, only `on_entry` + `manual` implemented | `board_steps.trigger_type` |
| Schedule/cron fields on steps | ⚠️ DTO fields defined, not implemented | `UpdateBoardStepDto.schedule_cron` |
| BullMQ + Redis infrastructure | ✅ Exists | `sync/sync-queue.module.ts` |
| @nestjs/schedule for cron | ✅ Exists | Used by sync service |
| Backbone connections (multi-backbone) | ✅ Designed | `prd-multi-backbone.md` |
| Board grouping / parent concept | ❌ Missing | — |
| Inter-board routing | ❌ Missing | — |
| Organizational AI agent hierarchy | ❌ Missing | — |
| Scheduled AI processing | ❌ Missing | — |
| Flow graph visualization | ❌ Missing | No ReactFlow/d3 dependency |

### 3.2 Key Files That Will Change

| File | Change |
|------|--------|
| `board_instances` table | Add `division_id` FK |
| `board_steps` table | Add `route_to_board_id`, `route_to_step_key` for inter-board routing |
| `conversations.service.ts` | `handlePostAiRouting` gains cross-board routing + Pulse triggering |
| `tasks.service.ts` | Cross-board task creation (task moves from Board A to Board B) |
| `nav-boards.tsx` | Grouped by Division in sidebar |
| `app-sidebar.tsx` | Division collapsible groups + Pilot entry |
| `frontend/package.json` | Add `@xyflow/react` (ReactFlow v12) for flow visualization |

---

## 4. Data Model

### 4.1 New Tables

```sql
-- ============================================================
-- ORGANIZATIONS (Top-Level Container)
-- ============================================================
-- One per account. Created automatically on first setup.
-- Houses the Pilot agent config and org-wide settings.
-- ============================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL DEFAULT 'My Organization',
  description TEXT,
  icon TEXT DEFAULT 'building-2',
  color TEXT DEFAULT '#6366f1',

  -- Pilot configuration
  pilot_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  pilot_backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL,
  pilot_enabled BOOLEAN DEFAULT FALSE,          -- Pilot doesn't run until explicitly enabled

  -- Settings
  require_approval_for_new_boards BOOLEAN DEFAULT FALSE,  -- Pilot proposes, Founder approves
  require_approval_for_cross_division BOOLEAN DEFAULT TRUE,
  max_pulse_depth INTEGER DEFAULT 10,           -- Max cascading auto-triggers

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id)                            -- One organization per account
);

-- ============================================================
-- DIVISIONS (Grouping Layer Above Boards)
-- ============================================================
-- A Division groups related boards and has its own AI lead.
-- Equivalent to a department/team in a traditional company.
-- ============================================================
CREATE TABLE divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,                           -- 'Marketing', 'Engineering', 'Operations'
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder',
  color TEXT DEFAULT '#6366f1',

  -- Division Lead (AI manager for this division)
  lead_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  lead_backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL,
  lead_enabled BOOLEAN DEFAULT FALSE,

  -- Display
  display_order INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_divisions_org ON divisions(organization_id);
CREATE INDEX idx_divisions_account ON divisions(account_id);

-- ============================================================
-- BOARD CONNECTIONS (Inter-Board Wiring)
-- ============================================================
-- Directional link: source board step → target board step.
-- When a task completes the source step, it can be routed
-- to the target board's step (creating a new task there).
-- ============================================================
CREATE TABLE board_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Source (where the task comes from)
  source_board_id UUID NOT NULL REFERENCES board_instances(id) ON DELETE CASCADE,
  source_step_key TEXT NOT NULL,                -- The step that triggers the connection

  -- Target (where the task goes)
  target_board_id UUID NOT NULL REFERENCES board_instances(id) ON DELETE CASCADE,
  target_step_key TEXT NOT NULL,                -- The step the new task enters

  -- Behavior
  connection_type TEXT NOT NULL DEFAULT 'create_task'
    CHECK (connection_type IN (
      'create_task',        -- Create a new task in target board (default)
      'move_task',          -- Move the same task to target board (cross-board transfer)
      'clone_task'          -- Clone task data to target board (keep original in source)
    )),

  -- Data mapping: which fields from source card_data map to target input fields
  -- Example: { "post_content": "review_content", "hashtags": "tags" }
  field_mapping JSONB DEFAULT '{}',

  -- Conditions: only fire if these card_data fields match
  -- Example: { "approved": true }
  conditions JSONB DEFAULT '{}',

  -- Settings
  is_active BOOLEAN DEFAULT TRUE,
  auto_trigger_ai BOOLEAN DEFAULT TRUE,        -- Auto-trigger AI on target step after routing

  -- Display (for flow graph visualization)
  label TEXT,                                   -- Connection label shown on edge
  source_handle_position TEXT DEFAULT 'right',  -- ReactFlow handle position
  target_handle_position TEXT DEFAULT 'left',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate connections between same steps
  UNIQUE(source_board_id, source_step_key, target_board_id, target_step_key)
);

CREATE INDEX idx_board_connections_source ON board_connections(source_board_id);
CREATE INDEX idx_board_connections_target ON board_connections(target_board_id);

-- ============================================================
-- GOALS (Organization-Level Objectives)
-- ============================================================
-- High-level goals set by the Founder.
-- The Pilot breaks these into Division-level tasks.
-- ============================================================
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Identity
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),

  -- Ownership
  assigned_division_id UUID REFERENCES divisions(id) ON DELETE SET NULL,  -- NULL = Pilot handles
  created_by_user_id UUID,                     -- Founder who created it
  created_by_agent TEXT,                        -- 'pilot', 'division_lead:{division_id}'

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  progress_pct INTEGER DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),

  -- Hierarchy
  parent_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,

  -- Linked tasks (tasks created to fulfill this goal)
  -- Tracked via tasks.goal_id FK (see ALTER TABLE below)

  -- Metadata
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_org ON goals(organization_id);
CREATE INDEX idx_goals_division ON goals(assigned_division_id);

-- ============================================================
-- PULSES (Heartbeat / Scheduled Wake-Ups)
-- ============================================================
-- Backbone-agnostic scheduler entries.
-- Each Pulse defines WHEN and WHERE AI should be triggered.
-- ============================================================
CREATE TABLE pulses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- What to pulse
  target_type TEXT NOT NULL CHECK (target_type IN ('board', 'step', 'division', 'pilot')),
  target_board_id UUID REFERENCES board_instances(id) ON DELETE CASCADE,
  target_step_key TEXT,                         -- For step-level pulses
  target_division_id UUID REFERENCES divisions(id) ON DELETE CASCADE,

  -- Schedule
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('interval', 'cron', 'webhook', 'event')),
  interval_seconds INTEGER,                     -- For 'interval': wake every N seconds
  cron_expression TEXT,                         -- For 'cron': standard 5-field cron
  cron_timezone TEXT DEFAULT 'UTC',
  webhook_public_id UUID DEFAULT gen_random_uuid(),  -- For 'webhook': public trigger URL
  event_type TEXT,                              -- For 'event': 'task.completed', 'goal.created', etc.
  event_filter JSONB DEFAULT '{}',              -- For 'event': filter conditions

  -- Execution
  is_enabled BOOLEAN DEFAULT TRUE,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed', 'skipped', 'running')),
  consecutive_failures INTEGER DEFAULT 0,
  max_consecutive_failures INTEGER DEFAULT 3,   -- Auto-pause after N failures

  -- Concurrency
  concurrency_policy TEXT DEFAULT 'skip_if_running'
    CHECK (concurrency_policy IN ('skip_if_running', 'queue', 'force')),

  -- Metadata
  name TEXT,                                    -- Human-readable label
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pulses_next_run ON pulses(next_run_at) WHERE is_enabled = TRUE;
CREATE INDEX idx_pulses_account ON pulses(account_id);
CREATE INDEX idx_pulses_target_board ON pulses(target_board_id);
CREATE INDEX idx_pulses_webhook ON pulses(webhook_public_id);

-- ============================================================
-- PULSE RUNS (Execution History)
-- ============================================================
-- One row per Pulse execution. Tracks what happened.
-- ============================================================
CREATE TABLE pulse_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id UUID NOT NULL REFERENCES pulses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Execution
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped', 'cancelled')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Result
  tasks_created INTEGER DEFAULT 0,
  tasks_moved INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  tokens_used BIGINT DEFAULT 0,
  error_message TEXT,

  -- Context
  trigger_kind TEXT NOT NULL,                   -- What triggered this run
  trigger_payload JSONB DEFAULT '{}',           -- Webhook body, event data, etc.
  backbone_connection_id UUID REFERENCES backbone_connections(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pulse_runs_pulse ON pulse_runs(pulse_id);
CREATE INDEX idx_pulse_runs_status ON pulse_runs(status) WHERE status = 'running';

-- ============================================================
-- ROUTINES (Recurring Workflows)
-- ============================================================
-- A Routine is a named, reusable workflow triggered by a Pulse.
-- Example: "Nightly Security Audit", "Weekly Content Calendar"
-- ============================================================
CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'repeat',

  -- What to do
  target_board_id UUID NOT NULL REFERENCES board_instances(id) ON DELETE CASCADE,
  target_step_key TEXT NOT NULL,                -- Which step to create the task in
  task_template JSONB NOT NULL DEFAULT '{}',    -- Template for the auto-created task
  -- Example: { "title": "Weekly Security Audit — {{date}}", "priority": "high", "card_data": { ... } }

  -- Schedule (linked to a Pulse)
  pulse_id UUID REFERENCES pulses(id) ON DELETE SET NULL,

  -- Settings
  is_active BOOLEAN DEFAULT TRUE,
  auto_trigger_ai BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routines_board ON routines(target_board_id);
```

### 4.2 Modified Tables

```sql
-- ============================================================
-- BOARD INSTANCES — add Division FK
-- ============================================================
ALTER TABLE board_instances
  ADD COLUMN division_id UUID REFERENCES divisions(id) ON DELETE SET NULL;

-- NULL = unassigned board (standalone, not in any division)
COMMENT ON COLUMN board_instances.division_id IS
  'Division this board belongs to. NULL = standalone board.';

-- Display position within a division
ALTER TABLE board_instances
  ADD COLUMN division_display_order INTEGER DEFAULT 0;

-- ============================================================
-- BOARD STEPS — add inter-board routing
-- ============================================================
-- These columns enable a step to route tasks to a DIFFERENT board.
-- Used by board_connections but also stored here for fast lookup.
ALTER TABLE board_steps
  ADD COLUMN route_to_board_id UUID REFERENCES board_instances(id) ON DELETE SET NULL,
  ADD COLUMN route_to_step_key TEXT;

COMMENT ON COLUMN board_steps.route_to_board_id IS
  'Cross-board routing: send task to this board when step completes. NULL = stay in current board.';

-- ============================================================
-- TASKS — add goal tracking + cross-board lineage
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  ADD COLUMN source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN source_board_id UUID REFERENCES board_instances(id) ON DELETE SET NULL;

COMMENT ON COLUMN tasks.goal_id IS 'The organizational goal this task contributes to.';
COMMENT ON COLUMN tasks.source_task_id IS 'If this task was created by a board connection, the originating task.';
COMMENT ON COLUMN tasks.source_board_id IS 'The board that originated this task via board connection.';
```

---

## 5. System Design: Divisions & The Pilot

### 5.1 Architecture

```
┌──────────────────────────────────────────────────────┐
│                    ORGANIZATION                       │
│                                                       │
│  ┌─────────────────┐                                 │
│  │     PILOT        │  ← Top-level AI agent          │
│  │  (sees everything)│  ← Receives goals from Founder│
│  └────────┬─────────┘  ← Delegates to Division Leads │
│           │                                           │
│  ┌────────┼──────────────────────┐                   │
│  │        │                      │                   │
│  ▼        ▼                      ▼                   │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│ │ Marketing    │ │ Engineering  │ │ Operations   │  │
│ │ Division     │ │ Division     │ │ Division     │  │
│ │              │ │              │ │              │  │
│ │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │  │
│ │ │Content   │ │ │ │Backend   │ │ │ │Support   │ │  │
│ │ │Board     │ │ │ │Board     │ │ │ │Board     │ │  │
│ │ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │  │
│ │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │  │
│ │ │Social    │ │ │ │Frontend  │ │ │ │Billing   │ │  │
│ │ │Board     │ │ │ │Board     │ │ │ │Board     │ │  │
│ │ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │  │
│ └──────────────┘ └──────────────┘ └──────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 5.2 Division Lead Behavior

A Division Lead is a **category (agent)** assigned to a Division. It has skills, knowledge docs, and a preferred backbone — identical to how board-level agents work today. The difference is its **scope**: it can see and act across all boards within its Division.

**Division Lead capabilities:**
- See all tasks across boards in the Division
- Create tasks in any board within the Division
- Move tasks between boards within the Division
- Comment on tasks (triggering board-level AI if needed)
- Report status to the Pilot (via inter-division communication)
- Escalate blocked tasks to the Pilot

**Division Lead is NOT a standalone process.** It runs within TaskClaw's Pulse system — it wakes on schedule, reviews its Division's state, takes actions via the TaskClaw API, and goes back to sleep.

### 5.3 Pilot Behavior

The Pilot is the Organization-level AI agent. Same model as Division Lead but scoped to the entire Organization.

**Pilot capabilities:**
- Receive and interpret goals from the Founder
- Break goals into Division-level sub-goals
- Create tasks in any board across any Division
- Monitor progress across all Divisions
- Escalate to the Founder when human input is needed
- Propose new Divisions or boards (requires Founder approval if `require_approval_for_new_boards = true`)

**Pilot system prompt context includes:**
```
Organization: {name}
Divisions: [{name, lead_name, board_count, active_tasks, blocked_tasks}]
Active Goals: [{title, priority, progress, assigned_division}]
Recent Activity: [{division, board, action, timestamp}]
Pending Approvals: [{type, description, requested_by}]
```

### 5.4 Founder Interaction Model

The Founder (human) interacts at three levels:

| Level | Interaction | UI |
|-------|------------|-----|
| **Organization** | Set goals, approve Pilot proposals, view org dashboard | `/dashboard/org` |
| **Division** | Review Division status, override Division Lead decisions, view Division dashboard | `/dashboard/divisions/:id` |
| **Board** | Full Kanban interaction (existing) — drag cards, chat with AI, review outputs | `/dashboard/boards/:id` |

The Founder can always override AI decisions at any level. TaskClaw's transparency principle: **every AI action is visible, reviewable, and reversible**.

### 5.5 Approval System

```sql
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- What needs approval
  approval_type TEXT NOT NULL CHECK (approval_type IN (
    'create_board',          -- Pilot/Lead wants to create a new board
    'create_division',       -- Pilot wants to create a new division
    'cross_division_task',   -- Task routing across division boundaries
    'goal_strategy',         -- Pilot proposes a strategy for a goal
    'budget_increase'        -- Agent requests more budget/tokens
  )),

  -- Who requested
  requested_by_type TEXT NOT NULL CHECK (requested_by_type IN ('pilot', 'division_lead', 'board')),
  requested_by_division_id UUID REFERENCES divisions(id),
  requested_by_board_id UUID REFERENCES board_instances(id),

  -- Proposal
  title TEXT NOT NULL,
  description TEXT,
  proposal_data JSONB NOT NULL DEFAULT '{}',    -- Structured proposal (e.g., board config, task details)

  -- Resolution
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by_user_id UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approvals_pending ON approvals(organization_id, status) WHERE status = 'pending';
```

---

## 6. System Design: Board Connections

### 6.1 How Connections Work

A Board Connection is a directional link: **Source Board Step → Target Board Step**.

When a task completes a source step that has outbound connections, TaskClaw evaluates each connection's conditions and fires matching ones.

**Connection lifecycle:**

```
Task completes "Publish" step on Content Board
  → handlePostAiRouting() checks for board_connections
  → Finds connection: Content.publish → QA.review_input
  → Evaluates conditions: { "approved": true } — matches card_data
  → Creates new task in QA Board at "review_input" step:
      - Title mapped from source task
      - card_data mapped via field_mapping
      - source_task_id = original task ID (lineage tracking)
      - goal_id inherited from source task
  → If auto_trigger_ai = true: triggers AI on target step
  → Original task stays in "Publish Done" (or moves to done step)
```

### 6.2 Connection Types

| Type | Behavior | Use Case |
|------|----------|----------|
| `create_task` | Creates a new task in the target board. Source task stays in its board. | Most common: content → QA, design → development |
| `move_task` | Moves the task itself to the target board. Task leaves the source board. | Linear pipeline: intake → processing → output |
| `clone_task` | Creates a copy in target board. Original continues in source board. | Fan-out: one idea → multiple teams review |

### 6.3 Field Mapping

Connections map fields from the source task's `card_data` to the target step's `input_fields`:

```json
{
  "field_mapping": {
    "post_content": "review_content",
    "hashtags": "tags",
    "author": "submitted_by"
  }
}
```

Unmapped fields are dropped. Target fields not in the mapping use their defaults.

### 6.4 ConversationsService Changes

```typescript
// In handlePostAiRouting(), after existing step routing:

// Check for outbound board connections
const connections = await this.boardConnectionsService.findBySource(
  boardId, currentStep.step_key
);

for (const conn of connections) {
  // Evaluate conditions against card_data
  if (!this.evaluateConditions(conn.conditions, task.card_data)) {
    continue;
  }

  switch (conn.connection_type) {
    case 'create_task':
      await this.createCrossBoardTask(task, conn);
      break;
    case 'move_task':
      await this.moveToCrossBoard(task, conn);
      break;
    case 'clone_task':
      await this.cloneToCrossBoard(task, conn);
      break;
  }
}
```

### 6.5 Visual: Flow Graph View

Add a **Division Flow View** that shows all boards in a Division as nodes and their connections as edges. Uses `@xyflow/react` (ReactFlow v12).

```
┌─────────────────────────────────────────────────────────────┐
│  Marketing Division — Flow View                    [Kanban] │
│                                                    [Flow ●] │
│                                                             │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐   │
│  │ 📝 Content │      │ 🎨 Design  │      │ 📤 Publish │   │
│  │   Board    │─────▶│   Board    │─────▶│   Board    │   │
│  │            │      │            │      │            │   │
│  │ 12 tasks   │      │ 5 tasks    │      │ 3 tasks    │   │
│  │ ● OpenClaw │      │ ● Claude   │      │ ● OpenClaw │   │
│  └────────────┘      └────────────┘      └────────────┘   │
│        │                                       │           │
│        │              ┌────────────┐            │           │
│        └─────────────▶│ 📊 Analyt. │◀───────────┘           │
│                       │   Board    │                        │
│                       │ 1 task     │                        │
│                       │ ● Codex   │                        │
│                       └────────────┘                        │
│                                                             │
│  Legend: ─▶ create_task  ═▶ move_task  ·▶ clone_task       │
└─────────────────────────────────────────────────────────────┘
```

Each node shows:
- Board name and icon
- Active task count
- Backbone indicator (colored dot + name)
- Health status

Clicking a node opens the board's Kanban view. Clicking an edge opens the connection config.

### 6.6 Sidebar Navigation Update

```
┌──────────────────────────┐
│ 🏢 My Organization       │
│                          │
│ ▼ Marketing Division     │  ← Collapsible group
│   📝 Content Board       │
│   🎨 Design Board        │
│   📊 Analytics Board     │
│                          │
│ ▼ Engineering Division   │
│   💻 Backend Board       │
│   🖥️ Frontend Board      │
│                          │
│ ▸ Operations Division    │  ← Collapsed
│                          │
│ ── Standalone Boards ──  │  ← Boards not in any division
│   🧪 Scratch Board       │
│                          │
│ [+ New Board]            │
│ [+ New Division]         │
└──────────────────────────┘
```

---

## 7. System Design: Heartbeat (Pulse) & Scheduler

### 7.1 The Problem with Backbone-Native Heartbeats

OpenClaw has native heartbeats. Claude Code does not. Codex does not. If TaskClaw only exposes OpenClaw's heartbeats, we're locked to one backbone and can't schedule work on boards running other backbones.

**Solution: TaskClaw owns the scheduler.** The Pulse system is a backbone-agnostic orchestration layer that lives in TaskClaw's backend. It uses BullMQ (already available) for reliable job scheduling and delegates execution to whatever backbone is configured for the target board/step.

### 7.2 Architecture

```
┌─────────────────────────────────────────────────────┐
│                  PULSE SCHEDULER                      │
│            (TaskClaw Backend — NestJS)                 │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Cron Ticker  │  │ Webhook      │  │ Event      │ │
│  │ (30s loop)   │  │ Listener     │  │ Listener   │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │        │
│         ▼                 ▼                 ▼        │
│  ┌──────────────────────────────────────────────┐   │
│  │              BullMQ Queue                     │   │
│  │              "pulse-jobs"                     │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                            │
│  ┌──────────────────────▼───────────────────────┐   │
│  │           Pulse Processor                     │   │
│  │                                               │   │
│  │  1. Load pulse config                         │   │
│  │  2. Resolve backbone (via BackboneRouter)     │   │
│  │  3. Build context (board state, tasks, goals) │   │
│  │  4. Send to backbone adapter                  │   │
│  │  5. Process response (create tasks, move, etc)│   │
│  │  6. Record pulse_run                          │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  Backbone Adapters:                                   │
│  [OpenClaw] [Claude Code] [Codex] [OpenRouter] [...]  │
└─────────────────────────────────────────────────────┘
```

### 7.3 Pulse Trigger Types

| Trigger | How It Works | Example |
|---------|-------------|---------|
| **Interval** | Fires every N seconds. Simple elapsed-time check. | "Check for new support tickets every 5 minutes" |
| **Cron** | Standard 5-field cron with timezone. | `0 9 * * 1-5` = "Every weekday at 9am" |
| **Webhook** | Public URL receives POST, queues a run. | CI/CD pipeline triggers deployment board |
| **Event** | Internal TaskClaw event fires the pulse. | `task.completed` on Board A → triggers review on Board B |

### 7.4 Pulse Processor

```typescript
// backend/src/pulse/pulse.processor.ts

@Processor('pulse-jobs')
export class PulseProcessor {
  constructor(
    private readonly backboneRouter: BackboneRouterService,
    private readonly boardsService: BoardsService,
    private readonly tasksService: TasksService,
    private readonly conversationsService: ConversationsService,
    private readonly pulseRunsService: PulseRunsService,
  ) {}

  @Process('execute-pulse')
  async handlePulse(job: Job<{ pulseId: string; triggeredBy: string; payload?: any }>) {
    const pulse = await this.pulsesService.findById(job.data.pulseId);
    const run = await this.pulseRunsService.create(pulse.id, job.data.triggeredBy);

    try {
      // 1. Build context based on target type
      const context = await this.buildPulseContext(pulse);

      // 2. Resolve backbone for the target
      const { adapter, config } = await this.backboneRouter.resolve({
        accountId: pulse.account_id,
        boardId: pulse.target_board_id,
        stepId: null,  // Pulse targets board-level by default
      });

      // 3. Build system prompt for the pulse
      const systemPrompt = this.buildPulseSystemPrompt(pulse, context);

      // 4. Send to backbone
      const result = await adapter.sendMessage({
        messages: [{ role: 'user', content: this.buildPulseInstruction(pulse, context) }],
        systemPrompt,
        connectionConfig: config,
        conversationId: `pulse-${run.id}`,
      });

      // 5. Parse AI response for actions
      await this.executePulseActions(result.content, pulse, context);

      // 6. Record success
      await this.pulseRunsService.complete(run.id, {
        status: 'success',
        tokens_used: result.tokensUsed?.total ?? 0,
      });
    } catch (error) {
      await this.pulseRunsService.fail(run.id, error.message);
      await this.handlePulseFailure(pulse, error);
    }
  }

  private async buildPulseContext(pulse: Pulse): Promise<PulseContext> {
    switch (pulse.target_type) {
      case 'board':
        return this.buildBoardPulseContext(pulse.target_board_id);
      case 'step':
        return this.buildStepPulseContext(pulse.target_board_id, pulse.target_step_key);
      case 'division':
        return this.buildDivisionPulseContext(pulse.target_division_id);
      case 'pilot':
        return this.buildPilotPulseContext(pulse.account_id);
    }
  }

  private async buildBoardPulseContext(boardId: string): Promise<PulseContext> {
    // Fetch: board config, all steps, all active tasks by step,
    // recent activity, connected boards, division context
    const board = await this.boardsService.findById(boardId);
    const tasks = await this.tasksService.findByBoard(boardId);
    const connections = await this.boardConnectionsService.findByBoard(boardId);

    return {
      board,
      tasksByStep: this.groupTasksByStep(tasks, board.board_steps),
      connections,
      summary: this.buildBoardSummary(board, tasks),
    };
  }

  private buildPulseSystemPrompt(pulse: Pulse, context: PulseContext): string {
    // Assembles context-aware prompt:
    // - Board state (tasks per step, blockers)
    // - Available actions (create task, move task, comment, trigger connection)
    // - Division context (if applicable)
    // - Organization goals (if applicable)
    // - Structured output format for action execution
  }
}
```

### 7.5 Pulse System Prompt for Board-Level Pulses

When a Pulse triggers on a board, the AI receives:

```markdown
# Pulse Context — {Board Name}

## Your Role
You are the AI agent for the "{Board Name}" board. You have been woken by a scheduled pulse.
Review the current state and take appropriate actions.

## Current Board State
Steps: {step_name} ({task_count} tasks) → {step_name} ({task_count} tasks) → ...

### Tasks by Step
**💡 Idea (3 tasks):**
- "Blog post about AI agents" (priority: high, created: 2 days ago)
- "Newsletter March edition" (priority: medium, created: 1 day ago)
- "Product announcement" (priority: high, created: 3 hours ago)

**🤖 AI Generate (1 task, AI running):**
- "Case study: Customer X" (started: 5 min ago)

**👀 Review (0 tasks)**
**✅ Done (12 tasks this week)**

## Blocked Tasks
None.

## Connected Boards
- Output "Publish" step → feeds into "QA Board" review step

## Organization Goals
- "Launch v2 marketing campaign" (priority: critical, progress: 40%)
  - This board contributes to this goal.

## Available Actions
Respond with a JSON array of actions:
- { "action": "create_task", "step_key": "idea", "title": "...", "priority": "..." }
- { "action": "move_task", "task_id": "...", "to_step_key": "..." }
- { "action": "comment", "task_id": "...", "content": "..." }
- { "action": "trigger_ai", "task_id": "..." }
- { "action": "report", "content": "..." }  // Report back to Division Lead
- { "action": "none" }  // Nothing to do right now
```

### 7.6 How OpenClaw Native Heartbeats Fit In

For backbones that have native heartbeats (OpenClaw, ZeroClaw, PinaClaw), TaskClaw's Pulse system can either:

**Option A: TaskClaw drives everything (recommended for v1)**
- TaskClaw Pulse scheduler wakes the AI → sends context → processes response
- OpenClaw's native heartbeat is disabled or set to a long interval
- Simplest: one scheduler, one behavior, works the same across all backbones

**Option B: Hybrid (future)**
- OpenClaw manages its own heartbeat for long-running sessions
- TaskClaw Pulse handles orchestration-level scheduling (cross-board, division, pilot)
- Backbones report heartbeat status back to TaskClaw via webhook
- More efficient but complex to synchronize

**Recommendation:** Start with Option A. TaskClaw's Pulse is the single source of truth for scheduling. If a backbone has native heartbeats, it's a nice-to-have but not required.

### 7.7 Cron Parser

Use `cron-parser` npm package (already well-tested, MIT licensed) instead of writing a custom parser:

```typescript
import { parseExpression } from 'cron-parser';

function getNextRunAt(cronExpression: string, timezone: string): Date {
  const interval = parseExpression(cronExpression, {
    tz: timezone,
    currentDate: new Date(),
  });
  return interval.next().toDate();
}
```

### 7.8 Webhook Endpoint for External Triggers

```
POST /api/pulse/webhook/:publicId
Content-Type: application/json
Authorization: Bearer {optional_token}

{ "payload": { ... } }
```

Returns `202 Accepted` immediately. Queues the pulse run in BullMQ.

### 7.9 Pulse Scheduler (Ticker)

```typescript
// backend/src/pulse/pulse-scheduler.service.ts

@Injectable()
export class PulseSchedulerService implements OnModuleInit {
  private tickIntervalMs = 30_000;  // 30 seconds

  onModuleInit() {
    // Start the ticker
    setInterval(() => this.tick(), this.tickIntervalMs);
  }

  async tick() {
    const now = new Date();

    // Find all enabled pulses where next_run_at <= now
    const duePulses = await this.pulsesService.findDue(now);

    for (const pulse of duePulses) {
      // Check concurrency policy
      if (pulse.concurrency_policy === 'skip_if_running') {
        const hasRunning = await this.pulseRunsService.hasRunning(pulse.id);
        if (hasRunning) continue;
      }

      // Queue the job
      await this.pulseQueue.add('execute-pulse', {
        pulseId: pulse.id,
        triggeredBy: pulse.trigger_kind,
      });

      // Compute and store next_run_at
      const nextRun = this.computeNextRun(pulse);
      await this.pulsesService.updateNextRun(pulse.id, nextRun);
    }
  }
}
```

---

## 8. Frontend Architecture

### 8.1 New Pages

| Route | Purpose |
|-------|---------|
| `/dashboard/org` | Organization overview — Pilot status, Division cards, active goals, recent activity |
| `/dashboard/org/goals` | Goal management — create, track progress, assign to divisions |
| `/dashboard/org/approvals` | Approval inbox — pending Pilot/Lead proposals |
| `/dashboard/divisions/:id` | Division detail — board list, flow graph, Division Lead status, metrics |
| `/dashboard/divisions/:id/flow` | Division flow graph — ReactFlow visualization of inter-board connections |
| `/dashboard/settings/pulse` | Pulse management — create/edit schedules, view run history |
| `/dashboard/settings/routines` | Routine management — recurring workflows |

### 8.2 New Components

```
frontend/src/
├── components/
│   ├── org/
│   │   ├── org-overview.tsx              # Dashboard cards: divisions, goals, pilot status
│   │   ├── org-goals-list.tsx            # Goal list with progress bars
│   │   ├── org-approval-inbox.tsx        # Pending approvals with approve/reject buttons
│   │   ├── pilot-status-card.tsx         # Pilot health, last pulse, next pulse
│   │   └── pilot-chat.tsx               # Chat with the Pilot (like board AI chat)
│   ├── divisions/
│   │   ├── division-card.tsx             # Card showing division name, boards, metrics
│   │   ├── division-board-list.tsx       # List of boards in a division
│   │   ├── division-flow-graph.tsx       # ReactFlow graph of connected boards
│   │   ├── division-lead-status.tsx      # Lead health, configuration
│   │   ├── create-division-dialog.tsx    # Create new division
│   │   └── board-connection-editor.tsx   # Create/edit connections between boards
│   ├── pulse/
│   │   ├── pulse-list.tsx                # List of configured pulses
│   │   ├── pulse-create-dialog.tsx       # Create new pulse (schedule, webhook, event)
│   │   ├── pulse-run-history.tsx         # Table of past pulse runs with status
│   │   ├── pulse-cron-builder.tsx        # Visual cron expression builder
│   │   └── pulse-status-badge.tsx        # Active/paused/failing indicator
│   └── routines/
│       ├── routine-list.tsx              # List of routines
│       └── routine-create-dialog.tsx     # Create routine with task template
├── hooks/
│   ├── use-organization.ts
│   ├── use-divisions.ts
│   ├── use-board-connections.ts
│   ├── use-goals.ts
│   ├── use-pulses.ts
│   ├── use-pulse-runs.ts
│   └── use-routines.ts
└── types/
    ├── organization.ts
    ├── division.ts
    ├── board-connection.ts
    ├── goal.ts
    ├── pulse.ts
    └── routine.ts
```

### 8.3 Organization Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  🏢 My Organization                                          │
│                                                               │
│  ┌─── Pilot ──────────────────┐  ┌─── Goals ───────────────┐│
│  │ 🧭 Pilot: Active           │  │ 🎯 Launch v2 campaign   ││
│  │    Backbone: OpenClaw ●    │  │    ████████░░ 75%        ││
│  │    Last pulse: 2h ago      │  │    → Marketing Division  ││
│  │    Next pulse: in 2h       │  │                          ││
│  │    [Chat with Pilot]       │  │ 🎯 Hire 3 engineers     ││
│  │    [View Pulse History]    │  │    ███░░░░░░░ 30%        ││
│  └────────────────────────────┘  │    → Engineering Div.    ││
│                                  │ [+ New Goal]             ││
│  ┌─── Divisions ──────────────┐  └──────────────────────────┘│
│  │                            │                               │
│  │ ┌────────┐ ┌────────┐ ┌────────┐                        │
│  │ │Marketing│ │Engineer│ │ Ops    │                        │
│  │ │ 3 boards│ │ 2 board│ │ 2 board│                        │
│  │ │ 20 tasks│ │ 14 task│ │ 8 tasks│                        │
│  │ │ ●●●    │ │ ●●    │ │ ●○    │  ● = healthy board      │
│  │ └────────┘ └────────┘ └────────┘                        │
│  │ [+ New Division]                                         │
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─── Approval Inbox (2 pending) ───────────────────────────┐│
│  │ 🟡 Pilot proposes: Create "SEO Board" in Marketing Div. ││
│  │   [Approve] [Reject] [View Details]                      ││
│  │ 🟡 Marketing Lead requests cross-div task to Engineering ││
│  │   [Approve] [Reject] [View Details]                      ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

---

## 9. Backend Module Structure

### 9.1 New Modules

```
backend/src/
├── organization/
│   ├── organization.module.ts
│   ├── organization.service.ts
│   ├── organization.controller.ts
│   └── dto/
├── divisions/
│   ├── divisions.module.ts
│   ├── divisions.service.ts
│   ├── divisions.controller.ts
│   └── dto/
├── board-connections/
│   ├── board-connections.module.ts
│   ├── board-connections.service.ts
│   ├── board-connections.controller.ts
│   └── dto/
├── goals/
│   ├── goals.module.ts
│   ├── goals.service.ts
│   ├── goals.controller.ts
│   └── dto/
├── pulse/
│   ├── pulse.module.ts
│   ├── pulse.service.ts                # CRUD for pulses
│   ├── pulse-scheduler.service.ts      # The 30s ticker
│   ├── pulse.processor.ts             # BullMQ job processor
│   ├── pulse-runs.service.ts          # Run history
│   ├── pulse.controller.ts            # API endpoints + webhook receiver
│   └── dto/
├── routines/
│   ├── routines.module.ts
│   ├── routines.service.ts
│   ├── routines.controller.ts
│   └── dto/
└── approvals/
    ├── approvals.module.ts
    ├── approvals.service.ts
    ├── approvals.controller.ts
    └── dto/
```

### 9.2 API Endpoints

```
# Organization
GET    /accounts/:accountId/organization                         # Get or auto-create
PATCH  /accounts/:accountId/organization                         # Update settings

# Divisions
GET    /accounts/:accountId/divisions                            # List all
POST   /accounts/:accountId/divisions                            # Create
GET    /accounts/:accountId/divisions/:id                        # Get with boards + metrics
PATCH  /accounts/:accountId/divisions/:id                        # Update
DELETE /accounts/:accountId/divisions/:id                        # Delete (unassigns boards)
PATCH  /accounts/:accountId/divisions/:id/reorder                # Reorder boards within division
POST   /accounts/:accountId/boards/:boardId/assign-division      # Assign board to division

# Board Connections
GET    /accounts/:accountId/board-connections                    # List all (filterable by board)
POST   /accounts/:accountId/board-connections                    # Create connection
PATCH  /accounts/:accountId/board-connections/:id                # Update
DELETE /accounts/:accountId/board-connections/:id                # Delete
GET    /accounts/:accountId/divisions/:id/flow                   # Get flow graph data (nodes + edges)

# Goals
GET    /accounts/:accountId/goals                                # List (filter by division, status)
POST   /accounts/:accountId/goals                                # Create
PATCH  /accounts/:accountId/goals/:id                            # Update
DELETE /accounts/:accountId/goals/:id                            # Delete

# Pulses
GET    /accounts/:accountId/pulses                               # List all
POST   /accounts/:accountId/pulses                               # Create
PATCH  /accounts/:accountId/pulses/:id                           # Update
DELETE /accounts/:accountId/pulses/:id                           # Delete
POST   /accounts/:accountId/pulses/:id/trigger                   # Manual trigger
GET    /accounts/:accountId/pulses/:id/runs                      # Run history
POST   /api/pulse/webhook/:publicId                              # Public webhook (no auth)

# Routines
GET    /accounts/:accountId/routines                             # List
POST   /accounts/:accountId/routines                             # Create
PATCH  /accounts/:accountId/routines/:id                         # Update
DELETE /accounts/:accountId/routines/:id                         # Delete
POST   /accounts/:accountId/routines/:id/run                     # Manual trigger

# Approvals
GET    /accounts/:accountId/approvals                            # List (filter by status)
POST   /accounts/:accountId/approvals/:id/resolve                # Approve or reject
```

---

## 10. Execution Plan

### Phase 1: Organization & Divisions (Database + Backend)

| # | Task | Status | Files |
|---|------|--------|-------|
| 1.1 | Create `organizations` table migration | ⬜ | `migrations/20260401000001_create_org_tables.sql` |
| 1.2 | Create `divisions` table migration | ⬜ | Same file |
| 1.3 | Create `goals` table migration | ⬜ | Same file |
| 1.4 | Create `approvals` table migration | ⬜ | Same file |
| 1.5 | Add `division_id` FK to `board_instances` | ⬜ | `migrations/20260401000002_add_division_refs.sql` |
| 1.6 | Add `goal_id`, `source_task_id`, `source_board_id` to `tasks` | ⬜ | Same file |
| 1.7 | Create `OrganizationModule` (service, controller, DTOs) | ⬜ | `backend/src/organization/` |
| 1.8 | Create `DivisionsModule` (service, controller, DTOs) | ⬜ | `backend/src/divisions/` |
| 1.9 | Create `GoalsModule` (service, controller, DTOs) | ⬜ | `backend/src/goals/` |
| 1.10 | Create `ApprovalsModule` (service, controller, DTOs) | ⬜ | `backend/src/approvals/` |
| 1.11 | Update `BoardsService` to accept `division_id` on create/update | ⬜ | `backend/src/boards/boards.service.ts` |

### Phase 2: Board Connections (Database + Backend + Routing)

| # | Task | Status | Files |
|---|------|--------|-------|
| 2.1 | Create `board_connections` table migration | ⬜ | `migrations/20260401000003_create_board_connections.sql` |
| 2.2 | Add `route_to_board_id`, `route_to_step_key` to `board_steps` | ⬜ | Same file |
| 2.3 | Create `BoardConnectionsModule` (service, controller, DTOs) | ⬜ | `backend/src/board-connections/` |
| 2.4 | Update `handlePostAiRouting` to check outbound connections | ⬜ | `backend/src/conversations/conversations.service.ts` |
| 2.5 | Implement `createCrossBoardTask` method | ⬜ | Same file |
| 2.6 | Implement `moveToCrossBoard` method | ⬜ | Same file |
| 2.7 | Implement `cloneToCrossBoard` method | ⬜ | Same file |
| 2.8 | Add flow graph data endpoint (nodes + edges for ReactFlow) | ⬜ | `backend/src/board-connections/board-connections.controller.ts` |

### Phase 3: Pulse & Scheduler (Database + Backend)

| # | Task | Status | Files |
|---|------|--------|-------|
| 3.1 | Create `pulses` + `pulse_runs` table migration | ⬜ | `migrations/20260401000004_create_pulse_tables.sql` |
| 3.2 | Create `routines` table migration | ⬜ | Same file |
| 3.3 | Create `PulseModule` with BullMQ queue registration | ⬜ | `backend/src/pulse/pulse.module.ts` |
| 3.4 | Implement `PulseService` (CRUD for pulse configs) | ⬜ | `backend/src/pulse/pulse.service.ts` |
| 3.5 | Implement `PulseSchedulerService` (30s ticker) | ⬜ | `backend/src/pulse/pulse-scheduler.service.ts` |
| 3.6 | Implement `PulseProcessor` (BullMQ job handler) | ⬜ | `backend/src/pulse/pulse.processor.ts` |
| 3.7 | Build pulse context builders (board, step, division, pilot) | ⬜ | Same file |
| 3.8 | Build pulse system prompt templates | ⬜ | `backend/src/pulse/pulse-prompts.ts` |
| 3.9 | Implement pulse action parser (extract actions from AI response) | ⬜ | `backend/src/pulse/pulse-actions.ts` |
| 3.10 | Implement `PulseRunsService` (history tracking) | ⬜ | `backend/src/pulse/pulse-runs.service.ts` |
| 3.11 | Create webhook receiver endpoint | ⬜ | `backend/src/pulse/pulse.controller.ts` |
| 3.12 | Create `RoutinesModule` | ⬜ | `backend/src/routines/` |
| 3.13 | Add `cron-parser` dependency | ⬜ | `backend/package.json` |

### Phase 4: Frontend — Divisions & Organization

| # | Task | Status | Files |
|---|------|--------|-------|
| 4.1 | Add TypeScript types (organization, division, goal, approval) | ⬜ | `frontend/src/types/` |
| 4.2 | Add React Query hooks | ⬜ | `frontend/src/hooks/` |
| 4.3 | Update sidebar: group boards by Division | ⬜ | `frontend/src/components/nav-boards.tsx` |
| 4.4 | Add Organization entry to sidebar | ⬜ | `frontend/src/components/app-sidebar.tsx` |
| 4.5 | Build Organization dashboard page | ⬜ | `frontend/src/app/dashboard/org/page.tsx` |
| 4.6 | Build Goals management page | ⬜ | `frontend/src/app/dashboard/org/goals/page.tsx` |
| 4.7 | Build Approval inbox page | ⬜ | `frontend/src/app/dashboard/org/approvals/page.tsx` |
| 4.8 | Build Division detail page | ⬜ | `frontend/src/app/dashboard/divisions/[id]/page.tsx` |
| 4.9 | Build CreateDivisionDialog | ⬜ | `frontend/src/components/divisions/create-division-dialog.tsx` |
| 4.10 | Build Pilot chat component | ⬜ | `frontend/src/components/org/pilot-chat.tsx` |

### Phase 5: Frontend — Flow Graph & Board Connections

| # | Task | Status | Files |
|---|------|--------|-------|
| 5.1 | Add `@xyflow/react` dependency | ⬜ | `frontend/package.json` |
| 5.2 | Build custom BoardNode component (ReactFlow) | ⬜ | `frontend/src/components/divisions/flow/board-node.tsx` |
| 5.3 | Build custom ConnectionEdge component | ⬜ | `frontend/src/components/divisions/flow/connection-edge.tsx` |
| 5.4 | Build DivisionFlowGraph page | ⬜ | `frontend/src/app/dashboard/divisions/[id]/flow/page.tsx` |
| 5.5 | Build BoardConnectionEditor (create/edit connections) | ⬜ | `frontend/src/components/divisions/board-connection-editor.tsx` |
| 5.6 | Add Flow/Kanban view toggle to Division page | ⬜ | `frontend/src/app/dashboard/divisions/[id]/page.tsx` |

### Phase 6: Frontend — Pulse & Routines

| # | Task | Status | Files |
|---|------|--------|-------|
| 6.1 | Add TypeScript types (pulse, pulse_run, routine) | ⬜ | `frontend/src/types/` |
| 6.2 | Add React Query hooks | ⬜ | `frontend/src/hooks/` |
| 6.3 | Build Pulse management page | ⬜ | `frontend/src/app/dashboard/settings/pulse/page.tsx` |
| 6.4 | Build PulseCronBuilder (visual cron editor) | ⬜ | `frontend/src/components/pulse/pulse-cron-builder.tsx` |
| 6.5 | Build PulseRunHistory table | ⬜ | `frontend/src/components/pulse/pulse-run-history.tsx` |
| 6.6 | Build Routines management page | ⬜ | `frontend/src/app/dashboard/settings/routines/page.tsx` |
| 6.7 | Add pulse status indicators to board headers | ⬜ | `frontend/src/components/boards/board-header.tsx` |

### Phase 7: Pilot & Division Lead AI Integration

| # | Task | Status | Files |
|---|------|--------|-------|
| 7.1 | Build Pilot system prompt builder | ⬜ | `backend/src/organization/pilot-prompt.service.ts` |
| 7.2 | Build Division Lead system prompt builder | ⬜ | `backend/src/divisions/division-lead-prompt.service.ts` |
| 7.3 | Implement Pilot pulse handler (special context: all divisions) | ⬜ | `backend/src/pulse/handlers/pilot-pulse.handler.ts` |
| 7.4 | Implement Division Lead pulse handler | ⬜ | `backend/src/pulse/handlers/division-pulse.handler.ts` |
| 7.5 | Wire Pilot conversations to BackboneRouter | ⬜ | `backend/src/organization/organization.service.ts` |
| 7.6 | Implement approval creation from AI responses | ⬜ | `backend/src/pulse/pulse-actions.ts` |
| 7.7 | Implement approval resolution → trigger follow-up pulse | ⬜ | `backend/src/approvals/approvals.service.ts` |

---

## 11. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| "Division" not "Department" or "Team" | Division | "Team" is already used for user membership. "Department" is Paperclip-adjacent. "Division" is clean, unambiguous. |
| "Pilot" not "CEO" | Pilot | Avoids corporate hierarchy baggage. Implies navigation + oversight. Also distinctive from Paperclip's "CEO". |
| "Pulse" not "Heartbeat" | Pulse | Distinct from OpenClaw's native heartbeat. Makes clear this is TaskClaw's own orchestration. |
| "Founder" not "Board Member" | Founder | The human is building something, not sitting on a board. Implies active ownership. |
| One Organization per account | Simplicity | Multi-org adds complexity with no clear user need. One account = one company. |
| Divisions are optional | Gradual adoption | Users can keep using standalone boards. Divisions are opt-in. Zero migration needed. |
| Board connections stored separately | `board_connections` table | Not embedded in board_steps — connections are their own entity with conditions, mapping, and UI positioning. Cleaner than overloading step config. |
| Pulse owns all scheduling | Backbone-agnostic | OpenClaw heartbeats are nice but lock us in. Pulse works with ANY backbone. Single scheduler, single behavior. |
| Pulse uses BullMQ | Leverage existing infra | BullMQ + Redis already present for source syncing. Same patterns, same reliability guarantees. |
| ReactFlow for flow graphs | Best-in-class | @xyflow/react is the standard for node-based graph UIs in React. MIT licensed, well-maintained, supports custom nodes/edges. |
| AI agents don't have persistent processes | Wake/sleep model | Like Paperclip, agents only run during pulse execution. No daemon processes. Saves resources, simplifies deployment. |
| Approval system is synchronous | Human-in-the-loop | Pilot/Leads create approvals → halt until Founder resolves. No auto-approval. Preserves TaskClaw's transparency principle. |
| Pilot context includes full org summary | Enable global reasoning | The Pilot needs to see everything to make good delegation decisions. Prompt size is managed by summarization, not truncation. |

---

## 12. Future Considerations (Out of Scope)

| Feature | Why Deferred | Dependency |
|---------|-------------|------------|
| **Multi-Founder** | Multiple human operators with roles (admin, observer, approver). Adds access control complexity. | Organization v1 stable |
| **Division-to-Division connections** | Direct wiring between divisions (not just boards). Needs clear use case first. | Board connections stable |
| **Pulse analytics dashboard** | Cost tracking, success rates, token usage over time per pulse. | Pulse runs history stable |
| **AI-generated board proposals** | Pilot suggests new board configurations as JSON manifests for Founder review. | Board manifest import + Pilot stable |
| **Natural language goal decomposition** | Founder types "Launch v2" → Pilot auto-generates goal tree with sub-goals per division. | Goals + Pilot stable |
| **Cross-organization communication** | Two TaskClaw instances sharing data. Far future. | Everything else |
| **Mobile push for approvals** | Notify Founder on phone when approval is pending. | Mobile app |
