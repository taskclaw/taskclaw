/**
 * ============================================================================
 * ADAPTER TEMPLATE
 * ============================================================================
 *
 * Copy this file to create a new source adapter for the OTT Dashboard.
 *
 * Steps to add a new integration:
 *
 *   1. Create a new directory:  backend/src/adapters/<provider>/
 *   2. Copy this file into it:  backend/src/adapters/<provider>/<provider>.adapter.ts
 *   3. Replace all occurrences of "template" / "Template" with your provider name
 *   4. Implement each method (see inline comments below)
 *   5. Add your adapter to the providers & exports arrays in adapters.module.ts:
 *        providers: [AdapterRegistry, NotionAdapter, ClickUpAdapter, YourAdapter],
 *        exports:   [AdapterRegistry, NotionAdapter, ClickUpAdapter, YourAdapter],
 *   6. That's it! The @Adapter() decorator + DiscoveryModule will auto-register it.
 *
 * The adapter will then be available via:
 *   - AdapterRegistry.getAdapter('yourProvider')
 *   - POST /accounts/:id/sources  with { provider: 'yourProvider', config: { ... } }
 *   - POST /accounts/:id/sources/yourProvider/workspaces
 *   - POST /accounts/:id/sources/yourProvider/properties
 *
 * ============================================================================
 */

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

// ---------------------------------------------------------------------------
// Configuration interface — define the fields your adapter needs
// ---------------------------------------------------------------------------
export interface TemplateConfig extends SourceConfig {
  api_key: string; // e.g. API token or OAuth access token
  project_id: string; // e.g. board ID, project key, list ID, etc.
  // Add more fields as needed for your provider
}

// ---------------------------------------------------------------------------
// Adapter class
// ---------------------------------------------------------------------------

@Adapter('template') // <-- Change to your provider name (lowercase)
@Injectable()
export class TemplateAdapter implements SourceAdapter {
  private readonly logger = new Logger(TemplateAdapter.name);

  getProviderName(): string {
    return 'template'; // <-- Must match the @Adapter() decorator value
  }

  // =========================================================================
  // REQUIRED: Fetch tasks from the external source
  // =========================================================================

  async fetchTasks(
    config: SourceConfig,
    filters?: SyncFilter[],
  ): Promise<ExternalTask[]> {
    const cfg = config as TemplateConfig;

    // TODO: Call your provider's API to fetch tasks/issues/cards
    // Handle pagination, apply filters where the API supports them

    this.logger.log(`Fetching tasks from Template project: ${cfg.project_id}`);

    // Example return — replace with real API calls:
    return [];
  }

  // =========================================================================
  // REQUIRED: Push a single task update back to the external source
  // =========================================================================

  async pushTaskUpdate(
    config: SourceConfig,
    update: TaskUpdate,
  ): Promise<void> {
    const cfg = config as TemplateConfig;

    // TODO: Map the TaskUpdate fields to your provider's API format
    // and call the update endpoint

    this.logger.log(`Pushing update to Template task: ${update.external_id}`);
  }

  // =========================================================================
  // REQUIRED: Validate configuration (test credentials, check permissions)
  // =========================================================================

  async validateConfig(config: SourceConfig): Promise<ValidationResult> {
    const cfg = config as TemplateConfig;

    if (!cfg.api_key) {
      return { valid: false, error: 'API key is required' };
    }
    if (!cfg.project_id) {
      return { valid: false, error: 'Project ID is required' };
    }

    // TODO: Make a lightweight API call to verify credentials
    // e.g. GET /me or GET /project/:id

    return { valid: true };
  }

  // =========================================================================
  // OPTIONAL: Get properties/schema (for filter builder & category mapping)
  // =========================================================================

  async getProperties(config: SourceConfig): Promise<any> {
    const cfg = config as TemplateConfig;

    // TODO: Fetch the schema of your provider's project/board
    // Return an array of { name, type, id, options? } descriptors

    return [];
  }

  // =========================================================================
  // OPTIONAL: List workspaces/projects (for the "Add Source" wizard)
  // =========================================================================

  async listWorkspaces(config: SourceConfig): Promise<any> {
    const cfg = config as TemplateConfig;

    // TODO: List available projects/boards/lists the API key has access to
    // Return an array of { id, name, ... } descriptors

    return [];
  }

  // =========================================================================
  // Private helpers — status & priority mapping
  // =========================================================================

  /**
   * Map your provider's status string to the OTT canonical status.
   * DB constraint: 'To-Do' | 'Today' | 'In Progress' | 'AI Running' | 'In Review' | 'Done' | 'Blocked'
   */
  private mapStatusFromProvider(providerStatus: string): TaskStatus {
    // TODO: Implement mapping for your provider
    const normalized = providerStatus.toLowerCase();
    if (normalized.includes('done') || normalized.includes('complete'))
      return 'Done';
    if (normalized.includes('progress')) return 'In Progress';
    if (normalized.includes('block')) return 'Blocked';
    return 'To-Do';
  }

  /**
   * Map OTT canonical status back to your provider's status string.
   */
  private mapStatusToProvider(ottStatus: TaskStatus): string {
    // TODO: Implement reverse mapping for your provider
    const statusMap: Record<TaskStatus, string> = {
      'To-Do': 'todo',
      Today: 'todo',
      'In Progress': 'in_progress',
      'AI Running': 'in_progress',
      'In Review': 'in_progress',
      Done: 'done',
      Blocked: 'blocked',
    };
    return statusMap[ottStatus] || 'todo';
  }

  /**
   * Map your provider's priority to the OTT canonical priority.
   * DB constraint: 'High' | 'Medium' | 'Low' | 'Urgent'
   */
  private mapPriorityFromProvider(
    providerPriority: string | null,
  ): TaskPriority | undefined {
    if (!providerPriority) return undefined;
    // TODO: Implement mapping for your provider
    return 'Medium';
  }
}
