import { listSkillSlugs, readSkillFile } from '../utils/file-manager';

/**
 * Register the taskclaw.listSkills RPC method.
 * Lists all taskclaw-managed skill directories with their hashes.
 */
export function registerListSkills(api: any, skillsBasePath: string): void {
  api.registerGatewayMethod('taskclaw.listSkills', async ({ respond }: any) => {
    try {
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

      respond(true, {
        ok: true,
        count: skills.length,
        skills,
      });
    } catch (err: any) {
      api.logger?.error(`taskclaw.listSkills failed: ${err.message}`);
      respond(false, { error: err.message });
    }
  });
}
