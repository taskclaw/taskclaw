import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Delete,
  Patch,
  Inject,
} from '@nestjs/common';
import { and, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { AiAssistantService } from './ai-assistant.service';
import { EmbeddingService } from './services/embedding.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { DB, type Db } from '../db';
import { projects, users, aiMessages } from '../db/schema';

@Controller('ai-assistant')
// Use the custom AuthGuard which checks Supabase auth
@UseGuards(AuthGuard)
export class AiAssistantController {
  constructor(
    private readonly aiAssistantService: AiAssistantService,
    private readonly embeddingService: EmbeddingService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Post('chat')
  async chat(
    @Body()
    body: {
      message: string;
      history: any[];
      conversationId?: string;
      systemPromptKey?: string;
      accountId?: string;
    },
    @Req() req,
  ) {
    const user = req.user;
    // Merge accountId from request body into user context so avatar tools are loaded
    const userWithAccount = {
      ...user,
      accountId: body.accountId || req['apiKeyAccountId'] || undefined,
    };

    return this.aiAssistantService.chat(
      body.message,
      body.history,
      userWithAccount,
      body.conversationId,
      body.systemPromptKey,
    );
  }

  @Get('conversations')
  async getConversations(@Req() req) {
    if (!req.user?.id) return [];
    return this.aiAssistantService.getUserConversations(req.user.id);
  }

  @Get('conversations/:id/messages')
  async getConversationMessages(@Req() req, @Param('id') id: string) {
    if (!req.user?.id) return [];
    return this.aiAssistantService.getConversationMessages(id, req.user.id);
  }

  @Delete('conversations/:id')
  async deleteConversation(@Req() req, @Param('id') id: string) {
    if (!req.user?.id) throw new Error('Unauthorized');
    return this.aiAssistantService.deleteConversation(id, req.user.id);
  }

  @Patch('conversations/:id')
  async updateConversation(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { title?: string; isPublic?: boolean },
  ) {
    if (!req.user?.id) throw new Error('Unauthorized');

    if (body.title !== undefined) {
      return this.aiAssistantService.updateConversationTitle(
        id,
        req.user.id,
        body.title,
      );
    }

    if (body.isPublic !== undefined) {
      return this.aiAssistantService.updateConversationVisibility(
        id,
        req.user.id,
        body.isPublic,
      );
    }

    return { success: false, message: 'No valid fields to update' };
  }

  @Post('conversations/batch-delete')
  async batchDeleteConversations(@Req() req, @Body() body: { ids: string[] }) {
    if (!req.user?.id) throw new Error('Unauthorized');
    return this.aiAssistantService.deleteConversations(body.ids, req.user.id);
  }

  /**
   * Admin endpoint: Generate embeddings for existing data
   * Supports batch processing with rate limiting
   */
  @Post('admin/generate-embeddings')
  @UseGuards(AdminGuard)
  async generateEmbeddings(
    @Body()
    body: {
      entity_type: 'projects' | 'users' | 'messages';
      batch_size?: number;
      force_regenerate?: boolean;
    },
  ) {
    const { entity_type, batch_size = 50, force_regenerate = false } = body;

    if (!this.embeddingService.isConfigured()) {
      return {
        success: false,
        message: 'Embedding service is not configured. Set OPENROUTER_API_KEY.',
      };
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    try {
      if (entity_type === 'projects') {
        // Fetch projects without embeddings (or all if force_regenerate)
        const projectRows = await this.db
          .select({ id: projects.id, description: projects.description })
          .from(projects)
          .where(
            force_regenerate
              ? isNotNull(projects.description)
              : and(
                  isNull(projects.descriptionEmbedding),
                  isNotNull(projects.description),
                ),
          );

        if (!projectRows || projectRows.length === 0) {
          return {
            success: true,
            message: 'No projects to process',
            stats: { processed: 0, failed: 0, skipped: 0 },
          };
        }

        // Process in batches
        for (let i = 0; i < projectRows.length; i += batch_size) {
          const batch = projectRows.slice(i, i + batch_size);

          for (const project of batch) {
            if (!project.description) {
              skipped++;
              continue;
            }

            try {
              const embedding = await this.embeddingService.generateEmbedding(
                project.description,
              );
              await this.db
                .update(projects)
                .set({ descriptionEmbedding: embedding })
                .where(eq(projects.id, project.id));
              processed++;
            } catch (error) {
              failed++;
              console.error(
                `Failed to generate embedding for project ${project.id}:`,
                error,
              );
            }
          }

          // Rate limiting delay between batches
          if (i + batch_size < projectRows.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } else if (entity_type === 'users') {
        // Fetch users without embeddings
        const userRows = await this.db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(force_regenerate ? undefined : isNull(users.profileEmbedding));

        if (!userRows || userRows.length === 0) {
          return {
            success: true,
            message: 'No users to process',
            stats: { processed: 0, failed: 0, skipped: 0 },
          };
        }

        for (let i = 0; i < userRows.length; i += batch_size) {
          const batch = userRows.slice(i, i + batch_size);

          for (const user of batch) {
            // Composite profile text from name and email
            const profileText = `${user.name || 'Unknown'} ${user.email}`;

            try {
              const embedding =
                await this.embeddingService.generateEmbedding(profileText);
              await this.db
                .update(users)
                .set({ profileEmbedding: embedding })
                .where(eq(users.id, user.id));
              processed++;
            } catch (error) {
              failed++;
              console.error(
                `Failed to generate embedding for user ${user.id}:`,
                error,
              );
            }
          }

          if (i + batch_size < userRows.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } else if (entity_type === 'messages') {
        // Fetch messages without embeddings (only user messages)
        const messageRows = await this.db
          .select({ id: aiMessages.id, content: aiMessages.content })
          .from(aiMessages)
          .where(
            force_regenerate
              ? and(eq(aiMessages.role, 'user'), isNotNull(aiMessages.content))
              : and(
                  eq(aiMessages.role, 'user'),
                  isNull(aiMessages.contentEmbedding),
                  isNotNull(aiMessages.content),
                ),
          );

        if (!messageRows || messageRows.length === 0) {
          return {
            success: true,
            message: 'No messages to process',
            stats: { processed: 0, failed: 0, skipped: 0 },
          };
        }

        for (let i = 0; i < messageRows.length; i += batch_size) {
          const batch = messageRows.slice(i, i + batch_size);

          for (const message of batch) {
            if (!message.content) {
              skipped++;
              continue;
            }

            try {
              const embedding = await this.embeddingService.generateEmbedding(
                message.content,
              );
              await this.db
                .update(aiMessages)
                .set({ contentEmbedding: embedding })
                .where(eq(aiMessages.id, message.id));
              processed++;
            } catch (error) {
              failed++;
              console.error(
                `Failed to generate embedding for message ${message.id}:`,
                error,
              );
            }
          }

          if (i + batch_size < messageRows.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } else {
        return {
          success: false,
          message: `Invalid entity_type: ${entity_type}. Must be 'projects', 'users', or 'messages'.`,
        };
      }

      return {
        success: true,
        message: `Embedding generation completed for ${entity_type}`,
        stats: {
          processed,
          failed,
          skipped,
          total: processed + failed + skipped,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error generating embeddings: ${error.message}`,
        stats: {
          processed,
          failed,
          skipped,
        },
      };
    }
  }

  /**
   * Admin endpoint: Check embedding coverage statistics
   */
  @Get('admin/embedding-status')
  @UseGuards(AdminGuard)
  async getEmbeddingStatus() {
    try {
      const result = await this.db.execute(
        sql`select * from check_embeddings_status()`,
      );

      return {
        success: true,
        config: this.embeddingService.getConfig(),
        stats: result.rows,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error checking embedding status: ${error.message}`,
      };
    }
  }
}
