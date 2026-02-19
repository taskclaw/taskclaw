import { deleteSkillFile } from '../utils/file-manager';

/**
 * Register the taskclaw.deleteSkill RPC method.
 * Removes a category's skill directory and SKILL.md file.
 */
export function registerDeleteSkill(api: any, skillsBasePath: string): void {
  api.registerGatewayMethod('taskclaw.deleteSkill', async ({ body, respond }: any) => {
    try {
      const { categorySlug } = body || {};

      if (!categorySlug || typeof categorySlug !== 'string') {
        return respond(false, { error: 'categorySlug is required and must be a string' });
      }

      if (!/^[a-z0-9_-]+$/i.test(categorySlug)) {
        return respond(false, { error: 'categorySlug must be alphanumeric with hyphens/underscores only' });
      }

      const deleted = deleteSkillFile(skillsBasePath, categorySlug);

      respond(true, {
        ok: true,
        deleted,
        categorySlug,
      });
    } catch (err: any) {
      api.logger?.error(`taskclaw.deleteSkill failed: ${err.message}`);
      respond(false, { error: err.message });
    }
  });
}
