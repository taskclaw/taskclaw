import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  and,
  asc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  skills,
  categorySkills,
  agentSkills,
  categories,
  providerAgents,
  tasks,
  boardInstances,
  boardSteps,
  conversations,
} from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { snakeKeys } from '../common/utils/snake-keys.util';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { AgentSyncService } from '../agent-sync/agent-sync.service';

const ALLOWED_EXTENSIONS = [
  'pdf',
  'txt',
  'md',
  'doc',
  'docx',
  'csv',
  'json',
  'png',
  'jpg',
  'jpeg',
  'yaml',
  'yml',
  'xml',
  'html',
  'css',
  'js',
  'ts',
  'py',
  'sh',
  'sql',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'log',
  'rst',
  'tex',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const STORAGE_BUCKET = 'skill-attachments';

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
    @Inject(forwardRef(() => AgentSyncService))
    private readonly agentSyncService: AgentSyncService,
  ) {}

  /**
   * Extract required_tools from YAML frontmatter in skill content.
   * Expects format: required_tools: [tool1, tool2]
   */
  getRequiredTools(skill: any): string[] {
    if (!skill?.content) return [];
    const match = skill.content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return [];
    const frontmatter = match[1];
    const toolsMatch = frontmatter.match(/required_tools:\s*\[([^\]]*)\]/);
    if (!toolsMatch) return [];
    return toolsMatch[1]
      .split(',')
      .map((t: string) => t.trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }

  /**
   * List all skills for an account (optionally filter by active status).
   * When include_system is true, also returns system-wide skills (account_id IS NULL).
   */
  async findAll(
    accessToken: string,
    accountId: string,
    activeOnly?: boolean,
    skillType?: string,
    includeSystem?: boolean,
  ) {
    try {
      const conditions: SQL[] = [];

      if (includeSystem) {
        // Return both account-owned and system-wide skills
        const ownership = or(
          eq(skills.accountId, accountId),
          isNull(skills.accountId),
        );
        if (ownership) conditions.push(ownership);
      } else {
        conditions.push(eq(skills.accountId, accountId));
      }

      if (activeOnly) {
        conditions.push(eq(skills.isActive, true));
      }

      if (skillType) {
        conditions.push(eq(skills.skillType, skillType));
      }

      const data = await this.db
        .select()
        .from(skills)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(skills.name));

      return (data || []).map(snakeKeys);
    } catch (error) {
      this.logger.error('Error fetching skills:', error);
      throw error;
    }
  }

  /**
   * Get a single skill by ID
   */
  async findOne(accessToken: string, accountId: string, id: string) {
    try {
      const [data] = await this.db
        .select()
        .from(skills)
        .where(and(eq(skills.id, id), eq(skills.accountId, accountId)))
        .limit(1);

      if (!data) {
        throw new NotFoundException('Skill not found');
      }

      // NOTE: returns the RAW camelCase row on purpose — internal callers
      // (update/uploadAttachment/removeAttachment/getAttachmentContent) read
      // `skill.fileAttachments`. The HTTP GET :id route re-keys via
      // `getOne()` below; do not snake_key here.
      return data;
    } catch (error) {
      this.logger.error('Error fetching skill:', error);
      throw error;
    }
  }

  /**
   * HTTP-facing single-skill fetch — same as `findOne` but re-keyed to the
   * snake_case shape the frontend reads (`skill_type`, `is_active`,
   * `file_attachments`, `created_at`, …). Kept separate from `findOne` because
   * that method is also consumed internally with camelCase keys.
   */
  async getOne(accessToken: string, accountId: string, id: string) {
    return snakeKeys(await this.findOne(accessToken, accountId, id));
  }

  /**
   * Get skills by multiple IDs (for chat skill selection)
   */
  async findByIds(accessToken: string, accountId: string, skillIds: string[]) {
    try {
      if (!skillIds || skillIds.length === 0) {
        return [];
      }

      const data = await this.db
        .select()
        .from(skills)
        .where(
          and(
            eq(skills.accountId, accountId),
            inArray(skills.id, skillIds),
            eq(skills.isActive, true),
          ),
        );

      return data || [];
    } catch (error) {
      this.logger.error('Error fetching skills by IDs:', error);
      throw error;
    }
  }

  /**
   * Slash-palette search (PRD §5.3). Returns three groups:
   *  - available: skills already imported into the account (any source_type).
   *  - local:     disk-scan rows the user can adopt with one click.
   *  - market:    deferred to v1.1 (always [] for now).
   * Ordered by name; limited to ~30 per group for snappy palette UI.
   */
  async search(
    accountId: string,
    prefix: string,
    opts: { include_local?: boolean; include_market?: boolean } = {},
  ) {
    const includeLocal = opts.include_local ?? true;
    const includeMarket = opts.include_market ?? false;

    const q = (prefix ?? '').trim();

    const availableColumns = {
      id: skills.id,
      name: skills.name,
      description: skills.description,
      source_type: skills.sourceType,
      source_uri: skills.sourceUri,
      source_version: skills.sourceVersion,
      locally_available: skills.locallyAvailable,
      is_active: skills.isActive,
    };

    const availableConditions = [
      eq(skills.accountId, accountId),
      eq(skills.isActive, true),
    ];
    if (q.length > 0) {
      availableConditions.push(ilike(skills.name, `%${q}%`));
    }

    // Available = imported and ready to use. Disk-scan rows that haven't been
    // adopted into an agent are surfaced separately under `local`.
    const availableRaw = await this.db
      .select(availableColumns)
      .from(skills)
      .where(and(...availableConditions))
      .orderBy(asc(skills.name))
      .limit(30);

    const available = (availableRaw ?? []).filter(
      (row: any) =>
        row.source_type !== 'disk-scan' || row.locally_available === false,
    );

    let local: any[] = [];
    if (includeLocal) {
      const localConditions = [
        eq(skills.accountId, accountId),
        eq(skills.sourceType, 'disk-scan'),
        eq(skills.locallyAvailable, true),
      ];
      if (q.length > 0) {
        localConditions.push(ilike(skills.name, `%${q}%`));
      }
      const data = await this.db
        .select({
          id: skills.id,
          name: skills.name,
          description: skills.description,
          source_type: skills.sourceType,
          source_uri: skills.sourceUri,
          source_version: skills.sourceVersion,
          locally_available: skills.locallyAvailable,
        })
        .from(skills)
        .where(and(...localConditions))
        .orderBy(asc(skills.name))
        .limit(30);
      local = data ?? [];
    }

    return {
      available,
      local,
      market: includeMarket ? [] : [],
    };
  }

  /**
   * One-click adoption for a disk-scan skill: copies content into a regular
   * row the user can attach to agents. Idempotent — second call returns the
   * existing row.
   */
  async importFromDisk(accountId: string, sourceUri: string) {
    const [source] = await this.db
      .select()
      .from(skills)
      .where(
        and(
          eq(skills.accountId, accountId),
          eq(skills.sourceType, 'disk-scan'),
          eq(skills.sourceUri, sourceUri),
        ),
      )
      .limit(1);

    if (!source) throw new NotFoundException('Disk skill not found');

    // Already imported? source_type='disk-scan' rows ARE the import. We just
    // mark them eligible for normal use by linking to the agent context. So
    // for v1, "import" returns the disk-scan row itself.
    return snakeKeys(source);
  }

  /**
   * Get all category-skill mappings for an account in one query.
   * Returns { [categoryId]: Skill[] }
   */
  async getCategorySkillsMap(accessToken: string, accountId: string) {
    try {
      const data = await this.db.query.categorySkills.findMany({
        with: {
          skill: {
            columns: {
              id: true,
              accountId: true,
              name: true,
              description: true,
              isActive: true,
            },
          },
        },
      });

      const map: Record<string, any[]> = {};
      for (const row of data || []) {
        const skill = (row as any).skill;
        if (!skill || !skill.isActive || skill.accountId !== accountId) continue;
        if (!map[row.categoryId]) map[row.categoryId] = [];
        map[row.categoryId].push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          is_active: skill.isActive,
        });
      }
      return map;
    } catch (error) {
      this.logger.error('Error fetching category skills map:', error);
      throw error;
    }
  }

  /**
   * Get default skills for a category
   */
  async findDefaultForCategory(
    accessToken: string,
    accountId: string,
    categoryId: string,
  ) {
    try {
      // Join category_skills with skills
      const data = await this.db.query.categorySkills.findMany({
        where: eq(categorySkills.categoryId, categoryId),
        with: {
          skill: {
            columns: {
              id: true,
              accountId: true,
              name: true,
              description: true,
              instructions: true,
              isActive: true,
              fileAttachments: true,
            },
          },
        },
      });

      // Filter and flatten — re-key the relational `skill` and restore the
      // snake_case response shape callers depend on.
      const skillsList = (data || [])
        .map((cs: any) => cs.skill)
        .filter(
          (skill: any) =>
            skill && skill.isActive && skill.accountId === accountId,
        )
        .map((skill: any) => ({
          id: skill.id,
          account_id: skill.accountId,
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          is_active: skill.isActive,
          file_attachments: skill.fileAttachments,
        }));

      return skillsList;
    } catch (error) {
      this.logger.error('Error fetching category skills:', error);
      throw error;
    }
  }

  /**
   * F04/F07: Get skills for an agent via agent_skills junction table
   */
  async findDefaultForAgent(
    accessToken: string,
    accountId: string,
    agentId: string,
  ) {
    try {
      const data = await this.db.query.agentSkills.findMany({
        where: and(
          eq(agentSkills.agentId, agentId),
          eq(agentSkills.isActive, true),
        ),
        with: {
          skill: {
            columns: {
              id: true,
              accountId: true,
              name: true,
              description: true,
              instructions: true,
              isActive: true,
              fileAttachments: true,
            },
          },
        },
      });

      const skillsList = (data || [])
        .map((as: any) => as.skill)
        .filter(
          (skill: any) =>
            skill && skill.isActive && skill.accountId === accountId,
        )
        .map((skill: any) => ({
          id: skill.id,
          account_id: skill.accountId,
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          is_active: skill.isActive,
          file_attachments: skill.fileAttachments,
        }));

      return skillsList;
    } catch (error) {
      this.logger.error('Error fetching agent skills:', error);
      throw error;
    }
  }

  /**
   * Create a new skill
   */
  async create(
    accessToken: string,
    accountId: string,
    userId: string,
    createDto: CreateSkillDto,
  ) {
    try {
      // Check for duplicate name
      const [existing] = await this.db
        .select({ id: skills.id })
        .from(skills)
        .where(
          and(
            eq(skills.accountId, accountId),
            eq(skills.name, createDto.name),
          ),
        )
        .limit(1);

      if (existing) {
        throw new ConflictException(
          `Skill with name "${createDto.name}" already exists`,
        );
      }

      const rows = await this.db
        .insert(skills)
        .values({
          accountId,
          createdBy: userId,
          name: createDto.name,
          description: createDto.description || '',
          instructions: createDto.instructions,
          isActive:
            createDto.is_active !== undefined ? createDto.is_active : true,
          skillType: createDto.skill_type || 'general',
        })
        .returning();

      return snakeKeys(rows[0]);
    } catch (error) {
      this.logger.error('Error creating skill:', error);
      throw error;
    }
  }

  /**
   * Update a skill
   */
  async update(
    accessToken: string,
    accountId: string,
    id: string,
    updateDto: UpdateSkillDto,
  ) {
    try {
      // Check skill exists
      await this.findOne(accessToken, accountId, id);

      // Check for duplicate name if changing name
      if (updateDto.name) {
        const [existing] = await this.db
          .select({ id: skills.id })
          .from(skills)
          .where(
            and(
              eq(skills.accountId, accountId),
              eq(skills.name, updateDto.name),
              ne(skills.id, id),
            ),
          )
          .limit(1);

        if (existing) {
          throw new ConflictException(
            `Skill with name "${updateDto.name}" already exists`,
          );
        }
      }

      const patch: Partial<typeof skills.$inferInsert> = {};
      if (updateDto.name !== undefined) patch.name = updateDto.name;
      if (updateDto.description !== undefined)
        patch.description = updateDto.description;
      if (updateDto.instructions !== undefined)
        patch.instructions = updateDto.instructions;
      if (updateDto.is_active !== undefined) patch.isActive = updateDto.is_active;
      if (updateDto.skill_type !== undefined)
        patch.skillType = updateDto.skill_type;

      const rows = await this.db
        .update(skills)
        .set(patch)
        .where(and(eq(skills.id, id), eq(skills.accountId, accountId)))
        .returning();

      const data = rows[0];

      // Trigger sync for all linked categories
      await this.syncLinkedCategories(accountId, id);

      return snakeKeys(data);
    } catch (error) {
      this.logger.error('Error updating skill:', error);
      throw error;
    }
  }

  /**
   * Link a skill to a category (default skill)
   */
  async linkToCategory(
    accessToken: string,
    accountId: string,
    skillId: string,
    categoryId: string,
  ) {
    try {
      // Verify skill and category belong to account
      await this.findOne(accessToken, accountId, skillId);

      // Verify category exists and belongs to account
      const [category] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, categoryId),
            eq(categories.accountId, accountId),
          ),
        )
        .limit(1);

      if (!category) {
        throw new NotFoundException('Agent not found');
      }

      // Insert association
      let data;
      try {
        const rows = await this.db
          .insert(categorySkills)
          .values({ categoryId, skillId })
          .returning();
        data = rows[0];
      } catch (error: any) {
        if (error?.code === '23505') {
          // Unique violation
          throw new ConflictException('Skill already linked to this agent');
        }
        this.logger.error(
          `Failed to link skill to category: ${error?.message}`,
        );
        throw new Error(error?.message);
      }

      // Trigger sync for the linked category
      this.agentSyncService.markStale(accountId, categoryId).catch((err) => {
        this.logger.warn(
          `Failed to trigger sync after linking skill: ${err.message}`,
        );
      });

      return data;
    } catch (error) {
      this.logger.error('Error linking skill to category:', error);
      throw error;
    }
  }

  /**
   * Unlink a skill from a category
   */
  async unlinkFromCategory(
    accessToken: string,
    accountId: string,
    skillId: string,
    categoryId: string,
  ) {
    try {
      // Verify ownership
      await this.findOne(accessToken, accountId, skillId);

      await this.db
        .delete(categorySkills)
        .where(
          and(
            eq(categorySkills.categoryId, categoryId),
            eq(categorySkills.skillId, skillId),
          ),
        );

      // Trigger sync for the unlinked category
      this.agentSyncService.markStale(accountId, categoryId).catch((err) => {
        this.logger.warn(
          `Failed to trigger sync after unlinking skill: ${err.message}`,
        );
      });

      return { message: 'Skill unlinked from agent successfully' };
    } catch (error) {
      this.logger.error('Error unlinking skill from category:', error);
      throw error;
    }
  }

  /**
   * Delete a skill
   */
  async remove(accessToken: string, accountId: string, id: string) {
    try {
      // Check skill exists
      await this.findOne(accessToken, accountId, id);

      // Get linked categories BEFORE deleting (cascade will remove category_skills rows)
      const linkedCategories = await this.db
        .select({ category_id: categorySkills.categoryId })
        .from(categorySkills)
        .where(eq(categorySkills.skillId, id));

      await this.db
        .delete(skills)
        .where(and(eq(skills.id, id), eq(skills.accountId, accountId)));

      // Trigger sync for all previously linked categories
      for (const link of linkedCategories || []) {
        this.agentSyncService
          .markStale(accountId, link.category_id)
          .catch((err) => {
            this.logger.warn(
              `Failed to trigger sync after deleting skill: ${err.message}`,
            );
          });
      }

      return { message: 'Skill deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting skill:', error);
      throw error;
    }
  }

  /**
   * Upload a file attachment to a skill
   */
  async uploadAttachment(
    accessToken: string,
    accountId: string,
    skillId: string,
    file: Express.Multer.File,
  ) {
    try {
      if (file.size > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        );
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        throw new BadRequestException(
          `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
        );
      }

      // Verify skill exists and belongs to account
      const skill = await this.findOne(accessToken, accountId, skillId);

      // Upload to object storage
      const storagePath = `${accountId}/${skillId}/${file.originalname}`;

      await this.storage.upload(
        STORAGE_BUCKET,
        storagePath,
        file.buffer,
        file.mimetype,
      );

      // Get the public URL
      const publicUrl = this.storage.getPublicUrl(STORAGE_BUCKET, storagePath);

      const attachment = {
        name: file.originalname,
        url: publicUrl,
        size: file.size,
        type: file.mimetype,
        uploaded_at: new Date().toISOString(),
      };

      // Update the skill's file_attachments array
      const existingAttachments = (skill.fileAttachments as any[]) || [];
      const filteredAttachments = existingAttachments.filter(
        (a: any) => a.name !== file.originalname,
      );
      const updatedAttachments = [...filteredAttachments, attachment];

      const rows = await this.db
        .update(skills)
        .set({ fileAttachments: updatedAttachments })
        .where(and(eq(skills.id, skillId), eq(skills.accountId, accountId)))
        .returning();

      const data = rows[0];

      // Trigger sync for linked categories
      await this.syncLinkedCategories(accountId, skillId);

      return snakeKeys(data);
    } catch (error) {
      this.logger.error('Error uploading skill attachment:', error);
      throw error;
    }
  }

  /**
   * Read text content of a file attachment from object storage
   */
  async getAttachmentContent(
    accessToken: string,
    accountId: string,
    skillId: string,
    filename: string,
  ): Promise<{ content: string; filename: string }> {
    const skill = await this.findOne(accessToken, accountId, skillId);

    const existingAttachments = (skill.fileAttachments as any[]) || [];
    const attachment = existingAttachments.find(
      (a: any) => a.name === filename,
    );
    if (!attachment) {
      throw new NotFoundException(`Attachment "${filename}" not found`);
    }

    const storagePath = `${accountId}/${skillId}/${filename}`;
    let buffer: Buffer;
    try {
      buffer = await this.storage.download(STORAGE_BUCKET, storagePath);
    } catch (error: any) {
      this.logger.error(
        `Failed to download attachment ${storagePath}: ${error?.message}`,
      );
      throw new Error(`Failed to read file content: ${error?.message}`);
    }

    const content = buffer.toString('utf-8');
    return { content, filename };
  }

  /**
   * Remove a file attachment from a skill
   */
  async removeAttachment(
    accessToken: string,
    accountId: string,
    skillId: string,
    filename: string,
  ) {
    try {
      const skill = await this.findOne(accessToken, accountId, skillId);

      const existingAttachments = (skill.fileAttachments as any[]) || [];
      const attachment = existingAttachments.find(
        (a: any) => a.name === filename,
      );

      if (!attachment) {
        throw new NotFoundException(`Attachment "${filename}" not found`);
      }

      // Delete from object storage
      const storagePath = `${accountId}/${skillId}/${filename}`;

      try {
        await this.storage.remove(STORAGE_BUCKET, [storagePath]);
      } catch (error: any) {
        this.logger.error(
          `Failed to delete file from storage: ${error?.message}`,
        );
        throw new Error(`Storage delete failed: ${error?.message}`);
      }

      const updatedAttachments = existingAttachments.filter(
        (a: any) => a.name !== filename,
      );

      const rows = await this.db
        .update(skills)
        .set({ fileAttachments: updatedAttachments })
        .where(and(eq(skills.id, skillId), eq(skills.accountId, accountId)))
        .returning();

      const data = rows[0];

      // Trigger sync for linked categories
      await this.syncLinkedCategories(accountId, skillId);

      return snakeKeys(data);
    } catch (error) {
      this.logger.error('Error removing skill attachment:', error);
      throw error;
    }
  }

  /**
   * Find all categories linked to a skill and trigger sync for each.
   */
  private async syncLinkedCategories(
    accountId: string,
    skillId: string,
  ): Promise<void> {
    try {
      const linkedCategories = await this.db
        .select({ category_id: categorySkills.categoryId })
        .from(categorySkills)
        .where(eq(categorySkills.skillId, skillId));

      for (const link of linkedCategories || []) {
        this.agentSyncService
          .markStale(accountId, link.category_id)
          .catch((err) => {
            this.logger.warn(
              `Failed to trigger sync for category ${link.category_id}: ${err.message}`,
            );
          });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to sync linked categories: ${err.message}`);
    }
  }

  /**
   * Get agents dashboard data — categories that have skills linked,
   * with skill count, sync status, task counts, and board assignments.
   */
  async getAgentsDashboard(accessToken: string, accountId: string) {
    // 1. Get all categories that have at least one linked skill
    let categorySkillsRows;
    try {
      categorySkillsRows = await this.db.query.categorySkills.findMany({
        columns: { categoryId: true },
        with: {
          skill: {
            columns: {
              id: true,
              name: true,
              isActive: true,
              accountId: true,
            },
          },
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to fetch category skills: ${error?.message}`);
      return [];
    }

    // Group skills by category (filter by account_id in JS)
    const categorySkillMap: Record<
      string,
      { skillCount: number; skillNames: string[] }
    > = {};
    for (const cs of categorySkillsRows || []) {
      const skill = (cs as any).skill;
      if (!skill || !skill.isActive || skill.accountId !== accountId) continue;
      if (!categorySkillMap[cs.categoryId]) {
        categorySkillMap[cs.categoryId] = { skillCount: 0, skillNames: [] };
      }
      categorySkillMap[cs.categoryId].skillCount++;
      categorySkillMap[cs.categoryId].skillNames.push(skill.name);
    }

    const categoryIds = Object.keys(categorySkillMap);
    if (categoryIds.length === 0) return [];

    // 2. Get category details
    let categoryRows: any[] = [];
    try {
      categoryRows = await this.db
        .select({
          id: categories.id,
          name: categories.name,
          color: categories.color,
          icon: categories.icon,
        })
        .from(categories)
        .where(
          and(
            eq(categories.accountId, accountId),
            inArray(categories.id, categoryIds),
          ),
        );
    } catch (error: any) {
      this.logger.error(
        `[AgentsDashboard] categories query failed: ${error?.message}`,
      );
    }

    // 3. Get provider_agents sync status
    const providerAgentRows = await this.db
      .select({
        category_id: providerAgents.categoryId,
        sync_status: providerAgents.syncStatus,
        last_synced_at: providerAgents.lastSyncedAt,
      })
      .from(providerAgents)
      .where(
        and(
          eq(providerAgents.accountId, accountId),
          inArray(providerAgents.categoryId, categoryIds),
        ),
      );

    const syncMap: Record<
      string,
      { sync_status: string; last_synced_at: string | null }
    > = {};
    for (const pa of providerAgentRows || []) {
      syncMap[pa.category_id] = {
        sync_status: pa.sync_status,
        last_synced_at: pa.last_synced_at,
      };
    }

    // 4. Count active tasks per agent category
    // Tasks where override_category_id = this category
    const overrideTasks = await this.db
      .select({ override_category_id: tasks.overrideCategoryId })
      .from(tasks)
      .where(
        and(
          eq(tasks.accountId, accountId),
          eq(tasks.completed, false),
          inArray(tasks.overrideCategoryId, categoryIds),
        ),
      );

    // Tasks where category_id = this category (legacy/direct)
    const directTasks = await this.db
      .select({ category_id: tasks.categoryId })
      .from(tasks)
      .where(
        and(
          eq(tasks.accountId, accountId),
          eq(tasks.completed, false),
          inArray(tasks.categoryId, categoryIds),
        ),
      );

    const taskCountMap: Record<string, number> = {};
    for (const t of overrideTasks || []) {
      if (t.override_category_id) {
        taskCountMap[t.override_category_id] =
          (taskCountMap[t.override_category_id] || 0) + 1;
      }
    }
    for (const t of directTasks || []) {
      if (t.category_id) {
        taskCountMap[t.category_id] = (taskCountMap[t.category_id] || 0) + 1;
      }
    }

    // 5. Get board assignments for each category
    // Board-level defaults
    const boardDefaults = await this.db
      .select({
        id: boardInstances.id,
        name: boardInstances.name,
        default_category_id: boardInstances.defaultCategoryId,
      })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.accountId, accountId),
          eq(boardInstances.isArchived, false),
          inArray(boardInstances.defaultCategoryId, categoryIds),
        ),
      );

    // Step-level links
    const stepLinks = await this.db.query.boardSteps.findMany({
      where: inArray(boardSteps.linkedCategoryId, categoryIds),
      columns: {
        linkedCategoryId: true,
        boardInstanceId: true,
      },
      with: {
        boardInstance: {
          columns: { id: true, name: true },
        },
      },
    });

    const boardAssignmentMap: Record<string, string[]> = {};
    for (const b of boardDefaults || []) {
      if (b.default_category_id) {
        if (!boardAssignmentMap[b.default_category_id])
          boardAssignmentMap[b.default_category_id] = [];
        if (!boardAssignmentMap[b.default_category_id].includes(b.name)) {
          boardAssignmentMap[b.default_category_id].push(b.name);
        }
      }
    }
    for (const s of stepLinks || []) {
      const board = (s as any).boardInstance;
      const linkedCategoryId = (s as any).linkedCategoryId;
      if (linkedCategoryId && board?.name) {
        if (!boardAssignmentMap[linkedCategoryId])
          boardAssignmentMap[linkedCategoryId] = [];
        if (!boardAssignmentMap[linkedCategoryId].includes(board.name)) {
          boardAssignmentMap[linkedCategoryId].push(board.name);
        }
      }
    }

    // 6. Count active conversations per agent category (last 30 min = "working")
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const recentConvos = await this.db.query.conversations.findMany({
      where: and(
        eq(conversations.accountId, accountId),
        gte(conversations.updatedAt, thirtyMinAgo),
      ),
      columns: { id: true },
      with: {
        task: {
          columns: {
            categoryId: true,
            overrideCategoryId: true,
          },
        },
      },
    });

    const activeConvoMap: Record<string, number> = {};
    for (const c of recentConvos || []) {
      const task = (c as any).task;
      const catId = task?.overrideCategoryId || task?.categoryId;
      if (catId && categoryIds.includes(catId)) {
        activeConvoMap[catId] = (activeConvoMap[catId] || 0) + 1;
      }
    }

    // 7. Build response
    return (categoryRows || []).map((cat: any) => {
      const skillsForCat = categorySkillMap[cat.id] || {
        skillCount: 0,
        skillNames: [],
      };
      const sync = syncMap[cat.id] || {
        sync_status: 'none',
        last_synced_at: null,
      };
      const activeConversations = activeConvoMap[cat.id] || 0;

      let status: string;
      if (sync.sync_status === 'error') status = 'error';
      else if (activeConversations > 0) status = 'working';
      else if (sync.sync_status === 'synced') status = 'idle';
      else status = 'not_synced';

      return {
        id: cat.id,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        status,
        skill_count: skillsForCat.skillCount,
        skill_names: skillsForCat.skillNames,
        sync_status: sync.sync_status,
        last_synced_at: sync.last_synced_at,
        active_task_count: taskCountMap[cat.id] || 0,
        active_conversations: activeConversations,
        boards: boardAssignmentMap[cat.id] || [],
      };
    });
  }
}
