import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

    return data;
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

    return data;
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

    return data;
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

    return data;
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
