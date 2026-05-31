'use server';

import { serverApiBase } from '@/lib/api-base';
import { cookies } from 'next/headers';

const API_URL = serverApiBase();

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

export interface PodBundleImportReport {
  pod_id: string;
  created: { boards: number; columns: number; agents: number; skills: number; knowledge: number };
  matched: { skills: number; agents: number; backbones: number };
  missing_integrations: Array<{ slug: string; display_name: string; optional?: boolean }>;
}

export async function exportPodBundle(podId: string): Promise<unknown> {
  const accountId = await currentAccountId();
  if (!accountId) throw new Error('No active account');
  const headers = await authHeaders();
  const res = await fetch(
    `${API_URL}/accounts/${accountId}/pods/${podId}/export`,
    { headers, cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  return res.json();
}

export async function importPodBundle(bundle: unknown): Promise<PodBundleImportReport> {
  const accountId = await currentAccountId();
  if (!accountId) throw new Error('No active account');
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/accounts/${accountId}/pods/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify(bundle),
    cache: 'no-store',
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const message = (body as any)?.message ?? `Import failed (${res.status})`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  return (await res.json()) as PodBundleImportReport;
}
