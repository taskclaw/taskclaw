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

export interface AvailableSkill {
  id: string;
  name: string;
  description: string | null;
  source_type: 'custom' | 'disk-scan' | 'git-repo' | 'marketplace';
  source_uri: string | null;
  source_version: string | null;
  locally_available: boolean | null;
  is_active: boolean;
}

export interface DiskSkill {
  id: string;
  name: string;
  description: string | null;
  source_type: 'disk-scan';
  source_uri: string;
  source_version: string | null;
  locally_available: boolean;
}

export interface MarketSkill {
  id: string;
  name: string;
  description: string | null;
}

export interface SkillSearchResult {
  available: AvailableSkill[];
  local: DiskSkill[];
  market: MarketSkill[];
}

export async function searchSkills(
  prefix: string,
  opts: { include_local?: boolean; include_market?: boolean } = {},
): Promise<SkillSearchResult> {
  const accountId = await currentAccountId();
  if (!accountId) throw new Error('No active account');
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (prefix.trim()) params.set('q', prefix.trim());
  if (opts.include_local === false) params.set('include_local', 'false');
  if (opts.include_market) params.set('include_market', 'true');

  const res = await fetch(
    `${API_URL}/accounts/${accountId}/skills/search?${params.toString()}`,
    { headers, cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return (await res.json()) as SkillSearchResult;
}

export async function importSkill(
  source_uri: string,
  source_type: 'disk-scan' | 'marketplace' = 'disk-scan',
): Promise<AvailableSkill> {
  const accountId = await currentAccountId();
  if (!accountId) throw new Error('No active account');
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/accounts/${accountId}/skills/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source_uri, source_type }),
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
    throw new Error(message);
  }
  return (await res.json()) as AvailableSkill;
}
