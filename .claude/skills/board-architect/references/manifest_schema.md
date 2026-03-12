# Board Manifest JSON Schema

## Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `manifest_version` | string | Yes | Always `"1.0"` |
| `id` | string | Yes | Kebab-case unique board identifier |
| `name` | string | Yes | Human-readable board name |
| `description` | string | Yes | What the board does |
| `version` | string | No | Semantic version (default `"1.0.0"`) |
| `author` | string | No | Author email or name |
| `icon` | string | No | Lucide icon name (default `"layout-grid"`) |
| `color` | string | No | Hex color (default `"#6366f1"`) |
| `tags` | string[] | No | Searchable tags |
| `default_category_slug` | string\|null | No | Fallback agent category slug |
| `settings` | object | No | Board-level settings |
| `categories` | array | No | Agent categories with embedded skills |
| `steps` | array | Yes | Pipeline steps (Kanban columns) |

## Settings Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `allow_manual_column_move` | boolean | `true` | Allow drag-drop between columns |
| `card_retention_days` | number\|null | `null` | Days before done cards archive (`null` = never) |

## Category Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | Yes | Kebab-case, unique per account |
| `name` | string | Yes | Display name |
| `color` | string | No | Hex color |
| `icon` | string | No | Lucide icon name |
| `skills` | array | No | Embedded skills |
| `knowledge_docs` | array | No | Embedded knowledge documents |

## Skill Object (embedded in category)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | Yes | Kebab-case, unique per account |
| `name` | string | Yes | Display name (max 100 chars) |
| `description` | string | No | One-line description (max 500 chars) |
| `instructions` | string | Yes | Full AI instructions (markdown, max 50KB) |
| `is_active` | boolean | No | Default `true` |

## Knowledge Doc Object (embedded in category)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Document title |
| `content` | string | Yes | Full markdown content |
| `is_master` | boolean | No | If `true`, auto-injected into AI context (one per category) |

## Step Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Kebab-case step key (unique per board) |
| `name` | string | Yes | Display name |
| `type` | string | Yes | `input` \| `ai_process` \| `human_review` \| `action` \| `done` |
| `position` | number | Yes | 0-indexed order |
| `color` | string | No | Hex color |
| `linked_category_slug` | string\|null | No | Agent category for this step |
| `trigger_type` | string | No | `manual` \| `on_entry` \| `on_complete` \| `webhook` \| `schedule` |
| `ai_first` | boolean | No | Auto-run AI on card entry |
| `system_prompt` | string\|null | No | AI instructions for this step |
| `input_schema` | array | No | Input field definitions |
| `output_schema` | array | No | Output field definitions |
| `on_success` | string\|null | No | Step `id` to route to on success |
| `on_error` | string\|null | No | Step `id` to route to on error |
| `webhook_url` | string\|null | No | External webhook URL |
| `webhook_auth_header` | string\|null | No | Webhook auth header value |
| `schedule_cron` | string\|null | No | Cron expression for schedule triggers |

## Field Schema Object (for input_schema / output_schema)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Machine-readable field key |
| `label` | string | Yes | Human display label |
| `type` | string | Yes | `text` \| `dropdown` \| `date` \| `number` \| `boolean` \| `url` |
| `required` | boolean | No | Default `false` |
| `options` | string[] | No | Choices for `dropdown` type only |
