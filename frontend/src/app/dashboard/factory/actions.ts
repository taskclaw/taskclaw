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

export interface FactorySummary {
  window_days: number;
  total_cost_usd: number;
  total_calls: number;
  cache_hit_rate: number;
  cost_by_pod: Array<{ pod_id: string; cost_usd: number }>;
  cost_by_day: Array<{ day: string; cost_usd: number }>;
}

export async function getFactorySummary(days = 30): Promise<FactorySummary> {
  const accountId = await currentAccountId();
  if (!accountId) throw new Error('No active account');
  const headers = await authHeaders();
  const res = await fetch(
    `${API_URL}/accounts/${accountId}/token-usage/summary?days=${days}`,
    { headers, cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Summary failed (${res.status})`);
  return (await res.json()) as FactorySummary;
}

export async function listPodsForLabels(): Promise<Record<string, string>> {
  const accountId = await currentAccountId();
  if (!accountId) return {};
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/accounts/${accountId}/pods`, {
    headers,
    cache: 'no-store',
  });
  if (!res.ok) return {};
  const pods = (await res.json()) as Array<{ id: string; name: string }>;
  return Object.fromEntries(pods.map((p) => [p.id, p.name]));
}
