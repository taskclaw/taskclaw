'use server';

import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

async function authHeaders() {
  const c = await cookies();
  const token = c.get('auth_token')?.value;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function currentAccountId(): Promise<string | null> {
  const c = await cookies();
  return c.get('current_account_id')?.value || null;
}

export interface SyncRow {
  id: string;
  account_id: string;
  name: string;
  sync_type: 'skills' | 'knowledge' | 'pods';
  source_kind: 'local-folder' | 'git-repo' | 'marketplace' | 'notion' | 'gdrive';
  config: Record<string, unknown>;
  schedule_cron: string | null;
  last_run_at: string | null;
  last_status: 'ok' | 'error' | 'partial' | 'running' | null;
  last_error: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncRunRow {
  id: string;
  sync_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'ok' | 'error' | 'partial' | 'cancelled';
  items_added: number;
  items_updated: number;
  items_removed: number;
  log_excerpt: string | null;
  trigger: 'schedule' | 'manual' | 'hook';
}

export interface CreateSyncInput {
  name: string;
  sync_type: SyncRow['sync_type'];
  source_kind: SyncRow['source_kind'];
  config: Record<string, unknown>;
  schedule_cron?: string | null;
  enabled?: boolean;
}

export interface UpdateSyncInput {
  name?: string;
  config?: Record<string, unknown>;
  schedule_cron?: string | null;
  enabled?: boolean;
}

async function call(path: string, init?: RequestInit) {
  const account = await currentAccountId();
  if (!account) throw new Error('No active account');
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/accounts/${account}/syncs${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const message = (body as any)?.message ?? `Request failed (${res.status})`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function listSyncs(): Promise<SyncRow[]> {
  return (await call('')) as SyncRow[];
}

export async function getSync(id: string): Promise<SyncRow> {
  return (await call(`/${id}`)) as SyncRow;
}

export async function listSyncRuns(id: string, limit = 20): Promise<SyncRunRow[]> {
  return (await call(`/${id}/runs?limit=${limit}`)) as SyncRunRow[];
}

export async function createSync(input: CreateSyncInput): Promise<SyncRow> {
  return (await call('', { method: 'POST', body: JSON.stringify(input) })) as SyncRow;
}

export async function updateSync(id: string, input: UpdateSyncInput): Promise<SyncRow> {
  return (await call(`/${id}`, { method: 'PATCH', body: JSON.stringify(input) })) as SyncRow;
}

export async function deleteSync(id: string): Promise<void> {
  await call(`/${id}`, { method: 'DELETE' });
}

export async function runSync(id: string): Promise<SyncRunRow> {
  return (await call(`/${id}/run`, { method: 'POST' })) as SyncRunRow;
}
