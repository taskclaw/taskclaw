import { writeSkillFile, computeHash } from '../utils/file-manager';

/**
 * Register the taskclaw.syncSkill RPC method.
 * Writes/updates a SKILL.md file for a given category.
 */
export function registerSyncSkill(api: any, skillsBasePath: string): void {
  api.registerGatewayMethod('taskclaw.syncSkill', async ({ body, respond }: any) => {
    try {
      const { categorySlug, content, hash } = body || {};

      if (!categorySlug || typeof categorySlug !== 'string') {
        return respond(false, { error: 'categorySlug is required and must be a string' });
      }

      if (!content || typeof content !== 'string') {
        return respond(false, { error: 'content is required and must be a string' });
      }

      // Validate slug (alphanumeric, hyphens, underscores only)
      if (!/^[a-z0-9_-]+$/i.test(categorySlug)) {
        return respond(false, { error: 'categorySlug must be alphanumeric with hyphens/underscores only' });
      }

      const result = writeSkillFile(skillsBasePath, categorySlug, content);

      // Verify hash if provided
      if (hash && result.hash !== hash) {
        api.logger?.warn(
          `Hash mismatch after write for ${categorySlug}: expected=${hash}, got=${result.hash}`,
        );
      }

      respond(true, {
        ok: true,
        path: result.path,
        hash: result.hash,
        categorySlug,
      });
    } catch (err: any) {
      api.logger?.error(`taskclaw.syncSkill failed: ${err.message}`);
      respond(false, { error: err.message });
    }
  });
}
