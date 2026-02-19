import { readSkillFile } from '../utils/file-manager';

/**
 * Register the taskclaw.verifySkill RPC method.
 * Reads back a SKILL.md file and returns its hash for verification.
 */
export function registerVerifySkill(api: any, skillsBasePath: string): void {
  api.registerGatewayMethod('taskclaw.verifySkill', async ({ body, respond }: any) => {
    try {
      const { categorySlug } = body || {};

      if (!categorySlug || typeof categorySlug !== 'string') {
        return respond(false, { error: 'categorySlug is required and must be a string' });
      }

      const result = readSkillFile(skillsBasePath, categorySlug);

      if (!result) {
        return respond(true, {
          exists: false,
          categorySlug,
          hash: null,
        });
      }

      respond(true, {
        exists: true,
        categorySlug,
        hash: result.hash,
        contentLength: result.content.length,
      });
    } catch (err: any) {
      api.logger?.error(`taskclaw.verifySkill failed: ${err.message}`);
      respond(false, { error: err.message });
    }
  });
}
