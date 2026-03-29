import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@notionhq/client';
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
import type {
  PageObjectResponse,
  QueryDataSourceParameters,
} from '@notionhq/client/build/src/api-endpoints.js';

export interface NotionConfig extends SourceConfig {
  api_key: string;
  database_id: string;
  data_source_id?: string; // Notion v5 dataSources API ID (different from database_id)
}

/**
 * NotionAdapter
 *
 * Adapts Notion databases to the unified SourceAdapter interface.
 * Supports bidirectional sync (fetch tasks from Notion, push updates back to Notion).
 */
@Adapter('notion')
@Injectable()
export class NotionAdapter implements SourceAdapter {
  private readonly logger = new Logger(NotionAdapter.name);

  getProviderName(): string {
    return 'notion';
  }

  async fetchTasks(
    config: SourceConfig,
    filters?: SyncFilter[],
  ): Promise<ExternalTask[]> {
    const notionConfig = config as NotionConfig;
    const client = this.createClient(notionConfig);

    try {
      const pages: PageObjectResponse[] = [];
      let cursor: string | undefined;

      this.logger.log(
        `Fetching tasks from Notion database: ${notionConfig.database_id}`,
      );

      // Build Notion filter from our SyncFilter array
      const notionFilter = this.buildNotionFilter(filters);
      if (notionFilter) {
        this.logger.log(
          `Applying Notion filter: ${JSON.stringify(notionFilter)}`,
        );
      }

      // Pagination: fetch all pages using dataSources API (Notion client v5+)
      const dsId = notionConfig.data_source_id || notionConfig.database_id;
      do {
        const queryParams: any = {
          data_source_id: dsId,
          start_cursor: cursor,
          page_size: 100,
        };
        if (notionFilter) {
          queryParams.filter = notionFilter;
        }

        const response = await client.dataSources.query(
          queryParams as QueryDataSourceParameters,
        );

        for (const result of response.results) {
          if (result.object === 'page' && 'properties' in result) {
            pages.push(result);
          }
        }

        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);

      this.logger.log(`Fetched ${pages.length} tasks from Notion`);

      return pages.map((page) => this.mapNotionPageToTask(page));
    } catch (error) {
      this.logger.error(
        `Failed to fetch Notion tasks: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Convert SyncFilter[] to Notion-compatible filter object.
   * Supports: checkbox, select, multi_select, status, rich_text, number, date, title
   */
  private buildNotionFilter(filters?: SyncFilter[]): any | null {
    if (!filters || filters.length === 0) return null;

    const conditions = filters
      .map((f) => {
        try {
          return this.buildSingleNotionCondition(f);
        } catch {
          this.logger.warn(`Skipping unsupported filter: ${JSON.stringify(f)}`);
          return null;
        }
      })
      .filter(Boolean);

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { and: conditions };
  }

  private buildSingleNotionCondition(f: SyncFilter): any {
    const prop = f.property;
    switch (f.type) {
      case 'checkbox':
        return { property: prop, checkbox: { [f.condition]: f.value } };
      case 'select':
        return { property: prop, select: { [f.condition]: f.value } };
      case 'multi_select':
        return { property: prop, multi_select: { [f.condition]: f.value } };
      case 'status':
        return { property: prop, status: { [f.condition]: f.value } };
      case 'rich_text':
        return { property: prop, rich_text: { [f.condition]: f.value } };
      case 'number':
        return { property: prop, number: { [f.condition]: f.value } };
      case 'date':
        return { property: prop, date: { [f.condition]: f.value } };
      case 'title':
        return { property: prop, title: { [f.condition]: f.value } };
      default:
        // For unknown types, try generic approach
        return { property: prop, [f.type]: { [f.condition]: f.value } };
    }
  }

  async pushTaskUpdate(
    config: SourceConfig,
    update: TaskUpdate,
  ): Promise<void> {
    const notionConfig = config as NotionConfig;
    const client = this.createClient(notionConfig);

    try {
      const properties: Record<string, any> = {};

      if (update.title !== undefined) {
        properties['Task'] = { title: [{ text: { content: update.title } }] };
      }
      if (update.status !== undefined) {
        properties['Status'] = {
          select: { name: this.mapStatusToNotion(update.status) },
        };
      }
      if (update.priority !== undefined) {
        properties['Priority'] = { select: { name: update.priority } };
      }
      if (update.completed !== undefined) {
        properties['Completed'] = { checkbox: update.completed };
      }
      if (update.notes !== undefined) {
        properties['Notes'] = {
          rich_text: [{ text: { content: update.notes } }],
        };
      }
      if (update.due_date !== undefined) {
        properties['Date'] = update.due_date
          ? { date: { start: update.due_date.toISOString().split('T')[0] } }
          : null;
      }

      await client.pages.update({
        page_id: update.external_id,
        properties,
      });

      this.logger.log(`Updated Notion page: ${update.external_id}`);
    } catch (error) {
      this.logger.error(
        `Failed to push update to Notion: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async validateConfig(config: SourceConfig): Promise<ValidationResult> {
    const notionConfig = config as NotionConfig;

    if (!notionConfig.api_key) {
      return { valid: false, error: 'API key is required' };
    }

    if (!notionConfig.database_id) {
      return { valid: false, error: 'Database ID is required' };
    }

    try {
      const client = this.createClient(notionConfig);

      // Try to retrieve the data source to validate credentials and permissions
      await client.dataSources.retrieve({
        data_source_id: notionConfig.data_source_id || notionConfig.database_id,
      });

      this.logger.log(
        `Successfully validated Notion config for database: ${notionConfig.database_id}`,
      );

      return { valid: true };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Notion config validation failed: ${message}`);

      if (message.includes('unauthorized')) {
        return { valid: false, error: 'Invalid API key' };
      }
      if (message.includes('not found')) {
        return {
          valid: false,
          error: 'Database not found or not accessible',
        };
      }
      return { valid: false, error: `Validation failed: ${message}` };
    }
  }

  // ============================================================================
  // SourceAdapter optional methods
  // ============================================================================

  /**
   * Fetch database properties/schema from Notion.
   * Returns an array of property descriptors with name, type, and options.
   * Config must include api_key and (database_id or data_source_id).
   */
  async getProperties(config: SourceConfig): Promise<any> {
    const notionConfig = config as NotionConfig;
    const client = this.createClient(notionConfig);

    const dsId = notionConfig.data_source_id || notionConfig.database_id;
    let rawProperties: Record<string, any> = {};

    try {
      const ds = await client.dataSources.retrieve({ data_source_id: dsId });
      rawProperties = (ds as any).properties || {};
    } catch {
      // Fallback: try databases.retrieve (older Notion API)
      const db = await client.databases.retrieve({
        database_id: notionConfig.database_id,
      });
      rawProperties = (db as any).properties || {};
    }

    return Object.entries(rawProperties).map(([name, prop]: [string, any]) => {
      const result: any = { name, type: prop.type, id: prop.id };
      if (prop.type === 'select' && prop.select?.options) {
        result.options = prop.select.options.map((o: any) => ({
          name: o.name,
          color: o.color,
        }));
      }
      if (prop.type === 'multi_select' && prop.multi_select?.options) {
        result.options = prop.multi_select.options.map((o: any) => ({
          name: o.name,
          color: o.color,
        }));
      }
      if (prop.type === 'status' && prop.status?.options) {
        result.options = prop.status.options.map((o: any) => ({
          name: o.name,
          color: o.color,
        }));
        result.groups = prop.status.groups?.map((g: any) => ({
          name: g.name,
          option_ids: g.option_ids,
        }));
      }
      return result;
    });
  }

  /**
   * List Notion databases accessible by the integration.
   * Config must include api_key. Returns { id, title, icon, url }[].
   */
  async listWorkspaces(config: SourceConfig): Promise<any> {
    const notionConfig = config as NotionConfig;
    const client = this.createClient(notionConfig);

    const response = await client.search({
      filter: { property: 'object', value: 'data_source' as any },
      page_size: 50,
    });

    return response.results.map((db: any) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || 'Untitled',
      icon: db.icon?.emoji || null,
      url: db.url,
    }));
  }

  // ============================================================================
  // Page Content (Notion Blocks API)
  // ============================================================================

  /**
   * Fetch page body content by reading Notion blocks.
   * Converts blocks to markdown-like plain text.
   */
  async getPageContent(config: SourceConfig, pageId: string): Promise<string> {
    const notionConfig = config as NotionConfig;
    const client = this.createClient(notionConfig);

    try {
      return await this.fetchBlockContent(client, pageId);
    } catch (error) {
      this.logger.error(
        `Failed to fetch page content for ${pageId}: ${(error as Error).message}`,
      );
      return '';
    }
  }

  private async fetchBlockContent(
    client: Client,
    blockId: string,
  ): Promise<string> {
    const blocks = await client.blocks.children.list({
      block_id: blockId,
      page_size: 100,
    });

    const lines: string[] = [];

    for (const block of blocks.results) {
      const b = block as Record<string, unknown>;
      const type = b['type'] as string;
      const data = b[type] as Record<string, unknown> | undefined;
      if (!data) continue;

      const richText = data['rich_text'] as
        | Array<{ plain_text: string }>
        | undefined;
      const text = richText?.map((t) => t.plain_text).join('') || '';

      let line = '';
      switch (type) {
        case 'paragraph':
          line = text;
          break;
        case 'heading_1':
          line = `# ${text}`;
          break;
        case 'heading_2':
          line = `## ${text}`;
          break;
        case 'heading_3':
          line = `### ${text}`;
          break;
        case 'bulleted_list_item':
          line = `- ${text}`;
          break;
        case 'numbered_list_item':
          line = `- ${text}`;
          break;
        case 'to_do': {
          const checked = (data['checked'] as boolean) ? 'x' : ' ';
          line = `- [${checked}] ${text}`;
          break;
        }
        case 'toggle':
          line = text;
          break;
        case 'quote':
          line = `> ${text}`;
          break;
        case 'callout':
          line = text;
          break;
        case 'code':
          line = text;
          break;
        case 'divider':
          line = '---';
          break;
        case 'bookmark': {
          const url = (data['url'] as string) || '';
          const caption = (
            data['caption'] as Array<{ plain_text: string }> | undefined
          )
            ?.map((t) => t.plain_text)
            .join('');
          line = caption ? `${caption}: ${url}` : url;
          break;
        }
        case 'embed': {
          const embedUrl = (data['url'] as string) || '';
          line = embedUrl;
          break;
        }
        case 'link_preview': {
          const linkUrl = (data['url'] as string) || '';
          line = linkUrl;
          break;
        }
        default:
          if (text) line = text;
          break;
      }

      if (line) lines.push(line);

      // Recursively fetch children for blocks that have them
      if (b['has_children'] === true) {
        const childContent = await this.fetchBlockContent(
          client,
          b['id'] as string,
        );
        if (childContent) {
          const indented = childContent
            .split('\n')
            .map((l) => `  ${l}`)
            .join('\n');
          lines.push(indented);
        }
      }
    }

    return lines.join('\n');
  }

  // ============================================================================
  // Comments API
  // ============================================================================

  /**
   * Fetch all comments for a Notion page.
   * Returns comments in chronological order (oldest first).
   */
  async getComments(
    config: SourceConfig,
    pageId: string,
  ): Promise<
    Array<{ id: string; text: string; created_at: string; author: string }>
  > {
    const notionConfig = config as NotionConfig;
    const client = this.createClient(notionConfig);

    try {
      const comments: Array<{
        id: string;
        text: string;
        created_at: string;
        author: string;
      }> = [];
      let cursor: string | undefined;

      do {
        const response: any = await client.comments.list({
          block_id: pageId,
          start_cursor: cursor,
          page_size: 100,
        });

        for (const comment of response.results) {
          const text =
            comment.rich_text?.map((t: any) => t.plain_text).join('') || '';

          const author =
            comment.created_by?.name ||
            comment.created_by?.person?.email ||
            (comment.created_by?.type === 'bot' ? 'Bot' : 'Unknown');

          comments.push({
            id: comment.id,
            text,
            created_at: comment.created_time,
            author,
          });
        }

        cursor = response.has_more ? response.next_cursor : undefined;
      } while (cursor);

      this.logger.log(
        `Fetched ${comments.length} comments for Notion page ${pageId}`,
      );
      return comments;
    } catch (error) {
      this.logger.error(
        `Failed to fetch comments for ${pageId}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Create a comment on a Notion page.
   */
  async createComment(
    config: SourceConfig,
    pageId: string,
    text: string,
  ): Promise<{ id: string }> {
    const notionConfig = config as NotionConfig;
    const client = this.createClient(notionConfig);

    try {
      const truncated = text.length > 1900 ? text.slice(0, 1900) + '...' : text;
      const response = await client.comments.create({
        parent: { page_id: pageId },
        rich_text: [{ type: 'text', text: { content: truncated } }],
      });
      this.logger.log(`Created comment on Notion page ${pageId}`);
      return { id: response.id };
    } catch (error) {
      this.logger.error(
        `Failed to create comment on ${pageId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private createClient(config: NotionConfig): Client {
    return new Client({
      auth: config.api_key,
      timeoutMs: 30000,
    });
  }

  private mapNotionPageToTask(page: PageObjectResponse): ExternalTask {
    const props = page.properties;

    // Build metadata dynamically from ALL properties (select, multi_select, checkbox, number)
    // This ensures any property can be used for category mapping or filtering
    const metadata: Record<string, any> = {};
    for (const [propName, propValue] of Object.entries(props)) {
      const type = (propValue as any)?.type;
      if (type === 'select') {
        metadata[propName] = this.getSelect(propValue);
      } else if (type === 'multi_select') {
        metadata[propName] = this.getMultiSelect(propValue);
      } else if (type === 'checkbox') {
        metadata[propName] = this.getCheckbox(propValue);
      } else if (type === 'number') {
        metadata[propName] = this.getNumber(propValue);
      }
    }

    // Keep legacy lowercase aliases for backward compatibility
    if (metadata['Horizon'] !== undefined)
      metadata['horizon'] = metadata['Horizon'];
    if (metadata['Category'] !== undefined)
      metadata['category'] = metadata['Category'];
    if (metadata['Time Spent'] !== undefined)
      metadata['timeSpent'] = metadata['Time Spent'];
    if (metadata['Signal-Noise'] !== undefined)
      metadata['signalNoise'] = metadata['Signal-Noise'];

    return {
      external_id: page.id,
      title:
        this.getTitle(props['Task']) ||
        this.getTitle(props['Name']) ||
        'Untitled',
      status: this.mapStatusFromNotion(this.getSelect(props['Status'])),
      priority: this.getPriority(this.getSelect(props['Priority'])),
      completed: this.getCheckbox(props['Completed']),
      notes: this.getRichText(props['Notes']),
      metadata,
      external_url: page.url,
      due_date: this.getDate(props['Date'])?.start
        ? new Date(this.getDate(props['Date'])!.start!)
        : undefined,
      completed_at: this.getCheckbox(props['Completed'])
        ? new Date(page.last_edited_time)
        : undefined,
      last_synced_at: new Date(),
    };
  }

  // Property extractors
  private getTitle(prop: any): string {
    if (prop?.type === 'title' && prop.title?.length > 0) {
      return prop.title.map((t: any) => t.plain_text).join('');
    }
    return '';
  }

  private getSelect(prop: any): string | null {
    if (prop?.type === 'select' && prop.select) {
      return prop.select.name;
    }
    return null;
  }

  private getMultiSelect(prop: any): string[] {
    if (prop?.type === 'multi_select' && prop.multi_select) {
      return prop.multi_select.map((o: any) => o.name);
    }
    return [];
  }

  private getCheckbox(prop: any): boolean {
    if (prop?.type === 'checkbox') return prop.checkbox;
    return false;
  }

  private getRichText(prop: any): string {
    if (prop?.type === 'rich_text' && prop.rich_text?.length > 0) {
      return prop.rich_text.map((t: any) => t.plain_text).join('');
    }
    return '';
  }

  private getNumber(prop: any): number | null {
    if (prop?.type === 'number') return prop.number;
    return null;
  }

  private getDate(
    prop: any,
  ): { start: string | null; end: string | null } | null {
    if (prop?.type === 'date' && prop.date) {
      return { start: prop.date.start, end: prop.date.end };
    }
    return null;
  }

  // Status mapping between OTT canonical and Notion
  // DB constraint: status IN ('To-Do', 'Today', 'In Progress', 'Done', 'Blocked')
  private mapStatusFromNotion(notionStatus: string | null): TaskStatus {
    if (!notionStatus) return 'To-Do';

    const normalized = notionStatus.toLowerCase();
    if (normalized === 'today') return 'Today';
    if (normalized.includes('progress') || normalized.includes('doing'))
      return 'In Progress';
    if (normalized.includes('done') || normalized.includes('complete'))
      return 'Done';
    if (normalized.includes('block')) return 'Blocked';
    // 'To Do', 'To-Do', or anything else -> 'To-Do'
    return 'To-Do';
  }

  private mapStatusToNotion(ottStatus: TaskStatus): string {
    const statusMap: Record<TaskStatus, string> = {
      'To-Do': 'To Do',
      Today: 'Today',
      'In Progress': 'In Progress',
      'AI Running': 'In Progress', // Internal status -- map to "In Progress" in Notion
      'In Review': 'In Progress', // Internal status -- map to "In Progress" in Notion
      Done: 'Done',
      Blocked: 'Blocked',
    };
    return statusMap[ottStatus] || 'To Do';
  }

  // DB constraint: priority IN ('High', 'Medium', 'Low', 'Urgent')
  private getPriority(notionPriority: string | null): TaskPriority | undefined {
    if (!notionPriority) return undefined;

    const normalized = notionPriority.toLowerCase();
    if (normalized.includes('urgent')) return 'Urgent';
    if (normalized.includes('high')) return 'High';
    if (normalized.includes('low')) return 'Low';
    return 'Medium';
  }
}
