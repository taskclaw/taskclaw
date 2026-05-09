/**
 * Source fixture factory — returns a minimal valid source DB row.
 */

export function sourceFixture(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: 'source-uuid-001',
    account_id: 'account-uuid-001',
    provider: 'notion',
    name: 'Test Notion source',
    is_active: true,
    sync_status: 'idle',
    sync_interval_minutes: 30,
    last_synced_at: null,
    last_sync_error: null,
    config: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export interface SourceRow {
  id: string;
  account_id: string;
  provider: string;
  name: string;
  is_active: boolean;
  sync_status: string;
  sync_interval_minutes: number;
  last_synced_at: string | null;
  last_sync_error: string | null;
  config: string;
  created_at: string;
  updated_at: string;
}
