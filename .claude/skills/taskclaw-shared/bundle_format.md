# TaskClaw Bundle Format Reference (v1.0)

The bundle format is a unified JSON structure for importing multiple TaskClaw entities at once. Users drop the JSON file into the **Import** page at `/dashboard/import`.

## Bundle Envelope

```json
{
  "bundle_version": "1.0",
  "categories": [],
  "boards": []
}
```

All arrays are optional. Processing order: categories first (dependency), then boards.

---

## Categories Array

Each category groups AI skills and knowledge docs into an "agent". Categories are upserted by name (duplicates are skipped).

```json
{
  "slug": "kebab-case-unique-name",
  "name": "Human Readable Name",
  "color": "#hex6",
  "icon": "lucide-icon-name",
  "skills": [],
  "knowledge_docs": []
}
```

### Slug Rules
- Derived from name: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`
- Must be unique per account
- Used for cross-referencing (steps link to categories via `linked_category_slug`)

### Colors (suggested palette)
`#6366f1` `#8b5cf6` `#ec4899` `#ef4444` `#f97316` `#eab308` `#22c55e` `#06b6d4` `#3b82f6` `#f59e0b`

### Icons
Any [Lucide icon](https://lucide.dev/icons) name in kebab-case: `lightbulb`, `pen-tool`, `image`, `check-circle`, `calendar`, `brain`, `shield`, `code`, `database`, `globe`, etc.

---

## Skills (embedded in categories)

```json
{
  "slug": "kebab-case-skill-name",
  "name": "Skill Display Name",
  "description": "One-line description (max 500 chars)",
  "instructions": "Full markdown instructions for the AI (max 50KB). This is the prompt that tells the AI how to behave when this skill is active.",
  "is_active": true
}
```

### Writing Good Instructions
- Start with a persona: "You are a [role] specialized in [domain]."
- Define the process: numbered steps the AI should follow
- Specify output format: headings, bullet points, JSON, tables
- Include constraints: what NOT to do, length limits, tone
- Add examples when helpful

---

## Knowledge Docs (embedded in categories)

```json
{
  "title": "Document Title",
  "content": "Full markdown content — guidelines, FAQs, reference material",
  "is_master": true
}
```

- `is_master: true` — injected into AI context automatically (one per category)
- `is_master: false` — supplementary reference, available but not auto-injected

---

## Boards Array

Each board is a full manifest that creates a Kanban board with steps (columns).

```json
{
  "manifest_version": "1.0",
  "id": "kebab-case-board-id",
  "name": "Board Display Name",
  "description": "What this board does",
  "version": "1.0.0",
  "author": "you@email.com",
  "icon": "lucide-icon-name",
  "color": "#hex6",
  "tags": ["tag1", "tag2"],
  "default_category_slug": "slug-of-fallback-agent",
  "settings": {
    "allow_manual_column_move": true,
    "card_retention_days": 90
  },
  "categories": [],
  "steps": []
}
```

### Board Settings
| Field | Type | Description |
|-------|------|-------------|
| `allow_manual_column_move` | boolean | Allow drag-drop between columns |
| `card_retention_days` | number\|null | Days before done cards are archived (null = never) |

### `default_category_slug`
The fallback agent for the entire board. If a step doesn't have its own `linked_category_slug`, the board default is used. Set to a category slug defined in the `categories` array.

---

## Steps Array (embedded in boards)

Steps are the Kanban columns/pipeline stages.

```json
{
  "id": "step-key-slug",
  "name": "Step Display Name",
  "type": "input",
  "position": 0,
  "color": "#hex6",
  "linked_category_slug": "agent-category-slug",
  "backbone_slug": null,
  "trigger_type": "manual",
  "ai_first": false,
  "system_prompt": null,
  "input_schema": [],
  "output_schema": [],
  "on_success": "next-step-id",
  "on_error": null,
  "webhook_url": null,
  "webhook_auth_header": null,
  "schedule_cron": null
}
```

### `backbone_slug`
Optional. The backbone type to use for this step (e.g., `"claude-code"`, `"anthropic"`, `"openrouter"`). Resolved at import time to the first active backbone connection of that type in the account. If omitted, inherits from board default → account default.

Available backbone types:
| Slug | Description |
|------|-------------|
| `claude-code` | Local Claude Code CLI subprocess — can write files, use tools |
| `anthropic` | Direct Anthropic API |
| `openrouter` | Multi-model API routing |
| `openclaw` | Self-hosted OpenClaw (WebSocket) |
| `custom-http` | Any REST endpoint |
| `ollama` | Local open-source models |

### Step Types
| Type | Description |
|------|-------------|
| `input` | Entry point. User provides initial data. Usually the first step. |
| `ai_process` | AI processes the card. Set `ai_first: true` + `system_prompt`. |
| `human_review` | Human reviews/edits AI output or other data. |
| `action` | External action (webhook, scheduling, API call). |
| `done` | Terminal step. Cards here are "completed". |

### Trigger Types
| Type | Description |
|------|-------------|
| `manual` | User manually moves card to this step |
| `on_entry` | Auto-triggered when card enters this step |
| `on_complete` | Auto-triggered when all fields are filled |
| `webhook` | Triggered by external webhook call |
| `schedule` | Triggered by cron schedule |

### `linked_category_slug`
Links this step to an agent category. When a card is in this step, the linked agent's skills are available. Set to a slug from the `categories` array.

### `ai_first`
When `true` and `linked_category_slug` is set, AI automatically processes the card when it enters this step. Requires `system_prompt` to tell the AI what to do.

### Input/Output Schema
Define form fields for each step:

```json
{
  "key": "field_key",
  "label": "Display Label",
  "type": "text",
  "required": true,
  "options": ["Option A", "Option B"]
}
```

Field types: `text`, `dropdown`, `date`, `number`, `boolean`, `url`

`options` array only needed for `dropdown` type.

**`url` type is special**: renders as a clickable link on the task card. Use it for:
- Source URLs the AI should research (input)
- Generated file paths (output) — `file:///tmp/output/report.html` opens directly in the browser
- External asset links (deployed pages, images, documents)

**Output schema for AI steps**: Every `ai_process` step should define `output_schema` fields for the data the AI produces. The platform automatically appends a structured `output_json` block instruction to the AI's system prompt, telling it to fill these fields. The AI response is parsed and saved as `card_data` on the task, making results visible and traceable on the card.

### Step Routing
- `on_success`: step `id` to move to when this step completes successfully
- `on_error`: step `id` to fall back to on failure
- Both reference step `id` values (not UUIDs — the import system resolves them)

---

## Agent Priority Cascade

When resolving which agent to use for a task:
1. **Card-level**: `task.override_category_id` (highest priority)
2. **Column-level**: `board_step.linked_category_slug` (step's agent)
3. **Board-level**: `board.default_category_slug` (fallback)
4. **Legacy**: `task.category_id`

---

## Complete Example

See the X Content Pipeline: a real-world board with 5 agent categories, 8 skills, and 6 steps.

**File**: `backend/supabase/seeds/x-content-pipeline.json` in the TaskClaw repository.
