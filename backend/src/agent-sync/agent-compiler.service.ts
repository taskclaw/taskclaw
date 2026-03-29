import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { SupabaseService } from '../supabase/supabase.service';
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
    private readonly supabase: SupabaseService,
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
      this.logger.warn(
        `Category ${categoryId} not found for account ${accountId}`,
      );
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
    const content = await this.buildSkillMd(
      accountId,
      category.name,
      categorySlug,
      skills,
      masterDoc,
    );
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
  private async buildSkillMd(
    accountId: string,
    categoryName: string,
    categorySlug: string,
    skills: any[],
    masterDoc: any | null,
  ): Promise<string> {
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

        // Include text-based reference file content inline
        const attachments = skill.file_attachments || [];
        const textAttachments = attachments.filter((a: any) =>
          /\.(md|txt|csv|json)$/i.test(a.name),
        );

        for (const att of textAttachments) {
          const content = await this.fetchAttachmentContent(
            accountId,
            skill.id,
            att.name,
          );
          if (content) {
            const refName = att.name.replace(/\.[^.]+$/, '');
            lines.push(`#### Reference: ${refName}`);
            lines.push('');
            lines.push(content);
            lines.push('');
          }
        }
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
   * Fetch text content of a skill attachment from Supabase Storage.
   */
  private async fetchAttachmentContent(
    accountId: string,
    skillId: string,
    filename: string,
  ): Promise<string | null> {
    try {
      const storagePath = `${accountId}/${skillId}/${filename}`;
      const adminClient = this.supabase.getAdminClient();
      const { data, error } = await adminClient.storage
        .from('skill-attachments')
        .download(storagePath);

      if (error || !data) {
        this.logger.warn(
          `Failed to download attachment ${storagePath}: ${error?.message}`,
        );
        return null;
      }

      return await data.text();
    } catch (err: any) {
      this.logger.warn(`Error fetching attachment content: ${err.message}`);
      return null;
    }
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
