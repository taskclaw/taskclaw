# OTT Dashboard — Integration, Sync Filters & Category Mapping

## Purpose of This Document

This document describes how the **OTT Dashboard** project implements external source integration with **dynamic sync filters** and **category property mapping**. The OTT approach prioritizes a simple, user-friendly interface that lets non-technical users configure *what* gets synced and *how* tasks are categorized — without writing code.

Brain Connectors can adopt these patterns to give connector authors and end-users the same level of configurability.

---

## Architecture Overview

OTT uses a **Source → Adapter → Sync → Tasks** pipeline:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL PLATFORM                                 │
│  (Notion database, ClickUp list, etc.)                                  │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     SOURCE ADAPTER (per provider)                        │
│                                                                          │
│  1. getProperties(config) → Discover schema (fields, types, options)    │
│  2. fetchTasks(config, filters?) → Pull data with pre-filters           │
│  3. pushTaskUpdate(config, update) → Write changes back                 │
│  4. validateConfig(config) → Test credentials                           │
│  5. listWorkspaces?(config) → Browse available databases/lists          │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │ ExternalTask[]
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       SYNC SERVICE (orchestrator)                        │
│                                                                          │
│  1. Load source config (including sync_filters + category_property)     │
│  2. Call adapter.fetchTasks(config, sync_filters)                       │
│  3. For each task: resolve category via property mapping                │
│  4. Upsert into local tasks table                                       │
│  5. Record sync job for audit trail                                     │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    LOCAL DATABASE (Supabase/Postgres)                    │
│                                                                          │
│  sources   → provider config + sync_filters + category_property         │
│  tasks     → synced records with category_id + metadata                 │
│  sync_jobs → audit trail (created/updated/failed counts)                │
└──────────────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- **Filters are applied server-side** at the external platform's API level (not post-fetch), reducing data transfer and processing
- **Category mapping is resolved at sync time**, not at display time — tasks are assigned to local categories during upsert
- **Schema discovery is dynamic** — the UI fetches property definitions from the external source at runtime, so filter/mapping UIs adapt to any database structure
- **Adapters are auto-discovered** via a decorator pattern — adding a new provider requires zero framework changes

---

## 1. The Adapter Interface

Every external provider implements one interface. This is the entire contract:

```typescript
// backend/src/adapters/interfaces/source-adapter.interface.ts

export interface SyncFilter {
  property: string;    // Field name in external system (e.g., "Horizon", "Status")
  type: string;        // Property type: 'checkbox' | 'select' | 'multi_select' | 'status' | 'number' | 'date' | 'rich_text' | 'title'
  condition: string;   // Operator: 'equals' | 'does_not_equal' | 'contains' | 'is_empty' | 'is_not_empty' | 'greater_than' | 'less_than'
  value: any;          // The filter value (boolean for checkbox, string for select, etc.)
}

export interface SourceAdapter {
  fetchTasks(config: SourceConfig, filters?: SyncFilter[]): Promise<ExternalTask[]>;
  pushTaskUpdate(config: SourceConfig, update: TaskUpdate): Promise<void>;
  validateConfig(config: SourceConfig): Promise<ValidationResult>;
  getProviderName(): string;

  // Optional — enables dynamic filter builder UI + category mapping UI
  getProperties?(config: SourceConfig): Promise<SourceProperty[]>;
  listWorkspaces?(config: SourceConfig): Promise<Workspace[]>;
}
```

The `SyncFilter` type is **provider-agnostic**. Each adapter converts it to the platform's native filter format internally:

| Platform | `SyncFilter` becomes... |
|----------|------------------------|
| Notion | `{ property: "X", select: { equals: "Y" } }` inside Notion API filter |
| ClickUp | Query params: `&statuses[]=Y&priorities[]=2` |
| Future | Whatever the platform's API expects |

---

## 2. Schema Discovery (`getProperties`)

The magic of the dynamic filter UI starts here. When a user opens the Integration tab, the frontend calls:

```
GET /accounts/:accountId/sources/:sourceId/properties
```

The backend delegates to the adapter:

```typescript
// backend/src/sources/sources.controller.ts

@Get(':id/properties')
async getSourceProperties(@Req() req, @Param('accountId') accountId, @Param('id') id) {
  const source = await this.sourcesService.findOneUnmasked(req.user.id, accountId, id);
  const adapter = this.adapterRegistry.getAdapter(source.provider);

  if (!adapter.getProperties) {
    return { error: `Adapter '${source.provider}' does not support getProperties` };
  }

  return await adapter.getProperties(source.config);
}
```

### Notion Implementation

The Notion adapter fetches the database schema and normalizes it:

```typescript
// backend/src/adapters/notion/notion.adapter.ts

async getProperties(config: SourceConfig): Promise<any> {
  const client = this.createClient(config);
  const dsId = config.data_source_id || config.database_id;

  // Fetch database schema
  const ds = await client.dataSources.retrieve({ data_source_id: dsId });
  const rawProperties = ds.properties || {};

  // Normalize to universal format
  return Object.entries(rawProperties).map(([name, prop]) => {
    const result: any = { name, type: prop.type, id: prop.id };

    // Include options for select/multi_select/status (used by filter value dropdowns)
    if (prop.type === 'select' && prop.select?.options) {
      result.options = prop.select.options.map(o => ({ name: o.name, color: o.color }));
    }
    if (prop.type === 'multi_select' && prop.multi_select?.options) {
      result.options = prop.multi_select.options.map(o => ({ name: o.name, color: o.color }));
    }
    if (prop.type === 'status' && prop.status?.options) {
      result.options = prop.status.options.map(o => ({ name: o.name, color: o.color }));
      result.groups = prop.status.groups?.map(g => ({ name: g.name, option_ids: g.option_ids }));
    }

    return result;
  });
}
```

### Returned Shape (Universal)

```typescript
interface SourceProperty {
  name: string                      // "Horizon", "Category", "Status", "Priority"
  type: string                      // "select", "multi_select", "checkbox", "number", "date", "rich_text", "title", "status"
  id: string                        // Platform-specific property ID
  options?: Array<{                 // Only for select/multi_select/status
    name: string                    // "Present", "Future", "Past"
    color?: string                  // "green", "blue", "red" (platform color names)
    value?: any                     // Optional computed value
  }>
  groups?: Array<{                  // Only for status type (Notion status groups)
    name: string
    option_ids: string[]
  }>
}
```

This shape drives both the **filter builder UI** and the **category property mapping dropdown**.

---

## 3. Sync Filters — The Filter Builder UI

### Frontend Component Structure

```
CategoryDialog (Integration Tab)
  └── Filter Section
       ├── "Add Filter" button
       └── FilterRow[] (one per active filter)
            ├── Property selector (dropdown of SourceProperty[])
            ├── Condition selector (depends on property type)
            ├── Value input (adapts to type: checkbox toggle, select dropdown, date picker, text)
            └── Remove button
```

### Filter Conditions Per Property Type

The frontend defines which conditions are available for each property type:

```typescript
// frontend/src/app/dashboard/settings/categories/page.tsx

const FILTER_CONDITIONS: Record<string, { label: string; value: string }[]> = {
  checkbox: [
    { label: 'Is', value: 'equals' },
  ],
  select: [
    { label: 'Is', value: 'equals' },
    { label: 'Is not', value: 'does_not_equal' },
    { label: 'Is empty', value: 'is_empty' },
    { label: 'Is not empty', value: 'is_not_empty' },
  ],
  multi_select: [
    { label: 'Contains', value: 'contains' },
    { label: 'Does not contain', value: 'does_not_contain' },
    { label: 'Is empty', value: 'is_empty' },
    { label: 'Is not empty', value: 'is_not_empty' },
  ],
  status: [
    { label: 'Is', value: 'equals' },
    { label: 'Is not', value: 'does_not_equal' },
  ],
  rich_text: [
    { label: 'Contains', value: 'contains' },
    { label: 'Does not contain', value: 'does_not_contain' },
    { label: 'Is empty', value: 'is_empty' },
    { label: 'Is not empty', value: 'is_not_empty' },
  ],
  number: [
    { label: 'Equals', value: 'equals' },
    { label: 'Does not equal', value: 'does_not_equal' },
    { label: 'Greater than', value: 'greater_than' },
    { label: 'Less than', value: 'less_than' },
  ],
  date: [
    { label: 'Is empty', value: 'is_empty' },
    { label: 'Is not empty', value: 'is_not_empty' },
  ],
  title: [
    { label: 'Contains', value: 'contains' },
    { label: 'Does not contain', value: 'does_not_contain' },
  ],
};
```

### Smart Value Input

The `FilterRow` component adapts the value input based on property type:

```typescript
// frontend/src/app/dashboard/settings/categories/page.tsx — FilterRow component

function FilterRow({ filter, properties, onChange, onRemove }) {
  const selectedProp = properties.find(p => p.name === filter.property);
  const propType = selectedProp?.type || filter.type || '';
  const conditions = FILTER_CONDITIONS[propType] || [];
  const needsValue = filter.condition && !['is_empty', 'is_not_empty'].includes(filter.condition);
  const hasOptions = selectedProp?.options?.length > 0;

  return (
    <div className="flex items-center gap-2">
      {/* 1. Property selector — shows all properties with type badge */}
      <Select value={filter.property} onValueChange={v => {
        const prop = properties.find(p => p.name === v);
        onChange({ property: v, type: prop?.type || '', condition: '', value: '' });
      }}>
        {properties.map(p => (
          <SelectItem key={p.id} value={p.name}>
            <Badge>{p.type}</Badge> {p.name}
          </SelectItem>
        ))}
      </Select>

      {/* 2. Condition selector — filtered by property type */}
      <Select value={filter.condition} onValueChange={v => onChange({ condition: v, value: '' })}>
        {conditions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
      </Select>

      {/* 3. Value input — adapts to type */}
      {needsValue && (
        propType === 'checkbox' ? (
          <Select> <SelectItem value="true">Checked</SelectItem> <SelectItem value="false">Unchecked</SelectItem> </Select>
        ) : hasOptions ? (
          <Select>  {/* Shows option names with color dots */}
            {selectedProp.options.map(o => (
              <SelectItem key={o.name} value={o.name}>
                <ColorDot color={o.color} /> {o.name}
              </SelectItem>
            ))}
          </Select>
        ) : propType === 'date' ? (
          <Input type="date" />
        ) : (
          <Input type={propType === 'number' ? 'number' : 'text'} />
        )
      )}

      {/* 4. Remove button */}
      <Button onClick={onRemove}><Trash2 /></Button>
    </div>
  );
}
```

### How Filters Are Saved

Filters are stored as a JSONB array on the `sources` table:

```sql
-- Database schema
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS sync_filters jsonb NOT NULL DEFAULT '[]';
```

Example stored value:
```json
[
  { "property": "Horizon", "type": "select", "condition": "equals", "value": "Present" },
  { "property": "Category", "type": "select", "condition": "equals", "value": "Microfactory" }
]
```

The frontend saves via:
```
PATCH /accounts/:accountId/sources/:sourceId
Body: { sync_filters: [...], category_property: "Category" }
```

---

## 4. How Filters Are Applied During Sync

### Sync Service → Adapter Pipeline

```typescript
// backend/src/sync/sync.service.ts — performInboundSync()

private async performInboundSync(source: any): Promise<SyncResult> {
  const adapter = this.adapterRegistry.getAdapter(source.provider);

  // Extract sync_filters from source config (JSONB column)
  const syncFilters = source.sync_filters?.length > 0
    ? source.sync_filters
    : undefined;

  // Pass filters to adapter — they are applied at the API level
  const externalTasks = await adapter.fetchTasks(source.config, syncFilters);

  // ... upsert tasks ...
}
```

### Notion Adapter — Filter Conversion

The Notion adapter converts the universal `SyncFilter[]` to Notion's native filter format:

```typescript
// backend/src/adapters/notion/notion.adapter.ts

async fetchTasks(config: SourceConfig, filters?: SyncFilter[]): Promise<ExternalTask[]> {
  const client = this.createClient(config);

  // Convert SyncFilter[] → Notion API filter object
  const notionFilter = this.buildNotionFilter(filters);

  // Fetch with server-side filtering
  const response = await client.dataSources.query({
    data_source_id: config.data_source_id,
    page_size: 100,
    filter: notionFilter,  // Applied at Notion API level — only matching records returned
  });

  return response.results.map(page => this.mapNotionPageToTask(page));
}

private buildNotionFilter(filters?: SyncFilter[]): any | null {
  if (!filters?.length) return null;

  const conditions = filters
    .map(f => this.buildSingleNotionCondition(f))
    .filter(Boolean);

  if (conditions.length === 0) return null;
  if (conditions.length === 1) return conditions[0];
  return { and: conditions };  // Multiple filters → AND logic
}

private buildSingleNotionCondition(f: SyncFilter): any {
  // Universal SyncFilter → Notion property filter
  // e.g. { property: "Horizon", type: "select", condition: "equals", value: "Present" }
  //   → { property: "Horizon", select: { equals: "Present" } }
  switch (f.type) {
    case 'checkbox':    return { property: f.property, checkbox: { [f.condition]: f.value } };
    case 'select':      return { property: f.property, select: { [f.condition]: f.value } };
    case 'multi_select': return { property: f.property, multi_select: { [f.condition]: f.value } };
    case 'status':      return { property: f.property, status: { [f.condition]: f.value } };
    case 'rich_text':   return { property: f.property, rich_text: { [f.condition]: f.value } };
    case 'number':      return { property: f.property, number: { [f.condition]: f.value } };
    case 'date':        return { property: f.property, date: { [f.condition]: f.value } };
    case 'title':       return { property: f.property, title: { [f.condition]: f.value } };
    default:            return { property: f.property, [f.type]: { [f.condition]: f.value } };
  }
}
```

**Important:** Filters are applied at the **API query level**. The Notion API only returns records matching all conditions. This means:
- Less data transferred over the network
- Faster sync (no need to fetch-then-filter thousands of records)
- The `AND` operator is used when multiple filters exist

---

## 5. Category Property Mapping

This feature lets users map an external property (e.g., Notion's "Category" select field) to local categories. During sync, tasks are automatically assigned to the matching local category.

### Database Schema

```sql
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS category_property text DEFAULT NULL;
```

### How It Works During Sync

```typescript
// backend/src/sync/sync.service.ts — performInboundSync()

// 1. Build a lookup map: category name (lowercase) → category ID
const { data: categories } = await this.db
  .from('categories')
  .select('id, name')
  .eq('account_id', source.account_id);

const categoryMap = new Map(
  (categories || []).map(c => [c.name.toLowerCase(), c.id])
);

// 2. For each external task, resolve category
for (const externalTask of externalTasks) {
  let categoryId = source.category_id;  // Default: source's assigned category

  // Read the configured property name (e.g., "Horizon", "Category", "Project")
  const categoryPropertyName = source.category_property || 'category';

  // Look up the value in the task's metadata
  const externalCategory = externalTask.metadata?.[categoryPropertyName]
    || externalTask.metadata?.category;  // Fallback

  if (externalCategory) {
    // Case-insensitive match against local category names
    const matchedCategoryId = categoryMap.get(String(externalCategory).toLowerCase());
    if (matchedCategoryId) {
      categoryId = matchedCategoryId;  // Override with matched category
    }
  }

  // Upsert task with resolved category
  await this.db.from('tasks').upsert({
    category_id: categoryId,
    // ... other fields
  });
}
```

### How Metadata Gets Populated

The adapter extracts ALL select/multi_select/checkbox/number properties into metadata:

```typescript
// backend/src/adapters/notion/notion.adapter.ts — mapNotionPageToTask()

private mapNotionPageToTask(page: PageObjectResponse): ExternalTask {
  const props = page.properties;
  const metadata: Record<string, any> = {};

  // Dynamically extract every property value into metadata
  for (const [propName, propValue] of Object.entries(props)) {
    const type = propValue.type;
    if (type === 'select')       metadata[propName] = this.getSelect(propValue);
    if (type === 'multi_select') metadata[propName] = this.getMultiSelect(propValue);
    if (type === 'checkbox')     metadata[propName] = this.getCheckbox(propValue);
    if (type === 'number')       metadata[propName] = this.getNumber(propValue);
  }

  return {
    external_id: page.id,
    title: this.getTitle(props['Task']) || this.getTitle(props['Name']) || 'Untitled',
    status: this.mapStatusFromNotion(this.getSelect(props['Status'])),
    metadata,  // Contains all property values for category resolution
    // ...
  };
}
```

### Example Flow

1. Notion database has a "Horizon" select property with options: "Present", "Future", "Past"
2. OTT has categories: "Present" (green), "Future" (blue), "Past" (gray)
3. User sets `category_property = "Horizon"` in the Integration tab
4. During sync:
   - Notion task with `Horizon = "Present"` → assigned to OTT category "Present"
   - Notion task with `Horizon = "Future"` → assigned to OTT category "Future"
   - Notion task with `Horizon = "Unknown"` → falls back to source's default category

### Frontend: Category Property Mapping UI

The dropdown only shows properties that can be used for mapping (select, multi_select, status):

```typescript
// frontend/src/app/dashboard/settings/categories/page.tsx — Integration Tab

// Filter properties to only show mappable types
const selectProperties = properties.filter(p =>
  ['select', 'multi_select', 'status'].includes(p.type)
);

<Select
  value={sourceCategoryProps[activeSourceId] || '__none'}
  onValueChange={v => setSourceCategoryProps({ ...sourceCategoryProps, [activeSourceId]: v })}
>
  <SelectItem value="__none">None (use source default)</SelectItem>
  {selectProperties.map(p => (
    <SelectItem key={p.id} value={p.name}>
      <Badge>{p.type}</Badge> {p.name}
    </SelectItem>
  ))}
</Select>
```

---

## 6. Adapter Auto-Discovery Pattern

OTT uses a decorator + module init pattern to auto-register adapters. No manual wiring needed.

### The Decorator

```typescript
// backend/src/adapters/adapter.decorator.ts

export const ADAPTER_METADATA = 'ADAPTER_PROVIDER_NAME';

export const Adapter = (providerName: string) =>
  SetMetadata(ADAPTER_METADATA, providerName);
```

### The Registry

```typescript
// backend/src/adapters/adapter.registry.ts

@Injectable()
export class AdapterRegistry {
  private adapters: Map<string, SourceAdapter> = new Map();

  register(provider: string, adapter: SourceAdapter) {
    this.adapters.set(provider, adapter);
  }

  getAdapter(provider: string): SourceAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new NotFoundException(`No adapter for: ${provider}`);
    return adapter;
  }

  hasAdapter(provider: string): boolean {
    return this.adapters.has(provider);
  }
}
```

### Auto-Discovery at Module Init

```typescript
// backend/src/adapters/adapters.module.ts

@Module({
  imports: [DiscoveryModule],
  providers: [AdapterRegistry, NotionAdapter, ClickUpAdapter],
  exports: [AdapterRegistry, NotionAdapter, ClickUpAdapter],
})
export class AdaptersModule implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly registry: AdapterRegistry,
  ) {}

  onModuleInit() {
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      const providerName = this.reflector.get<string>(ADAPTER_METADATA, metatype);
      if (providerName) {
        this.registry.register(providerName, instance as any);
      }
    }
  }
}
```

### Adding a New Provider

```typescript
// backend/src/adapters/jira/jira.adapter.ts

@Adapter('jira')       // ← This is all you need for auto-registration
@Injectable()
export class JiraAdapter implements SourceAdapter {
  async fetchTasks(config, filters?) { /* ... */ }
  async getProperties(config) { /* ... */ }   // Enables filter UI
  // ...
}
```

Then add to module providers array — that's it.

---

## 7. Database Schema

### Sources Table

```sql
CREATE TABLE public.sources (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id),
  category_id    UUID NOT NULL REFERENCES public.categories(id),  -- Default category
  provider       TEXT NOT NULL CHECK (provider IN ('notion', 'clickup', 'trello', 'local')),
  config         JSONB NOT NULL DEFAULT '{}',                      -- Provider credentials (encrypted)
  sync_filters   JSONB NOT NULL DEFAULT '[]',                      -- Pre-filters (SyncFilter[])
  category_property TEXT DEFAULT NULL,                              -- Property name for category mapping
  sync_status    TEXT NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error', 'disabled')),
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  sync_interval_minutes INTEGER DEFAULT 30,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
```

### Tasks Table

```sql
CREATE TABLE public.tasks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id     UUID NOT NULL,
  category_id    UUID REFERENCES public.categories(id),     -- Resolved via category_property mapping
  source_id      UUID REFERENCES public.sources(id),
  external_id    TEXT,                                        -- ID in external system
  title          TEXT NOT NULL,
  status         TEXT CHECK (status IN ('To-Do', 'Today', 'In Progress', 'Done', 'Blocked', 'AI Running', 'In Review')),
  priority       TEXT CHECK (priority IN ('High', 'Medium', 'Low', 'Urgent')),
  completed      BOOLEAN DEFAULT false,
  notes          TEXT,
  metadata       JSONB DEFAULT '{}',                          -- All external properties (used for category resolution)
  external_url   TEXT,
  due_date       TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  UNIQUE(source_id, external_id)                              -- Dedup: one local task per external record per source
);
```

### Sync Jobs (Audit Trail)

```sql
CREATE TABLE public.sync_jobs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id      UUID NOT NULL REFERENCES public.sources(id),
  direction      TEXT CHECK (direction IN ('inbound', 'outbound')),
  status         TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  tasks_synced   INTEGER DEFAULT 0,
  tasks_created  INTEGER DEFAULT 0,
  tasks_updated  INTEGER DEFAULT 0,
  tasks_deleted  INTEGER DEFAULT 0,
  error_log      TEXT,
  started_at     TIMESTAMPTZ DEFAULT now(),
  completed_at   TIMESTAMPTZ
);
```

---

## 8. API Endpoints

### Source Management

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/accounts/:accountId/sources` | List all sources |
| `GET` | `/accounts/:accountId/sources/:id` | Get single source |
| `POST` | `/accounts/:accountId/sources` | Create source |
| `PATCH` | `/accounts/:accountId/sources/:id` | Update source (sync_filters, category_property, etc.) |
| `DELETE` | `/accounts/:accountId/sources/:id` | Delete source |

### Schema Discovery

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/accounts/:accountId/sources/:id/properties` | Fetch properties from existing source |
| `POST` | `/accounts/:accountId/sources/:provider/properties` | Fetch properties from raw credentials (before source creation) |
| `POST` | `/accounts/:accountId/sources/:provider/workspaces` | List available databases/workspaces |

### Sync Triggers

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/accounts/:accountId/sync/sources/:sourceId` | Manual sync trigger |
| `GET` | `/accounts/:accountId/sync/status` | Get sync status for all sources |

### Update Source DTO (Filter + Mapping Config)

```typescript
// backend/src/sources/dto/update-source.dto.ts

export class UpdateSourceDto {
  @IsOptional() @IsUUID()    category_id?: string;
  @IsOptional() @IsObject()  config?: Record<string, any>;
  @IsOptional() @IsInt()     sync_interval_minutes?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;

  @IsOptional() @IsArray()
  sync_filters?: Array<{
    property: string;
    type: string;
    condition: string;
    value: any;
  }>;

  @IsOptional() @IsString()
  category_property?: string | null;
}
```

---

## 9. Scheduled & Queue-Based Sync

OTT supports both scheduled and manual sync with optional BullMQ queue:

```typescript
// backend/src/sync/sync.service.ts

@Cron(CronExpression.EVERY_5_MINUTES)
async handleScheduledSync() {
  const { data: sources } = await this.db
    .from('sources')
    .select('*')
    .eq('is_active', true)
    .neq('sync_status', 'syncing');

  for (const source of sources || []) {
    const minutesSinceSync = (now - lastSync) / 60000;

    if (minutesSinceSync >= (source.sync_interval_minutes || 30)) {
      await this.addSyncJob(source.id, source.account_id, 'cron');
    }
  }
}

// Routes through BullMQ if Redis available, otherwise direct execution
async addSyncJob(sourceId, accountId, triggeredBy) {
  if (this.isQueueAvailable()) {
    await this.bullQueue.add('sync', { sourceId, accountId, triggeredBy }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  } else {
    this.syncSource(sourceId);  // Direct fallback
  }
}
```

---

## 10. Bidirectional Sync (Outbound)

OTT also pushes changes back to external platforms. When a task is updated locally:

```typescript
// backend/src/sync/outbound-sync.service.ts (simplified)

async pushUpdate(taskId: string) {
  const task = await this.db.from('tasks').select('*, sources(*)').eq('id', taskId).single();
  const adapter = this.adapterRegistry.getAdapter(task.sources.provider);

  await adapter.pushTaskUpdate(task.sources.config, {
    external_id: task.external_id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    completed: task.completed,
    notes: task.notes,
    due_date: task.due_date,
  });
}
```

### Notion Outbound Example

```typescript
// backend/src/adapters/notion/notion.adapter.ts

async pushTaskUpdate(config: SourceConfig, update: TaskUpdate): Promise<void> {
  const client = this.createClient(config);
  const properties: Record<string, any> = {};

  if (update.title !== undefined)
    properties['Task'] = { title: [{ text: { content: update.title } }] };
  if (update.status !== undefined)
    properties['Status'] = { select: { name: this.mapStatusToNotion(update.status) } };
  if (update.priority !== undefined)
    properties['Priority'] = { select: { name: update.priority } };
  if (update.completed !== undefined)
    properties['Completed'] = { checkbox: update.completed };

  await client.pages.update({ page_id: update.external_id, properties });
}
```

---

## 11. File Structure

```
backend/src/
├── adapters/
│   ├── interfaces/
│   │   └── source-adapter.interface.ts    # SyncFilter, SourceAdapter, ExternalTask types
│   ├── adapter.decorator.ts               # @Adapter('provider') decorator
│   ├── adapter.registry.ts                # Factory: provider name → adapter instance
│   ├── adapters.module.ts                 # Auto-discovery via NestJS DiscoveryModule
│   ├── notion/
│   │   └── notion.adapter.ts              # Notion: fetchTasks, getProperties, buildNotionFilter, pushTaskUpdate
│   ├── clickup/
│   │   └── clickup.adapter.ts             # ClickUp: fetchTasks, getProperties, buildClickUpFilterParams
│   └── __template__/
│       └── template.adapter.ts            # Scaffold for new adapters
├── sources/
│   ├── sources.controller.ts              # CRUD + getProperties + listWorkspaces endpoints
│   ├── sources.service.ts                 # Source CRUD with config masking
│   └── dto/
│       ├── create-source.dto.ts
│       └── update-source.dto.ts           # Includes sync_filters[] and category_property
├── sync/
│   ├── sync.service.ts                    # Inbound sync: fetch → category resolve → upsert
│   ├── outbound-sync.service.ts           # Push changes back to external platform
│   ├── sync.processor.ts                  # BullMQ job handler
│   └── sync-queue.module.ts              # Conditional Redis/BullMQ setup
├── categories/
│   ├── categories.controller.ts           # Category CRUD
│   └── categories.service.ts
└── supabase/migrations/
    ├── 20260212000000_create_ott_core_tables.sql    # sources, tasks, sync_jobs, categories
    └── 20260214100000_category_visibility_and_source_filters.sql  # +sync_filters, +category_property

frontend/src/app/dashboard/settings/categories/
├── page.tsx                               # CategoryDialog (Integration tab, FilterRow, SourceFilterDialog)
└── actions.ts                             # Server actions: getSources, updateSource, getSourceProperties
```

---

## 12. Key Takeaways for Brain Connectors

### What OTT Does Well

1. **Dynamic schema discovery** — The `getProperties()` method on adapters returns the external system's property schema at runtime. The UI adapts to any database structure without code changes. Brain Connectors could expose a similar capability per connector, letting the admin UI render filter builders dynamically.

2. **Universal filter format** — The `SyncFilter` type (`{ property, type, condition, value }`) is provider-agnostic. Each adapter translates it to the platform's native filter syntax. Brain Connectors already has connector-specific extractors — adding a universal `SyncFilter` layer on top would be straightforward.

3. **Server-side filter application** — Filters are passed to the external API, not applied post-fetch. This is critical for large datasets. Brain Connectors' extractors could accept an optional `filters` parameter.

4. **Category/entity routing based on external properties** — The `category_property` concept maps an external field to local categories at sync time. Brain Connectors' equivalent could map external properties to routing targets or entity tags.

5. **Conditions are type-aware** — The UI shows different operators based on property type (checkbox gets "Is", select gets "Is/Is not/Is empty", number gets comparison operators). This prevents invalid filter configurations.

6. **Options with colors** — For select/status properties, the UI shows the actual option values with their platform colors (dots), making it intuitive to pick the right filter value.

### How to Adapt for Brain Connectors

| OTT Concept | Brain Connectors Equivalent |
|------------|---------------------------|
| `SyncFilter[]` on source | Could be stored on `Integration.connectorSetup` (JSONB) |
| `adapter.getProperties()` | New capability: `definePropertyDiscovery()` helper in connector author API |
| `category_property` mapping | Could extend entity configs with `routingProperty` to dynamically choose routing targets |
| `FILTER_CONDITIONS` constant | Shared between admin UI and connectors, defines which operators each type supports |
| `buildNotionFilter()` in adapter | Already exists as connector-specific — just needs the universal `SyncFilter` input |
| `PATCH /sources/:id` with `sync_filters` | Could be `PATCH /integrations/:id` with filter config stored in `connectorSetup` |
| `GET /sources/:id/properties` | New endpoint: `GET /connectors/:slug/properties?integrationId=` |

### Suggested Brain Connectors Extension

```typescript
// New helper for connector authors
export const definePropertyDiscovery = (
  fn: (ctx: PropertyDiscoveryContext) => Promise<SourceProperty[]>
) => fn;

// New optional file per connector entity
// connectors/hubspot/entities/companies/properties.ts
definePropertyDiscovery(async (ctx) => {
  const { data } = await ctx.api.get('https://api.hubapi.com/crm/v3/properties/companies');
  return data.results.map(prop => ({
    name: prop.name,
    type: mapHubSpotType(prop.type),
    id: prop.name,
    options: prop.options?.map(o => ({ name: o.label, value: o.value })),
  }));
});

// Extractor updated to accept filters
defineExtractor(async function* (ctx) {
  const filters = ctx.filters;  // SyncFilter[] from integration config
  const apiFilters = convertToHubSpotFilters(filters);
  // ... use apiFilters in API call
});
```

---

## Appendix: Complete FilterRow UI (Actual Code)

For reference, here is the complete `FilterRow` component from the OTT frontend:

```tsx
function FilterRow({ filter, properties, onChange, onRemove }: {
  filter: SyncFilter
  properties: SourceProperty[]
  onChange: (updates: Partial<SyncFilter>) => void
  onRemove: () => void
}) {
  const selectedProp = properties.find((p) => p.name === filter.property)
  const propType = selectedProp?.type || filter.type || ''
  const conditions = FILTER_CONDITIONS[propType] || []
  const needsValue = filter.condition && !['is_empty', 'is_not_empty'].includes(filter.condition)
  const hasOptions = selectedProp?.options && selectedProp.options.length > 0

  return (
    <div className="flex items-center gap-2 bg-accent/50 rounded-lg p-2 border border-border">
      {/* Property selector */}
      <Select
        value={filter.property}
        onValueChange={(v) => {
          const prop = properties.find((p) => p.name === v)
          onChange({ property: v, type: prop?.type || '', condition: '', value: '' })
        }}
      >
        <SelectTrigger className="w-44 h-8 text-xs">
          <SelectValue placeholder="Property..." />
        </SelectTrigger>
        <SelectContent>
          {properties.map((p) => (
            <SelectItem key={p.id} value={p.name}>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[9px] px-1 py-0">{p.type}</Badge>
                <span className="text-xs">{p.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Condition selector */}
      <Select
        value={filter.condition}
        onValueChange={(v) => onChange({ condition: v, value: '' })}
        disabled={!filter.property}
      >
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue placeholder="Condition..." />
        </SelectTrigger>
        <SelectContent>
          {conditions.map((c) => (
            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input — adapts to property type */}
      {needsValue && (
        <>
          {propType === 'checkbox' ? (
            <Select
              value={filter.value === true || filter.value === 'true' ? 'true' : 'false'}
              onValueChange={(v) => onChange({ value: v === 'true' })}
            >
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue placeholder="Value..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Checked</SelectItem>
                <SelectItem value="false">Unchecked</SelectItem>
              </SelectContent>
            </Select>
          ) : hasOptions ? (
            <Select
              value={String(filter.value || '')}
              onValueChange={(v) => onChange({ value: v })}
            >
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Select value..." />
              </SelectTrigger>
              <SelectContent>
                {selectedProp?.options?.map((o) => (
                  <SelectItem key={o.name} value={o.name}>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm"
                            style={{ backgroundColor: notionColorToCSS(o.color) }} />
                      <span className="text-xs">{o.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : propType === 'date' ? (
            <Input className="w-36 h-8 text-xs" type="date"
                   value={filter.value || ''}
                   onChange={(e) => onChange({ value: e.target.value })} />
          ) : (
            <Input className="w-36 h-8 text-xs" placeholder="Value..."
                   value={filter.value || ''}
                   onChange={(e) => {
                     const v = propType === 'number' ? Number(e.target.value) : e.target.value
                     onChange({ value: v })
                   }} />
          )}
        </>
      )}

      {/* Remove button */}
      <Button variant="ghost" size="icon"
              className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
              onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
```
