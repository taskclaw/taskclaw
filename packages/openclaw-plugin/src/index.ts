import { registerSyncSkill } from './rpc/sync-skill';
import { registerDeleteSkill } from './rpc/delete-skill';
import { registerVerifySkill } from './rpc/verify-skill';
import { registerListSkills } from './rpc/list-skills';
import { registerHealth } from './rpc/health';

const DEFAULT_SKILLS_BASE_PATH = '~/.openclaw/skills';

/**
 * TaskClaw Sync Plugin for OpenClaw
 *
 * Exposes RPC endpoints that allow the TaskClaw backend to manage
 * SKILL.md files on the OpenClaw server via HTTP. No SSH needed.
 *
 * RPC Methods:
 * - taskclaw.syncSkill   — Write/update a category's SKILL.md
 * - taskclaw.deleteSkill  — Remove a category's skill file
 * - taskclaw.verifySkill  — Read back a file and return its hash
 * - taskclaw.listSkills   — List all taskclaw-managed skills
 * - taskclaw.health       — Plugin health check
 */
export default function register(api: any): void {
  const config = api.getConfig?.() || {};
  const skillsBasePath: string = config.skillsBasePath || DEFAULT_SKILLS_BASE_PATH;

  api.logger?.info(`TaskClaw Sync plugin starting — skills path: ${skillsBasePath}`);

  // Register all RPC methods
  registerSyncSkill(api, skillsBasePath);
  registerDeleteSkill(api, skillsBasePath);
  registerVerifySkill(api, skillsBasePath);
  registerListSkills(api, skillsBasePath);
  registerHealth(api, skillsBasePath);

  api.logger?.info('TaskClaw Sync plugin ready — 5 RPC methods registered');
}
