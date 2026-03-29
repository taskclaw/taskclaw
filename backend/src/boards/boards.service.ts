import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { WebhookEmitterService } from '../webhooks/webhook-emitter.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import {
  encrypt,
  decrypt,
  maskSensitiveValue,
} from '../common/utils/encryption.util';

interface BoardFilters {
  archived?: boolean;
  favorite?: boolean;
}

@Injectable()
export class BoardsService {
  private readonly logger = new Logger(BoardsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
    private readonly webhookEmitter: WebhookEmitterService,
  ) {}

  async findAll(userId: string, accountId: string, filters?: BoardFilters) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    let query = client
      .from('board_instances')
      .select(
        '*, default_category:categories!default_category_id(id, name, color, icon), orchestrator_category:categories!orchestrator_category_id(id, name, color, icon), board_steps(id, step_key, name, step_type, position, color, linked_category_id, linked_category:categories!linked_category_id(id, name, color, icon))',
      )
      .eq('account_id', accountId);

    if (filters?.archived !== undefined) {
      query = query.eq('is_archived', filters.archived);
    } else {
      // Default: show non-archived boards
      query = query.eq('is_archived', false);
    }

    if (filters?.favorite !== undefined) {
      query = query.eq('is_favorite', filters.favorite);
    }

    query = query
      .order('is_favorite', { ascending: false })
      .order('display_order', { ascending: true })
      .order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch boards: ${error.message}`);
    }

    // Get task counts per board
    const boardIds = data.map((b) => b.id);
    if (boardIds.length > 0) {
      const { data: taskCounts, error: countError } = await client
        .from('tasks')
        .select('board_instance_id')
        .in('board_instance_id', boardIds);

      if (!countError && taskCounts) {
        const countMap: Record<string, number> = {};
        taskCounts.forEach((t) => {
          countMap[t.board_instance_id] =
            (countMap[t.board_instance_id] || 0) + 1;
        });
        data.forEach((board) => {
          board.task_count = countMap[board.id] || 0;
        });
      }
    }

    // Sort steps by position
    data.forEach((board) => {
      if (board.board_steps) {
        board.board_steps.sort((a: any, b: any) => a.position - b.position);
      }
    });

    return data;
  }

  async findOne(userId: string, accountId: string, boardId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('board_instances')
      .select(
        '*, default_category:categories!default_category_id(id, name, color, icon), orchestrator_category:categories!orchestrator_category_id(id, name, color, icon), board_steps(id, step_key, name, step_type, position, color, linked_category_id, trigger_type, ai_first, input_schema, output_schema, on_success_step_id, on_error_step_id, webhook_url, webhook_auth_header, schedule_cron, system_prompt, linked_category:categories!linked_category_id(id, name, color, icon))',
      )
      .eq('id', boardId)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    // Sort steps by position
    if (data.board_steps) {
      data.board_steps.sort((a: any, b: any) => a.position - b.position);
    }

    // Get task counts per step
    const { data: taskCounts } = await client
      .from('tasks')
      .select('current_step_id')
      .eq('board_instance_id', boardId);

    const stepCountMap: Record<string, number> = {};
    if (taskCounts) {
      taskCounts.forEach((t) => {
        if (t.current_step_id) {
          stepCountMap[t.current_step_id] =
            (stepCountMap[t.current_step_id] || 0) + 1;
        }
      });
    }

    data.board_steps?.forEach((step: any) => {
      step.task_count = stepCountMap[step.id] || 0;
    });

    data.task_count = taskCounts?.length || 0;

    return data;
  }

  async create(userId: string, accountId: string, dto: CreateBoardDto) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Create board instance
    const { data: board, error } = await client
      .from('board_instances')
      .insert({
        account_id: accountId,
        name: dto.name,
        description: dto.description || null,
        icon: dto.icon || 'layout-grid',
        color: dto.color || '#6366f1',
        tags: dto.tags || [],
        is_favorite: dto.is_favorite || false,
        default_category_id: dto.default_category_id || null,
        orchestrator_category_id: dto.orchestrator_category_id || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create board: ${error.message}`);
    }

    // Create inline steps if provided
    if (dto.steps && dto.steps.length > 0) {
      const stepRows = dto.steps.map((step, index) => {
        // Auto-assign step_type if not provided
        let stepType = step.step_type;
        if (!stepType) {
          if (index === 0) stepType = 'input';
          else if (index === dto.steps!.length - 1) stepType = 'done';
          else stepType = 'human_review';
        }

        return {
          board_instance_id: board.id,
          step_key: step.step_key,
          name: step.name,
          step_type: stepType,
          position: index,
          color: step.color || null,
          linked_category_id: step.linked_category_id || null,
        };
      });

      const { error: stepsError } = await client
        .from('board_steps')
        .insert(stepRows);

      if (stepsError) {
        this.logger.error(
          `Failed to create board steps: ${stepsError.message}`,
        );
      }
    }

    this.webhookEmitter.emit(accountId, 'board.created', { board });

    // Return full board with steps
    return this.findOne(userId, accountId, board.id);
  }

  async update(
    userId: string,
    accountId: string,
    boardId: string,
    dto: UpdateBoardDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);
    await this.findOne(userId, accountId, boardId);

    const updateData: any = { ...dto };
    if (dto.is_archived === true) {
      updateData.archived_at = new Date().toISOString();
    } else if (dto.is_archived === false) {
      updateData.archived_at = null;
    }

    const { data, error } = await client
      .from('board_instances')
      .update(updateData)
      .eq('id', boardId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update board: ${error.message}`);
    }

    this.webhookEmitter.emit(accountId, 'board.updated', { board: data });

    return data;
  }

  async remove(userId: string, accountId: string, boardId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);
    await this.findOne(userId, accountId, boardId);

    // Tasks become boardless (ON DELETE SET NULL on FK)
    const { error } = await client
      .from('board_instances')
      .delete()
      .eq('id', boardId)
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to delete board: ${error.message}`);
    }

    this.webhookEmitter.emit(accountId, 'board.deleted', { board_id: boardId });

    return { message: 'Board deleted successfully' };
  }

  async duplicate(userId: string, accountId: string, boardId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const original = await this.findOne(userId, accountId, boardId);

    // Create copy of board — clear integration credentials
    const cleanedSettings = { ...(original.settings_override || {}) };
    if (cleanedSettings.integrations) {
      const cleaned: Record<string, any> = {};
      for (const [slug, cfg] of Object.entries(
        cleanedSettings.integrations as Record<string, any>,
      )) {
        cleaned[slug] = { enabled: false, config: {}, test_status: 'untested' };
      }
      cleanedSettings.integrations = cleaned;
    }

    const { data: copy, error } = await client
      .from('board_instances')
      .insert({
        account_id: accountId,
        template_id: original.template_id,
        name: `${original.name} (Copy)`,
        description: original.description,
        icon: original.icon,
        color: original.color,
        tags: original.tags,
        is_favorite: false,
        settings_override: cleanedSettings,
        installed_manifest: original.installed_manifest,
        installed_version: original.installed_version,
        default_category_id: original.default_category_id || null,
        orchestrator_category_id: original.orchestrator_category_id || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to duplicate board: ${error.message}`);
    }

    // Copy steps (including rich config)
    if (original.board_steps && original.board_steps.length > 0) {
      const stepRows = original.board_steps.map((step: any) => ({
        board_instance_id: copy.id,
        step_key: step.step_key,
        name: step.name,
        step_type: step.step_type,
        position: step.position,
        color: step.color,
        linked_category_id: step.linked_category_id || null,
        trigger_type: step.trigger_type || 'on_entry',
        ai_first: step.ai_first || false,
        input_schema: step.input_schema || [],
        output_schema: step.output_schema || [],
        webhook_url: step.webhook_url || null,
        webhook_auth_header: step.webhook_auth_header || null,
        schedule_cron: step.schedule_cron || null,
        system_prompt: step.system_prompt || null,
      }));

      await client.from('board_steps').insert(stepRows);
    }

    return this.findOne(userId, accountId, copy.id);
  }

  async exportManifest(userId: string, accountId: string, boardId: string) {
    const client = this.supabaseAdmin.getClient();
    const board = await this.findOne(userId, accountId, boardId);

    // Collect unique linked category IDs (from steps + board default + orchestrator)
    const categoryIds = [
      ...new Set(
        [
          board.default_category_id,
          board.orchestrator_category_id,
          ...(board.board_steps || []).map((s: any) => s.linked_category_id),
        ].filter(Boolean),
      ),
    ];

    // Fetch full category data: skills + knowledge docs
    const categoriesMap: Record<string, any> = {};
    if (categoryIds.length > 0) {
      // Fetch categories with skills
      const { data: cats } = await client
        .from('categories')
        .select(
          'id, name, color, icon, category_skills(skill:skills(id, name, description, instructions, is_active, file_attachments))',
        )
        .in('id', categoryIds);

      // Fetch knowledge docs for these categories
      const { data: knowledgeDocs } = await client
        .from('knowledge_docs')
        .select('id, category_id, title, content, is_master, file_attachments')
        .in('category_id', categoryIds);

      if (cats) {
        for (const cat of cats) {
          const slug = cat.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
          categoriesMap[cat.id] = {
            id: cat.id,
            slug,
            name: cat.name,
            color: cat.color,
            icon: cat.icon,
            skills: (cat.category_skills || [])
              .map((cs: any) => {
                const skill = cs.skill;
                if (!skill) return null;
                return {
                  ...skill,
                  slug: skill.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, ''),
                };
              })
              .filter(Boolean),
            knowledge_docs: (knowledgeDocs || [])
              .filter((d: any) => d.category_id === cat.id)
              .map((d: any) => ({
                id: d.id,
                title: d.title,
                content: d.content,
                is_master: d.is_master,
                file_attachments: d.file_attachments,
              })),
          };
        }
      }
    }

    // Build step-level on_success/on_error references using step_key instead of UUID
    const stepIdToKey: Record<string, string> = {};
    (board.board_steps || []).forEach((s: any) => {
      stepIdToKey[s.id] = s.step_key;
    });

    // Build category ID → slug map for export
    const categoryIdToSlug: Record<string, string> = {};
    for (const cat of Object.values(categoriesMap)) {
      categoryIdToSlug[cat.id] = cat.slug;
    }

    const manifest: any = {
      manifest_version: '1.0',
      id: board.name.toLowerCase().replace(/\s+/g, '-'),
      name: board.name,
      description: board.description,
      integrations: board.installed_manifest?.integrations || [],
      default_category_id: board.default_category_id || null,
      default_category_slug: board.default_category_id
        ? categoryIdToSlug[board.default_category_id] || null
        : null,
      orchestrator_category_id: board.orchestrator_category_id || null,
      orchestrator_category_slug: board.orchestrator_category_id
        ? categoryIdToSlug[board.orchestrator_category_id] || null
        : null,
      version: '1.0.0',
      icon: board.icon,
      color: board.color,
      tags: board.tags,
      settings: board.settings_override || {},
      categories: Object.values(categoriesMap),
      steps: (board.board_steps || []).map((step: any) => ({
        id: step.step_key,
        name: step.name,
        type: step.step_type,
        position: step.position,
        color: step.color,
        linked_category_id: step.linked_category_id || null,
        linked_category_slug: step.linked_category_id
          ? categoryIdToSlug[step.linked_category_id] || null
          : null,
        linked_category_name: step.linked_category?.name || null,
        trigger_type: step.trigger_type || 'on_entry',
        ai_first: step.ai_first || false,
        system_prompt: step.system_prompt || null,
        input_schema: step.input_schema || [],
        output_schema: step.output_schema || [],
        on_success: step.on_success_step_id
          ? stepIdToKey[step.on_success_step_id] || null
          : null,
        on_error: step.on_error_step_id
          ? stepIdToKey[step.on_error_step_id] || null
          : null,
        webhook_url: step.webhook_url || null,
        webhook_auth_header: step.webhook_auth_header || null,
        schedule_cron: step.schedule_cron || null,
      })),
    };

    return manifest;
  }

  // ─── Board Integrations ──────────────────────────────────────────

  async getIntegrationStatuses(
    userId: string,
    accountId: string,
    boardId: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data: board, error } = await client
      .from('board_instances')
      .select('installed_manifest, settings_override')
      .eq('id', boardId)
      .eq('account_id', accountId)
      .single();

    if (error || !board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const definitions: any[] = board.installed_manifest?.integrations || [];
    const runtimeConfigs: Record<string, any> =
      board.settings_override?.integrations || {};

    return definitions.map((def: any) => {
      const runtime = runtimeConfigs[def.slug] || {
        enabled: false,
        config: {},
        test_status: 'untested',
      };

      // Mask password-type fields
      const maskedConfig: Record<string, string> = {};
      for (const field of def.config_fields || []) {
        const value = runtime.config?.[field.key];
        if (value && field.type === 'password') {
          try {
            maskedConfig[field.key] = maskSensitiveValue(decrypt(value));
          } catch {
            maskedConfig[field.key] = '****';
          }
        } else {
          maskedConfig[field.key] = value || '';
        }
      }

      return {
        ...def,
        enabled: runtime.enabled || false,
        config: maskedConfig,
        has_config: Object.values(runtime.config || {}).some(
          (v) => v && String(v).length > 0,
        ),
        last_tested_at: runtime.last_tested_at || null,
        test_status: runtime.test_status || 'untested',
      };
    });
  }

  async addIntegrationDefinition(
    userId: string,
    accountId: string,
    boardId: string,
    integration: {
      slug: string;
      name: string;
      description: string;
      icon: string;
      required: boolean;
      setup_guide: string;
      config_fields: Array<{
        key: string;
        label: string;
        type: string;
        required: boolean;
        placeholder?: string;
        help_text?: string;
      }>;
    },
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data: board, error } = await client
      .from('board_instances')
      .select('installed_manifest')
      .eq('id', boardId)
      .eq('account_id', accountId)
      .single();

    if (error || !board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const manifest = board.installed_manifest || {};
    const integrations: any[] = manifest.integrations || [];

    // Check for duplicate slug
    if (integrations.some((i: any) => i.slug === integration.slug)) {
      throw new BadRequestException(
        `Integration "${integration.slug}" already exists on this board`,
      );
    }

    integrations.push(integration);
    manifest.integrations = integrations;

    const { error: updateError } = await client
      .from('board_instances')
      .update({ installed_manifest: manifest })
      .eq('id', boardId)
      .eq('account_id', accountId);

    if (updateError) {
      throw new Error(`Failed to add integration: ${updateError.message}`);
    }

    return { success: true };
  }

  async removeIntegrationDefinition(
    userId: string,
    accountId: string,
    boardId: string,
    slug: string,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data: board, error } = await client
      .from('board_instances')
      .select('installed_manifest, settings_override')
      .eq('id', boardId)
      .eq('account_id', accountId)
      .single();

    if (error || !board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const manifest = board.installed_manifest || {};
    const integrations: any[] = manifest.integrations || [];
    const idx = integrations.findIndex((i: any) => i.slug === slug);

    if (idx === -1) {
      throw new NotFoundException(
        `Integration "${slug}" not found on this board`,
      );
    }

    integrations.splice(idx, 1);
    manifest.integrations = integrations;

    // Also clean up runtime config
    const settings = board.settings_override || {};
    if (settings.integrations?.[slug]) {
      delete settings.integrations[slug];
    }

    const { error: updateError } = await client
      .from('board_instances')
      .update({
        installed_manifest: manifest,
        settings_override: settings,
      })
      .eq('id', boardId)
      .eq('account_id', accountId);

    if (updateError) {
      throw new Error(`Failed to remove integration: ${updateError.message}`);
    }

    return { success: true };
  }

  async updateIntegrationConfig(
    userId: string,
    accountId: string,
    boardId: string,
    slug: string,
    data: { enabled: boolean; config: Record<string, string> },
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data: board, error } = await client
      .from('board_instances')
      .select('installed_manifest, settings_override')
      .eq('id', boardId)
      .eq('account_id', accountId)
      .single();

    if (error || !board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const definitions: any[] = board.installed_manifest?.integrations || [];
    const integrationDef = definitions.find((i: any) => i.slug === slug);
    if (!integrationDef) {
      throw new NotFoundException(
        `Integration "${slug}" not declared in board manifest`,
      );
    }

    // Get existing runtime config for this integration
    const existingRuntime = board.settings_override?.integrations?.[slug] || {};

    // Encrypt password fields, preserve masked values
    const encryptedConfig: Record<string, string> = {};
    for (const field of integrationDef.config_fields || []) {
      const value = data.config?.[field.key];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      // Skip masked values — keep existing encrypted value
      if (value.includes('****')) {
        if (existingRuntime.config?.[field.key]) {
          encryptedConfig[field.key] = existingRuntime.config[field.key];
        }
        continue;
      }
      encryptedConfig[field.key] =
        field.type === 'password' ? encrypt(value) : value;
    }

    // Merge into settings_override
    const currentSettings = board.settings_override || {};
    const currentIntegrations = currentSettings.integrations || {};
    currentIntegrations[slug] = {
      enabled: data.enabled,
      config: encryptedConfig,
      last_tested_at: null,
      test_status: 'untested',
    };

    const { data: updated, error: updateError } = await client
      .from('board_instances')
      .update({
        settings_override: {
          ...currentSettings,
          integrations: currentIntegrations,
        },
      })
      .eq('id', boardId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (updateError) {
      throw new Error(
        `Failed to update integration config: ${updateError.message}`,
      );
    }

    return { success: true };
  }
}
