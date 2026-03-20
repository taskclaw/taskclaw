# Adding a New Integration

This guide walks you through adding a new external integration to TaskClaw (e.g., Jira, Trello, Linear, Asana, GitHub Issues).

## Integration Architecture

TaskClaw uses a **unified integration system** with three layers:

1. **Integration Definition** — A catalog entry in `integration_definitions` describing the integration: its name, slug, categories, authentication type, credential fields, and a linked AI skill
2. **Integration Connection** — A user-configured instance in `integration_connections` with encrypted credentials, status, health monitoring, and a test conversation
3. **Source Adapter** (for task sync only) — A backend class implementing `SourceAdapter` that knows how to fetch/push tasks. Sources link to connections via `connection_id`

### Integration Categories

The `categories` field on a definition determines where it appears in the UI:

| Category | UI Section | Needs Adapter? | Examples |
|---|---|---|---|
| `source` | Task Sources | Yes | Notion, ClickUp, Jira |
| `communication` | Communication Tools | No | Telegram, WhatsApp, Slack |
| *(other/none)* | Marketplace | No | Discord, GitHub, Linear |

**All categories** share the same setup dialog (credentials + live test chat with OpenClaw). Source integrations additionally need an adapter for the sync engine.

## Prerequisites

- A working local development environment (see [development.md](../development.md))
- API documentation for the external service you are integrating
- An API key or OAuth credentials for testing

## Step-by-Step Guide

### Step 0: Create the Integration Definition (Database Migration)

Every integration needs a definition and a linked skill in the database. Create a SQL migration:

```sql
-- backend/supabase/migrations/YYYYMMDD000001_add_jira_integration.sql

-- 1. Create the skill with AI instructions
INSERT INTO public.skills (id, name, description, instructions, skill_type, is_system)
VALUES (
  'a1000000-0000-0000-0000-000000000099',  -- unique UUID
  'Jira Task Sync',
  'Syncs tasks bidirectionally with Jira projects',
  'You have access to a Jira integration. When the user asks about Jira tasks, project status, or sprint progress, use your knowledge of their connected Jira project to help. Fields: external_id maps to issue key (e.g. PROJ-123), status maps to Jira workflow states, priority maps to Jira priority levels.',
  'integration',
  true
);

-- 2. Create the integration definition
INSERT INTO public.integration_definitions (
  id, slug, name, description, icon, categories, auth_type,
  auth_config, config_fields, setup_guide, skill_id, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000099',
  'jira-source',                          -- unique slug
  'Jira',
  'Sync tasks from Jira projects',
  '🎯',                                   -- emoji icon
  '{source}',                             -- categories: 'source', 'communication', or other
  'api_key',                              -- 'api_key', 'oauth2', or 'none'
  '{
    "key_fields": [
      {"key": "api_key", "label": "API Token", "type": "password", "required": true, "placeholder": "Your Jira API token"},
      {"key": "email", "label": "Email", "type": "text", "required": true, "placeholder": "you@company.com"},
      {"key": "domain", "label": "Jira Domain", "type": "text", "required": true, "placeholder": "yourcompany.atlassian.net"}
    ]
  }'::jsonb,
  '[]'::jsonb,                            -- config_fields (non-credential settings)
  $guide$## Setup Guide: Jira

### Step 1: Get API Credentials
1. Log into your Atlassian account at **cloud.atlassian.com**
2. Go to **Account Settings** → **Security** → **API Tokens**
3. Click **Create API Token**, name it "TaskClaw", and copy the token

### Step 2: Connect in TaskClaw
1. Paste your **API Token**, **email**, and **Jira domain** in the fields
2. Click **Save & Connect**
3. Test the connection using the chat on the right$guide$,
  'a1000000-0000-0000-0000-000000000099',  -- links to the skill above
  true
);
```

The `auth_config` column contains a JSON object with a `key_fields` array. Each field in `key_fields` drives the **IntegrationSetupDialog** credentials form — rendered as inputs in the "Settings" tab. The `type` field supports `text`, `password`, `url`, `textarea`, and `number`.

The `setup_guide` column contains markdown rendered by `SetupGuideRenderer` in the "Setup Guide" tab. It supports `##` headings, `###` section dividers, numbered lists (with step badges), bullets, `**bold**`, `` `code` ``, and `[links](url)`.

The `config_fields` column stores optional non-credential settings (e.g., default channel, project ID) with the same field schema as `key_fields`.

For **non-source integrations** (marketplace or communication tools), you can stop here -- no adapter code is needed. The definition + skill + setup dialog + test chat is all that's required.

### Step 1: Create the Adapter Directory (Source Integrations Only)

```bash
mkdir backend/src/adapters/jira   # Replace "jira" with your provider name
```

### Step 2: Copy the Template

```bash
cp backend/src/adapters/__template__/template.adapter.ts \
   backend/src/adapters/jira/jira.adapter.ts
```

The template at `backend/src/adapters/__template__/template.adapter.ts` provides a fully commented skeleton with all required and optional methods.

### Step 3: Define Your Configuration Interface

In your adapter file, define what credentials and settings your integration needs:

```typescript
export interface JiraConfig extends SourceConfig {
  api_key: string;       // Jira API token
  domain: string;        // e.g. "yourcompany.atlassian.net"
  project_key: string;   // e.g. "PROJ"
  email: string;         // Jira account email (for basic auth)
}
```

These fields will be stored (encrypted at rest) when a user configures the integration in Settings > Integrations.

### Step 4: Implement the SourceAdapter Interface

Your adapter must implement the `SourceAdapter` interface. Here is the full interface for reference:

```typescript
export interface SourceAdapter {
  /**
   * Fetch all tasks from the external source, optionally applying pre-filters.
   */
  fetchTasks(config: SourceConfig, filters?: SyncFilter[]): Promise<ExternalTask[]>;

  /**
   * Push a task update to the external source (outbound sync).
   */
  pushTaskUpdate(config: SourceConfig, update: TaskUpdate): Promise<void>;

  /**
   * Validate the source configuration (test API credentials, check permissions).
   */
  validateConfig(config: SourceConfig): Promise<ValidationResult>;

  /**
   * Get the provider name (e.g., 'jira', 'notion', 'clickup').
   */
  getProviderName(): string;

  /**
   * (Optional) Fetch properties/schema from the external source.
   * Used by the UI to render dynamic filter builders and category mapping.
   */
  getProperties?(config: SourceConfig): Promise<any>;

  /**
   * (Optional) List workspaces/projects available with the given credentials.
   * Used by the "Add Source" wizard to let users browse and pick.
   */
  listWorkspaces?(config: SourceConfig): Promise<any>;
}
```

The full interface definition lives at:
`backend/src/adapters/interfaces/source-adapter.interface.ts`

### Step 5: Add the Decorators

Your adapter class must have both decorators:

```typescript
@Adapter('jira')    // Provider name (lowercase, used as the registry key)
@Injectable()
export class JiraAdapter implements SourceAdapter {
  private readonly logger = new Logger(JiraAdapter.name);

  getProviderName(): string {
    return 'jira';  // Must match the @Adapter() value
  }

  // ... implement other methods
}
```

### Step 6: Map Statuses

TaskClaw uses a fixed set of task statuses. You must map between your provider's statuses and these canonical values:

| TaskClaw Status | Typical Mapping |
|---|---|
| `To-Do` | Backlog, Open, New, Todo |
| `Today` | (No common external equivalent -- default to To-Do) |
| `In Progress` | In Progress, Active, Doing, Started |
| `AI Running` | (Internal -- not typically mapped from external) |
| `In Review` | In Review, Code Review, QA |
| `Done` | Done, Closed, Complete, Resolved |
| `Blocked` | Blocked, On Hold, Waiting |

Example implementation:

```typescript
private mapStatusFromProvider(jiraStatus: string): TaskStatus {
  const normalized = jiraStatus.toLowerCase();
  if (['done', 'closed', 'resolved'].some(s => normalized.includes(s))) return 'Done';
  if (['progress', 'active', 'doing'].some(s => normalized.includes(s))) return 'In Progress';
  if (['review', 'qa'].some(s => normalized.includes(s))) return 'In Review';
  if (['blocked', 'hold', 'waiting'].some(s => normalized.includes(s))) return 'Blocked';
  return 'To-Do';
}

private mapStatusToProvider(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    'To-Do': 'To Do',
    'Today': 'To Do',
    'In Progress': 'In Progress',
    'AI Running': 'In Progress',
    'In Review': 'In Review',
    'Done': 'Done',
    'Blocked': 'Blocked',
  };
  return map[status] || 'To Do';
}
```

### Step 7: Map Priorities

TaskClaw uses four priority levels. Map your provider's priorities accordingly:

| TaskClaw Priority | Typical Mapping |
|---|---|
| `Urgent` | Highest, Critical, P0 |
| `High` | High, P1 |
| `Medium` | Medium, Normal, P2 |
| `Low` | Low, Minor, P3, P4 |

Example:

```typescript
private mapPriorityFromProvider(jiraPriority: string | null): TaskPriority | undefined {
  if (!jiraPriority) return undefined;
  const normalized = jiraPriority.toLowerCase();
  if (['highest', 'critical', 'blocker'].includes(normalized)) return 'Urgent';
  if (normalized === 'high') return 'High';
  if (['medium', 'normal'].includes(normalized)) return 'Medium';
  if (['low', 'lowest', 'minor', 'trivial'].includes(normalized)) return 'Low';
  return 'Medium';
}
```

### Step 8: Implement fetchTasks

This is the core method for inbound sync. Return an array of `ExternalTask` objects:

```typescript
async fetchTasks(config: SourceConfig, filters?: SyncFilter[]): Promise<ExternalTask[]> {
  const cfg = config as JiraConfig;

  // Call Jira REST API to search for issues
  const response = await fetch(
    `https://${cfg.domain}/rest/api/3/search?jql=project=${cfg.project_key}`,
    {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${cfg.email}:${cfg.api_key}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const data = await response.json();

  return data.issues.map((issue: any) => ({
    external_id: issue.key,                                    // e.g. "PROJ-123"
    title: issue.fields.summary,
    status: this.mapStatusFromProvider(issue.fields.status.name),
    priority: this.mapPriorityFromProvider(issue.fields.priority?.name),
    completed: issue.fields.status.statusCategory.key === 'done',
    notes: issue.fields.description?.content?.[0]?.content?.[0]?.text || '',
    external_url: `https://${cfg.domain}/browse/${issue.key}`,
    due_date: issue.fields.duedate ? new Date(issue.fields.duedate) : undefined,
    completed_at: issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : undefined,
    metadata: {
      issue_type: issue.fields.issuetype?.name,
      labels: issue.fields.labels,
      assignee: issue.fields.assignee?.displayName,
    },
  }));
}
```

Handle pagination if the API paginates results. The sync engine calls `fetchTasks` once per sync cycle and expects all matching tasks to be returned.

### Step 9: Implement pushTaskUpdate

This method handles outbound sync (TaskClaw -> external service):

```typescript
async pushTaskUpdate(config: SourceConfig, update: TaskUpdate): Promise<void> {
  const cfg = config as JiraConfig;

  const body: any = { fields: {} };

  if (update.title) body.fields.summary = update.title;
  if (update.status) {
    // Jira requires a transition, not a direct status set.
    // You may need to fetch available transitions first.
    body.fields.status = { name: this.mapStatusToProvider(update.status) };
  }
  if (update.notes) body.fields.description = { /* ADF format */ };
  if (update.due_date) body.fields.duedate = update.due_date.toISOString().split('T')[0];

  await fetch(
    `https://${cfg.domain}/rest/api/3/issue/${update.external_id}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${cfg.email}:${cfg.api_key}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
}
```

### Step 10: Implement validateConfig

This method is called when a user saves their integration configuration. Make a lightweight API call to verify the credentials work:

```typescript
async validateConfig(config: SourceConfig): Promise<ValidationResult> {
  const cfg = config as JiraConfig;

  if (!cfg.api_key) return { valid: false, error: 'API key is required' };
  if (!cfg.domain) return { valid: false, error: 'Jira domain is required' };
  if (!cfg.project_key) return { valid: false, error: 'Project key is required' };
  if (!cfg.email) return { valid: false, error: 'Email is required' };

  try {
    const response = await fetch(`https://${cfg.domain}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${cfg.email}:${cfg.api_key}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      return { valid: false, error: `Authentication failed (HTTP ${response.status})` };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Connection failed: ${error.message}` };
  }
}
```

### Step 11: Implement Optional Methods

**`getProperties(config)`** -- Return the schema of the external project so the UI can build filter and mapping UIs:

```typescript
async getProperties(config: SourceConfig): Promise<any> {
  const cfg = config as JiraConfig;
  // Fetch Jira project fields/custom fields
  // Return array of { name, type, id, options? }
  return [];
}
```

**`listWorkspaces(config)`** -- Return available projects so the "Add Source" wizard can let users pick:

```typescript
async listWorkspaces(config: SourceConfig): Promise<any> {
  const cfg = config as JiraConfig;
  // Fetch all accessible Jira projects
  // Return array of { id, name, key }
  return [];
}
```

### Step 12: Register in the Module

Open `backend/src/adapters/adapters.module.ts` and add your adapter to the `providers` and `exports` arrays:

```typescript
import { JiraAdapter } from './jira/jira.adapter';

@Module({
  imports: [DiscoveryModule],
  providers: [AdapterRegistry, NotionAdapter, ClickUpAdapter, JiraAdapter],
  exports: [AdapterRegistry, NotionAdapter, ClickUpAdapter, JiraAdapter],
})
export class AdaptersModule implements OnModuleInit {
  // ... auto-discovery logic (no changes needed here)
}
```

The `@Adapter('jira')` decorator + the DiscoveryService handle auto-registration. You only need to add the class to the arrays so NestJS knows to instantiate it.

### Step 13: Write Tests

Create a test file at `backend/src/adapters/jira/jira.adapter.spec.ts`:

```typescript
import { JiraAdapter } from './jira.adapter';

describe('JiraAdapter', () => {
  let adapter: JiraAdapter;

  beforeEach(() => {
    adapter = new JiraAdapter();
  });

  it('should return the correct provider name', () => {
    expect(adapter.getProviderName()).toBe('jira');
  });

  it('should fail validation when API key is missing', async () => {
    const result = await adapter.validateConfig({ project_key: 'PROJ' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('API key');
  });

  it('should map external statuses correctly', () => {
    // Test your status mapping logic
  });

  it('should map external priorities correctly', () => {
    // Test your priority mapping logic
  });

  // Add integration tests with mocked HTTP calls for fetchTasks/pushTaskUpdate
});
```

Run tests with:

```bash
cd backend
pnpm test -- --testPathPattern=jira
```

### Step 14: Submit a Pull Request

Once your adapter is working:

1. Ensure all existing tests still pass: `cd backend && pnpm test`
2. Ensure linting passes: `cd backend && pnpm run lint`
3. Open a PR with:
   - A clear description of the integration
   - Instructions for testers to get API credentials
   - Any known limitations

## Complete File Checklist

### For all integrations (marketplace, communication, or source):

```
backend/supabase/migrations/
└── YYYYMMDD000001_add_jira_integration.sql   # Definition + skill seed
```

### For source integrations (task sync), additionally:

```
backend/src/adapters/jira/
├── jira.adapter.ts          # The adapter implementation
└── jira.adapter.spec.ts     # Tests
```

And one modified file:

```
backend/src/adapters/adapters.module.ts   # Added to providers + exports
```

## Reference Files

| File | Description |
|---|---|
| `backend/src/adapters/__template__/template.adapter.ts` | Commented starter template |
| `backend/src/adapters/interfaces/source-adapter.interface.ts` | The `SourceAdapter` interface and related types |
| `backend/src/adapters/adapter.decorator.ts` | The `@Adapter()` decorator |
| `backend/src/adapters/adapter.registry.ts` | The `AdapterRegistry` service |
| `backend/src/adapters/adapters.module.ts` | Module where adapters are registered |
| `backend/src/adapters/notion/notion.adapter.ts` | Notion adapter (real-world reference) |
| `backend/src/adapters/clickup/clickup.adapter.ts` | ClickUp adapter (real-world reference) |
| `backend/src/integrations/integrations.service.ts` | Unified integration service (connections, health checks, credentials) |
| `backend/src/integrations/integrations.controller.ts` | REST endpoints for definitions, connections, toggle, health-check |
| `frontend/src/components/integrations/integration-setup-dialog.tsx` | Setup dialog with credentials form + test chat |
| `frontend/src/components/integrations/integration-manager.tsx` | Integration marketplace catalog UI |
| `frontend/src/components/settings/comm-tools-section.tsx` | Communication tools section UI |
| `backend/supabase/migrations/20260320000002_seed_comm_source_definitions.sql` | Example of seeding definitions + skills |

## Type Reference

For quick reference, here are the key types your adapter will work with:

```typescript
// Task statuses (DB constraint)
type TaskStatus = 'To-Do' | 'Today' | 'In Progress' | 'AI Running' | 'In Review' | 'Done' | 'Blocked';

// Task priorities (DB constraint)
type TaskPriority = 'High' | 'Medium' | 'Low' | 'Urgent';

// What fetchTasks returns
interface ExternalTask {
  external_id: string;       // ID in the external system (e.g. "PROJ-123")
  title: string;
  status: TaskStatus;
  priority?: TaskPriority;
  completed: boolean;
  notes?: string;
  metadata?: Record<string, any>;
  external_url?: string;
  due_date?: Date;
  completed_at?: Date;
  last_synced_at?: Date;
}

// What pushTaskUpdate receives
interface TaskUpdate {
  external_id: string;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  completed?: boolean;
  notes?: string;
  due_date?: Date;
}

// What validateConfig returns
interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Pre-filters for fetchTasks
interface SyncFilter {
  property: string;
  type: string;       // 'checkbox' | 'select' | 'status' | 'number' | 'date' | 'text' | etc.
  condition: string;  // 'equals' | 'does_not_equal' | 'contains' | 'is_empty' | etc.
  value: any;
}
```

## API Endpoints

### Integration System (all types)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/accounts/:id/integrations/definitions` | List all definitions (add `?category=source` to filter) |
| `GET` | `/accounts/:id/integrations/connections` | List all connections (add `?category=communication` to filter) |
| `POST` | `/accounts/:id/integrations/connections` | Create a connection with `{ definition_id, credentials, config }` |
| `PATCH` | `/accounts/:id/integrations/connections/:connId` | Update connection credentials/config |
| `POST` | `/accounts/:id/integrations/connections/:connId/toggle` | Toggle connection on/off (`{ enabled: true/false }`) |
| `POST` | `/accounts/:id/integrations/connections/:connId/health-check` | Trigger immediate health check |

### Source Sync (source category only)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/accounts/:id/sources` | Create a source with `{ provider: 'jira', config: { ... }, connection_id: '...' }` |
| `POST` | `/accounts/:id/sources/jira/workspaces` | List available workspaces (if `listWorkspaces` is implemented) |
| `POST` | `/accounts/:id/sources/jira/properties` | Fetch schema/properties (if `getProperties` is implemented) |
| `POST` | `/accounts/:id/sources/:sourceId/sync` | Trigger a manual sync |

## Tips

- **Handle pagination**: Many APIs paginate results. Make sure `fetchTasks` retrieves all pages.
- **Rate limiting**: External APIs have rate limits. Use delays or batching if needed.
- **Error handling**: Wrap API calls in try/catch and return meaningful error messages in `validateConfig`.
- **Metadata**: Store provider-specific fields in `metadata` -- they are preserved but not displayed by default.
- **External URL**: Always set `external_url` so users can click through to the original item.
- **Idempotent sync**: The sync engine matches tasks by `external_id`. Ensure this is stable and unique per task.
