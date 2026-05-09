import { z } from 'zod';

// ============================================================
// Pod Bundle (PRD §6) — the portable, self-contained payload
// you can email, publish, or git-commit and re-import into a
// different account. v1.0.0 ships only the primitives needed
// to round-trip a Pod: pod, boards, columns, skills, knowledge,
// integration "types required" (without secrets), default
// agents. Versioning beyond a string field is deferred (PRD §15).
// ============================================================

export const POD_BUNDLE_VERSION = '1.0.0' as const;

// --- nested entity schemas ---

const ColorHex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const BundledColumnSchema = z.object({
  step_key: z.string().min(1),
  name: z.string().min(1),
  step_type: z.string().min(1),
  position: z.number().int().nonnegative(),
  color: z.string().nullable().optional(),
  ai_enabled: z.boolean().default(false),
  ai_first: z.boolean().default(false),
  system_prompt: z.string().nullable().optional(),
  model_override: z.string().nullable().optional(),
  temperature: z.number().nullable().optional(),
  max_retries: z.number().int().nonnegative().default(2),
  timeout_seconds: z.number().int().nonnegative().default(120),
  // skill / knowledge references are by name, not UUID — the import
  // resolves them against the destination account or creates new rows.
  skill_names: z.array(z.string()).default([]),
  knowledge_titles: z.array(z.string()).default([]),
  required_tool_ids: z.array(z.string()).default([]),
  input_fields: z.array(z.unknown()).default([]),
  output_fields: z.array(z.unknown()).default([]),
  trigger_type: z.string().default('manual'),
  trigger_config: z.record(z.string(), z.unknown()).default({}),
  on_complete_step_key: z.string().nullable().optional(),
});

const BundledBoardSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  icon: z.string().default('layout-grid'),
  color: ColorHex.default('#6366f1'),
  tags: z.array(z.string()).default([]),
  display_order: z.number().int().nonnegative().default(0),
  // Mirrors board_steps rows for this board.
  columns: z.array(BundledColumnSchema).default([]),
});

const BundledSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  // Inlined for source_type='custom'; stub for git-repo / marketplace.
  source_type: z.enum(['custom', 'git-repo', 'marketplace']).default('custom'),
  // For source_type='custom' instructions is the full skill body (required).
  // For git-repo / marketplace the importer resolves the body from the
  // referenced source so instructions may be empty.
  instructions: z.string().default(''),
  source_uri: z.string().nullable().optional(),
  source_version: z.string().nullable().optional(),
  skill_type: z.enum(['general', 'integration', 'board', 'system']).default('general'),
});

const BundledKnowledgeSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(''),
  is_master: z.boolean().default(false),
});

const BundledIntegrationRequirementSchema = z.object({
  // The integration_definitions slug or category — e.g. "notion", "clickup",
  // "anthropic", "stripe". The importer surfaces missing connections in the
  // post-import banner ("Configure these to use the Pod").
  slug: z.string().min(1),
  display_name: z.string().min(1),
  optional: z.boolean().default(false),
  // Free-form JSON describing what fields the user will need to provide.
  config_hint: z.record(z.string(), z.unknown()).default({}),
});

const BundledAgentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().optional(),
  persona: z.string().nullable().optional(),
  agent_type: z.enum(['worker', 'pilot', 'coordinator']).default('worker'),
  color: z.string().nullable().optional(),
  max_concurrent_tasks: z.number().int().min(1).max(50).default(3),
  // Backbone references are by adapter slug; the importer matches against
  // backbone_connections in the destination account or surfaces a missing
  // connection requirement.
  backbone_slug: z.string().nullable().optional(),
  model_override: z.string().nullable().optional(),
  // Skills attached to this agent, by name. Resolved against the bundle's
  // skills array first, then against the destination account.
  skill_names: z.array(z.string()).default([]),
});

const BundledPodSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]?$/),
  description: z.string().nullable().optional(),
  icon: z.string().default('layers'),
  color: ColorHex.default('#6366f1'),
  autonomy_level: z.number().int().min(1).max(4).default(1),
  // Pilot agent referenced by slug if any; resolved against the bundled
  // agents array.
  pilot_agent_slug: z.string().nullable().optional(),
  // Default backbone for agents in the pod, by slug.
  backbone_slug: z.string().nullable().optional(),
  agent_config: z.record(z.string(), z.unknown()).default({}),
});

export const PodBundleSchema = z.object({
  bundle_version: z.literal(POD_BUNDLE_VERSION),
  // Free-form metadata — useful for marketplace listings, attribution, and
  // human-readable diffs. None of it is load-bearing on import.
  metadata: z
    .object({
      title: z.string().optional(),
      summary: z.string().optional(),
      tags: z.array(z.string()).default([]),
      author: z.string().optional(),
      created_at: z.string().optional(), // ISO
      source_account_id: z.string().uuid().optional(),
      pod_version: z.string().default('1.0.0'),
    })
    .default(() => ({ tags: [], pod_version: '1.0.0' })),
  pod: BundledPodSchema,
  boards: z.array(BundledBoardSchema).default([]),
  agents: z.array(BundledAgentSchema).default([]),
  skills: z.array(BundledSkillSchema).default([]),
  knowledge: z.array(BundledKnowledgeSchema).default([]),
  integrations_required: z.array(BundledIntegrationRequirementSchema).default([]),
});

export type PodBundle = z.infer<typeof PodBundleSchema>;
export type BundledPod = z.infer<typeof BundledPodSchema>;
export type BundledBoard = z.infer<typeof BundledBoardSchema>;
export type BundledColumn = z.infer<typeof BundledColumnSchema>;
export type BundledAgent = z.infer<typeof BundledAgentSchema>;
export type BundledSkill = z.infer<typeof BundledSkillSchema>;
export type BundledKnowledge = z.infer<typeof BundledKnowledgeSchema>;
export type BundledIntegrationRequirement = z.infer<
  typeof BundledIntegrationRequirementSchema
>;

export interface ImportReport {
  pod_id: string;
  created: {
    boards: number;
    columns: number;
    agents: number;
    skills: number;
    knowledge: number;
  };
  matched: {
    skills: number; // existing skill resolved by name; not re-created
    agents: number;
    backbones: number; // by slug
  };
  missing_integrations: BundledIntegrationRequirement[];
}
