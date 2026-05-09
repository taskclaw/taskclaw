import { z } from 'zod';

// ============================================================
// Sync — typed schemas (PRD §4.3 + §12.3 "Parse, don't cast")
// All HTTP request bodies and DB rows that cross a boundary are
// validated through these Zod schemas, not bare TS casts.
// ============================================================

export const SyncTypeSchema = z.enum(['skills', 'knowledge', 'pods']);

export const SourceKindSchema = z.enum([
  'local-folder',
  'git-repo',
  'marketplace',
  'notion',
  'gdrive',
]);

export const LocalFolderSyncConfigSchema = z.object({
  // Absolute paths or `~/`-prefixed paths the runner should walk.
  // The runner expands `~/` against the backend process HOME.
  paths: z.array(z.string().min(1)).min(1),
});

export const GitRepoSyncConfigSchema = z.object({
  repo_url: z.string().url(),
  // Optional path glob inside the repo (e.g. "skills/*", default "**/SKILL.md").
  path_glob: z.string().optional(),
  ref: z.string().optional(), // branch / tag / sha
  auth_token_ref: z.string().optional(), // reference into integration_connections
});

export const MarketplaceSyncConfigSchema = z.object({
  marketplace_url: z.string().url().optional(),
  selection: z.array(z.string().min(1)).optional(),
});

// Discriminated by source_kind in the runner. The DB column is JSONB so we
// don't enforce shape at write time — but the controller does, before insert.
export const SyncConfigSchema = z.union([
  LocalFolderSyncConfigSchema,
  GitRepoSyncConfigSchema,
  MarketplaceSyncConfigSchema,
  z.record(z.string(), z.unknown()),
]);

export const CreateSyncSchema = z.object({
  name: z.string().min(1).max(120),
  sync_type: SyncTypeSchema,
  source_kind: SourceKindSchema,
  config: z.record(z.string(), z.unknown()).default({}),
  schedule_cron: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
});

export const UpdateSyncSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  schedule_cron: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

export const SyncRowSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  name: z.string(),
  sync_type: SyncTypeSchema,
  source_kind: SourceKindSchema,
  config: z.record(z.string(), z.unknown()),
  schedule_cron: z.string().nullable(),
  last_run_at: z.string().nullable(),
  last_status: z.enum(['ok', 'error', 'partial', 'running']).nullable(),
  last_error: z.string().nullable(),
  enabled: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SyncRunRowSchema = z.object({
  id: z.string().uuid(),
  sync_id: z.string().uuid(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: z.enum(['running', 'ok', 'error', 'partial', 'cancelled']),
  items_added: z.number().int().nonnegative(),
  items_updated: z.number().int().nonnegative(),
  items_removed: z.number().int().nonnegative(),
  log_excerpt: z.string().nullable(),
  trigger: z.enum(['schedule', 'manual', 'hook']),
});

export type SyncType = z.infer<typeof SyncTypeSchema>;
export type SourceKind = z.infer<typeof SourceKindSchema>;
export type LocalFolderSyncConfig = z.infer<typeof LocalFolderSyncConfigSchema>;
export type GitRepoSyncConfig = z.infer<typeof GitRepoSyncConfigSchema>;
export type MarketplaceSyncConfig = z.infer<typeof MarketplaceSyncConfigSchema>;
export type CreateSyncInput = z.infer<typeof CreateSyncSchema>;
export type UpdateSyncInput = z.infer<typeof UpdateSyncSchema>;
export type SyncRow = z.infer<typeof SyncRowSchema>;
export type SyncRunRow = z.infer<typeof SyncRunRowSchema>;

export const DEFAULT_LOCAL_SKILL_PATHS = [
  '~/.claude/skills',
  '~/.claude/projects/*/skills',
  '~/.config/opencode/skills',
  '~/.copilot/skills',
  '~/.cursor/skills',
];
