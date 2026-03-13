import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  writeSkillFile,
  deleteSkillFile,
  readSkillFile,
  listSkillSlugs,
  checkWriteAccess,
  resolveBasePath,
} from './utils/file-manager';
import * as fs from 'fs';

const DEFAULT_SKILLS_BASE_PATH = '~/.openclaw/skills';
const PLUGIN_VERSION = '1.0.0';

/**
 * TaskClaw Sync Plugin for OpenClaw
 *
 * Exposes HTTP endpoints under /api/taskclaw/* that allow the TaskClaw
 * backend to manage SKILL.md files on the OpenClaw server.
 *
 * HTTP Endpoints:
 *   POST /api/taskclaw/sync-skill   — Write/update a category's SKILL.md
 *   POST /api/taskclaw/delete-skill — Remove a category's skill file
 *   POST /api/taskclaw/verify-skill — Read back a file and return its hash
 *   GET  /api/taskclaw/list-skills  — List all taskclaw-managed skills
 *   GET  /api/taskclaw/health       — Plugin health check
 */

// ── Helpers ────────────────────────────────────────────────────────

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: any): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}

// ── HTTP Handler Factory ───────────────────────────────────────────

function createTaskClawHttpHandler(
  skillsBasePath: string,
  logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void },
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Only handle /api/taskclaw/* paths
    if (!url.pathname.startsWith('/api/taskclaw/')) {
      return false;
    }

    const route = url.pathname.slice('/api/taskclaw/'.length);

    try {
      // ── GET /api/taskclaw/health ─────────────────────────────
      if (route === 'health' && req.method === 'GET') {
        const resolved = resolveBasePath(skillsBasePath);
        const writable = checkWriteAccess(skillsBasePath);
        const dirExists = fs.existsSync(resolved);
        const slugs = listSkillSlugs(skillsBasePath);

        jsonResponse(res, 200, {
          ok: writable,
          pluginVersion: PLUGIN_VERSION,
          skillsBasePath: resolved,
          dirExists,
          writable,
          managedSkillCount: slugs.length,
          managedSlugs: slugs,
          timestamp: new Date().toISOString(),
        });
        return true;
      }

      // ── GET /api/taskclaw/list-skills ────────────────────────
      if (route === 'list-skills' && req.method === 'GET') {
        const slugs = listSkillSlugs(skillsBasePath);
        const skills = slugs.map((slug) => {
          const file = readSkillFile(skillsBasePath, slug);
          return {
            categorySlug: slug,
            exists: !!file,
            hash: file?.hash ?? null,
            contentLength: file?.content.length ?? 0,
          };
        });

        jsonResponse(res, 200, { ok: true, count: skills.length, skills });
        return true;
      }

      // ── POST /api/taskclaw/sync-skill ────────────────────────
      if (route === 'sync-skill' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { categorySlug, content, hash } = body || {};

        if (!categorySlug || typeof categorySlug !== 'string') {
          jsonResponse(res, 400, { ok: false, error: 'categorySlug is required and must be a string' });
          return true;
        }
        if (!content || typeof content !== 'string') {
          jsonResponse(res, 400, { ok: false, error: 'content is required and must be a string' });
          return true;
        }
        if (!/^[a-z0-9_-]+$/i.test(categorySlug)) {
          jsonResponse(res, 400, { ok: false, error: 'categorySlug must be alphanumeric with hyphens/underscores only' });
          return true;
        }

        const result = writeSkillFile(skillsBasePath, categorySlug, content);

        if (hash && result.hash !== hash) {
          logger?.warn(`Hash mismatch after write for ${categorySlug}: expected=${hash}, got=${result.hash}`);
        }

        logger?.info(`Synced skill: ${categorySlug} (${content.length} bytes)`);
        jsonResponse(res, 200, { ok: true, path: result.path, hash: result.hash, categorySlug });
        return true;
      }

      // ── POST /api/taskclaw/delete-skill ──────────────────────
      if (route === 'delete-skill' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { categorySlug } = body || {};

        if (!categorySlug || typeof categorySlug !== 'string') {
          jsonResponse(res, 400, { ok: false, error: 'categorySlug is required and must be a string' });
          return true;
        }
        if (!/^[a-z0-9_-]+$/i.test(categorySlug)) {
          jsonResponse(res, 400, { ok: false, error: 'categorySlug must be alphanumeric with hyphens/underscores only' });
          return true;
        }

        const deleted = deleteSkillFile(skillsBasePath, categorySlug);
        logger?.info(`Deleted skill: ${categorySlug} (existed=${deleted})`);
        jsonResponse(res, 200, { ok: true, deleted, categorySlug });
        return true;
      }

      // ── POST /api/taskclaw/verify-skill ──────────────────────
      if (route === 'verify-skill' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { categorySlug } = body || {};

        if (!categorySlug || typeof categorySlug !== 'string') {
          jsonResponse(res, 400, { ok: false, error: 'categorySlug is required and must be a string' });
          return true;
        }

        const result = readSkillFile(skillsBasePath, categorySlug);

        if (!result) {
          jsonResponse(res, 200, { exists: false, categorySlug, hash: null });
          return true;
        }

        jsonResponse(res, 200, { exists: true, categorySlug, hash: result.hash, contentLength: result.content.length });
        return true;
      }

      // Unknown taskclaw route
      jsonResponse(res, 404, { ok: false, error: `Unknown route: /api/taskclaw/${route}` });
      return true;
    } catch (err: any) {
      logger?.error(`TaskClaw HTTP error on ${route}: ${err.message}`);
      jsonResponse(res, 500, { ok: false, error: err.message });
      return true;
    }
  };
}

// ── Plugin Export ──────────────────────────────────────────────────

const plugin = {
  id: 'taskclaw-sync',
  name: 'TaskClaw Sync',
  description: 'Syncs skills and knowledge base from TaskClaw to OpenClaw as SKILL.md files',
  configSchema: {
    type: 'object' as const,
    properties: {
      skillsBasePath: {
        type: 'string' as const,
        default: '~/.openclaw/skills',
        description: 'Base directory where TaskClaw skill files are written',
      },
    },
  },
  register(api: any): void {
    const config = api.getConfig?.() || {};
    const skillsBasePath: string = config.skillsBasePath || DEFAULT_SKILLS_BASE_PATH;

    api.logger?.info(`TaskClaw Sync plugin starting — skills path: ${skillsBasePath}`);

    const httpHandler = createTaskClawHttpHandler(skillsBasePath, api.logger);
    api.registerHttpHandler(httpHandler);

    api.logger?.info('TaskClaw Sync plugin ready — HTTP handler registered at /api/taskclaw/*');
  },
};

export default plugin;
