import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { SkillsService } from '../skills/skills.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import * as crypto from 'crypto';

export interface CompiledAgent {
  content: string;
  hash: string;
  skillIds: string[];
  knowledgeDocId: string | null;
  categorySlug: string;
  categoryName: string;
}

/**
 * Compiles a category's linked skills + master knowledge doc into SKILL.md content.
 */
@Injectable()
export class AgentCompilerService {
  private readonly logger = new Logger(AgentCompilerService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    @Inject(forwardRef(() => SkillsService))
    private readonly skillsService: SkillsService,
    @Inject(forwardRef(() => KnowledgeService))
    private readonly knowledgeService: KnowledgeService,
  ) {}

  /**
   * Compile the SKILL.md content for a category.
   * Fetches linked active skills and the master knowledge doc.
   */
  async compileForCategory(
    accountId: string,
    categoryId: string,
  ): Promise<CompiledAgent | null> {
    const client = this.supabaseAdmin.getClient();

    // 1. Fetch category details
    const { data: category, error: catError } = await client
      .from('categories')
      .select('id, name')
      .eq('id', categoryId)
      .eq('account_id', accountId)
      .single();

    if (catError || !category) {
      this.logger.warn(`Category ${categoryId} not found for account ${accountId}`);
      return null;
    }

    // 2. Fetch linked active skills for this category
    // Use admin token bypass — this runs in background sync context
    const skills = await this.skillsService.findDefaultForCategory(
      'admin-bypass',
      accountId,
      categoryId,
    );

    // 3. Fetch master knowledge doc for this category
    let masterDoc: any = null;
    try {
      masterDoc = await this.knowledgeService.findMasterForCategory(
        'admin-bypass',
        accountId,
        categoryId,
      );
    } catch {
      // No master doc — that's fine
    }

    // 4. If nothing to compile, return null (no agent needed)
    if ((!skills || skills.length === 0) && !masterDoc) {
      this.logger.debug(
        `Category "${category.name}" has no skills or knowledge — skipping`,
      );
      return null;
    }

    // 5. Build the SKILL.md content
    const categorySlug = this.slugify(category.name);
    const content = this.buildSkillMd(category.name, categorySlug, skills, masterDoc);
    const hash = this.computeHash(content);
    const skillIds = skills.map((s: any) => s.id);

    return {
      content,
      hash,
      skillIds,
      knowledgeDocId: masterDoc?.id || null,
      categorySlug,
      categoryName: category.name,
    };
  }

  /**
   * Build the SKILL.md markdown content.
   */
  private buildSkillMd(
    categoryName: string,
    categorySlug: string,
    skills: any[],
    masterDoc: any | null,
  ): string {
    const lines: string[] = [];

    // YAML frontmatter
    lines.push('---');
    lines.push(`name: taskclaw-${categorySlug}`);
    lines.push(`description: Skills and knowledge for ${categoryName}`);
    lines.push('user-invocable: false');
    lines.push('---');
    lines.push('');

    // Skills section
    if (skills && skills.length > 0) {
      lines.push('## Skills');
      lines.push('');

      for (const skill of skills) {
        lines.push(`### ${skill.name}`);
        if (skill.description) {
          lines.push(skill.description);
          lines.push('');
        }
        if (skill.instructions) {
          lines.push(skill.instructions);
        }
        lines.push('');
      }
    }

    // Knowledge Base section
    if (masterDoc) {
      lines.push('## Knowledge Base');
      lines.push('');
      lines.push(`### ${masterDoc.title}`);
      lines.push('');
      lines.push(masterDoc.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Compute SHA-256 hash of content.
   */
  computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Convert a category name to a URL-safe slug.
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }
}
