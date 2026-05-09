import { Injectable, Logger } from '@nestjs/common';
import { MemoryAdapterRegistry } from './adapters/memory-adapter.registry';
import { MemoryConnectionsService } from './memory-connections.service';
import {
  MemoryAdapter,
  MemoryEntry,
  MemoryWriteOptions,
  MemorySearchOptions,
} from './adapters/memory-adapter.interface';

/**
 * MemoryRouterService (BE04)
 *
 * Routes memory operations to the correct adapter for a given account.
 * - resolveAdapter(accountId): looks up active memory_connection, falls back to 'default'
 * - buildMemoryContext(accountId, query, taskId?): recall + format with 200ms timeout
 * - remember/recall delegates to resolved adapter
 */
@Injectable()
export class MemoryRouterService {
  private readonly logger = new Logger(MemoryRouterService.name);

  constructor(
    private readonly registry: MemoryAdapterRegistry,
    private readonly connectionsService: MemoryConnectionsService,
  ) {}

  /**
   * Resolve the correct adapter for the account.
   * Falls back to 'default' when no active connection is configured.
   */
  async resolveAdapter(accountId: string): Promise<{
    adapter: MemoryAdapter;
    config: Record<string, any>;
  }> {
    try {
      const connection = await this.connectionsService.findActive(accountId);
      if (connection) {
        const slug = connection.adapter_slug || 'default';
        if (this.registry.has(slug)) {
          return {
            adapter: this.registry.resolve(slug),
            config: connection.config || {},
          };
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `resolveAdapter() failed to get active connection for ${accountId}: ${err.message}`,
      );
    }

    // Fallback to default adapter with empty config
    return {
      adapter: this.registry.resolve('default'),
      config: {},
    };
  }

  /**
   * Store a memory for an account.
   * Routes to the resolved adapter.
   */
  async remember(options: MemoryWriteOptions): Promise<MemoryEntry> {
    const accountId = options.metadata?.account_id as string;
    const { adapter } = await this.resolveAdapter(accountId);
    return adapter.remember(options);
  }

  /**
   * Recall memories for an account.
   * Routes to the resolved adapter.
   */
  async recall(options: MemorySearchOptions): Promise<MemoryEntry[]> {
    const { adapter } = await this.resolveAdapter(options.account_id);
    return adapter.recall(options);
  }

  /**
   * Build a formatted memory context block for injection into a system prompt.
   *
   * CRITICAL: Wrapped in Promise.race with 200ms timeout — NEVER blocks the chat.
   * Returns '' on timeout or error.
   */
  async buildMemoryContext(
    accountId: string,
    query: string,
    taskId?: string,
  ): Promise<string> {
    const timeout = new Promise<string>((resolve) =>
      setTimeout(() => {
        this.logger.debug(
          `buildMemoryContext() timed out after 200ms for account ${accountId}`,
        );
        resolve('');
      }, 200),
    );

    const recall = async (): Promise<string> => {
      try {
        const { adapter } = await this.resolveAdapter(accountId);
        const entries = await adapter.recall({
          query,
          account_id: accountId,
          limit: 10,
          task_id: taskId,
        });

        if (!entries || entries.length === 0) return '';

        // Use adapter's buildContextBlock if available, otherwise default format
        if (adapter.buildContextBlock) {
          return adapter.buildContextBlock(entries);
        }

        // Default formatting
        let block = `\n=== AGENT MEMORY ===\n`;
        block += `Relevant memories from previous interactions:\n`;
        entries.forEach((entry, i) => {
          const typeLabel =
            entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
          block += `${i + 1}. [${typeLabel}] ${entry.content}\n`;
        });
        block += `\n`;
        return block;
      } catch (err: any) {
        this.logger.warn(
          `buildMemoryContext() recall error for ${accountId}: ${err.message}`,
        );
        return '';
      }
    };

    return Promise.race([recall(), timeout]);
  }
}
