import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
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
 * transaction (best-effort on the JS side — Supabase doesn't expose multi-
 * statement transactions to PostgREST clients). On failure we surface the
 * partial write to the caller; v1.1 will move this to a server-side RPC.
 *
 * Per PRD §6.1, integration secrets are NEVER exported; the importer surfaces
 * a `missing_integrations` list the user can wire up post-install.
 */
@Injectable()
export class PodBundleService {
  private readonly logger = new Logger(PodBundleService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  // ============================================================
  // EXPORT
  // ============================================================

  async export(accountId: string, podId: string): Promise<PodBundle> {
    const client = this.supabaseAdmin.getClient();

    const { data: pod, error: podErr } = await client
      .from('pods')
      .select('*')
      .eq('account_id', accountId)
      .eq('id', podId)
      .single();
    if (podErr || !pod) throw new NotFoundException('Pod not found');

    // Load boards in this pod (board_instances pinned to pod_id) + steps.
    const { data: boardRows, error: boardErr } = await client
      .from('board_instances')
      .select('*')
      .eq('account_id', accountId)
      .eq('pod_id', podId)
      .order('display_order', { ascending: true });
    if (boardErr) throw new Error(boardErr.message);

    const boardIds = (boardRows ?? []).map((b: any) => b.id);
    const { data: stepRows } = boardIds.length
      ? await client.from('board_steps').select('*').in('board_instance_id', boardIds)
      : { data: [] as any[] };

    // Backbone connection slug for the pod's default + per-agent.
    const backboneSlugCache = new Map<string, string>();
    async function resolveBackboneSlug(
      backboneId: string | null | undefined,
    ): Promise<string | null> {
      if (!backboneId) return null;
      if (backboneSlugCache.has(backboneId)) return backboneSlugCache.get(backboneId)!;
      const { data } = await client
        .from('backbone_connections')
        .select('id, name, backbone_definition_id, backbone_definitions(slug)')
        .eq('id', backboneId)
        .maybeSingle();
      const slug =
        (data?.backbone_definitions as any)?.slug ??
        (data?.name as string | undefined) ??
        null;
      if (slug) backboneSlugCache.set(backboneId, slug);
      return slug ?? null;
    }

    // Agents that explicitly belong to this pod. We don't have a pods_agents
    // join in v1, so we scope agents by membership in agent_config or via
    // agents that have skills referenced by this pod's columns. For v1 we
    // export the pilot agent (if any) plus every agent referenced by any
    // column on any board in this pod.
    const stepAgentIds = new Set<string>();
    if (pod.pilot_agent_id) stepAgentIds.add(pod.pilot_agent_id);
    // Future: per-step agent assignment column. For now, agents come along
    // by virtue of being the pod's pilot.

    const agentRows: any[] = [];
    if (stepAgentIds.size > 0) {
      const { data } = await client
        .from('agents')
        .select('*')
        .eq('account_id', accountId)
        .in('id', [...stepAgentIds]);
      if (data) agentRows.push(...data);
    }

    // Agent skills (id->skill_id map)
    const agentSkillMap = new Map<string, string[]>();
    if (agentRows.length > 0) {
      const { data: agentSkillRows } = await client
        .from('agent_skills')
        .select('agent_id, skill_id, is_active')
        .in('agent_id', agentRows.map((a) => a.id));
      for (const row of agentSkillRows ?? []) {
        if (!row.is_active) continue;
        if (!agentSkillMap.has(row.agent_id)) agentSkillMap.set(row.agent_id, []);
        agentSkillMap.get(row.agent_id)!.push(row.skill_id);
      }
    }

    // Skills referenced by columns + by exported agents.
    const skillIds = new Set<string>();
    for (const step of stepRows ?? []) {
      for (const sid of (step.skill_ids ?? []) as string[]) skillIds.add(sid);
    }
    for (const skillList of agentSkillMap.values()) {
      for (const sid of skillList) skillIds.add(sid);
    }

    const skillRows: any[] = [];
    if (skillIds.size > 0) {
      const { data } = await client
        .from('skills')
        .select('id, name, description, instructions, source_type, source_uri, source_version, skill_type')
        .eq('account_id', accountId)
        .in('id', [...skillIds]);
      if (data) skillRows.push(...data);
    }
    const skillIdToName = new Map(skillRows.map((s: any) => [s.id, s.name]));

    // Knowledge referenced by columns.
    const knowledgeIds = new Set<string>();
    for (const step of stepRows ?? []) {
      for (const kid of (step.knowledge_base_ids ?? []) as string[]) knowledgeIds.add(kid);
    }
    const knowledgeRows: any[] = [];
    if (knowledgeIds.size > 0) {
      const { data } = await client
        .from('knowledge_docs')
        .select('id, title, content, is_master')
        .eq('account_id', accountId)
        .in('id', [...knowledgeIds]);
      if (data) knowledgeRows.push(...data);
    }
    const knowledgeIdToTitle = new Map(knowledgeRows.map((k: any) => [k.id, k.title]));

    // Build the bundle — references resolved to names where possible.
    const bundledBoards: BundledBoard[] = (boardRows ?? []).map((b: any) => ({
      name: b.name,
      description: b.description ?? null,
      icon: b.icon ?? 'layout-grid',
      color: b.color ?? '#6366f1',
      tags: Array.isArray(b.tags) ? b.tags : [],
      display_order: b.display_order ?? 0,
      columns: (stepRows ?? [])
        .filter((s: any) => s.board_instance_id === b.id)
        .sort((a: any, c: any) => a.position - c.position)
        .map((s: any) => ({
          step_key: s.step_key,
          name: s.name,
          step_type: s.step_type,
          position: s.position,
          color: s.color ?? null,
          ai_enabled: !!s.ai_enabled,
          ai_first: !!s.ai_first,
          system_prompt: s.system_prompt ?? null,
          model_override: s.model_override ?? null,
          temperature: s.temperature ?? null,
          max_retries: s.max_retries ?? 2,
          timeout_seconds: s.timeout_seconds ?? 120,
          skill_names: ((s.skill_ids ?? []) as string[])
            .map((id) => skillIdToName.get(id))
            .filter((n): n is string => !!n),
          knowledge_titles: ((s.knowledge_base_ids ?? []) as string[])
            .map((id) => knowledgeIdToTitle.get(id))
            .filter((t): t is string => !!t),
          required_tool_ids: Array.isArray(s.required_tool_ids) ? s.required_tool_ids : [],
          input_fields: Array.isArray(s.input_fields) ? s.input_fields : [],
          output_fields: Array.isArray(s.output_fields) ? s.output_fields : [],
          trigger_type: s.trigger_type ?? 'manual',
          trigger_config: s.trigger_config ?? {},
          on_complete_step_key: s.on_complete_step_key ?? null,
        })),
    }));

    const bundledAgents: BundledAgent[] = await Promise.all(
      agentRows.map(async (a: any) => ({
        name: a.name,
        slug: a.slug,
        description: a.description ?? null,
        persona: a.persona ?? null,
        agent_type: a.agent_type ?? 'worker',
        color: a.color ?? null,
        max_concurrent_tasks: a.max_concurrent_tasks ?? 3,
        backbone_slug: await resolveBackboneSlug(a.backbone_connection_id),
        model_override: a.model_override ?? null,
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

    const bundledKnowledge: BundledKnowledge[] = knowledgeRows.map((k: any) => ({
      title: k.title,
      content: k.content ?? '',
      is_master: !!k.is_master,
    }));

    // Integrations required: derive from board_integration_refs for the pod's boards.
    const integrationsRequired: BundledIntegrationRequirement[] = [];
    if (boardIds.length > 0) {
      const { data: refs } = await client
        .from('board_integration_refs')
        .select(
          'connection_id, integration_connections(integration_definition_id, integration_definitions(slug, display_name))',
        )
        .in('board_instance_id', boardIds);
      const seen = new Set<string>();
      for (const r of refs ?? []) {
        const def = (r.integration_connections as any)?.integration_definitions;
        if (!def?.slug || seen.has(def.slug)) continue;
        seen.add(def.slug);
        integrationsRequired.push({
          slug: def.slug,
          display_name: def.display_name ?? def.slug,
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
        autonomy_level: pod.autonomy_level ?? 1,
        pilot_agent_slug:
          agentRows.find((a: any) => a.id === pod.pilot_agent_id)?.slug ?? null,
        backbone_slug: await resolveBackboneSlug(pod.backbone_connection_id),
        agent_config: pod.agent_config ?? {},
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

    const client = this.supabaseAdmin.getClient();
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
      const { data, error } = await client
        .from('skills')
        .insert({
          account_id: accountId,
          name: s.name,
          description: s.description ?? null,
          instructions: s.instructions ?? '',
          source_type: s.source_type,
          source_uri: s.source_uri ?? null,
          source_version: s.source_version ?? null,
          skill_type: s.skill_type,
          is_active: true,
        })
        .select('id, name')
        .single();
      if (error || !data) {
        throw new BadRequestException(
          `Failed to create skill "${s.name}": ${error?.message ?? 'unknown error'}`,
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
    if (bundle.pod.backbone_slug && backboneSlugToId.has(bundle.pod.backbone_slug)) {
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
      const { data, error } = await client
        .from('agents')
        .insert({
          account_id: accountId,
          name: a.name,
          slug: a.slug,
          description: a.description ?? null,
          persona: a.persona ?? null,
          agent_type: a.agent_type,
          color: a.color ?? null,
          max_concurrent_tasks: a.max_concurrent_tasks,
          backbone_connection_id: a.backbone_slug
            ? backboneSlugToId.get(a.backbone_slug) ?? null
            : null,
          model_override: a.model_override ?? null,
          is_active: true,
        })
        .select('id, slug')
        .single();
      if (error || !data) {
        throw new BadRequestException(
          `Failed to create agent "${a.slug}": ${error?.message ?? 'unknown error'}`,
        );
      }
      agentSlugToId.set(a.slug, data.id);
      report.created.agents += 1;

      // Wire skills onto the agent.
      const links = a.skill_names
        .map((sn) => skillBundleNameToId.get(sn) ?? existingSkillsByName.get(sn)?.id)
        .filter((id): id is string => !!id);
      if (links.length > 0) {
        const { error: linkErr } = await client.from('agent_skills').insert(
          links.map((sid) => ({
            agent_id: data.id,
            skill_id: sid,
            is_active: true,
          })),
        );
        if (linkErr) {
          this.logger.warn(
            `agent_skills link failed for ${a.slug}: ${linkErr.message}`,
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
    const { data: podRow, error: podErr } = await client
      .from('pods')
      .insert({
        account_id: accountId,
        name: bundle.pod.name,
        slug: finalSlug,
        description: bundle.pod.description ?? null,
        icon: bundle.pod.icon,
        color: bundle.pod.color,
        autonomy_level: bundle.pod.autonomy_level,
        pilot_agent_id: pilotAgentId,
        backbone_connection_id: podBackboneId,
        agent_config: bundle.pod.agent_config,
      })
      .select('id, slug')
      .single();
    if (podErr || !podRow) {
      throw new BadRequestException(
        `Failed to create pod: ${podErr?.message ?? 'unknown error'}`,
      );
    }
    report.pod_id = podRow.id;

    // 5. Knowledge — create directly on account (not pod-scoped today).
    const knowledgeTitleToId = new Map<string, string>();
    for (const k of bundle.knowledge) {
      // Skip knowledge titles that already exist for this account to avoid
      // bloating the master-doc constraint.
      const { data: existing } = await client
        .from('knowledge_docs')
        .select('id')
        .eq('account_id', accountId)
        .eq('title', k.title)
        .maybeSingle();
      if (existing) {
        knowledgeTitleToId.set(k.title, existing.id);
        continue;
      }
      const { data, error } = await client
        .from('knowledge_docs')
        .insert({
          account_id: accountId,
          title: k.title,
          content: k.content,
          is_master: false, // imported docs default to non-master to avoid unique-master conflicts
        })
        .select('id, title')
        .single();
      if (error || !data) {
        this.logger.warn(`Knowledge import skipped "${k.title}": ${error?.message}`);
        continue;
      }
      knowledgeTitleToId.set(k.title, data.id);
      report.created.knowledge += 1;
    }

    // 6. Boards + columns.
    for (const b of bundle.boards) {
      const { data: boardRow, error: boardErr } = await client
        .from('board_instances')
        .insert({
          account_id: accountId,
          name: b.name,
          description: b.description ?? null,
          icon: b.icon,
          color: b.color,
          tags: b.tags,
          display_order: b.display_order,
          pod_id: podRow.id,
        })
        .select('id')
        .single();
      if (boardErr || !boardRow) {
        throw new BadRequestException(
          `Failed to create board "${b.name}": ${boardErr?.message ?? 'unknown error'}`,
        );
      }
      report.created.boards += 1;

      for (const c of b.columns) {
        const skillIds = c.skill_names
          .map((sn) => skillBundleNameToId.get(sn) ?? existingSkillsByName.get(sn)?.id)
          .filter((id): id is string => !!id);
        const knowledgeIds = c.knowledge_titles
          .map((kt) => knowledgeTitleToId.get(kt))
          .filter((id): id is string => !!id);
        const { error: stepErr } = await client.from('board_steps').insert({
          board_instance_id: boardRow.id,
          step_key: c.step_key,
          name: c.name,
          step_type: c.step_type,
          position: c.position,
          color: c.color ?? null,
          ai_enabled: c.ai_enabled,
          ai_first: c.ai_first,
          system_prompt: c.system_prompt ?? null,
          model_override: c.model_override ?? null,
          temperature: c.temperature ?? null,
          max_retries: c.max_retries,
          timeout_seconds: c.timeout_seconds,
          skill_ids: skillIds,
          knowledge_base_ids: knowledgeIds,
          required_tool_ids: c.required_tool_ids,
          input_fields: c.input_fields,
          output_fields: c.output_fields,
          trigger_type: c.trigger_type,
          trigger_config: c.trigger_config,
          on_complete_step_key: c.on_complete_step_key ?? null,
        });
        if (stepErr) {
          throw new BadRequestException(
            `Failed to create column "${c.step_key}" on board "${b.name}": ${stepErr.message}`,
          );
        }
        report.created.columns += 1;
      }
    }

    // 7. Surface integrations the user must configure.
    if (bundle.integrations_required.length > 0) {
      const slugs = bundle.integrations_required.map((i) => i.slug);
      const { data: existingConns } = await client
        .from('integration_connections')
        .select('integration_definitions(slug)')
        .eq('account_id', accountId);
      const have = new Set(
        (existingConns ?? [])
          .map((row: any) => (row.integration_definitions as any)?.slug)
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
    const client = this.supabaseAdmin.getClient();
    const { data } = await client
      .from('skills')
      .select('id, name')
      .eq('account_id', accountId)
      .in('name', names);
    return new Map((data ?? []).map((s: any) => [s.name, { id: s.id, name: s.name }]));
  }

  private async fetchAgentsBySlug(
    accountId: string,
    slugs: string[],
  ): Promise<Map<string, { id: string; slug: string }>> {
    if (slugs.length === 0) return new Map();
    const client = this.supabaseAdmin.getClient();
    const { data } = await client
      .from('agents')
      .select('id, slug')
      .eq('account_id', accountId)
      .in('slug', slugs);
    return new Map((data ?? []).map((a: any) => [a.slug, { id: a.id, slug: a.slug }]));
  }

  private async fetchBackbonesBySlug(
    accountId: string,
    slugs: string[],
  ): Promise<Map<string, string>> {
    if (slugs.length === 0) return new Map();
    const client = this.supabaseAdmin.getClient();
    const { data } = await client
      .from('backbone_connections')
      .select('id, name, backbone_definitions(slug)')
      .eq('account_id', accountId);
    const map = new Map<string, string>();
    for (const conn of data ?? []) {
      const slug = (conn.backbone_definitions as any)?.slug ?? conn.name;
      if (slug && slugs.includes(slug)) map.set(slug, conn.id);
    }
    return map;
  }

  private async uniqueSlug(accountId: string, candidate: string): Promise<string> {
    const client = this.supabaseAdmin.getClient();
    let attempt = candidate;
    let suffix = 1;
    while (true) {
      const { data } = await client
        .from('pods')
        .select('id')
        .eq('account_id', accountId)
        .eq('slug', attempt)
        .maybeSingle();
      if (!data) return attempt;
      suffix += 1;
      attempt = `${candidate}-${suffix}`;
      if (suffix > 100) return `${candidate}-${Date.now()}`;
    }
  }
}
