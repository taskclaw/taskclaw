import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { CreateKnowledgeDocDto } from './dto/create-knowledge-doc.dto';
import { UpdateKnowledgeDocDto } from './dto/update-knowledge-doc.dto';
import { AgentSyncService } from '../agent-sync/agent-sync.service';

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
];

const ALLOWED_EXTENSIONS = [
  'pdf', 'txt', 'md', 'doc', 'docx', 'csv', 'json', 'png', 'jpg', 'jpeg',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const STORAGE_BUCKET = 'knowledge-attachments';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly supabaseAdmin: SupabaseAdminService,
    @Inject(forwardRef(() => AgentSyncService))
    private readonly agentSyncService: AgentSyncService,
  ) {}

  /**
   * List all knowledge docs for an account (optionally filter by category)
   */
  async findAll(accessToken: string, accountId: string, categoryId?: string) {
    try {
      const client = this.supabaseAdmin.getClient();
      let query = client
        .from('knowledge_docs')
        .select('*')
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false });

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Failed to fetch knowledge docs: ${error.message}`);
        throw new Error(error.message);
      }

      return data || [];
    } catch (error) {
      this.logger.error('Error fetching knowledge docs:', error);
      throw error;
    }
  }

  /**
   * Get a single knowledge doc by ID
   */
  async findOne(accessToken: string, accountId: string, id: string) {
    try {
      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('knowledge_docs')
        .select('*')
        .eq('id', id)
        .eq('account_id', accountId)
        .single();

      if (error || !data) {
        throw new NotFoundException('Knowledge doc not found');
      }

      return data;
    } catch (error) {
      this.logger.error('Error fetching knowledge doc:', error);
      throw error;
    }
  }

  /**
   * Get the master doc for a category
   */
  async findMasterForCategory(accessToken: string, accountId: string, categoryId: string) {
    try {
      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('knowledge_docs')
        .select('*')
        .eq('account_id', accountId)
        .eq('category_id', categoryId)
        .eq('is_master', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned (expected if no master)
        this.logger.error(`Failed to fetch master doc: ${error.message}`);
        throw new Error(error.message);
      }

      return data || null;
    } catch (error) {
      this.logger.error('Error fetching master doc:', error);
      throw error;
    }
  }

  /**
   * Create a new knowledge doc
   */
  async create(
    accessToken: string,
    accountId: string,
    userId: string,
    createDto: CreateKnowledgeDocDto,
  ) {
    try {
      // If setting as master, check if another master exists
      if (createDto.is_master && createDto.category_id) {
        const existingMaster = await this.findMasterForCategory(
          accessToken,
          accountId,
          createDto.category_id,
        );
        if (existingMaster) {
          throw new ConflictException(
            `Agent already has a master doc: "${existingMaster.title}". Please unset it first or set is_master=false.`,
          );
        }
      }

      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('knowledge_docs')
        .insert([
          {
            account_id: accountId,
            created_by: userId,
            title: createDto.title,
            content: createDto.content,
            category_id: createDto.category_id || null,
            is_master: createDto.is_master || false,
            file_attachments: createDto.file_attachments || [],
          },
        ])
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to create knowledge doc: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync if this is a master doc with a category
      if (data.is_master && data.category_id) {
        this.triggerCategorySync(accountId, data.category_id);
      }

      return data;
    } catch (error) {
      this.logger.error('Error creating knowledge doc:', error);
      throw error;
    }
  }

  /**
   * Update a knowledge doc
   */
  async update(
    accessToken: string,
    accountId: string,
    id: string,
    updateDto: UpdateKnowledgeDocDto,
  ) {
    try {
      // Check doc exists
      await this.findOne(accessToken, accountId, id);

      // If setting as master, validate
      if (updateDto.is_master) {
        const doc = await this.findOne(accessToken, accountId, id);
        if (doc.category_id || updateDto.category_id) {
          const categoryId = updateDto.category_id || doc.category_id;
          const existingMaster = await this.findMasterForCategory(
            accessToken,
            accountId,
            categoryId,
          );
          if (existingMaster && existingMaster.id !== id) {
            throw new ConflictException(
              `Agent already has a master doc: "${existingMaster.title}". Cannot set multiple masters.`,
            );
          }
        }
      }

      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('knowledge_docs')
        .update({
          ...(updateDto.title !== undefined && { title: updateDto.title }),
          ...(updateDto.content !== undefined && { content: updateDto.content }),
          ...(updateDto.category_id !== undefined && { category_id: updateDto.category_id }),
          ...(updateDto.is_master !== undefined && { is_master: updateDto.is_master }),
          ...(updateDto.file_attachments !== undefined && {
            file_attachments: updateDto.file_attachments,
          }),
        })
        .eq('id', id)
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to update knowledge doc: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync if this is a master doc with a category
      if (data.is_master && data.category_id) {
        this.triggerCategorySync(accountId, data.category_id);
      }

      return data;
    } catch (error) {
      this.logger.error('Error updating knowledge doc:', error);
      throw error;
    }
  }

  /**
   * Set a doc as the master for its category (unsets all others)
   */
  async setAsMaster(accessToken: string, accountId: string, id: string) {
    try {
      const doc = await this.findOne(accessToken, accountId, id);

      if (!doc.category_id) {
        throw new ConflictException('Cannot set unassigned doc as master');
      }

      // Update triggers will handle unsetting others
      return this.update(accessToken, accountId, id, { is_master: true });
    } catch (error) {
      this.logger.error('Error setting master doc:', error);
      throw error;
    }
  }

  /**
   * Delete a knowledge doc
   */
  async remove(accessToken: string, accountId: string, id: string) {
    try {
      // Check doc exists and get category info BEFORE deleting
      const doc = await this.findOne(accessToken, accountId, id);

      const client = this.supabaseAdmin.getClient();
      const { error } = await client
        .from('knowledge_docs')
        .delete()
        .eq('id', id)
        .eq('account_id', accountId);

      if (error) {
        this.logger.error(`Failed to delete knowledge doc: ${error.message}`);
        throw new Error(error.message);
      }

      // Trigger sync if this was a master doc with a category
      if (doc.is_master && doc.category_id) {
        this.triggerCategorySync(accountId, doc.category_id);
      }

      return { message: 'Knowledge doc deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting knowledge doc:', error);
      throw error;
    }
  }

  /**
   * Upload a file attachment to a knowledge doc
   */
  async uploadAttachment(
    accessToken: string,
    accountId: string,
    docId: string,
    file: Express.Multer.File,
  ) {
    try {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        );
      }

      // Validate file type by extension
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        throw new BadRequestException(
          `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
        );
      }

      // Validate MIME type (allow application/octet-stream when extension is valid,
      // as browsers often can't determine MIME type for drag-and-drop folder entries)
      if (
        !ALLOWED_FILE_TYPES.includes(file.mimetype) &&
        file.mimetype !== 'application/octet-stream'
      ) {
        throw new BadRequestException(
          `MIME type "${file.mimetype}" not allowed.`,
        );
      }

      // Verify doc exists and belongs to account
      const doc = await this.findOne(accessToken, accountId, docId);

      // Upload to Supabase Storage
      const storagePath = `${accountId}/${docId}/${file.originalname}`;
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

      // Build the attachment metadata
      const attachment = {
        name: file.originalname,
        url: urlData.publicUrl,
        size: file.size,
        type: file.mimetype,
        uploaded_at: new Date().toISOString(),
      };

      // Update the doc's file_attachments array
      const existingAttachments = doc.file_attachments || [];
      // Remove any existing attachment with the same name (upsert behavior)
      const filteredAttachments = existingAttachments.filter(
        (a: any) => a.name !== file.originalname,
      );
      const updatedAttachments = [...filteredAttachments, attachment];

      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('knowledge_docs')
        .update({ file_attachments: updatedAttachments })
        .eq('id', docId)
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to update doc attachments: ${error.message}`);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      this.logger.error('Error uploading attachment:', error);
      throw error;
    }
  }

  /**
   * Remove a file attachment from a knowledge doc
   */
  async removeAttachment(
    accessToken: string,
    accountId: string,
    docId: string,
    filename: string,
  ) {
    try {
      // Verify doc exists and belongs to account
      const doc = await this.findOne(accessToken, accountId, docId);

      const existingAttachments = doc.file_attachments || [];
      const attachment = existingAttachments.find((a: any) => a.name === filename);

      if (!attachment) {
        throw new NotFoundException(`Attachment "${filename}" not found`);
      }

      // Delete from Supabase Storage
      const storagePath = `${accountId}/${docId}/${filename}`;
      const adminClient = this.supabase.getAdminClient();

      const { error: deleteError } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

      if (deleteError) {
        this.logger.error(`Failed to delete file from storage: ${deleteError.message}`);
        throw new Error(`Storage delete failed: ${deleteError.message}`);
      }

      // Update the doc's file_attachments array
      const updatedAttachments = existingAttachments.filter(
        (a: any) => a.name !== filename,
      );

      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('knowledge_docs')
        .update({ file_attachments: updatedAttachments })
        .eq('id', docId)
        .eq('account_id', accountId)
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to update doc attachments: ${error.message}`);
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      this.logger.error('Error removing attachment:', error);
      throw error;
    }
  }

  /**
   * Get the content of a file attachment from storage
   */
  async getAttachmentContent(
    accessToken: string,
    accountId: string,
    docId: string,
    filename: string,
  ): Promise<{ content: string; filename: string }> {
    try {
      // Verify doc exists and belongs to account
      const doc = await this.findOne(accessToken, accountId, docId);

      const existingAttachments = doc.file_attachments || [];
      const attachment = existingAttachments.find(
        (a: any) => a.name === filename,
      );
      if (!attachment) {
        throw new NotFoundException(`Attachment "${filename}" not found`);
      }

      // Download from storage
      const storagePath = `${accountId}/${docId}/${filename}`;
      const adminClient = this.supabase.getAdminClient();

      const { data, error } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .download(storagePath);

      if (error || !data) {
        this.logger.error(
          `Failed to read file content: ${error?.message}`,
        );
        throw new Error(`Failed to read file content: ${error?.message}`);
      }

      const content = await data.text();
      return { content, filename };
    } catch (error) {
      this.logger.error('Error fetching attachment content:', error);
      throw error;
    }
  }

  /**
   * Fire-and-forget sync trigger for a category's provider agent.
   */
  private triggerCategorySync(accountId: string, categoryId: string): void {
    this.agentSyncService.markStale(accountId, categoryId).catch((err) => {
      this.logger.warn(`Failed to trigger agent sync for category ${categoryId}: ${err.message}`);
    });
  }
}
