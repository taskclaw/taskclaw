import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { AgentSyncService } from '../agent-sync/agent-sync.service';

const ALLOWED_EXTENSIONS = [
  'pdf', 'txt', 'md', 'doc', 'docx', 'csv', 'json', 'png', 'jpg', 'jpeg',
  'yaml', 'yml', 'xml', 'html', 'css', 'js', 'ts', 'py', 'sh', 'sql',
  'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'rst', 'tex',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const STORAGE_BUCKET = 'skill-attachments';

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly supabaseAdmin: SupabaseAdminService,
    @Inject(forwardRef(() => AgentSyncService))
    private readonly agentSyncService: AgentSyncService,
  ) {}

  /**
   * List all skills for an account (optionally filter by active status)
   */
  async findAll(accessToken: string, accountId: string, activeOnly?: boolean) {
    try {
      const client = this.supabaseAdmin.getClient();
      let query = client
        .from('skills')
        .select('*')
        .eq('account_id', accountId)
        .order('name', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Failed to fetch skills: ${error.message}`);
        throw new Error(error.message);
      }

      return data || [];
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
      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('skills')
        .select('*')
        .eq('id', id)
        .eq('account_id', accountId)
        .single();

      if (error || !data) {
        throw new NotFoundException('Skill not found');
      }

      return data;
    } catch (error) {
      this.logger.error('Error fetching skill:', error);
      throw error;
    }
  }

  /**
   * Get skills by multiple IDs (for chat skill selection)
   */
  async findByIds(accessToken: string, accountId: string, skillIds: string[]) {
    try {
      if (!skillIds || skillIds.length === 0) {
        return [];
      }

      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('skills')
        .select('*')
        .eq('account_id', accountId)
        .in('id', skillIds)
        .eq('is_active', true);

      if (error) {
        this.logger.error(`Failed to fetch skills by IDs: ${error.message}`);
        throw new Error(error.message);
      }

      return data || [];
    } catch (error) {
      this.logger.error('Error fetching skills by IDs:', error);
      throw error;
    }
  }

  /**
   * Get all category-skill mappings for an account in one query.
   * Returns { [categoryId]: Skill[] }
   */
  async getCategorySkillsMap(accessToken: string, accountId: string) {
    try {
      const client = this.supabaseAdmin.getClient();

      const { data, error } = await client
        .from('category_skills')
        .select(
          `
          category_id,
          skills (
            id,
            account_id,
            name,
            description,
            is_active
          )
        `,
        );

      if (error) {
        this.logger.error(`Failed to fetch category skills map: ${error.message}`);
        throw new Error(error.message);
      }

      const map: Record<string, any[]> = {};
      for (const row of data || []) {
        const skill = (row as any).skills;
        if (!skill || !skill.is_active || skill.account_id !== accountId) continue;
        if (!map[row.category_id]) map[row.category_id] = [];
        map[row.category_id].push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          is_active: skill.is_active,
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
  async findDefaultForCategory(accessToken: string, accountId: string, categoryId: string) {
    try {
      const client = this.supabaseAdmin.getClient();

      // Join category_skills with skills
      const { data, error } = await client
        .from('category_skills')
        .select(
          `
          skill_id,
          skills (
            id,
            account_id,
            name,
            description,
            instructions,
            is_active,
            file_attachments
          )
        `,
        )
        .eq('category_id', categoryId);

      if (error) {
        this.logger.error(`Failed to fetch category skills: ${error.message}`);
        throw new Error(error.message);
      }

      // Filter and flatten
      const skills = (data || [])
        .map((cs: any) => cs.skills)
        .filter((skill: any) => skill && skill.is_active && skill.account_id === accountId);

      return skills;
    } catch (error) {
      this.logger.error('Error fetching category skills:', error);
      throw error;
    }
  }

  /**
   * Create a new skill
   */
  async create(accessToken: string, accountId: string, userId: string, createDto: CreateSkillDto) {
    try {
      const client = this.supabaseAdmin.getClient();

      // Check for duplicate name
      const { data: existing } = await client
        .from('skills')
        .select('id')
        .eq('account_id', accountId)
        .eq('name', createDto.name)
        .single();

      if (existing) {
        throw new ConflictException(`Skill with name "${createDto.name}" already exists`);
      }

      const { data, error } = await client
        .from('skills')
        .insert([
          {
            account_id: accountId,
            created_by: userId,
            name: createDto.name,
            description: createDto.description || '',
            instructions: createDto.instructions,
            is_active: createDto.is_active !== undefined ? createDto.is_active : true,
          },
        ])
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to create skill: ${error.message}`);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      this.logger.error('Error creating skill:', error);
      throw error;
    }
  }

  /**
   * Update a skill
   */
  async update(accessToken: string, accountId: string, id: string, updateDto: UpdateSkillDto) {
    try {
      // Check skill exists
      await this.findOne(accessToken, accountId, id);

      // Check for duplicate name if changing name
      if (updateDto.name) {
        const client = this.supabaseAdmin.getClient();
        const { data: existing } = await client
          .from('skills')
          .select('id')
          .eq('account_id', accountId)
          .eq('name', updateDto.name)
          .neq('id', id)
          .single();

        if (existing) {
          throw new ConflictException(`Skill with name "${updateDto.name}" already exists`);
        }
      }

      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('skills')
        .update({
          ...(updateDto.name !== undefined && { name: updateDto.name }),
          ...(updateDto.description !== undefined && { description: updateDto.description }),
          ...(updateDto.instructions !== undefined && { instructions: updateDto.instructions }),
          ...(updateDto.is_active !== undefined && { is_active: updateDto.is_active }),
        })
        .eq('id', id)
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to update skill: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync for all linked categories
      await this.syncLinkedCategories(accountId, id);

      return data;
    } catch (error) {
      this.logger.error('Error updating skill:', error);
      throw error;
    }
  }

  /**
   * Link a skill to a category (default skill)
   */
  async linkToCategory(accessToken: string, accountId: string, skillId: string, categoryId: string) {
    try {
      // Verify skill and category belong to account
      await this.findOne(accessToken, accountId, skillId);

      const client = this.supabaseAdmin.getClient();

      // Verify category exists and belongs to account
      const { data: category } = await client
        .from('categories')
        .select('id')
        .eq('id', categoryId)
        .eq('account_id', accountId)
        .single();

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      // Insert association
      const { data, error } = await client
        .from('category_skills')
        .insert([{ category_id: categoryId, skill_id: skillId }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Unique violation
          throw new ConflictException('Skill already linked to this category');
        }
        this.logger.error(`Failed to link skill to category: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync for the linked category
      this.agentSyncService.markStale(accountId, categoryId).catch((err) => {
        this.logger.warn(`Failed to trigger sync after linking skill: ${err.message}`);
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
  async unlinkFromCategory(accessToken: string, accountId: string, skillId: string, categoryId: string) {
    try {
      // Verify ownership
      await this.findOne(accessToken, accountId, skillId);

      const client = this.supabaseAdmin.getClient();
      const { error } = await client
        .from('category_skills')
        .delete()
        .eq('category_id', categoryId)
        .eq('skill_id', skillId);

      if (error) {
        this.logger.error(`Failed to unlink skill from category: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync for the unlinked category
      this.agentSyncService.markStale(accountId, categoryId).catch((err) => {
        this.logger.warn(`Failed to trigger sync after unlinking skill: ${err.message}`);
      });

      return { message: 'Skill unlinked from category successfully' };
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
      const client = this.supabaseAdmin.getClient();
      const { data: linkedCategories } = await client
        .from('category_skills')
        .select('category_id')
        .eq('skill_id', id);

      const { error } = await client.from('skills').delete().eq('id', id).eq('account_id', accountId);

      if (error) {
        this.logger.error(`Failed to delete skill: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync for all previously linked categories
      for (const link of linkedCategories || []) {
        this.agentSyncService.markStale(accountId, link.category_id).catch((err) => {
          this.logger.warn(`Failed to trigger sync after deleting skill: ${err.message}`);
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

      // Upload to Supabase Storage
      const storagePath = `${accountId}/${skillId}/${file.originalname}`;
      const adminClient = this.supabase.getAdminClient();

      const { error: uploadError } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        this.logger.error(`Failed to upload file: ${uploadError.message}`);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Get the public URL
      const { data: urlData } = adminClient.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const attachment = {
        name: file.originalname,
        url: urlData.publicUrl,
        size: file.size,
        type: file.mimetype,
        uploaded_at: new Date().toISOString(),
      };

      // Update the skill's file_attachments array
      const existingAttachments = skill.file_attachments || [];
      const filteredAttachments = existingAttachments.filter(
        (a: any) => a.name !== file.originalname,
      );
      const updatedAttachments = [...filteredAttachments, attachment];

      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('skills')
        .update({ file_attachments: updatedAttachments })
        .eq('id', skillId)
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to update skill attachments: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync for linked categories
      await this.syncLinkedCategories(accountId, skillId);

      return data;
    } catch (error) {
      this.logger.error('Error uploading skill attachment:', error);
      throw error;
    }
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

      const existingAttachments = skill.file_attachments || [];
      const attachment = existingAttachments.find((a: any) => a.name === filename);

      if (!attachment) {
        throw new NotFoundException(`Attachment "${filename}" not found`);
      }

      // Delete from Supabase Storage
      const storagePath = `${accountId}/${skillId}/${filename}`;
      const adminClient = this.supabase.getAdminClient();

      const { error: deleteError } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

      if (deleteError) {
        this.logger.error(`Failed to delete file from storage: ${deleteError.message}`);
        throw new Error(`Storage delete failed: ${deleteError.message}`);
      }

      const updatedAttachments = existingAttachments.filter(
        (a: any) => a.name !== filename,
      );

      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('skills')
        .update({ file_attachments: updatedAttachments })
        .eq('id', skillId)
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to update skill attachments: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync for linked categories
      await this.syncLinkedCategories(accountId, skillId);

      return data;
    } catch (error) {
      this.logger.error('Error removing skill attachment:', error);
      throw error;
    }
  }

  /**
   * Find all categories linked to a skill and trigger sync for each.
   */
  private async syncLinkedCategories(accountId: string, skillId: string): Promise<void> {
    try {
      const client = this.supabaseAdmin.getClient();
      const { data: linkedCategories } = await client
        .from('category_skills')
        .select('category_id')
        .eq('skill_id', skillId);

      for (const link of linkedCategories || []) {
        this.agentSyncService.markStale(accountId, link.category_id).catch((err) => {
          this.logger.warn(`Failed to trigger sync for category ${link.category_id}: ${err.message}`);
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to sync linked categories: ${err.message}`);
    }
  }
}
