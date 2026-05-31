import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  boardInstances,
  boardSteps,
  tasks,
  categories,
  knowledgeDocs,
  backboneConnections,
} from '../db/schema';
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
  pod_id?: string;
}

@Injectable()
export class BoardsService {
  private readonly logger = new Logger(BoardsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
    private readonly webhookEmitter: WebhookEmitterService,
  ) {}

  /**
   * Drizzle's relational query returns joined rows under the relation name
   * (e.g. `category_defaultCategoryId`, `boardSteps`); PostgREST returned them
   * under the embed alias (`default_category`, `board_steps`, etc).
   * Re-key to the PostgREST aliases so the response shape callers depend on is
   * unchanged.
   */
  private presentBoard(row: any) {
    const {
      category_defaultCategoryId,
      category_orchestratorCategoryId,
      boardSteps: steps,
      ...rest
    } = row;
    return {
      ...rest,
      default_category: category_defaultCategoryId ?? null,
      orchestrator_category: category_orchestratorCategoryId ?? null,
      board_steps: (steps ?? []).map((s: any) => {
        const { category, ...stepRest } = s;
        return {
          ...stepRest,
          linked_category: category ?? null,
        };
      }),
    };
  }

  async findAll(userId: string, accountId: string, filters?: BoardFilters) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const conditions = [eq(boardInstances.accountId, accountId)];

    if (filters?.archived !== undefined) {
      conditions.push(eq(boardInstances.isArchived, filters.archived));
    } else {
      // Default: show non-archived boards
      conditions.push(eq(boardInstances.isArchived, false));
    }

    if (filters?.favorite !== undefined) {
      conditions.push(eq(boardInstances.isFavorite, filters.favorite));
    }

    if (filters?.pod_id !== undefined) {
      conditions.push(eq(boardInstances.podId, filters.pod_id));
    }

    const rows = await this.db.query.boardInstances.findMany({
      where: and(...conditions),
      orderBy: [
        desc(boardInstances.isFavorite),
        asc(boardInstances.displayOrder),
        desc(boardInstances.updatedAt),
      ],
      with: {
        category_defaultCategoryId: {
          columns: { id: true, name: true, color: true, icon: true },
        },
        category_orchestratorCategoryId: {
          columns: { id: true, name: true, color: true, icon: true },
        },
        boardSteps: {
          columns: {
            id: true,
            stepKey: true,
            name: true,
            stepType: true,
            position: true,
            color: true,
            linkedCategoryId: true,
          },
          with: {
            category: {
              columns: { id: true, name: true, color: true, icon: true },
            },
          },
        },
      },
    });

    const data = rows.map((r) => this.presentBoard(r));

    // Get task counts per board
    const boardIds = data.map((b) => b.id);
    if (boardIds.length > 0) {
      const taskCounts = await this.db
        .select({ boardInstanceId: tasks.boardInstanceId })
        .from(tasks)
        .where(inArray(tasks.boardInstanceId, boardIds));

      const countMap: Record<string, number> = {};
      taskCounts.forEach((t) => {
        if (t.boardInstanceId) {
          countMap[t.boardInstanceId] =
            (countMap[t.boardInstanceId] || 0) + 1;
        }
      });
      data.forEach((board) => {
        board.task_count = countMap[board.id] || 0;
      });
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const row = await this.db.query.boardInstances.findFirst({
      where: and(
        eq(boardInstances.id, boardId),
        eq(boardInstances.accountId, accountId),
      ),
      with: {
        category_defaultCategoryId: {
          columns: { id: true, name: true, color: true, icon: true },
        },
        category_orchestratorCategoryId: {
          columns: { id: true, name: true, color: true, icon: true },
        },
        boardSteps: {
          columns: {
            id: true,
            stepKey: true,
            name: true,
            stepType: true,
            position: true,
            color: true,
            linkedCategoryId: true,
            triggerType: true,
            aiFirst: true,
            inputSchema: true,
            outputSchema: true,
            onSuccessStepId: true,
            onErrorStepId: true,
            webhookUrl: true,
            webhookAuthHeader: true,
            scheduleCron: true,
            systemPrompt: true,
          },
          with: {
            category: {
              columns: { id: true, name: true, color: true, icon: true },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const data = this.presentBoard(row);

    // Sort steps by position
    if (data.board_steps) {
      data.board_steps.sort((a: any, b: any) => a.position - b.position);
    }

    // Get task counts per step
    const taskCounts = await this.db
      .select({ currentStepId: tasks.currentStepId })
      .from(tasks)
      .where(eq(tasks.boardInstanceId, boardId));

    const stepCountMap: Record<string, number> = {};
    if (taskCounts) {
      taskCounts.forEach((t) => {
        if (t.currentStepId) {
          stepCountMap[t.currentStepId] =
            (stepCountMap[t.currentStepId] || 0) + 1;
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Create board instance
    const boardRows = await this.db
      .insert(boardInstances)
      .values({
        accountId,
        name: dto.name,
        description: dto.description || null,
        icon: dto.icon || 'layout-grid',
        color: dto.color || '#6366f1',
        tags: dto.tags || [],
        isFavorite: dto.is_favorite || false,
        defaultCategoryId: dto.default_category_id || null,
        orchestratorCategoryId: dto.orchestrator_category_id || null,
        backboneConnectionId: dto.default_backbone_connection_id || null,
        podId: dto.pod_id || null,
      })
      .returning();
    const board = boardRows[0];

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
          boardInstanceId: board.id,
          stepKey: step.step_key,
          name: step.name,
          stepType: stepType,
          position: index,
          color: step.color || null,
          linkedCategoryId: step.linked_category_id || null,
        };
      });

      try {
        await this.db.insert(boardSteps).values(stepRows);
      } catch (stepsError: any) {
        this.logger.error(
          `Failed to create board steps: ${stepsError?.message}`,
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    await this.findOne(userId, accountId, boardId);

    // Map the DTO to camelCase columns (only defined fields).
    const updateData: Partial<typeof boardInstances.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.is_favorite !== undefined) updateData.isFavorite = dto.is_favorite;
    if (dto.display_order !== undefined)
      updateData.displayOrder = dto.display_order;
    if (dto.default_category_id !== undefined)
      updateData.defaultCategoryId = dto.default_category_id;
    if (dto.orchestrator_category_id !== undefined)
      updateData.orchestratorCategoryId = dto.orchestrator_category_id;
    if (dto.pod_id !== undefined) updateData.podId = dto.pod_id;
    if (dto.settings_override !== undefined)
      updateData.settingsOverride = dto.settings_override;
    if (dto.is_archived !== undefined)
      updateData.isArchived = dto.is_archived;
    // Map DTO field name to DB column name (F022)
    if (dto.default_backbone_connection_id !== undefined) {
      updateData.backboneConnectionId = dto.default_backbone_connection_id;
    }
    if (dto.is_archived === true) {
      updateData.archivedAt = new Date().toISOString();
    } else if (dto.is_archived === false) {
      updateData.archivedAt = null;
    }

    const rows = await this.db
      .update(boardInstances)
      .set(updateData)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      )
      .returning();
    const data = rows[0];

    this.webhookEmitter.emit(accountId, 'board.updated', { board: data });

    return data;
  }

  async remove(userId: string, accountId: string, boardId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);
    await this.findOne(userId, accountId, boardId);

    // Tasks become boardless (ON DELETE SET NULL on FK)
    await this.db
      .delete(boardInstances)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      );

    this.webhookEmitter.emit(accountId, 'board.deleted', { board_id: boardId });

    return { message: 'Board deleted successfully' };
  }

  async duplicate(userId: string, accountId: string, boardId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const original = await this.findOne(userId, accountId, boardId);

    // Create copy of board — clear integration credentials
    const cleanedSettings = { ...(original.settings_override || {}) };
    if (cleanedSettings.integrations) {
      const cleaned: Record<string, any> = {};
      for (const [slug] of Object.entries(
        cleanedSettings.integrations as Record<string, any>,
      )) {
        cleaned[slug] = { enabled: false, config: {}, test_status: 'untested' };
      }
      cleanedSettings.integrations = cleaned;
    }

    const copyRows = await this.db
      .insert(boardInstances)
      .values({
        accountId,
        templateId: original.template_id,
        name: `${original.name} (Copy)`,
        description: original.description,
        icon: original.icon,
        color: original.color,
        tags: original.tags,
        isFavorite: false,
        settingsOverride: cleanedSettings,
        installedManifest: original.installed_manifest,
        installedVersion: original.installed_version,
        defaultCategoryId: original.default_category_id || null,
        orchestratorCategoryId: original.orchestrator_category_id || null,
        backboneConnectionId: original.backbone_connection_id || null,
      })
      .returning();
    const copy = copyRows[0];

    // Copy steps (including rich config)
    if (original.board_steps && original.board_steps.length > 0) {
      const stepRows = original.board_steps.map((step: any) => ({
        boardInstanceId: copy.id,
        stepKey: step.step_key,
        name: step.name,
        stepType: step.step_type,
        position: step.position,
        color: step.color,
        linkedCategoryId: step.linked_category_id || null,
        backboneConnectionId: step.backbone_connection_id || null,
        triggerType: step.trigger_type || 'on_entry',
        aiFirst: step.ai_first || false,
        inputSchema: step.input_schema || [],
        outputSchema: step.output_schema || [],
        webhookUrl: step.webhook_url || null,
        webhookAuthHeader: step.webhook_auth_header || null,
        scheduleCron: step.schedule_cron || null,
        systemPrompt: step.system_prompt || null,
      }));

      await this.db.insert(boardSteps).values(stepRows);
    }

    return this.findOne(userId, accountId, copy.id);
  }

  async exportManifest(userId: string, accountId: string, boardId: string) {
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
      const catsRaw = await this.db.query.categories.findMany({
        columns: { id: true, name: true, color: true, icon: true },
        where: inArray(categories.id, categoryIds),
        with: {
          categorySkills: {
            with: {
              skill: {
                columns: {
                  id: true,
                  name: true,
                  description: true,
                  instructions: true,
                  isActive: true,
                  fileAttachments: true,
                },
              },
            },
          },
        },
      });
      // Re-key `categorySkills` → `category_skills` to preserve PostgREST shape
      const cats = catsRaw.map((c: any) => {
        const { categorySkills, ...rest } = c;
        return { ...rest, category_skills: categorySkills ?? [] };
      });

      // Fetch knowledge docs for these categories
      const knowledgeDocsRows = await this.db
        .select({
          id: knowledgeDocs.id,
          category_id: knowledgeDocs.categoryId,
          title: knowledgeDocs.title,
          content: knowledgeDocs.content,
          is_master: knowledgeDocs.isMaster,
          file_attachments: knowledgeDocs.fileAttachments,
        })
        .from(knowledgeDocs)
        .where(inArray(knowledgeDocs.categoryId, categoryIds));

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
            knowledge_docs: (knowledgeDocsRows || [])
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

    // F024: Resolve backbone connection IDs to slugs for export
    const backboneIds = [
      board.backbone_connection_id,
      ...(board.board_steps || []).map((s: any) => s.backbone_connection_id),
    ].filter(Boolean);
    const backboneIdToSlug: Record<string, string> = {};
    if (backboneIds.length > 0) {
      const conns = await this.db
        .select({
          id: backboneConnections.id,
          backbone_type: backboneConnections.backboneType,
        })
        .from(backboneConnections)
        .where(inArray(backboneConnections.id, [...new Set(backboneIds)]));
      if (conns) {
        for (const c of conns) {
          backboneIdToSlug[c.id] = c.backbone_type;
        }
      }
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
      default_backbone: board.backbone_connection_id
        ? backboneIdToSlug[board.backbone_connection_id] || null
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
        backbone_override: step.backbone_connection_id
          ? backboneIdToSlug[step.backbone_connection_id] || null
          : null,
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [board] = await this.db
      .select({
        installed_manifest: boardInstances.installedManifest,
        settings_override: boardInstances.settingsOverride,
      })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      )
      .limit(1);

    if (!board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const manifest = (board.installed_manifest ?? {}) as Record<string, any>;
    const settings = (board.settings_override ?? {}) as Record<string, any>;
    const definitions: any[] = manifest.integrations || [];
    const runtimeConfigs: Record<string, any> = settings.integrations || {};

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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [board] = await this.db
      .select({ installed_manifest: boardInstances.installedManifest })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      )
      .limit(1);

    if (!board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const manifest = (board.installed_manifest || {}) as Record<string, any>;
    const integrations: any[] = manifest.integrations || [];

    // Check for duplicate slug
    if (integrations.some((i: any) => i.slug === integration.slug)) {
      throw new BadRequestException(
        `Integration "${integration.slug}" already exists on this board`,
      );
    }

    integrations.push(integration);
    manifest.integrations = integrations;

    try {
      await this.db
        .update(boardInstances)
        .set({ installedManifest: manifest })
        .where(
          and(
            eq(boardInstances.id, boardId),
            eq(boardInstances.accountId, accountId),
          ),
        );
    } catch (updateError: any) {
      throw new Error(`Failed to add integration: ${updateError?.message}`);
    }

    return { success: true };
  }

  async removeIntegrationDefinition(
    userId: string,
    accountId: string,
    boardId: string,
    slug: string,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [board] = await this.db
      .select({
        installed_manifest: boardInstances.installedManifest,
        settings_override: boardInstances.settingsOverride,
      })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      )
      .limit(1);

    if (!board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const manifest = (board.installed_manifest || {}) as Record<string, any>;
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
    const settings = (board.settings_override || {}) as Record<string, any>;
    if (settings.integrations?.[slug]) {
      delete settings.integrations[slug];
    }

    try {
      await this.db
        .update(boardInstances)
        .set({
          installedManifest: manifest,
          settingsOverride: settings,
        })
        .where(
          and(
            eq(boardInstances.id, boardId),
            eq(boardInstances.accountId, accountId),
          ),
        );
    } catch (updateError: any) {
      throw new Error(`Failed to remove integration: ${updateError?.message}`);
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [board] = await this.db
      .select({
        installed_manifest: boardInstances.installedManifest,
        settings_override: boardInstances.settingsOverride,
      })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.id, boardId),
          eq(boardInstances.accountId, accountId),
        ),
      )
      .limit(1);

    if (!board) {
      throw new NotFoundException(`Board with ID ${boardId} not found`);
    }

    const manifest = (board.installed_manifest ?? {}) as Record<string, any>;
    const settings = (board.settings_override ?? {}) as Record<string, any>;
    const definitions: any[] = manifest.integrations || [];
    const integrationDef = definitions.find((i: any) => i.slug === slug);
    if (!integrationDef) {
      throw new NotFoundException(
        `Integration "${slug}" not declared in board manifest`,
      );
    }

    // Get existing runtime config for this integration
    const existingRuntime = settings.integrations?.[slug] || {};

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
    const currentSettings = settings;
    const currentIntegrations = currentSettings.integrations || {};
    currentIntegrations[slug] = {
      enabled: data.enabled,
      config: encryptedConfig,
      last_tested_at: null,
      test_status: 'untested',
    };

    try {
      await this.db
        .update(boardInstances)
        .set({
          settingsOverride: {
            ...currentSettings,
            integrations: currentIntegrations,
          },
        })
        .where(
          and(
            eq(boardInstances.id, boardId),
            eq(boardInstances.accountId, accountId),
          ),
        )
        .returning();
    } catch (updateError: any) {
      throw new Error(
        `Failed to update integration config: ${updateError?.message}`,
      );
    }

    return { success: true };
  }
}
