'use server';

import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

async function getAuthHeaders() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function getCurrentAccountId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('current_account_id')?.value || null;
}

export interface SyncStatusDetail {
  category_id: string;
  category_name: string;
  category_color: string | null;
  category_icon: string | null;
  sync_status: 'pending' | 'syncing' | 'synced' | 'error' | 'stale' | 'none';
  last_synced_at: string | null;
  last_sync_error: string | null;
  instructions_hash: string | null;
  skill_count: number;
  has_knowledge: boolean;
  retry_count: number;
}

export interface SyncStatusResponse {
  total_categories: number;
  agents_synced: number;
  agents_pending: number;
  agents_stale: number;
  agents_error: number;
  agents_none: number;
  details: SyncStatusDetail[];
}

export interface SyncResult {
  categoryId: string;
  categoryName: string;
  action: 'created' | 'updated' | 'skipped' | 'deleted' | 'error';
  error?: string;
}

export interface PluginHealth {
  plugin_connected: boolean;
  plugin_data?: {
    ok: boolean;
    skillsBasePath: string;
    managedSkills: string[];
    writeAccess: boolean;
  } | null;
  error?: string | null;
}

export interface PreviewResponse {
  content: string | null;
  hash?: string;
  skillIds?: string[];
  knowledgeDocId?: string | null;
  categorySlug?: string;
  message?: string;
}

export async function getAgentSyncStatus(): Promise<SyncStatusResponse | null> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) return null;

    const res = await fetch(`${API_URL}/accounts/${accountId}/agent-sync/status`, {
      headers: await getAuthHeaders(),
      cache: 'no-store',
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('Failed to fetch agent sync status:', error);
    return null;
  }
}

export async function getPluginHealth(): Promise<PluginHealth | null> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) return null;

    const res = await fetch(`${API_URL}/accounts/${accountId}/agent-sync/health`, {
      headers: await getAuthHeaders(),
      cache: 'no-store',
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('Failed to check plugin health:', error);
    return null;
  }
}

export async function triggerSync(categoryId?: string): Promise<SyncResult[] | SyncResult | null> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) return null;

    const url = categoryId
      ? `${API_URL}/accounts/${accountId}/agent-sync/sync/${categoryId}`
      : `${API_URL}/accounts/${accountId}/agent-sync/sync`;

    const res = await fetch(url, {
      method: 'POST',
      headers: await getAuthHeaders(),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Sync failed');
    }

    return await res.json();
  } catch (error) {
    console.error('Failed to trigger sync:', error);
    throw error;
  }
}

export async function previewInstructions(categoryId: string): Promise<PreviewResponse | null> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) return null;

    const res = await fetch(
      `${API_URL}/accounts/${accountId}/agent-sync/${categoryId}/preview`,
      {
        headers: await getAuthHeaders(),
        cache: 'no-store',
      },
    );

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('Failed to preview instructions:', error);
    return null;
  }
}

export async function deleteProviderAgent(categoryId: string): Promise<boolean> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) return false;

    const res = await fetch(
      `${API_URL}/accounts/${accountId}/agent-sync/${categoryId}`,
      {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      },
    );

    return res.ok;
  } catch (error) {
    console.error('Failed to delete provider agent:', error);
    return false;
  }
}
