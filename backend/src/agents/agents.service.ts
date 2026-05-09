import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { encrypt, decrypt, maskSensitiveValue } from '../common/utils/encryption.util';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Marker prefix on encrypted env values. We keep encryption per-value so
// the user can edit a single key without re-supplying every other secret.
const ENC_PREFIX = 'enc:v1:';

/** Encrypt every non-encrypted value in a custom_env object. */
function encryptEnvObject(env: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!env) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string') continue;
    if (v.startsWith(ENC_PREFIX)) {
      out[k] = v;
    } else {
      out[k] = ENC_PREFIX + encrypt(v);
    }
  }
  return out;
}

/** Mask values stored encrypted; safe to return to the client. */
function maskEnvObject(env: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!env) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string') continue;
    if (v.startsWith(ENC_PREFIX)) {
      try {
        const plain = decrypt(v.slice(ENC_PREFIX.length));
        out[k] = maskSensitiveValue(plain);
      } catch {
        out[k] = '••••';
      }
    } else {
      out[k] = maskSensitiveValue(v);
    }
  }
  return out;
}

/**
 * Decrypt a stored custom_env into plain values. Used at adapter call
 * time to merge into spawn env / HTTP headers. Never returned to clients.
 */
export function decryptEnvObject(env: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!env) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string') continue;
    if (v.startsWith(ENC_PREFIX)) {
      try {
        out[k] = decrypt(v.slice(ENC_PREFIX.length));
      } catch {
        // Skip undecryptable values rather than crashing the spawn.
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
  ) {}

  async findAll(
    userId: string,
    accountId: string,
    filters?: { status?: string; agent_type?: string },
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    let query = client
      .from('agents')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.agent_type) {
      query = query.eq('agent_type', filters.agent_type);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch agents: ${error.message}`);
    }

    return (data ?? []).map((row) => this.maskRowEnv(row));
  }

  async findOne(userId: string, accountId: string, agentId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return this.maskRowEnv(data);
  }

  /**
   * Internal helper for adapter callers that need the *decrypted* env to
   * merge into spawn env / HTTP headers. Bypasses the standard read path
   * so we can guarantee plain values never leak through findOne/findAll.
   */
  async getDecryptedEnv(
    accountId: string,
    agentId: string,
  ): Promise<{ env: Record<string, string>; args: string[] }> {
    const client = this.supabaseAdmin.getClient();
    const { data } = await client
      .from('agents')
      .select('custom_env, custom_args')
      .eq('id', agentId)
      .eq('account_id', accountId)
      .maybeSingle();
    return {
      env: decryptEnvObject((data?.custom_env as Record<string, unknown>) ?? {}),
      args: Array.isArray(data?.custom_args) ? (data!.custom_args as string[]) : [],
    };
  }

  private maskRowEnv(row: any) {
    return {
      ...row,
      custom_env: maskEnvObject(row?.custom_env ?? {}),
    };
  }

  async create(
    userId: string,
    accountId: string,
    dto: CreateAgentDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const slug = dto.slug ?? generateSlug(dto.name);

    const { data, error } = await client
      .from('agents')
      .insert({
        account_id: accountId,
        name: dto.name,
        slug,
        avatar_url: dto.avatar_url ?? null,
        description: dto.description ?? null,
        persona: dto.persona ?? null,
        color: dto.color ?? '#6366f1',
        backbone_connection_id: dto.backbone_connection_id ?? null,
        model_override: dto.model_override ?? null,
        max_concurrent_tasks: dto.max_concurrent_tasks ?? 3,
        agent_type: dto.agent_type ?? 'worker',
        config: dto.config ?? {},
        custom_env: encryptEnvObject(dto.custom_env ?? {}),
        custom_args: Array.isArray(dto.custom_args) ? dto.custom_args : [],
        status: 'idle',
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          `An agent with slug "${slug}" already exists in this account`,
        );
      }
      throw new Error(`Failed to create agent: ${error.message}`);
    }

    return this.maskRowEnv(data);
  }

  async update(
    userId: string,
    accountId: string,
    agentId: string,
    dto: UpdateAgentDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify agent exists and belongs to account
    await this.findOne(userId, accountId, agentId);

    const updatePayload: Record<string, unknown> = { ...dto, updated_at: new Date().toISOString() };
    if (dto.custom_env !== undefined) {
      // Merge: empty string means "delete this key"; missing keys keep their
      // existing encrypted value so the user doesn't have to re-supply
      // already-set secrets just to add a new one.
      const existing = await client
        .from('agents')
        .select('custom_env')
        .eq('id', agentId)
        .single();
      const merged: Record<string, unknown> = {
        ...((existing.data?.custom_env as Record<string, unknown>) ?? {}),
      };
      for (const [k, v] of Object.entries(dto.custom_env ?? {})) {
        if (v === '' || v === null || v === undefined) {
          delete merged[k];
        } else {
          merged[k] = v;
        }
      }
      updatePayload.custom_env = encryptEnvObject(merged);
    }
    if (dto.custom_args !== undefined) {
      updatePayload.custom_args = Array.isArray(dto.custom_args) ? dto.custom_args : [];
    }

    const { data, error } = await client
      .from('agents')
      .update(updatePayload)
      .eq('id', agentId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update agent: ${error.message}`);
    }

    return this.maskRowEnv(data);
  }

  async remove(userId: string, accountId: string, agentId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Soft-deactivate
    const { data, error } = await client
      .from('agents')
      .update({ is_active: false, status: 'offline', updated_at: new Date().toISOString() })
      .eq('id', agentId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return data;
  }

  async pause(userId: string, accountId: string, agentId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('agents')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', agentId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return data;
  }

  async resume(userId: string, accountId: string, agentId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('agents')
      .update({ status: 'idle', updated_at: new Date().toISOString() })
      .eq('id', agentId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return data;
  }

  async clone(
    userId: string,
    accountId: string,
    agentId: string,
    newName?: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const original = await this.findOne(userId, accountId, agentId);

    const cloneName = newName ?? `${original.name} (Copy)`;
    const cloneSlug = generateSlug(cloneName);

    const { data, error } = await client
      .from('agents')
      .insert({
        account_id: accountId,
        name: cloneName,
        slug: cloneSlug,
        avatar_url: original.avatar_url,
        description: original.description,
        persona: original.persona,
        color: original.color,
        backbone_connection_id: original.backbone_connection_id,
        model_override: original.model_override,
        max_concurrent_tasks: original.max_concurrent_tasks,
        agent_type: original.agent_type,
        config: original.config,
        status: 'idle',
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          `An agent with slug "${cloneSlug}" already exists in this account`,
        );
      }
      throw new Error(`Failed to clone agent: ${error.message}`);
    }

    return data;
  }

  /** Called by AgentActivityService and DAGExecutorService to update stats. */
  async recordCompletion(agentId: string, opts: { tokensUsed?: number } = {}) {
    const client = this.supabaseAdmin.getClient();

    const { error } = await client.rpc('increment_agent_stats', {
      p_agent_id: agentId,
      p_completed_delta: 1,
      p_failed_delta: 0,
      p_tokens_delta: opts.tokensUsed ?? 0,
    });

    if (error) {
      // Non-fatal: log but don't throw
      console.error(`[AgentsService] recordCompletion failed: ${error.message}`);
    }
  }

  async recordFailure(agentId: string) {
    const client = this.supabaseAdmin.getClient();

    const { error } = await client.rpc('increment_agent_stats', {
      p_agent_id: agentId,
      p_completed_delta: 0,
      p_failed_delta: 1,
      p_tokens_delta: 0,
    });

    if (error) {
      console.error(`[AgentsService] recordFailure failed: ${error.message}`);
    }
  }

  // ── Skills management ────────────────────────────────────────────────────────

  async getAgentSkills(userId: string, accountId: string, agentId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('agent_skills')
      .select('*, skill:skills(*)')
      .eq('agent_id', agentId);

    if (error) throw new Error(`Failed to fetch agent skills: ${error.message}`);
    return (data || []).map((row: any) => row.skill).filter(Boolean);
  }

  async addSkillToAgent(userId: string, accountId: string, agentId: string, skillId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data: agent, error: agentError } = await client
      .from('agents')
      .select('id')
      .eq('id', agentId)
      .eq('account_id', accountId)
      .single();

    if (agentError || !agent) throw new NotFoundException(`Agent ${agentId} not found`);

    const { data, error } = await client
      .from('agent_skills')
      .insert({ agent_id: agentId, skill_id: skillId, is_active: true })
      .select('*, skill:skills(*)')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictException('Skill already linked to this agent');
      throw new Error(`Failed to add skill: ${error.message}`);
    }

    return (data as any).skill;
  }

  async removeSkillFromAgent(userId: string, accountId: string, agentId: string, skillId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { error } = await client
      .from('agent_skills')
      .delete()
      .eq('agent_id', agentId)
      .eq('skill_id', skillId);

    if (error) throw new Error(`Failed to remove skill: ${error.message}`);
    return { message: 'Skill removed from agent' };
  }

  // ── Knowledge docs management ────────────────────────────────────────────────

  async getAgentKnowledge(userId: string, accountId: string, agentId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Get migrated_from_category_id so we can also return category-linked docs (F14 soak period)
    const { data: agent } = await client
      .from('agents')
      .select('id, migrated_from_category_id')
      .eq('id', agentId)
      .eq('account_id', accountId)
      .single();

    // Build OR filter: agent_id match OR category_id match (legacy)
    let query = client
      .from('knowledge_docs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (agent?.migrated_from_category_id) {
      query = query.or(`agent_id.eq.${agentId},category_id.eq.${agent.migrated_from_category_id}`);
    } else {
      query = query.eq('agent_id', agentId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch agent knowledge: ${error.message}`);
    return data;
  }
}
