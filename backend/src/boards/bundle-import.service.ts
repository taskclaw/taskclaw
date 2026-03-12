import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { BoardTemplatesService } from './board-templates.service';

export interface BundleImportResult {
  categories_created: number;
  categories_reused: number;
  skills_created: number;
  knowledge_docs_created: number;
  boards_created: number;
  errors: string[];
}

@Injectable()
export class BundleImportService {
  private readonly logger = new Logger(BundleImportService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
    private readonly boardTemplatesService: BoardTemplatesService,
  ) {}

  async importBundle(
    userId: string,
    accountId: string,
    bundle: any,
  ): Promise<BundleImportResult> {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const result: BundleImportResult = {
      categories_created: 0,
      categories_reused: 0,
      skills_created: 0,
      knowledge_docs_created: 0,
      boards_created: 0,
      errors: [],
    };

    // Phase 1: Provision standalone categories (with skills + knowledge docs)
    let categorySlugToId: Record<string, string> = {};

    if (bundle.categories && bundle.categories.length > 0) {
      try {
        const countsBefore = await this.countEntities(client, accountId);
        categorySlugToId =
          await this.boardTemplatesService.provisionCategories(
            client,
            accountId,
            userId,
            bundle.categories,
          );
        const countsAfter = await this.countEntities(client, accountId);

        result.categories_created =
          countsAfter.categories - countsBefore.categories;
        result.categories_reused =
          bundle.categories.length - result.categories_created;
        result.skills_created = countsAfter.skills - countsBefore.skills;
        result.knowledge_docs_created =
          countsAfter.knowledge_docs - countsBefore.knowledge_docs;
      } catch (error: any) {
        this.logger.error(
          `Failed to provision categories: ${error.message}`,
        );
        result.errors.push(`Categories: ${error.message}`);
      }
    }

    // Phase 2: Import boards (each board is a full manifest)
    if (bundle.boards && bundle.boards.length > 0) {
      for (const boardManifest of bundle.boards) {
        try {
          await this.boardTemplatesService.importManifest(
            userId,
            accountId,
            boardManifest,
          );
          result.boards_created++;
        } catch (error: any) {
          const boardName = boardManifest.name || 'Unknown board';
          this.logger.error(
            `Failed to import board "${boardName}": ${error.message}`,
          );
          result.errors.push(`Board "${boardName}": ${error.message}`);
        }
      }
    }

    this.logger.log(
      `Bundle import complete for account ${accountId}: ` +
        `${result.categories_created} categories, ` +
        `${result.skills_created} skills, ` +
        `${result.knowledge_docs_created} knowledge docs, ` +
        `${result.boards_created} boards, ` +
        `${result.errors.length} errors`,
    );

    return result;
  }

  private async countEntities(
    client: any,
    accountId: string,
  ): Promise<{
    categories: number;
    skills: number;
    knowledge_docs: number;
  }> {
    const [categoriesRes, skillsRes, knowledgeRes] = await Promise.all([
      client
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId),
      client
        .from('skills')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId),
      client
        .from('knowledge_docs')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId),
    ]);

    return {
      categories: categoriesRes.count || 0,
      skills: skillsRes.count || 0,
      knowledge_docs: knowledgeRes.count || 0,
    };
  }
}
