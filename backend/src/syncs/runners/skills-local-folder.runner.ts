import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import {
  DEFAULT_LOCAL_SKILL_PATHS,
  LocalFolderSyncConfigSchema,
  type SyncRow,
} from '../dto/syncs.schema';
import { SyncsService, type SyncRunner } from '../syncs.service';

interface ParsedSkill {
  name: string;
  description?: string;
  version?: string;
  raw_frontmatter: Record<string, unknown>;
  body: string;
  source_uri: string; // file://...
  absolute_path: string;
}

interface RunResult {
  status: 'ok' | 'error' | 'partial';
  items_added: number;
  items_updated: number;
  items_removed: number;
  log_excerpt?: string;
  error?: string;
}

/**
 * SkillsLocalFolderRunner — Walks configured directories on the local
 * filesystem, finds SKILL.md files, parses their YAML frontmatter, and
 * upserts a row into `skills` per skill keyed by (account_id,
 * source_type='disk-scan', source_uri='file://<absolute-path>').
 *
 * Skills imported via sync are *catalog* rows: they appear in the slash-
 * command palette under "On your machine" but are not yet usable by agents
 * until the user explicitly imports them (POST /skills/import). The
 * `locally_available` flag is what the palette filters on.
 *
 * Removal: any disk-scan row whose source_uri is no longer present on disk
 * is marked `locally_available=false` rather than deleted, so we don't
 * remove a skill the user has already imported into an agent.
 */
@Injectable()
export class SkillsLocalFolderRunner implements OnModuleInit, SyncRunner {
  readonly id = 'skills-local-folder';
  readonly handles = { sync_type: 'skills', source_kind: 'local-folder' };

  private readonly logger = new Logger(SkillsLocalFolderRunner.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly syncs: SyncsService,
  ) {}

  onModuleInit() {
    this.syncs.registerRunner(this);
  }

  async run(sync: SyncRow): Promise<RunResult> {
    const config = LocalFolderSyncConfigSchema.safeParse(sync.config);
    const paths = config.success ? config.data.paths : DEFAULT_LOCAL_SKILL_PATHS;

    let added = 0;
    let updated = 0;
    let removed = 0;
    const errors: string[] = [];

    // Walk all roots, expand globs, parse SKILL.md files.
    const found: ParsedSkill[] = [];
    for (const rawRoot of paths) {
      const expandedRoots = await this.expandGlobs(this.expandHome(rawRoot));
      for (const root of expandedRoots) {
        try {
          const skills = await this.scanRoot(root);
          found.push(...skills);
        } catch (err) {
          errors.push(`Scan ${root}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    this.logger.log(
      `Sync ${sync.id}: scanned ${paths.length} root(s), found ${found.length} SKILL.md files`,
    );

    // Upsert into DB.
    const client = this.supabaseAdmin.getClient();

    // 1. Existing rows owned BY THIS SYNC, keyed by source_uri. Earlier we
    //    looked at every disk-scan row in the account, which meant scans of
    //    one sync clobbered the locally_available flag on rows owned by
    //    OTHER syncs. Scope tight.
    const { data: existing } = await client
      .from('skills')
      .select('id, source_uri, source_version, name, description, locally_available')
      .eq('account_id', sync.account_id)
      .eq('source_type', 'disk-scan')
      .eq('source_sync_id', sync.id);

    const existingByUri = new Map(
      (existing ?? []).map((row: any) => [row.source_uri as string, row]),
    );

    // 2. Upsert each found skill.
    for (const parsed of found) {
      const previous = existingByUri.get(parsed.source_uri);
      const sanitizedName = this.sanitizeName(parsed.name);

      if (!previous) {
        // Insert new row. Conflict on (account_id, name) unique constraint
        // is possible if the user already has a custom skill with the same
        // name; in that case, we suffix with an index to make it unique.
        const safeName = await this.uniqueName(client, sync.account_id, sanitizedName);
        const { error: insertErr } = await client.from('skills').insert({
          account_id: sync.account_id,
          name: safeName,
          description: parsed.description ?? null,
          // skills.instructions has a 50KB CHECK constraint; SKILL.md bodies
          // sometimes exceed it. Truncate with a marker so the row still
          // inserts and the user sees what was clipped.
          instructions: this.clampInstructions(parsed.body),
          is_active: true,
          source_type: 'disk-scan',
          source_uri: parsed.source_uri,
          source_sync_id: sync.id,
          source_version: parsed.version ?? null,
          locally_available: true,
          skill_type: 'general',
        });
        if (insertErr) {
          errors.push(`Insert ${parsed.source_uri}: ${insertErr.message}`);
        } else {
          added += 1;
        }
        continue;
      }

      const versionChanged =
        (previous.source_version ?? null) !== (parsed.version ?? null);
      const descriptionChanged =
        (previous.description ?? '') !== (parsed.description ?? '');

      if (versionChanged || descriptionChanged) {
        const { error: updateErr } = await client
          .from('skills')
          .update({
            description: parsed.description ?? null,
            instructions: this.clampInstructions(parsed.body),
            source_version: parsed.version ?? null,
            source_sync_id: sync.id,
            locally_available: true,
          })
          .eq('id', previous.id);
        if (updateErr) {
          errors.push(`Update ${parsed.source_uri}: ${updateErr.message}`);
        } else {
          updated += 1;
        }
      } else if (!previous.locally_available) {
        // Disk file reappeared after going missing — flip flag back on.
        await client
          .from('skills')
          .update({ locally_available: true })
          .eq('id', previous.id);
        updated += 1;
      }
    }

    // 3. Mark vanished disk skills as unavailable.
    const foundUris = new Set(found.map((p) => p.source_uri));
    for (const [uri, row] of existingByUri) {
      if (!foundUris.has(uri)) {
        const { error: removeErr } = await client
          .from('skills')
          .update({ locally_available: false })
          .eq('id', (row as any).id)
          .eq('locally_available', true); // only if currently true
        if (removeErr) {
          errors.push(`Mark removed ${uri}: ${removeErr.message}`);
        } else {
          removed += 1;
        }
      }
    }

    const status: RunResult['status'] = errors.length === 0 ? 'ok' : 'partial';

    return {
      status,
      items_added: added,
      items_updated: updated,
      items_removed: removed,
      log_excerpt: errors.slice(0, 50).join('\n').slice(0, 4000) || undefined,
      error: errors[0],
    };
  }

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------

  private expandHome(p: string): string {
    if (p.startsWith('~/')) return path.join(homedir(), p.slice(2));
    if (p === '~') return homedir();
    return p;
  }

  /**
   * Minimal glob expansion supporting one `*` segment in the middle of a path
   * (e.g. ~/.claude/projects/* /skills). Does NOT support `**`. Anything more
   * complex is treated as a literal path.
   */
  private async expandGlobs(p: string): Promise<string[]> {
    if (!p.includes('*')) return [p];
    const parts = p.split(path.sep);
    const starIdx = parts.findIndex((seg) => seg.includes('*'));
    if (starIdx === -1) return [p];
    const prefix = parts.slice(0, starIdx).join(path.sep) || path.sep;
    const pattern = parts[starIdx];
    const suffix = parts.slice(starIdx + 1).join(path.sep);

    let entries: string[] = [];
    try {
      entries = await fs.readdir(prefix);
    } catch {
      return [];
    }

    const re = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    );
    const matches: string[] = [];
    for (const entry of entries) {
      if (!re.test(entry)) continue;
      const full = path.join(prefix, entry, suffix);
      // Recurse if the suffix still contains a star.
      if (full.includes('*')) {
        matches.push(...(await this.expandGlobs(full)));
      } else {
        matches.push(full);
      }
    }
    return matches;
  }

  /**
   * Walk a root directory looking for SKILL.md files. Bounded depth (8) to
   * prevent runaway scans — but enough to handle realistic monorepo layouts
   * like ~/Workspace/<org>/<project>/.claude/skills/<skill>/SKILL.md (depth 6).
   */
  private async scanRoot(root: string, depth = 0, maxDepth = 8): Promise<ParsedSkill[]> {
    const out: ParsedSkill[] = [];
    let stat;
    try {
      stat = await fs.stat(root);
    } catch {
      return out;
    }
    if (!stat.isDirectory()) return out;
    if (depth > maxDepth) return out;

    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return out;
    }

    for (const entry of entries) {
      const full = path.join(root, entry.name);
      if (entry.isFile() && entry.name === 'SKILL.md') {
        try {
          const parsed = await this.parseSkillFile(full);
          if (parsed) out.push(parsed);
        } catch (err) {
          this.logger.debug(`Skip ${full}: ${err instanceof Error ? err.message : err}`);
        }
      } else if (entry.isDirectory() && !this.shouldSkipDir(entry.name)) {
        const inner = await this.scanRoot(full, depth + 1, maxDepth);
        out.push(...inner);
      }
    }

    return out;
  }

  /**
   * Directories we never recurse into. Critically we DO walk into well-known
   * dot-dirs that hold skills (`.claude`, `.cursor`, `.copilot`, `.config`,
   * `.opencode`) — earlier versions skipped every dot-dir which silently
   * dropped repo-scoped skill folders nested under ~/Workspace/<repo>/.claude/.
   */
  private shouldSkipDir(name: string): boolean {
    const noise = new Set([
      'node_modules',
      'dist',
      'build',
      'out',
      '.next',
      '.turbo',
      '.svelte-kit',
      '.cache',
      '.git',
      '.github',
      '.idea',
      '.vscode',
      '.DS_Store',
      '__pycache__',
      'venv',
      '.venv',
      'target',
      'coverage',
      '.pytest_cache',
      '.mypy_cache',
    ]);
    return noise.has(name);
  }

  private async parseSkillFile(absolute: string): Promise<ParsedSkill | null> {
    const raw = await fs.readFile(absolute, 'utf8');
    const fm = this.extractFrontmatter(raw);
    if (!fm) return null;
    const name = typeof fm.parsed.name === 'string' ? fm.parsed.name : path.basename(path.dirname(absolute));
    const description =
      typeof fm.parsed.description === 'string' ? fm.parsed.description : undefined;
    let version: string | undefined;
    if (typeof fm.parsed.version === 'string') version = fm.parsed.version;
    if (
      !version &&
      typeof fm.parsed.metadata === 'object' &&
      fm.parsed.metadata !== null &&
      typeof (fm.parsed.metadata as any).version === 'string'
    ) {
      version = (fm.parsed.metadata as any).version as string;
    }
    return {
      name,
      description,
      version,
      raw_frontmatter: fm.parsed,
      body: raw,
      source_uri: `file://${absolute}`,
      absolute_path: absolute,
    };
  }

  /**
   * Tiny YAML frontmatter parser. Handles top-level key:value pairs,
   * single-line strings (quoted or unquoted), and one nested level under
   * `metadata:`. Does NOT support arrays or multi-line strings — the only
   * fields we care about (name, description, version) are simple scalars.
   * For complex frontmatter we capture the raw body verbatim and stash
   * the parsed object so callers can inspect.
   */
  private extractFrontmatter(
    raw: string,
  ): { parsed: Record<string, unknown>; body: string } | null {
    if (!raw.startsWith('---')) return null;
    const closeIdx = raw.indexOf('\n---', 3);
    if (closeIdx === -1) return null;
    const fmText = raw.slice(3, closeIdx).replace(/^\r?\n/, '');
    const body = raw.slice(closeIdx + 4).replace(/^\r?\n/, '');

    const parsed: Record<string, unknown> = {};
    const lines = fmText.split(/\r?\n/);
    let currentNestedKey: string | null = null;
    let nested: Record<string, unknown> | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      // Nested entry under `metadata:`
      if (currentNestedKey && /^\s+\S/.test(line)) {
        const m = line.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (m && nested) {
          nested[m[1]] = this.unquote(m[2]);
        }
        continue;
      }
      currentNestedKey = null;
      nested = null;
      const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2];
      if (value === '' && /^\s*$/.test(value)) {
        // Block scalar — start nested object only for known nested keys.
        if (key === 'metadata') {
          nested = {};
          parsed[key] = nested;
          currentNestedKey = key;
        }
      } else {
        parsed[key] = this.unquote(value);
      }
    }

    return { parsed, body };
  }

  private unquote(v: string): string {
    const s = v.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  /**
   * Skill names must be unique per account. Disk-scan skills sometimes
   * share names with already-existing custom skills; in that case append
   * `-disk`, `-disk-2`, etc.
   */
  /**
   * skills.instructions has a 50KB CHECK constraint; very long SKILL.md
   * files (notably some scaffold + connector docs) exceed it. We truncate
   * with a visible marker so the row still inserts and the user can see
   * that something was clipped.
   */
  private clampInstructions(body: string): string {
    const MAX = 51000; // a hair under the 51200 ceiling so leading text fits
    if (body.length <= MAX) return body;
    const trailer = '\n\n---\n*[truncated by Skills Sync — original SKILL.md is longer than 50KB]*\n';
    return body.slice(0, MAX - trailer.length) + trailer;
  }

  private sanitizeName(name: string): string {
    const cleaned = name.replace(/[^A-Za-z0-9_:.-]+/g, '-').slice(0, 100);
    return cleaned || 'unnamed-skill';
  }

  private async uniqueName(client: any, accountId: string, candidate: string): Promise<string> {
    let attempt = candidate;
    let suffix = 1;
    while (true) {
      const { data } = await client
        .from('skills')
        .select('id')
        .eq('account_id', accountId)
        .eq('name', attempt)
        .maybeSingle();
      if (!data) return attempt;
      suffix += 1;
      attempt = `${candidate}-disk-${suffix}`;
      if (suffix > 50) return `${candidate}-disk-${Date.now()}`;
    }
  }
}
