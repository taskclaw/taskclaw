/**
 * SourceAdapter Interface
 *
 * Defines the contract for all external source integrations (Notion, ClickUp, Trello, etc.)
 * Each adapter implements this interface to provide a unified API for syncing tasks.
 */

export interface SyncFilter {
  property: string;
  type: string; // 'checkbox' | 'select' | 'multi_select' | 'status' | 'number' | 'date' | 'text' | etc.
  condition: string; // 'equals' | 'does_not_equal' | 'contains' | 'is_empty' | 'is_not_empty' | etc.
  value: any;
}

export interface SourceConfig {
  // Provider-specific configuration (API keys, database IDs, etc.)
  [key: string]: any;
}

// DB status constraint: 'To-Do' | 'Today' | 'In Progress' | 'AI Running' | 'In Review' | 'Done' | 'Blocked'
export type TaskStatus =
  | 'To-Do'
  | 'Today'
  | 'In Progress'
  | 'AI Running'
  | 'In Review'
  | 'Done'
  | 'Blocked';
// DB priority constraint: 'High' | 'Medium' | 'Low' | 'Urgent'
export type TaskPriority = 'High' | 'Medium' | 'Low' | 'Urgent';

export interface ExternalTask {
  external_id: string; // ID in the external system
  title: string;
  status: TaskStatus;
  priority?: TaskPriority;
  completed: boolean;
  notes?: string;
  metadata?: Record<string, any>; // Source-specific fields
  external_url?: string;
  due_date?: Date;
  completed_at?: Date;
  last_synced_at?: Date;
}

export interface TaskUpdate {
  external_id: string;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  completed?: boolean;
  notes?: string;
  due_date?: Date;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface SourceAdapter {
  /**
   * Fetch all tasks from the external source, optionally applying pre-filters
   */
  fetchTasks(
    config: SourceConfig,
    filters?: SyncFilter[],
  ): Promise<ExternalTask[]>;

  /**
   * Push a task update to the external source (outbound sync)
   */
  pushTaskUpdate(config: SourceConfig, update: TaskUpdate): Promise<void>;

  /**
   * Validate the source configuration (test API credentials, check permissions, etc.)
   */
  validateConfig(config: SourceConfig): Promise<ValidationResult>;

  /**
   * Get the provider name (e.g., 'notion', 'clickup', 'trello')
   */
  getProviderName(): string;

  /**
   * (Optional) Fetch properties/schema from the external source.
   * E.g. Notion database properties, ClickUp custom fields, Jira issue types.
   * Adapters that support this allow the UI to render dynamic filter builders
   * and category-property mapping.
   */
  getProperties?(config: SourceConfig): Promise<any>;

  /**
   * (Optional) List workspaces/databases/projects available with the given credentials.
   * E.g. Notion databases accessible by the integration, ClickUp workspace→space→list tree.
   * Adapters that support this allow the "Add Source" wizard to let users browse and pick.
   */
  listWorkspaces?(config: SourceConfig): Promise<any>;
}
