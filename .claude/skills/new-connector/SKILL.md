---
name: new-connector
description: >
  Create a new integration connector for the TaskClaw marketplace.
  Walks you through defining the integration, writing the database migration,
  implementing the source adapter (if needed), and registering everything.
license: MIT
triggers:
  - new connector
  - new integration
  - add integration
  - create connector
  - add a connector
  - build integration
  - new marketplace integration
  - add source adapter
metadata:
  version: 1.0.0
  author: TaskClaw
  category: new-connector
  domain: development
  updated: 2026-03-20
---

# New Connector

Create a new integration connector for the TaskClaw marketplace. This skill walks you step-by-step through defining the integration, writing the database seed migration, optionally implementing a source adapter, and registering everything correctly.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Wizard Flow](#wizard-flow)
- [Reference](#reference)

---

## Quick Start

1. User describes what external service they want to integrate
2. You determine the integration category and auth type
3. You generate the database migration (definition + skill)
4. For source integrations: you scaffold the adapter
5. You register everything and verify the build

---

## Wizard Flow

Follow these phases **in order**.

### Phase 1: Discovery

Ask the user:

- "What service are you integrating?" (e.g., Jira, Trello, HubSpot, SendGrid)
- "What will TaskClaw do with this integration?" (sync tasks, send messages, fetch data, post content)
- "Do you have API documentation or credentials for testing?"

Based on the answers, determine the **category**:

| If the integration... | Category | Slug Convention | Needs Adapter? |
|---|---|---|---|
| Syncs tasks bidirectionally | `source` | `{name}-source` | Yes |
| Sends/receives messages via OpenClaw | `communication` | `{name}-comm` | No |
| Everything else (API tools, webhooks, etc.) | *(none — marketplace)* | `{name}` | No |

Tell the user the category and confirm before proceeding.

### Phase 2: Integration Definition

Design the definition fields:

1. **Slug**: unique kebab-case identifier (e.g., `jira-source`, `sendgrid`, `hubspot`)
2. **Name**: human-readable (e.g., "Jira", "SendGrid")
3. **Description**: one-line purpose
4. **Icon**: emoji (e.g., 🎯, 📧, 📊)
5. **Auth Type**: `api_key`, `oauth2`, or `none`
6. **Auth Config** (for `api_key`/`basic`): define `key_fields` — what credentials the user needs to provide:
   ```json
   {
     "key_fields": [
       {
         "key": "api_key",
         "label": "API Key",
         "type": "password",
         "required": true,
         "placeholder": "sk-...",
         "help_text": "Find this at Settings > API Keys"
       }
     ]
   }
   ```
   Field types: `text`, `password`, `url`, `textarea`, `number`
7. **Config Fields** (optional): non-credential settings like default channels, project IDs
8. **Setup Guide** (recommended): markdown instructions for users. Supports:
   - `##` section headings
   - `###` divider headings (rendered as centered labels with lines)
   - Numbered lists (rendered with circular step badges)
   - Bullet lists (with indent support for sub-items)
   - `**bold**`, `` `inline code` ``, `[links](url)`

Ask: "What credentials does this service need? Walk me through the authentication."

### Phase 3: AI Skill Instructions

Every integration gets a linked AI skill — this is the system prompt injected into OpenClaw when the integration is active on a board. Write instructions that:

1. Describe what the integration can do
2. Reference the credential field names
3. Explain how external data maps to TaskClaw concepts
4. Include formatting guidance for the AI's responses

Example:
```
You have access to a Jira integration for project {project_key}.
When the user asks about Jira tasks, sprint status, or project progress,
use your knowledge of their connected Jira project. Issue keys follow the
format PROJ-123. Map Jira statuses to TaskClaw columns: "To Do" → To-Do,
"In Progress" → In Progress, "Done" → Done.
```

### Phase 4: Generate Migration

Generate the SQL migration file at:
`backend/supabase/migrations/YYYYMMDD000001_add_{slug}_integration.sql`

The migration must:
1. Insert the skill into `public.skills` with `skill_type = 'integration'` and `is_system = true`
2. Insert the definition into `public.integration_definitions` with `is_system = true` and `account_id = NULL`
3. Use `$inst$...$inst$` dollar quoting for skill instructions
4. Use `'[...]'::jsonb` for `key_fields` and `config_fields`

Template:
```sql
-- Add {Name} integration definition + skill

-- 1. Create the integration skill
INSERT INTO public.skills (id, name, description, instructions, skill_type, is_system)
VALUES (
  '{uuid1}',
  '{Name} Integration',
  '{One-line description}',
  $inst${AI instructions here}$inst$,
  'integration',
  true
);

-- 2. Create the integration definition
INSERT INTO public.integration_definitions (
  id, slug, name, description, icon, categories, auth_type,
  auth_config, config_fields, setup_guide, skill_id, is_system
) VALUES (
  '{uuid2}',
  '{slug}',
  '{Name}',
  '{Description}',
  '{emoji}',
  '{{category}}',          -- e.g. '{source}', '{communication}', or '{}'
  '{auth_type}',
  '{auth_config_json}'::jsonb,
  '{config_fields_json}'::jsonb,
  $guide${setup_guide_markdown}$guide$,
  '{uuid1}',
  true
);
```

**Important**: Use `auth_config` (not `key_fields`) as the column name. The `auth_config` column contains a JSON object with a `key_fields` array inside.

### Phase 5: Source Adapter (Source Category Only)

If category is `source`, scaffold the adapter:

1. Create directory: `backend/src/adapters/{name}/`
2. Copy template: `backend/src/adapters/__template__/template.adapter.ts`
3. Implement:
   - Config interface extending `SourceConfig`
   - `@Adapter('{name}')` + `@Injectable()` decorators
   - `getProviderName()` → `'{name}'`
   - `fetchTasks()` — fetch from external API, map to `ExternalTask[]`
   - `pushTaskUpdate()` — push changes back to external service
   - `validateConfig()` — test credentials with a lightweight API call
   - `listWorkspaces()` (optional) — let users browse projects/databases
   - `getProperties()` (optional) — return schema for filter builders
4. Status mapping: Map provider statuses → TaskClaw (`To-Do`, `In Progress`, `In Review`, `Done`, `Blocked`)
5. Priority mapping: Map provider priorities → TaskClaw (`Urgent`, `High`, `Medium`, `Low`)
6. Register in `backend/src/adapters/adapters.module.ts` (add to `providers` + `exports`)

Reference adapters:
- `backend/src/adapters/notion/notion.adapter.ts`
- `backend/src/adapters/clickup/clickup.adapter.ts`
- `backend/src/adapters/interfaces/source-adapter.interface.ts`

### Phase 6: Verify & Test

1. Apply migration: `docker exec -i taskclaw-db-1 psql -U postgres -d postgres < backend/supabase/migrations/{file}.sql`
2. TypeScript build: `cd backend && npx tsc --noEmit`
3. For source adapters: `cd backend && pnpm test -- --testPathPattern={name}`
4. Manual test: Open Settings → Integrations, find the new definition, connect with credentials, test via chat

Tell the user:
> Your integration is ready! Navigate to **Settings → Integrations** to find it in the catalog. Connect your credentials and use the test chat to verify it works with your OpenClaw instance.

For source integrations, also:
> To sync tasks, go to **Settings → Task Sources → Add Source**, select **{Name}**, connect, choose your project/database, and assign it to a category.

---

## Reference

### File Checklist

**All integrations:**
```
backend/supabase/migrations/
└── YYYYMMDD000001_add_{slug}_integration.sql  # Definition + skill seed
```

**Source integrations additionally:**
```
backend/src/adapters/{name}/
├── {name}.adapter.ts       # SourceAdapter implementation
└── {name}.adapter.spec.ts  # Tests
backend/src/adapters/adapters.module.ts  # Register in providers + exports
```

### Key Types

```typescript
// Auth config structure (stored in integration_definitions.auth_config)
interface AuthConfigApiKey {
  key_fields: Array<{
    key: string;        // Field identifier
    label: string;      // Display label
    type: 'text' | 'password' | 'url' | 'textarea' | 'number';
    required: boolean;
    placeholder?: string;
    help_text?: string;
  }>;
}

// Config fields structure (stored in integration_definitions.config_fields)
// Same schema as key_fields — non-credential settings

// Integration categories
type IntegrationCategory = 'source' | 'communication';  // or omit for marketplace
```

### Existing Integrations (for reference)

| Slug | Category | Auth | Service |
|---|---|---|---|
| `notion-source` | source | api_key | Notion |
| `clickup-source` | source | api_key | ClickUp |
| `telegram-comm` | communication | none | Telegram Bot |
| `whatsapp-comm` | communication | none | WhatsApp Business |
| `slack-comm` | communication | none | Slack Bot |
| `discord` | marketplace | api_key | Discord Bot |
| `github` | marketplace | api_key | GitHub |
| `slack` | marketplace | oauth2 | Slack App |
| `linear` | marketplace | api_key | Linear |
| `google-calendar` | marketplace | oauth2 | Google Calendar |
| ... | ... | ... | (17 total marketplace definitions) |

### Related Documentation

- [Adding an Integration](docs/integrations/adding-an-integration.md) — full developer guide
- [Integration Unification](docs/implementations/integration-unification.md) — architecture overview
- [Template Adapter](backend/src/adapters/__template__/template.adapter.ts) — starter code
