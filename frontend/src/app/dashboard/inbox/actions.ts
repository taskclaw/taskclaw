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
  const fromCookie = c.get('current_account_id')?.value;
  if (fromCookie) return fromCookie;

  // Fallback when the cookie hasn't been seeded yet (dashboard/layout may
  // have skipped writing it because Server Components can't write cookies in
  // Next 15 prod). Fetch the user's accounts and pick the first one — the
  // sidebar will eventually re-route to the correct active account.
  const headers = await authHeaders();
  if (!('Authorization' in headers)) return null;
  try {
    const res = await fetch(`${API_URL}/accounts`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    const accounts = (await res.json()) as Array<{ id: string }>;
    return accounts[0]?.id ?? null;
  } catch {
    return null;
  }
}

export type InboxKind =
  | 'orchestration_pending_approval'
  | 'agent_approval_request'
  | 'dag_approval_pending'
  | 'mention_task_open';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  subtitle?: string;
  href?: string;
  pod_id: string | null;
  pod_name: string | null;
  created_at: string;
  priority: 1 | 2 | 3 | 4 | 5;
  refs: Record<string, string | null | undefined>;
}

export interface InboxSummary {
  total: number;
  by_kind: Record<InboxKind, number>;
  items: InboxItem[];
}

async function call(path: string): Promise<any> {
  const accountId = await currentAccountId();
  if (!accountId) throw new Error('No active account');
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/accounts/${accountId}/inbox${path}`, {
    headers,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Inbox failed (${res.status})`);
  return res.json();
}

export async function getInbox(limit = 100): Promise<InboxSummary> {
  return (await call(`?limit=${limit}`)) as InboxSummary;
}

export async function getInboxCount(): Promise<{ count: number }> {
  return (await call('/count')) as { count: number };
}
