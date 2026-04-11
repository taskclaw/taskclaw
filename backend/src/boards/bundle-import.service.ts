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
  pods_created: number;
  backbones_declared: number;
  integrations_declared: number;
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
      pods_created: 0,
      backbones_declared: 0,
      integrations_declared: 0,
      errors: [],
    };

    // Phase 0: Declare backbone connections (upsert by type+name, never overwrite credentials)
    const backboneSlugToId: Record<string, string> = {};
    if (bundle.backbones && bundle.backbones.length > 0) {
      for (const bb of bundle.backbones) {
        try {
          const id = await this.declareBackbone(client, accountId, bb);
          if (bb.slug) backboneSlugToId[bb.slug] = id;
          result.backbones_declared++;
        } catch (error: any) {
          this.logger.warn(`Backbone "${bb.name}" declaration skipped: ${error.message}`);
          result.errors.push(`Backbone "${bb.name}": ${error.message}`);
        }
      }
    }

    // Phase 0b: Declare integration definitions (upsert by slug, no credentials)
    if (bundle.integrations && bundle.integrations.length > 0) {
      for (const integration of bundle.integrations) {
        try {
          await this.declareIntegration(client, accountId, integration);
          result.integrations_declared++;
        } catch (error: any) {
          this.logger.warn(`Integration "${integration.slug}" declaration skipped: ${error.message}`);
          result.errors.push(`Integration "${integration.slug}": ${error.message}`);
        }
      }
    }

    // Phase 1: Provision standalone categories (with skills + knowledge docs)
    let categorySlugToId: Record<string, string> = {};

    if (bundle.categories && bundle.categories.length > 0) {
      try {
        const countsBefore = await this.countEntities(client, accountId);
        categorySlugToId = await this.boardTemplatesService.provisionCategories(
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
        this.logger.error(`Failed to provision categories: ${error.message}`);
        result.errors.push(`Categories: ${error.message}`);
      }
    }

    // Phase 2: Create Pod(s) defined in the bundle
    const podSlugToId: Record<string, string> = {};
    if (bundle.pod) {
      // Single pod definition
      try {
        const podId = await this.upsertPod(
          client,
          accountId,
          bundle.pod,
          backboneSlugToId,
        );
        if (bundle.pod.slug) podSlugToId[bundle.pod.slug] = podId;
        result.pods_created++;
      } catch (error: any) {
        this.logger.error(`Failed to create pod "${bundle.pod.name}": ${error.message}`);
        result.errors.push(`Pod "${bundle.pod.name}": ${error.message}`);
      }
    }
    if (bundle.pods && bundle.pods.length > 0) {
      for (const podDef of bundle.pods) {
        try {
          const podId = await this.upsertPod(
            client,
            accountId,
            podDef,
            backboneSlugToId,
          );
          if (podDef.slug) podSlugToId[podDef.slug] = podId;
          result.pods_created++;
        } catch (error: any) {
          this.logger.error(`Failed to create pod "${podDef.name}": ${error.message}`);
          result.errors.push(`Pod "${podDef.name}": ${error.message}`);
        }
      }
    }

    // Phase 3: Import boards (each board is a full manifest)
    if (bundle.boards && bundle.boards.length > 0) {
      for (const boardManifest of bundle.boards) {
        try {
          // Resolve pod_id for this board from pod_slug or pod reference
          const podSlug = boardManifest.pod_slug || (bundle.pod ? bundle.pod.slug : null);
          const podId = podSlug ? podSlugToId[podSlug] || null : null;

          await this.boardTemplatesService.importManifest(
            userId,
            accountId,
            boardManifest,
            podId,
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
        `${result.pods_created} pods, ` +
        `${result.categories_created} categories, ` +
        `${result.skills_created} skills, ` +
        `${result.knowledge_docs_created} knowledge docs, ` +
        `${result.boards_created} boards, ` +
        `${result.backbones_declared} backbones declared, ` +
        `${result.integrations_declared} integrations declared, ` +
        `${result.errors.length} errors`,
    );

    return result;
  }

  /**
   * Upsert a Pod from a bundle pod definition.
   * Matches by slug — if exists, updates metadata but never overwrites backbone if already set.
   */
  private async upsertPod(
    client: any,
    accountId: string,
    podDef: any,
    backboneSlugToId: Record<string, string>,
  ): Promise<string> {
    const slug =
      podDef.slug ||
      podDef.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    // Resolve backbone from slug reference
    const backboneSlug = podDef.backbone_slug || null;
    const backboneConnectionId = backboneSlug
      ? backboneSlugToId[backboneSlug] || null
      : null;

    // Check if pod already exists for this account
    const { data: existing } = await client
      .from('pods')
      .select('id, backbone_connection_id')
      .eq('account_id', accountId)
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      // Update metadata but preserve existing backbone if not explicitly set
      const updateData: any = {
        name: podDef.name,
        description: podDef.description || null,
        icon: podDef.icon || 'layers',
        color: podDef.color || '#6366f1',
        agent_config: podDef.agent_config || {},
        updated_at: new Date().toISOString(),
      };
      if (backboneConnectionId) {
        updateData.backbone_connection_id = backboneConnectionId;
      }
      await client.from('pods').update(updateData).eq('id', existing.id);
      this.logger.log(`Pod "${slug}" already exists, updated metadata`);
      return existing.id;
    }

    const { data: newPod, error } = await client
      .from('pods')
      .insert({
        account_id: accountId,
        name: podDef.name,
        slug,
        description: podDef.description || null,
        icon: podDef.icon || 'layers',
        color: podDef.color || '#6366f1',
        backbone_connection_id: backboneConnectionId,
        agent_config: podDef.agent_config || {},
        position: podDef.position ?? 0,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create pod: ${error.message}`);
    }

    this.logger.log(`Pod created: ${newPod.id} (${slug})`);
    return newPod.id;
  }

  /**
   * Declare a backbone connection from a bundle backbone definition.
   * Upserts by backbone_type+name. Never overwrites existing credentials/config.
   * Returns the connection ID.
   */
  private async declareBackbone(
    client: any,
    accountId: string,
    bbDef: any,
  ): Promise<string> {
    // Check if backbone connection already exists (match by type + name)
    const { data: existing } = await client
      .from('backbone_connections')
      .select('id')
      .eq('account_id', accountId)
      .eq('backbone_type', bbDef.backbone_type)
      .eq('name', bbDef.name)
      .maybeSingle();

    if (existing) {
      this.logger.log(`Backbone "${bbDef.name}" already exists, reusing ${existing.id}`);
      return existing.id;
    }

    // Create a placeholder backbone connection (no credentials — user must configure)
    const { data: newBb, error } = await client
      .from('backbone_connections')
      .insert({
        account_id: accountId,
        backbone_type: bbDef.backbone_type,
        name: bbDef.name,
        description: bbDef.description || `Declared by bundle import — configure credentials to activate`,
        config: bbDef.config || {},
        is_default: bbDef.is_default || false,
        is_active: false, // inactive until user configures credentials
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to declare backbone: ${error.message}`);
    }

    this.logger.log(`Backbone declared: ${newBb.id} (${bbDef.backbone_type}/${bbDef.name}) — needs credentials`);
    return newBb.id;
  }

  /**
   * Declare an integration definition from a bundle integration definition.
   * Upserts by slug. These are definitions only — no credentials stored here.
   */
  private async declareIntegration(
    client: any,
    accountId: string,
    integrationDef: any,
  ): Promise<void> {
    // Check if integration definition already exists
    const { data: existing } = await client
      .from('integration_definitions')
      .select('id')
      .eq('slug', integrationDef.slug)
      .maybeSingle();

    if (existing) {
      this.logger.log(`Integration definition "${integrationDef.slug}" already exists, skipping`);
      return;
    }

    const { error } = await client
      .from('integration_definitions')
      .insert({
        slug: integrationDef.slug,
        name: integrationDef.name,
        description: integrationDef.description || null,
        icon: integrationDef.icon || null,
        categories: integrationDef.categories || [],
        auth_type: integrationDef.auth_type || 'api_key',
        auth_config: integrationDef.auth_config || {},
        config_fields: integrationDef.config_fields || [],
        setup_guide: integrationDef.setup_guide || null,
        is_system: false,
        is_published: false,
      });

    if (error) {
      // Non-fatal — integration may be a system integration we can't insert
      this.logger.warn(`Integration definition "${integrationDef.slug}" skipped: ${error.message}`);
    }
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
