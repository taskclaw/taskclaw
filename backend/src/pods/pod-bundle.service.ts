import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { ZodError } from 'zod';
import { DB, type Db } from '../db';
import {
  agents,
  agentSkills,
  backboneConnections,
  boardInstances,
  boardIntegrationRefs,
  boardSteps,
  integrationConnections,
  knowledgeDocs,
  pods,
  skills,
} from '../db/schema';
import {
  ImportReport,
  POD_BUNDLE_VERSION,
  PodBundle,
  PodBundleSchema,
  type BundledAgent,
  type BundledBoard,
  type BundledIntegrationRequirement,
  type BundledKnowledge,
  type BundledSkill,
} from './dto/pod-bundle.schema';

interface SkillResolution {
  id: string;
  bundle_name: string;
  matched: boolean; // true = existing row used; false = freshly inserted
}

/**
 * PodBundleService — round-trip a Pod (PRD §6).
 *
 * Export: walks the pod, its boards/columns, attached agents, agent_skills,
 * referenced knowledge, and produces a self-contained PodBundle that can be
 * round-tripped back via import. References across nested entities are by
 * name/slug, never UUID, so the bundle stays portable across accounts and
 * databases.
 *
 * Import: Zod-parses the bundle FIRST, then runs all writes inside a logical
 * transaction (best-effort on the JS side — we don't wrap the import in a
 * single DB transaction yet). On failure we surface the partial write to the
 * caller; v1.1 will move this to a server-side RPC.
 *
 * Per PRD §6.1, integration secrets are NEVER exported; the importer surfaces
 * a `missing_integrations` list the user can wire up post-install.
 */
@Injectable()
export class PodBundleService {
  private readonly logger = new Logger(PodBundleService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  // ============================================================
  // EXPORT
  // ============================================================

  async export(accountId: string, podId: string): Promise<PodBundle> {
    const [pod] = await this.db
      .select()
      .from(pods)
      .where(and(eq(pods.accountId, accountId), eq(pods.id, podId)))
      .limit(1);
    if (!pod) throw new NotFoundException('Pod not found');

    // Load boards in this pod (board_instances pinned to pod_id) + steps.
    const boardRows = await this.db
      .select()
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.accountId, accountId),
          eq(boardInstances.podId, podId),
        ),
      )
      .orderBy(boardInstances.displayOrder);

    const boardIds = boardRows.map((b) => b.id);
    const stepRows = boardIds.length
      ? await this.db
          .select()
          .from(boardSteps)
          .where(inArray(boardSteps.boardInstanceId, boardIds))
      : [];

    // Backbone connection slug for the pod's default + per-agent.
    const backboneSlugCache = new Map<string, string>();
    const db = this.db;
    async function resolveBackboneSlug(
      backboneId: string | null | undefined,
    ): Promise<string | null> {
      if (!backboneId) return null;
      if (backboneSlugCache.has(backboneId))
        return backboneSlugCache.get(backboneId)!;
      const [data] = await db
        .select({ id: backboneConnections.id, name: backboneConnections.name })
        .from(backboneConnections)
        .where(eq(backboneConnections.id, backboneId))
        .limit(1);
      const slug = (data?.name as string | undefined) ?? null;
      if (slug) backboneSlugCache.set(backboneId, slug);
      return slug ?? null;
    }

    // Agents that explicitly belong to this pod. We don't have a pods_agents
    // join in v1, so we scope agents by membership in agent_config or via
    // agents that have skills referenced by this pod's columns. For v1 we
    // export the pilot agent (if any) plus every agent referenced by any
    // column on any board in this pod.
    const stepAgentIds = new Set<string>();
    if (pod.pilotAgentId) stepAgentIds.add(pod.pilotAgentId);
    // Future: per-step agent assignment column. For now, agents come along
    // by virtue of being the pod's pilot.

    const agentRows: any[] = [];
    if (stepAgentIds.size > 0) {
      const data = await this.db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.accountId, accountId),
            inArray(agents.id, [...stepAgentIds]),
          ),
        );
      agentRows.push(...data);
    }

    // Agent skills (id->skill_id map)
    const agentSkillMap = new Map<string, string[]>();
    if (agentRows.length > 0) {
      const agentSkillRows = await this.db
        .select({
          agentId: agentSkills.agentId,
          skillId: agentSkills.skillId,
          isActive: agentSkills.isActive,
        })
        .from(agentSkills)
        .where(
          inArray(
            agentSkills.agentId,
            agentRows.map((a) => a.id),
          ),
        );
      for (const row of agentSkillRows ?? []) {
        if (!row.isActive) continue;
        if (!agentSkillMap.has(row.agentId)) agentSkillMap.set(row.agentId, []);
        agentSkillMap.get(row.agentId)!.push(row.skillId);
      }
    }

    // Skills referenced by columns + by exported agents.
    const skillIds = new Set<string>();
    for (const step of stepRows ?? []) {
      for (const sid of (step.skillIds ?? []) as string[]) skillIds.add(sid);
    }
    for (const skillList of agentSkillMap.values()) {
      for (const sid of skillList) skillIds.add(sid);
    }

    const skillRows: any[] = [];
    if (skillIds.size > 0) {
      const data = await this.db
        .select({
          id: skills.id,
          name: skills.name,
          description: skills.description,
          instructions: skills.instructions,
          source_type: skills.sourceType,
          source_uri: skills.sourceUri,
          source_version: skills.sourceVersion,
          skill_type: skills.skillType,
        })
        .from(skills)
        .where(
          and(eq(skills.accountId, accountId), inArray(skills.id, [...skillIds])),
        );
      skillRows.push(...data);
    }
    const skillIdToName = new Map(skillRows.map((s: any) => [s.id, s.name]));

    // Knowledge referenced by columns.
    const knowledgeIds = new Set<string>();
    for (const step of stepRows ?? []) {
      for (const kid of (step.knowledgeBaseIds ?? []) as string[])
        knowledgeIds.add(kid);
    }
    const knowledgeRows: any[] = [];
    if (knowledgeIds.size > 0) {
      const data = await this.db
        .select({
          id: knowledgeDocs.id,
          title: knowledgeDocs.title,
          content: knowledgeDocs.content,
          is_master: knowledgeDocs.isMaster,
        })
        .from(knowledgeDocs)
        .where(
          and(
            eq(knowledgeDocs.accountId, accountId),
            inArray(knowledgeDocs.id, [...knowledgeIds]),
          ),
        );
      knowledgeRows.push(...data);
    }
    const knowledgeIdToTitle = new Map(
      knowledgeRows.map((k: any) => [k.id, k.title]),
    );

    // Build the bundle — references resolved to names where possible.
    const bundledBoards: BundledBoard[] = (boardRows ?? []).map((b: any) => ({
      name: b.name,
      description: b.description ?? null,
      icon: b.icon ?? 'layout-grid',
      color: b.color ?? '#6366f1',
      tags: Array.isArray(b.tags) ? b.tags : [],
      display_order: b.displayOrder ?? 0,
      columns: (stepRows ?? [])
        .filter((s: any) => s.boardInstanceId === b.id)
        .sort((a: any, c: any) => a.position - c.position)
        .map((s: any) => ({
          step_key: s.stepKey,
          name: s.name,
          step_type: s.stepType,
          position: s.position,
          color: s.color ?? null,
          ai_enabled: !!s.aiEnabled,
          ai_first: !!s.aiFirst,
          system_prompt: s.systemPrompt ?? null,
          model_override: s.modelOverride ?? null,
          temperature: s.temperature ?? null,
          max_retries: s.maxRetries ?? 2,
          timeout_seconds: s.timeoutSeconds ?? 120,
          skill_names: ((s.skillIds ?? []) as string[])
            .map((id) => skillIdToName.get(id))
            .filter((n): n is string => !!n),
          knowledge_titles: ((s.knowledgeBaseIds ?? []) as string[])
            .map((id) => knowledgeIdToTitle.get(id))
            .filter((t): t is string => !!t),
          required_tool_ids: Array.isArray(s.requiredToolIds)
            ? s.requiredToolIds
            : [],
          input_fields: Array.isArray(s.inputFields) ? s.inputFields : [],
          output_fields: Array.isArray(s.outputFields) ? s.outputFields : [],
          trigger_type: s.triggerType ?? 'manual',
          trigger_config: s.triggerConfig ?? {},
          on_complete_step_key: s.onCompleteStepKey ?? null,
        })),
    }));

    const bundledAgents: BundledAgent[] = await Promise.all(
      agentRows.map(async (a: any) => ({
        name: a.name,
        slug: a.slug,
        description: a.description ?? null,
        persona: a.persona ?? null,
        agent_type: a.agentType ?? 'worker',
        color: a.color ?? null,
        max_concurrent_tasks: a.maxConcurrentTasks ?? 3,
        backbone_slug: await resolveBackboneSlug(a.backboneConnectionId),
        model_override: a.modelOverride ?? null,
        skill_names: (agentSkillMap.get(a.id) ?? [])
          .map((sid) => skillIdToName.get(sid))
          .filter((n): n is string => !!n),
      })),
    );

    const bundledSkills: BundledSkill[] = skillRows.map((s: any) => ({
      name: s.name,
      description: s.description ?? null,
      // Custom skills inline their instructions; external sources keep a stub
      // so the importer can re-resolve via Skills Sync.
      source_type:
        s.source_type === 'disk-scan' || s.source_type === 'git-repo'
          ? 'git-repo'
          : s.source_type === 'marketplace'
            ? 'marketplace'
            : 'custom',
      instructions: s.source_type === 'custom' ? s.instructions ?? '' : '',
      source_uri: s.source_uri ?? null,
      source_version: s.source_version ?? null,
      skill_type: (s.skill_type ?? 'general') as BundledSkill['skill_type'],
    }));

    const bundledKnowledge: BundledKnowledge[] = knowledgeRows.map(
      (k: any) => ({
        title: k.title,
        content: k.content ?? '',
        is_master: !!k.is_master,
      }),
    );

    // Integrations required: derive from board_integration_refs for the pod's boards.
    const integrationsRequired: BundledIntegrationRequirement[] = [];
    if (boardIds.length > 0) {
      const refs = await this.db.query.boardIntegrationRefs.findMany({
        where: inArray(boardIntegrationRefs.boardId, boardIds),
        with: {
          integrationConnection: {
            with: { integrationDefinition: true },
          },
        },
      });
      const seen = new Set<string>();
      for (const r of refs ?? []) {
        const def = (r.integrationConnection as any)?.integrationDefinition;
        if (!def?.slug || seen.has(def.slug)) continue;
        seen.add(def.slug);
        integrationsRequired.push({
          slug: def.slug,
          display_name: def.name ?? def.slug,
          optional: false,
          config_hint: {},
        });
      }
    }

    const bundle: PodBundle = {
      bundle_version: POD_BUNDLE_VERSION,
      metadata: {
        title: pod.name,
        summary: pod.description ?? undefined,
        tags: [],
        created_at: new Date().toISOString(),
        source_account_id: accountId,
        pod_version: '1.0.0',
      },
      pod: {
        name: pod.name,
        slug: pod.slug,
        description: pod.description ?? null,
        icon: pod.icon ?? 'layers',
        color: pod.color ?? '#6366f1',
        autonomy_level: pod.autonomyLevel ?? 1,
        pilot_agent_slug:
          agentRows.find((a: any) => a.id === pod.pilotAgentId)?.slug ?? null,
        backbone_slug: await resolveBackboneSlug(pod.backboneConnectionId),
        agent_config: (pod.agentConfig as Record<string, unknown>) ?? {},
      },
      boards: bundledBoards,
      agents: bundledAgents,
      skills: bundledSkills,
      knowledge: bundledKnowledge,
      integrations_required: integrationsRequired,
    };

    // Validate our own output before returning — guards against schema drift.
    return PodBundleSchema.parse(bundle);
  }

  // ============================================================
  // IMPORT
  // ============================================================

  async import(accountId: string, raw: unknown): Promise<ImportReport> {
    let bundle: PodBundle;
    try {
      bundle = PodBundleSchema.parse(raw);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Pod bundle is invalid',
          issues: err.issues,
        });
      }
      throw err;
    }

    if (bundle.bundle_version !== POD_BUNDLE_VERSION) {
      throw new BadRequestException(
        `Unsupported bundle_version "${bundle.bundle_version}"; this server expects "${POD_BUNDLE_VERSION}"`,
      );
    }

    const report: ImportReport = {
      pod_id: '',
      created: { boards: 0, columns: 0, agents: 0, skills: 0, knowledge: 0 },
      matched: { skills: 0, agents: 0, backbones: 0 },
      missing_integrations: [],
    };

    // 1. Resolve / create skills (deduped by name within the destination account).
    const existingSkillsByName = await this.fetchSkillsByName(
      accountId,
      bundle.skills.map((s) => s.name),
    );
    const skillBundleNameToId = new Map<string, string>();
    for (const s of bundle.skills) {
      const existing = existingSkillsByName.get(s.name);
      if (existing) {
        skillBundleNameToId.set(s.name, existing.id);
        report.matched.skills += 1;
        continue;
      }
      let data: { id: string; name: string } | undefined;
      try {
        const rows = await this.db
          .insert(skills)
          .values({
            accountId,
            name: s.name,
            description: s.description ?? null,
            instructions: s.instructions ?? '',
            sourceType: s.source_type,
            sourceUri: s.source_uri ?? null,
            sourceVersion: s.source_version ?? null,
            skillType: s.skill_type,
            isActive: true,
          })
          .returning({ id: skills.id, name: skills.name });
        data = rows[0];
      } catch (error: any) {
        throw new BadRequestException(
          `Failed to create skill "${s.name}": ${error?.message ?? 'unknown error'}`,
        );
      }
      if (!data) {
        throw new BadRequestException(
          `Failed to create skill "${s.name}": unknown error`,
        );
      }
      skillBundleNameToId.set(s.name, data.id);
      report.created.skills += 1;
    }

    // 2. Resolve backbones by slug (best-effort; missing slugs become null).
    const backboneSlugToId = await this.fetchBackbonesBySlug(
      accountId,
      [
        bundle.pod.backbone_slug,
        ...bundle.agents.map((a) => a.backbone_slug ?? null),
      ].filter((s): s is string => !!s),
    );
    if (
      bundle.pod.backbone_slug &&
      backboneSlugToId.has(bundle.pod.backbone_slug)
    ) {
      report.matched.backbones += 1;
    }

    // 3. Resolve / create agents (by slug within the destination account).
    const existingAgentsBySlug = await this.fetchAgentsBySlug(
      accountId,
      bundle.agents.map((a) => a.slug),
    );
    const agentSlugToId = new Map<string, string>();
    for (const a of bundle.agents) {
      const existing = existingAgentsBySlug.get(a.slug);
      if (existing) {
        agentSlugToId.set(a.slug, existing.id);
        report.matched.agents += 1;
        continue;
      }
      let data: { id: string; slug: string } | undefined;
      try {
        const rows = await this.db
          .insert(agents)
          .values({
            accountId,
            name: a.name,
            slug: a.slug,
            description: a.description ?? null,
            persona: a.persona ?? null,
            agentType: a.agent_type,
            color: a.color ?? null,
            maxConcurrentTasks: a.max_concurrent_tasks,
            backboneConnectionId: a.backbone_slug
              ? backboneSlugToId.get(a.backbone_slug) ?? null
              : null,
            modelOverride: a.model_override ?? null,
            isActive: true,
          })
          .returning({ id: agents.id, slug: agents.slug });
        data = rows[0];
      } catch (error: any) {
        throw new BadRequestException(
          `Failed to create agent "${a.slug}": ${error?.message ?? 'unknown error'}`,
        );
      }
      if (!data) {
        throw new BadRequestException(
          `Failed to create agent "${a.slug}": unknown error`,
        );
      }
      const createdAgent = data;
      agentSlugToId.set(a.slug, createdAgent.id);
      report.created.agents += 1;

      // Wire skills onto the agent.
      const links = a.skill_names
        .map((sn) => skillBundleNameToId.get(sn) ?? existingSkillsByName.get(sn)?.id)
        .filter((id): id is string => !!id);
      if (links.length > 0) {
        try {
          await this.db.insert(agentSkills).values(
            links.map((sid) => ({
              agentId: createdAgent.id,
              skillId: sid,
              isActive: true,
            })),
          );
        } catch (linkErr: any) {
          this.logger.warn(
            `agent_skills link failed for ${a.slug}: ${linkErr?.message}`,
          );
        }
      }
    }

    // 4. Create the pod (under a unique slug — append "-N" if taken).
    const finalSlug = await this.uniqueSlug(accountId, bundle.pod.slug);
    const pilotAgentId = bundle.pod.pilot_agent_slug
      ? agentSlugToId.get(bundle.pod.pilot_agent_slug) ??
        existingAgentsBySlug.get(bundle.pod.pilot_agent_slug)?.id ??
        null
      : null;
    const podBackboneId = bundle.pod.backbone_slug
      ? backboneSlugToId.get(bundle.pod.backbone_slug) ?? null
      : null;
    let podRow: { id: string; slug: string } | undefined;
    try {
      const rows = await this.db
        .insert(pods)
        .values({
          accountId,
          name: bundle.pod.name,
          slug: finalSlug,
          description: bundle.pod.description ?? null,
          icon: bundle.pod.icon,
          color: bundle.pod.color,
          autonomyLevel: bundle.pod.autonomy_level,
          pilotAgentId: pilotAgentId,
          backboneConnectionId: podBackboneId,
          agentConfig: bundle.pod.agent_config,
        })
        .returning({ id: pods.id, slug: pods.slug });
      podRow = rows[0];
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to create pod: ${error?.message ?? 'unknown error'}`,
      );
    }
    if (!podRow) {
      throw new BadRequestException(`Failed to create pod: unknown error`);
    }
    const createdPod = podRow;
    report.pod_id = createdPod.id;

    // 5. Knowledge — create directly on account (not pod-scoped today).
    const knowledgeTitleToId = new Map<string, string>();
    for (const k of bundle.knowledge) {
      // Skip knowledge titles that already exist for this account to avoid
      // bloating the master-doc constraint.
      const [existing] = await this.db
        .select({ id: knowledgeDocs.id })
        .from(knowledgeDocs)
        .where(
          and(
            eq(knowledgeDocs.accountId, accountId),
            eq(knowledgeDocs.title, k.title),
          ),
        )
        .limit(1);
      if (existing) {
        knowledgeTitleToId.set(k.title, existing.id);
        continue;
      }
      let data: { id: string; title: string } | undefined;
      try {
        const rows = await this.db
          .insert(knowledgeDocs)
          .values({
            accountId,
            title: k.title,
            content: k.content,
            isMaster: false, // imported docs default to non-master to avoid unique-master conflicts
          })
          .returning({ id: knowledgeDocs.id, title: knowledgeDocs.title });
        data = rows[0];
      } catch (error: any) {
        this.logger.warn(
          `Knowledge import skipped "${k.title}": ${error?.message}`,
        );
        continue;
      }
      if (!data) {
        continue;
      }
      knowledgeTitleToId.set(k.title, data.id);
      report.created.knowledge += 1;
    }

    // 6. Boards + columns.
    for (const b of bundle.boards) {
      let boardRow: { id: string } | undefined;
      try {
        const rows = await this.db
          .insert(boardInstances)
          .values({
            accountId,
            name: b.name,
            description: b.description ?? null,
            icon: b.icon,
            color: b.color,
            tags: b.tags,
            displayOrder: b.display_order,
            podId: createdPod.id,
          })
          .returning({ id: boardInstances.id });
        boardRow = rows[0];
      } catch (error: any) {
        throw new BadRequestException(
          `Failed to create board "${b.name}": ${error?.message ?? 'unknown error'}`,
        );
      }
      if (!boardRow) {
        throw new BadRequestException(
          `Failed to create board "${b.name}": unknown error`,
        );
      }
      const createdBoard = boardRow;
      report.created.boards += 1;

      for (const c of b.columns) {
        const skillIds = c.skill_names
          .map((sn) => skillBundleNameToId.get(sn) ?? existingSkillsByName.get(sn)?.id)
          .filter((id): id is string => !!id);
        const knowledgeIds = c.knowledge_titles
          .map((kt) => knowledgeTitleToId.get(kt))
          .filter((id): id is string => !!id);
        try {
          await this.db.insert(boardSteps).values({
            boardInstanceId: createdBoard.id,
            stepKey: c.step_key,
            name: c.name,
            stepType: c.step_type,
            position: c.position,
            color: c.color ?? null,
            aiEnabled: c.ai_enabled,
            aiFirst: c.ai_first,
            systemPrompt: c.system_prompt ?? null,
            modelOverride: c.model_override ?? null,
            temperature: c.temperature ?? null,
            maxRetries: c.max_retries,
            timeoutSeconds: c.timeout_seconds,
            skillIds: skillIds,
            knowledgeBaseIds: knowledgeIds,
            requiredToolIds: c.required_tool_ids,
            inputFields: c.input_fields,
            outputFields: c.output_fields,
            triggerType: c.trigger_type,
            triggerConfig: c.trigger_config,
            onCompleteStepKey: c.on_complete_step_key ?? null,
          });
        } catch (stepErr: any) {
          throw new BadRequestException(
            `Failed to create column "${c.step_key}" on board "${b.name}": ${stepErr?.message}`,
          );
        }
        report.created.columns += 1;
      }
    }

    // 7. Surface integrations the user must configure.
    if (bundle.integrations_required.length > 0) {
      const existingConns = await this.db.query.integrationConnections.findMany({
        where: eq(integrationConnections.accountId, accountId),
        with: {
          integrationDefinition: { columns: { slug: true } },
        },
      });
      const have = new Set(
        (existingConns ?? [])
          .map((row: any) => (row.integrationDefinition as any)?.slug)
          .filter(Boolean),
      );
      report.missing_integrations = bundle.integrations_required.filter(
        (i) => !have.has(i.slug),
      );
    }

    return report;
  }

  // ------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------

  private async fetchSkillsByName(
    accountId: string,
    names: string[],
  ): Promise<Map<string, { id: string; name: string }>> {
    if (names.length === 0) return new Map();
    const data = await this.db
      .select({ id: skills.id, name: skills.name })
      .from(skills)
      .where(and(eq(skills.accountId, accountId), inArray(skills.name, names)));
    return new Map(
      (data ?? []).map((s: any) => [s.name, { id: s.id, name: s.name }]),
    );
  }

  private async fetchAgentsBySlug(
    accountId: string,
    slugs: string[],
  ): Promise<Map<string, { id: string; slug: string }>> {
    if (slugs.length === 0) return new Map();
    const data = await this.db
      .select({ id: agents.id, slug: agents.slug })
      .from(agents)
      .where(and(eq(agents.accountId, accountId), inArray(agents.slug, slugs)));
    return new Map(
      (data ?? []).map((a: any) => [a.slug, { id: a.id, slug: a.slug }]),
    );
  }

  private async fetchBackbonesBySlug(
    accountId: string,
    slugs: string[],
  ): Promise<Map<string, string>> {
    if (slugs.length === 0) return new Map();
    const data = await this.db
      .select({ id: backboneConnections.id, name: backboneConnections.name })
      .from(backboneConnections)
      .where(eq(backboneConnections.accountId, accountId));
    const map = new Map<string, string>();
    for (const conn of data ?? []) {
      const slug = conn.name;
      if (slug && slugs.includes(slug)) map.set(slug, conn.id);
    }
    return map;
  }

  private async uniqueSlug(
    accountId: string,
    candidate: string,
  ): Promise<string> {
    let attempt = candidate;
    let suffix = 1;
    while (true) {
      const [data] = await this.db
        .select({ id: pods.id })
        .from(pods)
        .where(and(eq(pods.accountId, accountId), eq(pods.slug, attempt)))
        .limit(1);
      if (!data) return attempt;
      suffix += 1;
      attempt = `${candidate}-${suffix}`;
      if (suffix > 100) return `${candidate}-${Date.now()}`;
    }
  }
}
