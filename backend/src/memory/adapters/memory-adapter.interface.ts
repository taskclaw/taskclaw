/**
 * MemoryAdapter interface (BE01)
 *
 * Each memory backend (Default/Supabase, Obsidian, etc.) implements this
 * interface so the MemoryRouterService can talk to it in a unified way.
 */

export interface MemoryEntry {
  id: string;
  account_id: string;
  content: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'working';
  source: 'agent' | 'human' | 'sync';
  salience: number;
  task_id?: string | null;
  conversation_id?: string | null;
  board_instance_id?: string | null;
  category_id?: string | null;
  metadata?: Record<string, any>;
  created_at?: string;
  valid_from?: string;
  valid_to?: string | null;
}

export interface MemorySearchOptions {
  query: string;
  account_id: string;
  limit?: number;
  threshold?: number;
  task_id?: string;
  type?: 'episodic' | 'semantic' | 'procedural' | 'working';
}

export interface MemoryWriteOptions {
  content: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'working';
  source?: 'agent' | 'human' | 'sync';
  metadata?: Record<string, any> & {
    account_id: string;
    task_id?: string;
    conversation_id?: string;
    board_instance_id?: string;
    category_id?: string;
  };
}

export interface MemoryHealthResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

export interface MemoryAdapter {
  /** Unique slug identifying the adapter type (e.g. 'default', 'obsidian') */
  readonly slug: string;

  /** Human-readable display name */
  readonly name: string;

  /**
   * Store a memory entry.
   * Embedding generation is non-blocking — errors are caught silently.
   */
  remember(options: MemoryWriteOptions): Promise<MemoryEntry>;

  /**
   * Recall relevant memories for a query using vector similarity.
   * Falls back to ILIKE text search when no embedding is available.
   */
  recall(options: MemorySearchOptions): Promise<MemoryEntry[]>;

  /**
   * Retrieve recent memories for an account (ORDER BY created_at DESC).
   */
  recent(
    accountId: string,
    limit?: number,
    type?: string,
  ): Promise<MemoryEntry[]>;

  /**
   * Delete a memory entry by id + account_id.
   */
  forget(id: string, accountId: string): Promise<void>;

  /**
   * Check adapter health (e.g. can we connect to the backend store).
   */
  healthCheck(config?: Record<string, any>): Promise<MemoryHealthResult>;

  /**
   * Validate connection config shape before saving.
   * Should throw BadRequestException on invalid config.
   */
  validateConfig(config: Record<string, any>): void;

  /**
   * Optional: build a formatted context block from a list of memory entries.
   * Default implementation returns a bullet list prefixed with '=== AGENT MEMORY ==='.
   */
  buildContextBlock?(entries: MemoryEntry[]): string;
}
