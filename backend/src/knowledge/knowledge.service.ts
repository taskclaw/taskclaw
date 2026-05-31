import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { knowledgeDocs } from '../db/schema';
import { StorageService } from '../storage/storage.service';
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
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const STORAGE_BUCKET = 'knowledge-attachments';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
    @Inject(forwardRef(() => AgentSyncService))
    private readonly agentSyncService: AgentSyncService,
  ) {}

  /**
   * Drizzle returns camelCase columns; PostgREST returned snake_case. Re-key to
   * the snake_case response shape callers depend on (`is_master`, `category_id`,
   * `file_attachments`, etc.).
   */
  private present(row: typeof knowledgeDocs.$inferSelect) {
    return {
      id: row.id,
      account_id: row.accountId,
      category_id: row.categoryId,
      title: row.title,
      content: row.content,
      is_master: row.isMaster,
      file_attachments: row.fileAttachments,
      created_by: row.createdBy,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      agent_id: row.agentId,
    };
  }

  /**
   * List all knowledge docs for an account (optionally filter by category)
   */
  async findAll(accessToken: string, accountId: string, categoryId?: string) {
    try {
      const where = categoryId
        ? and(
            eq(knowledgeDocs.accountId, accountId),
            eq(knowledgeDocs.categoryId, categoryId),
          )
        : eq(knowledgeDocs.accountId, accountId);

      const rows = await this.db
        .select()
        .from(knowledgeDocs)
        .where(where)
        .orderBy(desc(knowledgeDocs.updatedAt));

      return rows.map((r) => this.present(r));
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
      const [row] = await this.db
        .select()
        .from(knowledgeDocs)
        .where(
          and(
            eq(knowledgeDocs.id, id),
            eq(knowledgeDocs.accountId, accountId),
          ),
        )
        .limit(1);

      if (!row) {
        throw new NotFoundException('Knowledge doc not found');
      }

      return this.present(row);
    } catch (error) {
      this.logger.error('Error fetching knowledge doc:', error);
      throw error;
    }
  }

  /**
   * Get the master doc for a category
   */
  async findMasterForCategory(
    accessToken: string,
    accountId: string,
    categoryId: string,
  ) {
    try {
      const [row] = await this.db
        .select()
        .from(knowledgeDocs)
        .where(
          and(
            eq(knowledgeDocs.accountId, accountId),
            eq(knowledgeDocs.categoryId, categoryId),
            eq(knowledgeDocs.isMaster, true),
          ),
        )
        .limit(1);

      return row ? this.present(row) : null;
    } catch (error) {
      this.logger.error('Error fetching master doc:', error);
      throw error;
    }
  }

  /**
   * F05/F07: Get the master doc for an agent (via agent_id FK)
   */
  async findMasterForAgent(
    accessToken: string,
    accountId: string,
    agentId: string,
  ) {
    try {
      const [row] = await this.db
        .select()
        .from(knowledgeDocs)
        .where(
          and(
            eq(knowledgeDocs.accountId, accountId),
            eq(knowledgeDocs.agentId, agentId),
            eq(knowledgeDocs.isMaster, true),
          ),
        )
        .limit(1);

      return row ? this.present(row) : null;
    } catch (error) {
      this.logger.error('Error fetching agent master doc:', error);
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

      const rows = await this.db
        .insert(knowledgeDocs)
        .values({
          accountId,
          createdBy: userId,
          title: createDto.title,
          content: createDto.content,
          categoryId: createDto.category_id || null,
          isMaster: createDto.is_master || false,
          fileAttachments: createDto.file_attachments || [],
        })
        .returning();
      const data = this.present(rows[0]);

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
          const categoryId = (updateDto.category_id || doc.category_id)!;
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

      const patch: Partial<typeof knowledgeDocs.$inferInsert> = {};
      if (updateDto.title !== undefined) patch.title = updateDto.title;
      if (updateDto.content !== undefined) patch.content = updateDto.content;
      if (updateDto.category_id !== undefined)
        patch.categoryId = updateDto.category_id;
      if (updateDto.is_master !== undefined)
        patch.isMaster = updateDto.is_master;
      if (updateDto.file_attachments !== undefined)
        patch.fileAttachments = updateDto.file_attachments;

      const rows = await this.db
        .update(knowledgeDocs)
        .set(patch)
        .where(
          and(
            eq(knowledgeDocs.id, id),
            eq(knowledgeDocs.accountId, accountId),
          ),
        )
        .returning();
      const data = this.present(rows[0]);

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

      await this.db
        .delete(knowledgeDocs)
        .where(
          and(
            eq(knowledgeDocs.id, id),
            eq(knowledgeDocs.accountId, accountId),
          ),
        );

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

      // Upload to object storage (throws on error)
      const storagePath = `${accountId}/${docId}/${file.originalname}`;
      await this.storage.upload(
        STORAGE_BUCKET,
        storagePath,
        file.buffer,
        file.mimetype,
      );

      // Get the public URL
      const publicUrl = this.storage.getPublicUrl(STORAGE_BUCKET, storagePath);

      // Build the attachment metadata
      const attachment = {
        name: file.originalname,
        url: publicUrl,
        size: file.size,
        type: file.mimetype,
        uploaded_at: new Date().toISOString(),
      };

      // Update the doc's file_attachments array
      const existingAttachments = (doc.file_attachments as any[]) || [];
      // Remove any existing attachment with the same name (upsert behavior)
      const filteredAttachments = existingAttachments.filter(
        (a: any) => a.name !== file.originalname,
      );
      const updatedAttachments = [...filteredAttachments, attachment];

      const rows = await this.db
        .update(knowledgeDocs)
        .set({ fileAttachments: updatedAttachments })
        .where(
          and(
            eq(knowledgeDocs.id, docId),
            eq(knowledgeDocs.accountId, accountId),
          ),
        )
        .returning();

      return this.present(rows[0]);
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

      const existingAttachments = (doc.file_attachments as any[]) || [];
      const attachment = existingAttachments.find(
        (a: any) => a.name === filename,
      );

      if (!attachment) {
        throw new NotFoundException(`Attachment "${filename}" not found`);
      }

      // Delete from object storage (throws on error)
      const storagePath = `${accountId}/${docId}/${filename}`;
      await this.storage.remove(STORAGE_BUCKET, [storagePath]);

      // Update the doc's file_attachments array
      const updatedAttachments = existingAttachments.filter(
        (a: any) => a.name !== filename,
      );

      const rows = await this.db
        .update(knowledgeDocs)
        .set({ fileAttachments: updatedAttachments })
        .where(
          and(
            eq(knowledgeDocs.id, docId),
            eq(knowledgeDocs.accountId, accountId),
          ),
        )
        .returning();

      return this.present(rows[0]);
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

      const existingAttachments = (doc.file_attachments as any[]) || [];
      const attachment = existingAttachments.find(
        (a: any) => a.name === filename,
      );
      if (!attachment) {
        throw new NotFoundException(`Attachment "${filename}" not found`);
      }

      // Download from storage (returns a Buffer)
      const storagePath = `${accountId}/${docId}/${filename}`;
      const data = await this.storage.download(STORAGE_BUCKET, storagePath);

      const content = data.toString('utf-8');
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
      this.logger.warn(
        `Failed to trigger agent sync for category ${categoryId}: ${err.message}`,
      );
    });
  }
}
