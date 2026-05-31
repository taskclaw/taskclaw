import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { agents, agentSkills, knowledgeDocs } from '../db/schema';
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
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
  ) {}

  /**
   * Drizzle returns camelCase columns; PostgREST returned snake_case. Re-key
   * each agent row back to the snake_case shape the API response (and internal
   * callers like `clone`) depend on, so the contract is unchanged.
   */
  private present(row: any) {
    return {
      id: row.id,
      account_id: row.accountId,
      name: row.name,
      slug: row.slug,
      avatar_url: row.avatarUrl,
      description: row.description,
      persona: row.persona,
      color: row.color,
      backbone_connection_id: row.backboneConnectionId,
      model_override: row.modelOverride,
      max_concurrent_tasks: row.maxConcurrentTasks,
      status: row.status,
      is_active: row.isActive,
      agent_type: row.agentType,
      total_tasks_completed: row.totalTasksCompleted,
      total_tasks_failed: row.totalTasksFailed,
      total_tokens_used: row.totalTokensUsed,
      last_active_at: row.lastActiveAt,
      config: row.config,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      migrated_from_category_id: row.migratedFromCategoryId,
      custom_env: row.customEnv,
      custom_args: row.customArgs,
    };
  }

  /**
   * Re-key a Drizzle knowledge_docs row (camelCase) back to the snake_case
   * shape PostgREST returned, which the frontend depends on.
   */
  private presentKnowledgeDoc(row: any) {
    return {
      id: row.id,
      account_id: row.accountId,
      category_id: row.categoryId,
      title: row.title,
      content: row.content,
      is_master: row.isMaster,
      file_attachments: row.fileAttachments,
      created_by: row.createdBy,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      agent_id: row.agentId,
    };
  }

  async findAll(
    userId: string,
    accountId: string,
    filters?: { status?: string; agent_type?: string },
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const conditions = [eq(agents.accountId, accountId)];
    if (filters?.status) {
      conditions.push(eq(agents.status, filters.status));
    }
    if (filters?.agent_type) {
      conditions.push(eq(agents.agentType, filters.agent_type));
    }

    const data = await this.db
      .select()
      .from(agents)
      .where(and(...conditions))
      .orderBy(desc(agents.createdAt));

    return data.map((row) => this.maskRowEnv(this.present(row)));
  }

  async findOne(userId: string, accountId: string, agentId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [data] = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
      .limit(1);

    if (!data) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return this.maskRowEnv(this.present(data));
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
    const [data] = await this.db
      .select({ customEnv: agents.customEnv, customArgs: agents.customArgs })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
      .limit(1);
    return {
      env: decryptEnvObject((data?.customEnv as Record<string, unknown>) ?? {}),
      args: Array.isArray(data?.customArgs) ? (data!.customArgs as string[]) : [],
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const slug = dto.slug ?? generateSlug(dto.name);

    try {
      const rows = await this.db
        .insert(agents)
        .values({
          accountId,
          name: dto.name,
          slug,
          avatarUrl: dto.avatar_url ?? null,
          description: dto.description ?? null,
          persona: dto.persona ?? null,
          color: dto.color ?? '#6366f1',
          backboneConnectionId: dto.backbone_connection_id ?? null,
          modelOverride: dto.model_override ?? null,
          maxConcurrentTasks: dto.max_concurrent_tasks ?? 3,
          agentType: dto.agent_type ?? 'worker',
          config: dto.config ?? {},
          customEnv: encryptEnvObject(dto.custom_env ?? {}),
          customArgs: Array.isArray(dto.custom_args) ? dto.custom_args : [],
          status: 'idle',
          isActive: true,
        })
        .returning();

      return this.maskRowEnv(this.present(rows[0]));
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          `An agent with slug "${slug}" already exists in this account`,
        );
      }
      throw new Error(`Failed to create agent: ${error?.message}`);
    }
  }

  async update(
    userId: string,
    accountId: string,
    agentId: string,
    dto: UpdateAgentDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify agent exists and belongs to account
    await this.findOne(userId, accountId, agentId);

    // Map the snake_case DTO to camelCase columns (only defined fields).
    const updatePayload: Partial<typeof agents.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.name !== undefined) updatePayload.name = dto.name;
    if (dto.slug !== undefined) updatePayload.slug = dto.slug;
    if (dto.avatar_url !== undefined) updatePayload.avatarUrl = dto.avatar_url;
    if (dto.description !== undefined) updatePayload.description = dto.description;
    if (dto.persona !== undefined) updatePayload.persona = dto.persona;
    if (dto.color !== undefined) updatePayload.color = dto.color;
    if (dto.backbone_connection_id !== undefined)
      updatePayload.backboneConnectionId = dto.backbone_connection_id;
    if (dto.model_override !== undefined)
      updatePayload.modelOverride = dto.model_override;
    if (dto.max_concurrent_tasks !== undefined)
      updatePayload.maxConcurrentTasks = dto.max_concurrent_tasks;
    if (dto.agent_type !== undefined) updatePayload.agentType = dto.agent_type;
    if (dto.config !== undefined) updatePayload.config = dto.config;
    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.is_active !== undefined) updatePayload.isActive = dto.is_active;

    if (dto.custom_env !== undefined) {
      // Merge: empty string means "delete this key"; missing keys keep their
      // existing encrypted value so the user doesn't have to re-supply
      // already-set secrets just to add a new one.
      const [existing] = await this.db
        .select({ customEnv: agents.customEnv })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      const merged: Record<string, unknown> = {
        ...((existing?.customEnv as Record<string, unknown>) ?? {}),
      };
      for (const [k, v] of Object.entries(dto.custom_env ?? {})) {
        if (v === '' || v === null || v === undefined) {
          delete merged[k];
        } else {
          merged[k] = v;
        }
      }
      updatePayload.customEnv = encryptEnvObject(merged);
    }
    if (dto.custom_args !== undefined) {
      updatePayload.customArgs = Array.isArray(dto.custom_args) ? dto.custom_args : [];
    }

    let rows;
    try {
      rows = await this.db
        .update(agents)
        .set(updatePayload)
        .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
        .returning();
    } catch (error: any) {
      throw new Error(`Failed to update agent: ${error?.message}`);
    }

    return this.maskRowEnv(this.present(rows[0]));
  }

  async remove(userId: string, accountId: string, agentId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Soft-deactivate
    const rows = await this.db
      .update(agents)
      .set({ isActive: false, status: 'offline', updatedAt: new Date().toISOString() })
      .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return this.present(rows[0]);
  }

  async pause(userId: string, accountId: string, agentId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const rows = await this.db
      .update(agents)
      .set({ status: 'paused', updatedAt: new Date().toISOString() })
      .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return this.present(rows[0]);
  }

  async resume(userId: string, accountId: string, agentId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const rows = await this.db
      .update(agents)
      .set({ status: 'idle', updatedAt: new Date().toISOString() })
      .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    return this.present(rows[0]);
  }

  async clone(
    userId: string,
    accountId: string,
    agentId: string,
    newName?: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const original = await this.findOne(userId, accountId, agentId);

    const cloneName = newName ?? `${original.name} (Copy)`;
    const cloneSlug = generateSlug(cloneName);

    try {
      const rows = await this.db
        .insert(agents)
        .values({
          accountId,
          name: cloneName,
          slug: cloneSlug,
          avatarUrl: original.avatar_url,
          description: original.description,
          persona: original.persona,
          color: original.color,
          backboneConnectionId: original.backbone_connection_id,
          modelOverride: original.model_override,
          maxConcurrentTasks: original.max_concurrent_tasks,
          agentType: original.agent_type,
          config: original.config,
          status: 'idle',
          isActive: true,
        })
        .returning();

      return this.present(rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          `An agent with slug "${cloneSlug}" already exists in this account`,
        );
      }
      throw new Error(`Failed to clone agent: ${error?.message}`);
    }
  }

  /** Called by AgentActivityService and DAGExecutorService to update stats. */
  async recordCompletion(agentId: string, opts: { tokensUsed?: number } = {}) {
    try {
      await this.db
        .update(agents)
        .set({
          totalTasksCompleted: sql`${agents.totalTasksCompleted} + 1`,
          totalTokensUsed: sql`${agents.totalTokensUsed} + ${opts.tokensUsed ?? 0}`,
        })
        .where(eq(agents.id, agentId));
    } catch (error: any) {
      // Non-fatal: log but don't throw
      console.error(`[AgentsService] recordCompletion failed: ${error?.message}`);
    }
  }

  async recordFailure(agentId: string) {
    try {
      await this.db
        .update(agents)
        .set({
          totalTasksFailed: sql`${agents.totalTasksFailed} + 1`,
        })
        .where(eq(agents.id, agentId));
    } catch (error: any) {
      console.error(`[AgentsService] recordFailure failed: ${error?.message}`);
    }
  }

  // ── Skills management ────────────────────────────────────────────────────────

  async getAgentSkills(userId: string, accountId: string, agentId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const data = await this.db.query.agentSkills.findMany({
      where: eq(agentSkills.agentId, agentId),
      with: { skill: true },
    });

    return (data || []).map((row: any) => row.skill).filter(Boolean);
  }

  async addSkillToAgent(userId: string, accountId: string, agentId: string, skillId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [agent] = await this.db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
      .limit(1);

    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);

    let inserted;
    try {
      inserted = await this.db
        .insert(agentSkills)
        .values({ agentId, skillId, isActive: true })
        .returning();
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Skill already linked to this agent');
      throw new Error(`Failed to add skill: ${error?.message}`);
    }

    // Re-read the inserted link with its joined skill so we return the same
    // shape PostgREST gave via `.select('*, skill:skills(*)')`.
    const link = await this.db.query.agentSkills.findFirst({
      where: and(
        eq(agentSkills.agentId, inserted[0].agentId),
        eq(agentSkills.skillId, inserted[0].skillId),
      ),
      with: { skill: true },
    });

    return (link as any).skill;
  }

  async removeSkillFromAgent(userId: string, accountId: string, agentId: string, skillId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    try {
      await this.db
        .delete(agentSkills)
        .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)));
    } catch (error: any) {
      throw new Error(`Failed to remove skill: ${error?.message}`);
    }
    return { message: 'Skill removed from agent' };
  }

  // ── Knowledge docs management ────────────────────────────────────────────────

  async getAgentKnowledge(userId: string, accountId: string, agentId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Get migrated_from_category_id so we can also return category-linked docs (F14 soak period)
    const [agent] = await this.db
      .select({
        id: agents.id,
        migratedFromCategoryId: agents.migratedFromCategoryId,
      })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
      .limit(1);

    // Build OR filter: agent_id match OR category_id match (legacy)
    const filter = agent?.migratedFromCategoryId
      ? or(
          eq(knowledgeDocs.agentId, agentId),
          eq(knowledgeDocs.categoryId, agent.migratedFromCategoryId),
        )
      : eq(knowledgeDocs.agentId, agentId);

    try {
      const data = await this.db
        .select()
        .from(knowledgeDocs)
        .where(and(eq(knowledgeDocs.accountId, accountId), filter))
        .orderBy(desc(knowledgeDocs.createdAt));
      return data.map((row) => this.presentKnowledgeDoc(row));
    } catch (error: any) {
      throw new Error(`Failed to fetch agent knowledge: ${error?.message}`);
    }
  }
}
