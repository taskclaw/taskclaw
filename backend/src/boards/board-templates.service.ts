import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { InstallTemplateDto } from './dto/install-template.dto';

@Injectable()
export class BoardTemplatesService {
  private readonly logger = new Logger(BoardTemplatesService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
  ) {}

  async findAll() {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('board_templates')
      .select('*')
      .or('is_system.eq.true,is_published.eq.true')
      .order('install_count', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch board templates: ${error.message}`);
    }

    return data;
  }

  async findOne(templateId: string) {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('board_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Board template with ID ${templateId} not found`);
    }

    return data;
  }

  /**
   * Provision categories and skills from the manifest into the user's account.
   * Returns a map of category slug → category UUID for step linking.
   */
  async provisionCategories(
    client: any,
    accountId: string,
    userId: string,
    categories: any[],
  ): Promise<Record<string, string>> {
    const slugToId: Record<string, string> = {};

    for (const cat of categories) {
      // Upsert category (skip if name already exists for this account)
      const { data: existing } = await client
        .from('categories')
        .select('id')
        .eq('account_id', accountId)
        .eq('name', cat.name)
        .maybeSingle();

      let categoryId: string;

      if (existing) {
        categoryId = existing.id;
        this.logger.log(`Category "${cat.name}" already exists, reusing ${categoryId}`);
      } else {
        const { data: newCat, error: catError } = await client
          .from('categories')
          .insert({
            account_id: accountId,
            name: cat.name,
            color: cat.color || null,
            icon: cat.icon || null,
          })
          .select('id')
          .single();

        if (catError) {
          this.logger.error(`Failed to create category "${cat.name}": ${catError.message}`);
          continue;
        }
        categoryId = newCat.id;
      }

      slugToId[cat.slug] = categoryId;

      // Provision skills for this category
      if (cat.skills && cat.skills.length > 0) {
        for (const skill of cat.skills) {
          // Upsert skill (skip if name already exists for this account)
          const { data: existingSkill } = await client
            .from('skills')
            .select('id')
            .eq('account_id', accountId)
            .eq('name', skill.name)
            .maybeSingle();

          let skillId: string;

          if (existingSkill) {
            skillId = existingSkill.id;
          } else {
            const { data: newSkill, error: skillError } = await client
              .from('skills')
              .insert({
                account_id: accountId,
                name: skill.name,
                description: skill.description || null,
                instructions: skill.instructions || '',
                is_active: skill.is_active !== false,
                created_by: userId,
              })
              .select('id')
              .single();

            if (skillError) {
              this.logger.error(`Failed to create skill "${skill.name}": ${skillError.message}`);
              continue;
            }
            skillId = newSkill.id;
          }

          // Link skill to category (ignore conflict)
          await client
            .from('category_skills')
            .upsert(
              { category_id: categoryId, skill_id: skillId },
              { onConflict: 'category_id,skill_id', ignoreDuplicates: true },
            );
        }
      }

      // Provision knowledge docs for this category
      if (cat.knowledge_docs && cat.knowledge_docs.length > 0) {
        for (const doc of cat.knowledge_docs) {
          const { error: docError } = await client
            .from('knowledge_docs')
            .insert({
              account_id: accountId,
              category_id: categoryId,
              title: doc.title,
              content: doc.content || '',
              is_master: doc.is_master || false,
            });

          if (docError) {
            this.logger.error(`Failed to create knowledge doc "${doc.title}": ${docError.message}`);
          }
        }
      }
    }

    return slugToId;
  }

  async install(userId: string, accountId: string, dto: InstallTemplateDto) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const template = await this.findOne(dto.template_id);
    const manifest = template.manifest;

    // Provision categories, skills, and knowledge docs from manifest
    let categorySlugToId: Record<string, string> = {};
    if (manifest.categories && manifest.categories.length > 0) {
      categorySlugToId = await this.provisionCategories(
        client,
        accountId,
        userId,
        manifest.categories,
      );
    }

    // Resolve board-level default category
    const defaultCategorySlug = manifest.default_category_slug || null;
    const defaultCategoryId = defaultCategorySlug
      ? categorySlugToId[defaultCategorySlug] || null
      : null;

    // Create board instance from template
    const { data: board, error: boardError } = await client
      .from('board_instances')
      .insert({
        account_id: accountId,
        template_id: template.id,
        name: dto.name || template.name,
        description: template.description,
        icon: template.icon,
        color: template.color,
        tags: template.tags,
        installed_manifest: manifest,
        installed_version: template.version,
        latest_available_version: template.version,
        settings_override: manifest.settings || {},
        default_category_id: defaultCategoryId,
      })
      .select()
      .single();

    if (boardError) {
      throw new Error(`Failed to install board template: ${boardError.message}`);
    }

    // Create steps from manifest
    if (manifest.steps && manifest.steps.length > 0) {
      const stepRows = manifest.steps.map((step: any) => {
        // Resolve linked category slug to ID
        const linkedCategorySlug = step.linked_category_slug || null;
        const linkedCategoryId = linkedCategorySlug
          ? categorySlugToId[linkedCategorySlug] || null
          : null;

        return {
          board_instance_id: board.id,
          step_key: step.id,
          name: step.name,
          step_type: step.type,
          position: step.position,
          color: step.color || null,
          linked_category_id: linkedCategoryId,
          // AI config (legacy format support)
          ai_enabled: step.ai_config?.enabled || false,
          ai_first: step.ai_config?.ai_first || false,
          system_prompt: step.ai_config?.system_prompt || null,
          model_override: step.ai_config?.model_override || null,
          temperature: step.ai_config?.temperature || null,
          // Rich config
          trigger_type: step.trigger_type || 'on_entry',
          input_schema: step.input_schema || step.fields?.inputs || [],
          output_schema: step.output_schema || step.fields?.outputs || [],
          input_fields: step.fields?.inputs || [],
          output_fields: step.fields?.outputs || [],
          // Routing (step_key references, resolved to IDs after insert)
          on_complete_step_key: step.on_complete || null,
          on_error_step_key: step.on_error || null,
          routing_rules: step.routing_rules || [],
          // Trigger-specific
          webhook_url: step.webhook_url || null,
          webhook_auth_header: step.webhook_auth_header || null,
          schedule_cron: step.schedule_cron || null,
        };
      });

      const { data: createdSteps, error: stepsError } = await client
        .from('board_steps')
        .insert(stepRows)
        .select('id, step_key');

      if (stepsError) {
        this.logger.error(`Failed to create template steps: ${stepsError.message}`);
      }

      // Resolve on_success_step_id / on_error_step_id from step_key references
      if (createdSteps && createdSteps.length > 0) {
        const stepKeyToId: Record<string, string> = {};
        for (const s of createdSteps) {
          stepKeyToId[s.step_key] = s.id;
        }

        for (const step of manifest.steps) {
          const stepId = stepKeyToId[step.id];
          if (!stepId) continue;

          const updates: Record<string, any> = {};
          if (step.on_complete && stepKeyToId[step.on_complete]) {
            updates.on_success_step_id = stepKeyToId[step.on_complete];
          }
          if (step.on_error && stepKeyToId[step.on_error]) {
            updates.on_error_step_id = stepKeyToId[step.on_error];
          }

          if (Object.keys(updates).length > 0) {
            await client
              .from('board_steps')
              .update(updates)
              .eq('id', stepId);
          }
        }
      }
    }

    // Increment install count
    await client
      .from('board_templates')
      .update({ install_count: template.install_count + 1 })
      .eq('id', template.id);

    // Return full board with steps and linked categories
    const { data: fullBoard } = await client
      .from('board_instances')
      .select(
        `*, default_category:categories!board_instances_default_category_id_fkey(id, name, color, icon),
         board_steps(id, step_key, name, step_type, position, color, linked_category_id,
           linked_category:categories!board_steps_linked_category_id_fkey(id, name, color, icon))`,
      )
      .eq('id', board.id)
      .single();

    if (fullBoard?.board_steps) {
      fullBoard.board_steps.sort((a: any, b: any) => a.position - b.position);
    }

    return fullBoard;
  }

  /**
   * Import a board directly from a manifest JSON (no template_id required).
   * Creates categories, skills, knowledge docs, board instance, and steps.
   */
  async importManifest(userId: string, accountId: string, manifest: any) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Provision categories, skills, and knowledge docs
    let categorySlugToId: Record<string, string> = {};
    if (manifest.categories && manifest.categories.length > 0) {
      categorySlugToId = await this.provisionCategories(
        client,
        accountId,
        userId,
        manifest.categories,
      );
    }

    // Resolve board-level default category
    const defaultCategorySlug = manifest.default_category_slug || null;
    const defaultCategoryId = defaultCategorySlug
      ? categorySlugToId[defaultCategorySlug] || null
      : null;

    // Create board instance
    const { data: board, error: boardError } = await client
      .from('board_instances')
      .insert({
        account_id: accountId,
        name: manifest.name || 'Imported Board',
        description: manifest.description || null,
        icon: manifest.icon || 'layout-grid',
        color: manifest.color || '#6366f1',
        tags: manifest.tags || [],
        installed_manifest: manifest,
        settings_override: manifest.settings || {},
        default_category_id: defaultCategoryId,
      })
      .select()
      .single();

    if (boardError) {
      throw new Error(`Failed to import board: ${boardError.message}`);
    }

    // Create steps
    if (manifest.steps && manifest.steps.length > 0) {
      const stepRows = manifest.steps.map((step: any) => {
        const linkedCategorySlug = step.linked_category_slug || null;
        const linkedCategoryId = linkedCategorySlug
          ? categorySlugToId[linkedCategorySlug] || null
          : null;

        return {
          board_instance_id: board.id,
          step_key: step.id,
          name: step.name,
          step_type: step.type,
          position: step.position,
          color: step.color || null,
          linked_category_id: linkedCategoryId,
          ai_enabled: step.ai_config?.enabled || false,
          ai_first: step.ai_config?.ai_first || step.ai_first || false,
          system_prompt: step.ai_config?.system_prompt || step.system_prompt || null,
          model_override: step.ai_config?.model_override || null,
          temperature: step.ai_config?.temperature || null,
          trigger_type: step.trigger_type || 'on_entry',
          input_schema: step.input_schema || step.fields?.inputs || [],
          output_schema: step.output_schema || step.fields?.outputs || [],
          input_fields: step.fields?.inputs || [],
          output_fields: step.fields?.outputs || [],
          on_complete_step_key: step.on_complete || step.on_success || null,
          on_error_step_key: step.on_error || null,
          routing_rules: step.routing_rules || [],
          webhook_url: step.webhook_url || null,
          webhook_auth_header: step.webhook_auth_header || null,
          schedule_cron: step.schedule_cron || null,
        };
      });

      const { data: createdSteps, error: stepsError } = await client
        .from('board_steps')
        .insert(stepRows)
        .select('id, step_key');

      if (stepsError) {
        this.logger.error(`Failed to create imported steps: ${stepsError.message}`);
      }

      // Resolve step routing references
      if (createdSteps && createdSteps.length > 0) {
        const stepKeyToId: Record<string, string> = {};
        for (const s of createdSteps) {
          stepKeyToId[s.step_key] = s.id;
        }

        for (const step of manifest.steps) {
          const stepId = stepKeyToId[step.id];
          if (!stepId) continue;

          const updates: Record<string, any> = {};
          const onSuccess = step.on_complete || step.on_success;
          if (onSuccess && stepKeyToId[onSuccess]) {
            updates.on_success_step_id = stepKeyToId[onSuccess];
          }
          if (step.on_error && stepKeyToId[step.on_error]) {
            updates.on_error_step_id = stepKeyToId[step.on_error];
          }

          if (Object.keys(updates).length > 0) {
            await client
              .from('board_steps')
              .update(updates)
              .eq('id', stepId);
          }
        }
      }
    }

    // Return full board with steps
    const { data: fullBoard } = await client
      .from('board_instances')
      .select(
        `*, default_category:categories!board_instances_default_category_id_fkey(id, name, color, icon),
         board_steps(id, step_key, name, step_type, position, color, linked_category_id,
           linked_category:categories!board_steps_linked_category_id_fkey(id, name, color, icon))`,
      )
      .eq('id', board.id)
      .single();

    if (fullBoard?.board_steps) {
      fullBoard.board_steps.sort((a: any, b: any) => a.position - b.position);
    }

    return fullBoard;
  }
}
