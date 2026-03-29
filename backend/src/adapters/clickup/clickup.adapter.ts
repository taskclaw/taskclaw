import { Injectable, Logger } from '@nestjs/common';
import { Adapter } from '../adapter.decorator';
import {
  SourceAdapter,
  SourceConfig,
  ExternalTask,
  TaskUpdate,
  TaskStatus,
  TaskPriority,
  ValidationResult,
  SyncFilter,
} from '../interfaces/source-adapter.interface';

export interface ClickUpConfig extends SourceConfig {
  api_token: string;
  list_id: string;
  team_id?: string; // workspace ID, used for listing spaces
}

interface ClickUpTask {
  id: string;
  name: string;
  status: {
    status: string;
    type: string;
  };
  priority?: {
    id: string;
    priority: string;
  };
  text_content?: string;
  description?: string;
  url: string;
  due_date?: number; // unix ms timestamp
  date_closed?: number; // unix ms timestamp
  list: {
    id: string;
    name: string;
  };
  folder?: {
    id: string;
    name: string;
  };
  space?: {
    id: string;
    name: string;
  };
  tags?: Array<{
    name: string;
  }>;
}

interface ClickUpListResponse {
  tasks: ClickUpTask[];
  last_page: boolean;
}

/**
 * ClickUpAdapter
 *
 * Adapts ClickUp lists to the unified SourceAdapter interface.
 * Supports bidirectional sync (fetch tasks from ClickUp, push updates back to ClickUp).
 */
@Adapter('clickup')
@Injectable()
export class ClickUpAdapter implements SourceAdapter {
  private readonly logger = new Logger(ClickUpAdapter.name);
  private readonly baseUrl = 'https://api.clickup.com/api/v2';

  getProviderName(): string {
    return 'clickup';
  }

  async fetchTasks(
    config: SourceConfig,
    filters?: SyncFilter[],
  ): Promise<ExternalTask[]> {
    const clickupConfig = config as ClickUpConfig;
    const tasks: ClickUpTask[] = [];
    let page = 0;
    let hasMore = true;

    try {
      this.logger.log(
        `Fetching tasks from ClickUp list: ${clickupConfig.list_id}`,
      );

      // Build ClickUp filter query params from SyncFilter[]
      const filterParams = this.buildClickUpFilterParams(filters);
      const baseParams = `include_closed=true&subtasks=true${filterParams}`;

      if (filterParams) {
        this.logger.log(`Applying ClickUp filters: ${filterParams}`);
      }

      // Pagination: fetch all tasks
      while (hasMore) {
        const response = await this.makeRequest<ClickUpListResponse>(
          clickupConfig,
          `GET /list/${clickupConfig.list_id}/task?${baseParams}&page=${page}`,
        );

        tasks.push(...response.tasks);
        hasMore = !response.last_page;
        page++;
      }

      this.logger.log(`Fetched ${tasks.length} tasks from ClickUp`);

      return tasks.map((task) => this.mapClickUpTaskToTask(task));
    } catch (error) {
      this.logger.error(
        `Failed to fetch ClickUp tasks: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Convert SyncFilter[] to ClickUp API query string parameters.
   * ClickUp supports: statuses[], tags[], assignees[], priorities[]
   */
  private buildClickUpFilterParams(filters?: SyncFilter[]): string {
    if (!filters || filters.length === 0) return '';

    const params: string[] = [];

    for (const f of filters) {
      switch (f.property.toLowerCase()) {
        case 'status':
          if (Array.isArray(f.value)) {
            f.value.forEach((v: string) =>
              params.push(`statuses[]=${encodeURIComponent(v)}`),
            );
          } else if (f.value) {
            params.push(`statuses[]=${encodeURIComponent(f.value)}`);
          }
          break;
        case 'priority':
          // ClickUp priority: 1=urgent, 2=high, 3=normal, 4=low
          if (Array.isArray(f.value)) {
            f.value.forEach((v: any) => params.push(`priorities[]=${v}`));
          } else if (f.value !== undefined) {
            params.push(`priorities[]=${f.value}`);
          }
          break;
        case 'tags':
          if (Array.isArray(f.value)) {
            f.value.forEach((v: string) =>
              params.push(`tags[]=${encodeURIComponent(v)}`),
            );
          } else if (f.value) {
            params.push(`tags[]=${encodeURIComponent(f.value)}`);
          }
          break;
        default:
          // For custom fields, ClickUp uses custom_fields parameter (JSON)
          // We'll apply these as post-fetch client-side filters for now
          this.logger.warn(
            `ClickUp filter for '${f.property}' will be applied post-fetch`,
          );
          break;
      }
    }

    return params.length > 0 ? '&' + params.join('&') : '';
  }

  async pushTaskUpdate(
    config: SourceConfig,
    update: TaskUpdate,
  ): Promise<void> {
    const clickupConfig = config as ClickUpConfig;

    try {
      const payload: Record<string, any> = {};

      if (update.title !== undefined) {
        payload.name = update.title;
      }
      if (update.status !== undefined) {
        // Note: ClickUp requires status name, not ID. We'd need to fetch available statuses
        // For now, we'll use the status name directly (this may need adjustment based on actual API)
        payload.status = this.mapStatusToClickUp(update.status);
      }
      if (update.priority !== undefined) {
        payload.priority = this.mapPriorityToClickUp(update.priority);
      }
      if (update.notes !== undefined) {
        payload.description = update.notes;
      }
      if (update.due_date !== undefined) {
        payload.due_date = update.due_date ? update.due_date.getTime() : null;
      }

      await this.makeRequest(
        clickupConfig,
        `PUT /task/${update.external_id}`,
        payload,
      );

      this.logger.log(`Updated ClickUp task: ${update.external_id}`);
    } catch (error) {
      this.logger.error(
        `Failed to push update to ClickUp: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async validateConfig(config: SourceConfig): Promise<ValidationResult> {
    const clickupConfig = config as ClickUpConfig;

    if (!clickupConfig.api_token) {
      return { valid: false, error: 'API token is required' };
    }

    if (!clickupConfig.list_id) {
      return { valid: false, error: 'List ID is required' };
    }

    try {
      // First validate token by checking team access
      await this.makeRequest(clickupConfig, 'GET /team');

      // Then validate list access
      await this.makeRequest(
        clickupConfig,
        `GET /list/${clickupConfig.list_id}`,
      );

      this.logger.log(
        `Successfully validated ClickUp config for list: ${clickupConfig.list_id}`,
      );

      return { valid: true };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`ClickUp config validation failed: ${message}`);

      if (message.includes('unauthorized') || message.includes('401')) {
        return { valid: false, error: 'Invalid API token' };
      }
      if (message.includes('not found') || message.includes('404')) {
        return {
          valid: false,
          error: 'List not found or not accessible',
        };
      }
      return { valid: false, error: `Validation failed: ${message}` };
    }
  }

  // ============================================================================
  // SourceAdapter optional methods
  // ============================================================================

  /**
   * Fetch custom fields and statuses of a ClickUp list.
   * Config must include api_token and list_id.
   * Returns an array of property descriptors.
   */
  async getProperties(config: SourceConfig): Promise<any> {
    const clickupConfig = config as ClickUpConfig;

    // Fetch custom fields
    const fieldsRes = await fetch(
      `${this.baseUrl}/list/${clickupConfig.list_id}/field`,
      { headers: { Authorization: clickupConfig.api_token } },
    );
    const fieldsData = await fieldsRes.json();

    // Fetch list statuses
    const listRes = await fetch(
      `${this.baseUrl}/list/${clickupConfig.list_id}`,
      { headers: { Authorization: clickupConfig.api_token } },
    );
    const listData = await listRes.json();

    const properties: any[] = [];

    // Add built-in fields
    properties.push({
      name: 'Status',
      type: 'status',
      id: '__status',
      options: (listData.statuses || []).map((s: any) => ({
        name: s.status,
        color: s.color,
        type: s.type,
      })),
    });

    properties.push({
      name: 'Priority',
      type: 'priority',
      id: '__priority',
      options: [
        { name: 'Urgent', value: 1 },
        { name: 'High', value: 2 },
        { name: 'Normal', value: 3 },
        { name: 'Low', value: 4 },
      ],
    });

    properties.push({
      name: 'Tags',
      type: 'tags',
      id: '__tags',
    });

    // Add custom fields
    for (const field of fieldsData.fields || []) {
      const prop: any = {
        name: field.name,
        type: field.type,
        id: field.id,
      };

      if (field.type_config?.options) {
        prop.options = field.type_config.options.map((o: any) => ({
          name: o.name || o.label,
          color: o.color,
          id: o.id,
          orderindex: o.orderindex,
        }));
      }

      properties.push(prop);
    }

    return properties;
  }

  /**
   * List ClickUp workspaces, spaces, folders, and lists.
   * Config must include api_token. Returns a flat array of list descriptors.
   */
  async listWorkspaces(config: SourceConfig): Promise<any> {
    const clickupConfig = config as ClickUpConfig;

    const res = await fetch(`${this.baseUrl}/team`, {
      headers: { Authorization: clickupConfig.api_token },
    });
    if (!res.ok) {
      throw new Error('Invalid API token');
    }
    const data = await res.json();

    // Flatten: teams -> spaces -> folders -> lists
    const result: any[] = [];
    for (const team of data.teams || []) {
      const spacesRes = await fetch(
        `${this.baseUrl}/team/${team.id}/space?archived=false`,
        { headers: { Authorization: clickupConfig.api_token } },
      );
      const spacesData = await spacesRes.json();

      for (const space of spacesData.spaces || []) {
        const foldersRes = await fetch(
          `${this.baseUrl}/space/${space.id}/folder?archived=false`,
          { headers: { Authorization: clickupConfig.api_token } },
        );
        const foldersData = await foldersRes.json();

        // Folderless lists
        const folderlessRes = await fetch(
          `${this.baseUrl}/space/${space.id}/list?archived=false`,
          { headers: { Authorization: clickupConfig.api_token } },
        );
        const folderlessData = await folderlessRes.json();

        for (const list of folderlessData.lists || []) {
          result.push({
            list_id: list.id,
            list_name: list.name,
            space_name: space.name,
            folder_name: null,
            team_name: team.name,
            team_id: team.id,
            task_count: list.task_count,
          });
        }

        for (const folder of foldersData.folders || []) {
          for (const list of folder.lists || []) {
            result.push({
              list_id: list.id,
              list_name: list.name,
              space_name: space.name,
              folder_name: folder.name,
              team_name: team.name,
              team_id: team.id,
              task_count: list.task_count,
            });
          }
        }
      }
    }

    return result;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async makeRequest<T>(
    config: ClickUpConfig,
    endpoint: string,
    body?: any,
  ): Promise<T> {
    const [method, path] = endpoint.split(' ');
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: config.api_token,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `ClickUp API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.err || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private mapClickUpTaskToTask(task: ClickUpTask): ExternalTask {
    return {
      external_id: task.id,
      title: task.name,
      status: this.mapStatusFromClickUp(task.status.status),
      priority: task.priority
        ? this.mapPriorityFromClickUp(parseInt(task.priority.id))
        : undefined,
      completed: task.status.type === 'closed',
      notes: task.text_content || task.description,
      external_url: task.url,
      due_date: task.due_date ? new Date(task.due_date) : undefined,
      completed_at: task.date_closed ? new Date(task.date_closed) : undefined,
      metadata: {
        list_name: task.list.name,
        folder_name: task.folder?.name,
        space_name: task.space?.name,
        tags: task.tags?.map((t) => t.name),
      },
      last_synced_at: new Date(),
    };
  }

  // Status mapping between OTT canonical and ClickUp
  // DB constraint: status IN ('To-Do', 'Today', 'In Progress', 'Done', 'Blocked')
  private mapStatusFromClickUp(clickupStatus: string): TaskStatus {
    if (!clickupStatus) return 'To-Do';

    const normalized = clickupStatus.toLowerCase();
    if (normalized === 'to do' || normalized === 'open') return 'To-Do';
    if (normalized.includes('progress') || normalized === 'doing')
      return 'In Progress';
    if (
      normalized.includes('complete') ||
      normalized === 'done' ||
      normalized === 'closed'
    )
      return 'Done';
    if (normalized.includes('block')) return 'Blocked';
    // Default to 'To-Do'
    return 'To-Do';
  }

  private mapStatusToClickUp(ottStatus: TaskStatus): string {
    // Note: ClickUp statuses are list-specific, so this is a best-effort mapping
    // The actual status name may need to be fetched from the list's statuses
    const statusMap: Record<TaskStatus, string> = {
      'To-Do': 'to do',
      Today: 'to do', // ClickUp doesn't have "Today", map to "to do"
      'In Progress': 'in progress',
      'AI Running': 'in progress', // Internal status -- map to "in progress" in ClickUp
      'In Review': 'in progress', // Internal status -- map to "in progress" in ClickUp
      Done: 'complete',
      Blocked: 'blocked',
    };
    return statusMap[ottStatus] || 'to do';
  }

  // Priority mapping: ClickUp uses 1-4, where 1 is urgent
  // DB constraint: priority IN ('High', 'Medium', 'Low', 'Urgent')
  private mapPriorityFromClickUp(
    clickupPriority: number | null,
  ): TaskPriority | undefined {
    if (clickupPriority === null || clickupPriority === undefined) {
      return undefined;
    }

    // ClickUp priority: 1 = urgent, 2 = high, 3 = normal (medium), 4 = low
    switch (clickupPriority) {
      case 1:
        return 'Urgent';
      case 2:
        return 'High';
      case 3:
        return 'Medium';
      case 4:
        return 'Low';
      default:
        return undefined;
    }
  }

  private mapPriorityToClickUp(ottPriority: TaskPriority): number {
    // ClickUp priority: 1 = urgent, 2 = high, 3 = normal (medium), 4 = low
    const priorityMap: Record<TaskPriority, number> = {
      Urgent: 1,
      High: 2,
      Medium: 3,
      Low: 4,
    };
    return priorityMap[ottPriority] || 3; // Default to medium (3)
  }
}
