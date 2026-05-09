# TaskClaw Terminology Reference

## Hierarchy

> **Workspace → Cockpit → Pod → Board → Column → Task**

---

## Definitions

### Workspace
The top-level tenant boundary. Represents a single customer account (a solo founder, an agency, a company). All data, billing, members, and permissions are scoped to a Workspace. A user may belong to multiple Workspaces but operates in one at a time. This is the existing multi-tenant concept and should map to whatever `account` / `tenant` primitive already exists in the data model.

**Data model:** Real entity. Root of the ownership chain.

---

### Cockpit
A **recursive visual view**, not a data model entity. A Cockpit shows everything one level below its current scope, with live status, agent activity, and priorities. It is the human's command surface — the place where the user pilots their AI workforce.

Cockpits exist at two scopes:

- **Workspace Cockpit** — shows all Pods in the Workspace, their health, active agents, blocked tasks, and cross-Pod priorities. This is the "god view" for the Workspace owner.
- **Pod Cockpit** — shows all Boards within a single Pod, their columns' status, agent activity, and Pod-level priorities. This is the operational view for whoever runs that Pod.

**Critical architectural rule:** A Cockpit is *always derived*. There is no `cockpits` table, no `cockpit_id` foreign key, no `cockpit_config` field. A Cockpit is a UI lens that queries the Pods or Boards beneath its current scope. This keeps the data model clean and means the term can be renamed in the future with zero migration cost.

**Data model:** None. Pure UX/view layer.

---

### Pod
A **container that groups Boards with shared purpose**. Pods are the organizational unit between the Workspace and individual Boards. Examples: "Marketing Pod," "Engineering Pod," "Content Pod," "Client Acme Pod."

A Pod has:
- A name, icon, and description
- A set of Boards
- Optionally, a Pod-level AI agent that can observe and coordinate across the Pod's Boards (this is the "department head" concept from the original CEO → Department → Board hierarchy)
- Optionally, a Pod-level pluggable AI backbone setting (e.g., Claude Code for an Engineering Pod, OpenRouter for a Marketing Pod) — this is the natural home for the per-Pod backbone abstraction already on the roadmap
- Its own Cockpit view (derived, see above)

A Board belongs to exactly one Pod. A Pod belongs to exactly one Workspace.

**Data model:** Real entity. New table. Foreign key on `boards` pointing to `pods`. Significant migration work — this is the "Departments layer" already flagged on the roadmap.

---

### Board
A single Kanban workflow. Unchanged from the existing concept. A Board has Columns, Tasks, sync configuration with external tools (Notion, ClickUp, etc.), and any Board-level AI configuration. Boards now belong to a Pod (new) which belongs to a Workspace (existing).

**Data model:** Existing entity. Add `pod_id` foreign key.

---

### Column
A stage within a Board's Kanban workflow (e.g., "Backlog," "In Progress," "Review," "Done"). Columns are the home of agent behavior configuration — the `ai_config` already lives here. Per the column-centric redesign direction (Option A), the Agent entity is folded into the Column: a Column *is* the unit of work-stage-plus-AI-behavior. There is no separate "Agent" entity with its own data model.

**Data model:** Existing entity. Already has `ai_config`. The column-centric refactor consolidates Agent logic here.

---

### Task
A unit of work. Unchanged. Lives in a Column on a Board in a Pod in a Workspace.

**Data model:** Existing entity.

---

## Vocabulary rules for the PRD

These should be enforced consistently in copy, UI, API, and documentation:

| Use | Don't use |
|---|---|
| Workspace | Account, Tenant, Organization (in user-facing copy) |
| Cockpit | Dashboard, Command Center, Bridge, Overview |
| Pod | Department, Team, Squad, Crew, Group, Hub |
| Board | Project, Kanban (as a noun) |
| Column | Stage, Status, Lane, Agent (as the visible unit) |
| Task | Card, Item, Ticket |

Internal/technical terms (in code, schema, API routes) may use the existing names (`account_users`, etc.) — the rules above apply to **user-facing** language.

---

## Key relationships

```
Workspace (1) ──── (N) Pod ──── (N) Board ──── (N) Column ──── (N) Task
                    │
                    └── has one Pod Cockpit (derived view)

Workspace ── has one Workspace Cockpit (derived view of all Pods)
```

- A Workspace has many Pods.
- A Pod has many Boards.
- A Board has many Columns.
- A Column has many Tasks.
- Cockpits exist at the Workspace and Pod levels as **derived views**, not stored entities.

---

## Conceptual framing for the PRD writer

TaskClaw's strategic positioning is **human visual control over an AI workforce**. The terminology reinforces this:

- **Workspace** is where you *belong*.
- **Cockpit** is where you *pilot*. The user is the pilot. The AI is the engine.
- **Pod** is a *unit of focused capability* — a group of related workflows and the agents that run them.
- **Board** is *how work flows*.
- **Column** is *where AI behavior is configured* — work stage and agent behavior are unified.
- **Task** is *what gets done*.

The Cockpit is the durable differentiator. TaskClaw deliberately avoids naming an AI persona at the top level. The pilot is the human, every time, at every scope.

### Human pilot, AI engine.