import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  backboneConnections,
  boardInstances,
  boardSteps,
  boardTemplates,
  categories,
  categorySkills,
  knowledgeDocs,
  skills,
} from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { InstallTemplateDto } from './dto/install-template.dto';

@Injectable()
export class BoardTemplatesService {
  private readonly logger = new Logger(BoardTemplatesService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
  ) {}

  async findAll() {
    return this.db
      .select()
      .from(boardTemplates)
      .where(
        or(
          eq(boardTemplates.isSystem, true),
          eq(boardTemplates.isPublished, true),
        ),
      )
      .orderBy(desc(boardTemplates.installCount));
  }

  async findOne(templateId: string) {
    const [data] = await this.db
      .select()
      .from(boardTemplates)
      .where(eq(boardTemplates.id, templateId))
      .limit(1);

    if (!data) {
      throw new NotFoundException(
        `Board template with ID ${templateId} not found`,
      );
    }

    return data;
  }

  /**
   * Provision categories and skills from the manifest into the user's account.
   * Returns a map of category slug → category UUID for step linking.
   */
  async provisionCategories(
    _client: any,
    accountId: string,
    userId: string,
    categoryList: any[],
  ): Promise<Record<string, string>> {
    const slugToId: Record<string, string> = {};

    for (const cat of categoryList) {
      // Upsert category (skip if name already exists for this account)
      const [existing] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.accountId, accountId),
            eq(categories.name, cat.name),
          ),
        )
        .limit(1);

      let categoryId: string;

      if (existing) {
        categoryId = existing.id;
        this.logger.log(
          `Category "${cat.name}" already exists, reusing ${categoryId}`,
        );
      } else {
        try {
          const inserted = await this.db
            .insert(categories)
            .values({
              accountId,
              name: cat.name,
              color: cat.color || null,
              icon: cat.icon || null,
            })
            .returning({ id: categories.id });
          categoryId = inserted[0].id;
        } catch (catError: any) {
          this.logger.error(
            `Failed to create category "${cat.name}": ${catError?.message}`,
          );
          continue;
        }
      }

      slugToId[cat.slug] = categoryId;

      // Provision skills for this category
      if (cat.skills && cat.skills.length > 0) {
        for (const skill of cat.skills) {
          // Upsert skill (skip if name already exists for this account)
          const [existingSkill] = await this.db
            .select({ id: skills.id })
            .from(skills)
            .where(
              and(
                eq(skills.accountId, accountId),
                eq(skills.name, skill.name),
              ),
            )
            .limit(1);

          let skillId: string;

          if (existingSkill) {
            skillId = existingSkill.id;
          } else {
            try {
              const insertedSkill = await this.db
                .insert(skills)
                .values({
                  accountId,
                  name: skill.name,
                  description: skill.description || null,
                  instructions: skill.instructions || '',
                  isActive: skill.is_active !== false,
                  createdBy: userId,
                })
                .returning({ id: skills.id });
              skillId = insertedSkill[0].id;
            } catch (skillError: any) {
              this.logger.error(
                `Failed to create skill "${skill.name}": ${skillError?.message}`,
              );
              continue;
            }
          }

          // Link skill to category (ignore conflict)
          await this.db
            .insert(categorySkills)
            .values({ categoryId, skillId })
            .onConflictDoNothing({
              target: [categorySkills.categoryId, categorySkills.skillId],
            });
        }
      }

      // Provision knowledge docs for this category
      if (cat.knowledge_docs && cat.knowledge_docs.length > 0) {
        for (const doc of cat.knowledge_docs) {
          try {
            await this.db.insert(knowledgeDocs).values({
              accountId,
              categoryId,
              title: doc.title,
              content: doc.content || '',
              isMaster: doc.is_master || false,
            });
          } catch (docError: any) {
            this.logger.error(
              `Failed to create knowledge doc "${doc.title}": ${docError?.message}`,
            );
          }
        }
      }
    }

    return slugToId;
  }

  async install(userId: string, accountId: string, dto: InstallTemplateDto) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const template = await this.findOne(dto.template_id);
    const manifest = template.manifest as any;

    // Provision categories, skills, and knowledge docs from manifest
    let categorySlugToId: Record<string, string> = {};
    if (manifest.categories && manifest.categories.length > 0) {
      categorySlugToId = await this.provisionCategories(
        null,
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

    // F024: Resolve backbone slugs from manifest
    const backboneSlugMap = await this.resolveBackboneSlugs(null, accountId, manifest);

    // Create board instance from template
    let board: { id: string };
    try {
      const insertedBoard = await this.db
        .insert(boardInstances)
        .values({
          accountId,
          templateId: template.id,
          name: dto.name || template.name,
          description: template.description,
          icon: template.icon,
          color: template.color,
          tags: template.tags,
          installedManifest: manifest,
          installedVersion: template.version,
          latestAvailableVersion: template.version,
          settingsOverride: manifest.settings || {},
          defaultCategoryId: defaultCategoryId,
          defaultBackboneConnectionId: backboneSlugMap.boardDefault || null,
        })
        .returning({ id: boardInstances.id });
      board = insertedBoard[0];
    } catch (boardError: any) {
      throw new Error(
        `Failed to install board template: ${boardError?.message}`,
      );
    }

    // Create steps from manifest
    if (manifest.steps && manifest.steps.length > 0) {
      const stepRows = manifest.steps.map((step: any) => {
        // Resolve linked category slug to ID
        const linkedCategorySlug = step.linked_category_slug || null;
        const linkedCategoryId = linkedCategorySlug
          ? categorySlugToId[linkedCategorySlug] || null
          : null;

        // F024: Resolve step-level backbone override slug
        const stepBackboneSlug =
          step.ai_config?.backbone_override || step.backbone_override || null;
        const stepBackboneId = stepBackboneSlug
          ? backboneSlugMap.bySlug[stepBackboneSlug] || null
          : null;

        return {
          boardInstanceId: board.id,
          stepKey: step.id,
          name: step.name,
          stepType: step.type,
          position: step.position,
          color: step.color || null,
          linkedCategoryId: linkedCategoryId,
          backboneConnectionId: stepBackboneId,
          // AI config (legacy format support)
          aiEnabled: step.ai_config?.enabled || false,
          aiFirst: step.ai_config?.ai_first || false,
          systemPrompt: step.ai_config?.system_prompt || null,
          modelOverride: step.ai_config?.model_override || null,
          temperature: step.ai_config?.temperature || null,
          // Rich config
          triggerType: step.trigger_type || 'on_entry',
          inputSchema: step.input_schema || step.fields?.inputs || [],
          outputSchema: step.output_schema || step.fields?.outputs || [],
          inputFields: step.fields?.inputs || [],
          outputFields: step.fields?.outputs || [],
          // Routing (step_key references, resolved to IDs after insert)
          onCompleteStepKey: step.on_complete || null,
          onErrorStepKey: step.on_error || null,
          routingRules: step.routing_rules || [],
          // Trigger-specific
          webhookUrl: step.webhook_url || null,
          webhookAuthHeader: step.webhook_auth_header || null,
          scheduleCron: step.schedule_cron || null,
        };
      });

      let createdSteps: { id: string; stepKey: string }[] = [];
      try {
        createdSteps = await this.db
          .insert(boardSteps)
          .values(stepRows)
          .returning({ id: boardSteps.id, stepKey: boardSteps.stepKey });
      } catch (stepsError: any) {
        this.logger.error(
          `Failed to create template steps: ${stepsError?.message}`,
        );
      }

      // Resolve on_success_step_id / on_error_step_id from step_key references
      if (createdSteps && createdSteps.length > 0) {
        const stepKeyToId: Record<string, string> = {};
        for (const s of createdSteps) {
          stepKeyToId[s.stepKey] = s.id;
        }

        for (const step of manifest.steps) {
          const stepId = stepKeyToId[step.id];
          if (!stepId) continue;

          const updates: Record<string, any> = {};
          if (step.on_complete && stepKeyToId[step.on_complete]) {
            updates.onSuccessStepId = stepKeyToId[step.on_complete];
          }
          if (step.on_error && stepKeyToId[step.on_error]) {
            updates.onErrorStepId = stepKeyToId[step.on_error];
          }

          if (Object.keys(updates).length > 0) {
            await this.db
              .update(boardSteps)
              .set(updates)
              .where(eq(boardSteps.id, stepId));
          }
        }
      }
    }

    // Increment install count
    await this.db
      .update(boardTemplates)
      .set({ installCount: (template.installCount ?? 0) + 1 })
      .where(eq(boardTemplates.id, template.id));

    // Return full board with steps and linked categories
    const fullBoard = await this.loadFullBoard(board.id);

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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Provision categories, skills, and knowledge docs
    let categorySlugToId: Record<string, string> = {};
    if (manifest.categories && manifest.categories.length > 0) {
      categorySlugToId = await this.provisionCategories(
        null,
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

    // F024: Resolve board-level default backbone slug to connection ID
    const backboneSlugMap = await this.resolveBackboneSlugs(null, accountId, manifest);

    // Create board instance
    let board: { id: string };
    try {
      const insertedBoard = await this.db
        .insert(boardInstances)
        .values({
          accountId,
          name: manifest.name || 'Imported Board',
          description: manifest.description || null,
          icon: manifest.icon || 'layout-grid',
          color: manifest.color || '#6366f1',
          tags: manifest.tags || [],
          installedManifest: manifest,
          settingsOverride: manifest.settings || {},
          defaultCategoryId: defaultCategoryId,
          defaultBackboneConnectionId: backboneSlugMap.boardDefault || null,
        })
        .returning({ id: boardInstances.id });
      board = insertedBoard[0];
    } catch (boardError: any) {
      throw new Error(`Failed to import board: ${boardError?.message}`);
    }

    // Create steps
    if (manifest.steps && manifest.steps.length > 0) {
      const stepRows = manifest.steps.map((step: any) => {
        const linkedCategorySlug = step.linked_category_slug || null;
        const linkedCategoryId = linkedCategorySlug
          ? categorySlugToId[linkedCategorySlug] || null
          : null;

        // F024: Resolve step-level backbone override slug
        const stepBackboneSlug =
          step.ai_config?.backbone_override || step.backbone_override || null;
        const stepBackboneId = stepBackboneSlug
          ? backboneSlugMap.bySlug[stepBackboneSlug] || null
          : null;

        return {
          boardInstanceId: board.id,
          stepKey: step.id,
          name: step.name,
          stepType: step.type,
          position: step.position,
          color: step.color || null,
          linkedCategoryId: linkedCategoryId,
          backboneConnectionId: stepBackboneId,
          aiEnabled: step.ai_config?.enabled || false,
          aiFirst: step.ai_config?.ai_first || step.ai_first || false,
          systemPrompt:
            step.ai_config?.system_prompt || step.system_prompt || null,
          modelOverride: step.ai_config?.model_override || null,
          temperature: step.ai_config?.temperature || null,
          triggerType: step.trigger_type || 'on_entry',
          inputSchema: step.input_schema || step.fields?.inputs || [],
          outputSchema: step.output_schema || step.fields?.outputs || [],
          inputFields: step.fields?.inputs || [],
          outputFields: step.fields?.outputs || [],
          onCompleteStepKey: step.on_complete || step.on_success || null,
          onErrorStepKey: step.on_error || null,
          routingRules: step.routing_rules || [],
          webhookUrl: step.webhook_url || null,
          webhookAuthHeader: step.webhook_auth_header || null,
          scheduleCron: step.schedule_cron || null,
        };
      });

      let createdSteps: { id: string; stepKey: string }[] = [];
      try {
        createdSteps = await this.db
          .insert(boardSteps)
          .values(stepRows)
          .returning({ id: boardSteps.id, stepKey: boardSteps.stepKey });
      } catch (stepsError: any) {
        this.logger.error(
          `Failed to create imported steps: ${stepsError?.message}`,
        );
      }

      // Resolve step routing references
      if (createdSteps && createdSteps.length > 0) {
        const stepKeyToId: Record<string, string> = {};
        for (const s of createdSteps) {
          stepKeyToId[s.stepKey] = s.id;
        }

        for (const step of manifest.steps) {
          const stepId = stepKeyToId[step.id];
          if (!stepId) continue;

          const updates: Record<string, any> = {};
          const onSuccess = step.on_complete || step.on_success;
          if (onSuccess && stepKeyToId[onSuccess]) {
            updates.onSuccessStepId = stepKeyToId[onSuccess];
          }
          if (step.on_error && stepKeyToId[step.on_error]) {
            updates.onErrorStepId = stepKeyToId[step.on_error];
          }

          if (Object.keys(updates).length > 0) {
            await this.db
              .update(boardSteps)
              .set(updates)
              .where(eq(boardSteps.id, stepId));
          }
        }
      }
    }

    // Return full board with steps
    const fullBoard = await this.loadFullBoard(board.id);

    if (fullBoard?.board_steps) {
      fullBoard.board_steps.sort((a: any, b: any) => a.position - b.position);
    }

    return fullBoard;
  }

  /**
   * Load a board instance with its default category and steps (each with their
   * linked category), re-keying Drizzle relation names back to the PostgREST
   * aliases the response shape callers depend on:
   *   `category_defaultCategoryId` → `default_category`
   *   `boardSteps`                 → `board_steps`
   *   per-step `category`          → `linked_category`
   */
  private async loadFullBoard(boardId: string) {
    const row = await this.db.query.boardInstances.findFirst({
      where: eq(boardInstances.id, boardId),
      with: {
        category_defaultCategoryId: {
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
          orderBy: asc(boardSteps.position),
          with: {
            category: {
              columns: { id: true, name: true, color: true, icon: true },
            },
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    const {
      category_defaultCategoryId,
      boardSteps: steps,
      ...rest
    } = row as any;

    return {
      ...rest,
      default_category: category_defaultCategoryId ?? null,
      board_steps: (steps ?? []).map((s: any) => {
        const { category, ...stepRest } = s;
        return {
          ...stepRest,
          step_key: stepRest.stepKey,
          step_type: stepRest.stepType,
          linked_category_id: stepRest.linkedCategoryId,
          linked_category: category ?? null,
        };
      }),
    };
  }

  /**
   * F024: Resolve backbone slugs from a manifest to backbone_connection IDs.
   * Looks up connections by name (slug-matched) for the given account.
   * Returns { boardDefault, bySlug } where bySlug maps slug -> connection ID.
   */
  private async resolveBackboneSlugs(
    _client: any,
    accountId: string,
    manifest: any,
  ): Promise<{ boardDefault: string | null; bySlug: Record<string, string> }> {
    const result = { boardDefault: null as string | null, bySlug: {} as Record<string, string> };

    // Collect all backbone slugs referenced in the manifest
    const slugs = new Set<string>();
    const boardDefaultSlug =
      manifest.settings?.default_backbone || manifest.default_backbone || null;
    if (boardDefaultSlug) slugs.add(boardDefaultSlug);

    if (manifest.steps) {
      for (const step of manifest.steps) {
        const stepSlug =
          step.ai_config?.backbone_override || step.backbone_override || null;
        if (stepSlug) slugs.add(stepSlug);
      }
    }

    if (slugs.size === 0) return result;

    // Fetch all active backbone connections for this account
    const connections = await this.db
      .select({
        id: backboneConnections.id,
        name: backboneConnections.name,
        backbone_type: backboneConnections.backboneType,
      })
      .from(backboneConnections)
      .where(
        and(
          eq(backboneConnections.accountId, accountId),
          eq(backboneConnections.isActive, true),
        ),
      );

    if (!connections || connections.length === 0) {
      this.logger.warn(
        `No backbone connections found for account ${accountId} — manifest backbone slugs will be ignored`,
      );
      return result;
    }

    // Build slug -> connection ID map by matching backbone_type or name
    for (const slug of slugs) {
      const match =
        connections.find((c: any) => c.backbone_type === slug) ||
        connections.find(
          (c: any) => c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug,
        );
      if (match) {
        result.bySlug[slug] = match.id;
      } else {
        this.logger.warn(
          `Backbone slug "${slug}" not found in account ${accountId} connections`,
        );
      }
    }

    if (boardDefaultSlug) {
      result.boardDefault = result.bySlug[boardDefaultSlug] || null;
    }

    return result;
  }
}
