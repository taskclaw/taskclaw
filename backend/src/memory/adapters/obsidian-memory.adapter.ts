import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  MemoryAdapter,
  MemoryEntry,
  MemoryHealthResult,
  MemorySearchOptions,
  MemoryWriteOptions,
} from './memory-adapter.interface';

/**
 * ObsidianMemoryAdapter (BE03)
 *
 * Bridges TaskClaw memory to an Obsidian vault via the Obsidian Local REST API plugin.
 *
 * Setup guide (Obsidian Local REST API):
 * 1. Install Obsidian from https://obsidian.md
 * 2. Enable community plugins: Settings → Community plugins → Turn off Safe mode
 * 3. Search and install "Local REST API" (by Adam Coddington / coddingtonbear)
 *    See: https://github.com/coddingtonbear/obsidian-local-rest-api
 * 4. Enable the plugin. In its settings, copy the API Key shown on screen.
 * 5. The vault REST API is available at http://localhost:27123 (default).
 *    Enter vault_url = "http://localhost:27123" and api_key in TaskClaw settings.
 *
 * Config shape: { vault_url: string, api_key: string, memory_folder?: string }
 * Default memory_folder: 'TaskClaw/Memories'
 *
 * All methods catch connection errors and return empty / false gracefully.
 */
@Injectable()
export class ObsidianMemoryAdapter implements MemoryAdapter {
  readonly slug = 'obsidian';
  readonly name = 'Obsidian';

  private readonly logger = new Logger(ObsidianMemoryAdapter.name);
  private readonly DEFAULT_FOLDER = 'TaskClaw/Memories';
  private readonly REQUEST_TIMEOUT_MS = 5000;

  async remember(options: MemoryWriteOptions): Promise<MemoryEntry> {
    const { content, type, source = 'agent', metadata = {} as any } = options;
    const config = (metadata?._obsidian_config || {}) as Record<string, any>;
    const vault_url = config.vault_url as string;
    const api_key = config.api_key as string;
    const memory_folder =
      (config.memory_folder as string) || this.DEFAULT_FOLDER;

    if (!vault_url || !api_key) {
      throw new BadRequestException(
        'ObsidianMemoryAdapter requires vault_url and api_key',
      );
    }

    const filename = `${Date.now()}.md`;
    const path = `${memory_folder}/${type}/${filename}`;
    const noteContent = `# Memory\n\n${content}\n\n---\n*Source: ${source} | Created: ${new Date().toISOString()}*\n`;

    try {
      await this.fetchWithTimeout(
        `${vault_url}/vault/${encodeURIComponent(path)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${api_key}`,
            'Content-Type': 'text/markdown',
          },
          body: noteContent,
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `ObsidianMemoryAdapter.remember() failed: ${err.message}`,
      );
    }

    // Return a synthetic MemoryEntry since Obsidian doesn't give us a UUID
    return {
      id: `obsidian-${Date.now()}`,
      account_id: (metadata?.account_id as string) || '',
      content,
      type,
      source,
      salience: 1.0,
      metadata,
      created_at: new Date().toISOString(),
      valid_to: null,
    };
  }

  async recall(options: MemorySearchOptions): Promise<MemoryEntry[]> {
    const { query, account_id, limit = 10 } = options;
    // Config must be injected via metadata or resolved externally.
    // In practice MemoryRouterService passes config through to healthCheck but
    // recall is called with no direct config — we accept config from metadata.
    const config = (options as any)._config as Record<string, any> | undefined;
    if (!config?.vault_url || !config?.api_key) {
      return [];
    }

    const { vault_url, api_key } = config;

    try {
      const res = await this.fetchWithTimeout(`${vault_url}/search/simple/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        this.logger.warn(`Obsidian search returned ${res.status}`);
        return [];
      }

      const results: any[] = await res.json();
      return results.slice(0, limit).map((r, i) => ({
        id: `obsidian-search-${i}`,
        account_id,
        content: r.content || r.filename || '',
        type: 'episodic' as const,
        source: 'sync' as const,
        salience: 1.0,
        metadata: { filename: r.filename },
        created_at: new Date().toISOString(),
        valid_to: null,
      }));
    } catch (err: any) {
      this.logger.warn(`ObsidianMemoryAdapter.recall() failed: ${err.message}`);
      return [];
    }
  }

  async recent(
    _accountId: string,
    limit = 20,
    _type?: string,
  ): Promise<MemoryEntry[]> {
    // Without config context we can't connect — return empty gracefully
    return [];
  }

  async forget(_id: string, _accountId: string): Promise<void> {
    // Obsidian files are not deleted via this adapter for safety
    this.logger.debug(
      'ObsidianMemoryAdapter.forget() is a no-op (files are not deleted)',
    );
  }

  async healthCheck(config?: Record<string, any>): Promise<MemoryHealthResult> {
    if (!config?.vault_url) {
      return { healthy: false, error: 'vault_url is required' };
    }

    const start = Date.now();
    try {
      const res = await this.fetchWithTimeout(`${config.vault_url}/`, {
        headers: config.api_key
          ? { Authorization: `Bearer ${config.api_key}` }
          : {},
      });
      return {
        healthy: res.ok || res.status === 200,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return { healthy: false, error: err.message };
    }
  }

  validateConfig(config: Record<string, any>): void {
    if (!config.vault_url) {
      throw new BadRequestException(
        'vault_url is required for Obsidian adapter',
      );
    }
    if (!config.api_key) {
      throw new BadRequestException('api_key is required for Obsidian adapter');
    }
    try {
      new URL(config.vault_url as string);
    } catch {
      throw new BadRequestException('vault_url must be a valid URL');
    }
  }

  buildContextBlock(entries: MemoryEntry[]): string {
    if (!entries || entries.length === 0) return '';

    let block = `\n=== AGENT MEMORY (Obsidian) ===\n`;
    block += `Relevant notes from Obsidian vault:\n`;
    entries.forEach((entry, i) => {
      block += `${i + 1}. ${entry.content}\n`;
    });
    block += `\n`;
    return block;
  }

  // ── Private helpers ──────────────────────────────────────────

  private fetchWithTimeout(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return Promise.race([
      fetch(url, options),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Obsidian request timed out after ${this.REQUEST_TIMEOUT_MS}ms`,
              ),
            ),
          this.REQUEST_TIMEOUT_MS,
        ),
      ),
    ]);
  }
}
