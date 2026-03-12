import { checkWriteAccess, listSkillSlugs, resolveBasePath } from '../utils/file-manager';
import * as fs from 'fs';

const PLUGIN_VERSION = '1.0.0';

/**
 * Register the taskclaw.health RPC method.
 * Returns plugin health status including file system access and skill count.
 */
export function registerHealth(api: any, skillsBasePath: string): void {
  api.registerGatewayMethod('taskclaw.health', async ({ respond }: any) => {
    try {
      const resolved = resolveBasePath(skillsBasePath);
      const writable = checkWriteAccess(skillsBasePath);
      const dirExists = fs.existsSync(resolved);
      const slugs = listSkillSlugs(skillsBasePath);

      respond(true, {
        ok: writable,
        pluginVersion: PLUGIN_VERSION,
        skillsBasePath: resolved,
        dirExists,
        writable,
        managedSkillCount: slugs.length,
        managedSlugs: slugs,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      api.logger?.error(`taskclaw.health failed: ${err.message}`);
      respond(false, {
        ok: false,
        pluginVersion: PLUGIN_VERSION,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
