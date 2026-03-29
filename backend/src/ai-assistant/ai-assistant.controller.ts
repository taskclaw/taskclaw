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
} from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { EmbeddingService } from './services/embedding.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('ai-assistant')
// Use the custom AuthGuard which checks Supabase auth
@UseGuards(AuthGuard)
export class AiAssistantController {
  constructor(
    private readonly aiAssistantService: AiAssistantService,
    private readonly embeddingService: EmbeddingService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Post('chat')
  async chat(
    @Body()
    body: {
      message: string;
      history: any[];
      conversationId?: string;
      systemPromptKey?: string;
    },
    @Req() req,
  ) {
    // Current user context is available in req.user if needed
    const user = req.user;

    return this.aiAssistantService.chat(
      body.message,
      body.history,
      user,
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

    const supabase = this.supabaseService.getAdminClient();
    let processed = 0;
    let failed = 0;
    let skipped = 0;

    try {
      if (entity_type === 'projects') {
        // Fetch projects without embeddings (or all if force_regenerate)
        const query = supabase.from('projects').select('id, description');

        if (!force_regenerate) {
          query.is('description_embedding', null);
        }

        const { data: projects, error } = await query.not(
          'description',
          'is',
          null,
        );

        if (error) throw new Error(error.message);
        if (!projects || projects.length === 0) {
          return {
            success: true,
            message: 'No projects to process',
            stats: { processed: 0, failed: 0, skipped: 0 },
          };
        }

        // Process in batches
        for (let i = 0; i < projects.length; i += batch_size) {
          const batch = projects.slice(i, i + batch_size);

          for (const project of batch) {
            if (!project.description) {
              skipped++;
              continue;
            }

            try {
              const embedding = await this.embeddingService.generateEmbedding(
                project.description,
              );
              await supabase
                .from('projects')
                .update({ description_embedding: JSON.stringify(embedding) })
                .eq('id', project.id);
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
          if (i + batch_size < projects.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } else if (entity_type === 'users') {
        // Fetch users without embeddings
        const query = supabase.from('users').select('id, name, email');

        if (!force_regenerate) {
          query.is('profile_embedding', null);
        }

        const { data: users, error } = await query;

        if (error) throw new Error(error.message);
        if (!users || users.length === 0) {
          return {
            success: true,
            message: 'No users to process',
            stats: { processed: 0, failed: 0, skipped: 0 },
          };
        }

        for (let i = 0; i < users.length; i += batch_size) {
          const batch = users.slice(i, i + batch_size);

          for (const user of batch) {
            // Composite profile text from name and email
            const profileText = `${user.name || 'Unknown'} ${user.email}`;

            try {
              const embedding =
                await this.embeddingService.generateEmbedding(profileText);
              await supabase
                .from('users')
                .update({ profile_embedding: JSON.stringify(embedding) })
                .eq('id', user.id);
              processed++;
            } catch (error) {
              failed++;
              console.error(
                `Failed to generate embedding for user ${user.id}:`,
                error,
              );
            }
          }

          if (i + batch_size < users.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } else if (entity_type === 'messages') {
        // Fetch messages without embeddings
        const query = supabase
          .from('ai_messages')
          .select('id, content')
          .eq('role', 'user'); // Only embed user messages

        if (!force_regenerate) {
          query.is('content_embedding', null);
        }

        const { data: messages, error } = await query.not(
          'content',
          'is',
          null,
        );

        if (error) throw new Error(error.message);
        if (!messages || messages.length === 0) {
          return {
            success: true,
            message: 'No messages to process',
            stats: { processed: 0, failed: 0, skipped: 0 },
          };
        }

        for (let i = 0; i < messages.length; i += batch_size) {
          const batch = messages.slice(i, i + batch_size);

          for (const message of batch) {
            if (!message.content) {
              skipped++;
              continue;
            }

            try {
              const embedding = await this.embeddingService.generateEmbedding(
                message.content,
              );
              await supabase
                .from('ai_messages')
                .update({ content_embedding: JSON.stringify(embedding) })
                .eq('id', message.id);
              processed++;
            } catch (error) {
              failed++;
              console.error(
                `Failed to generate embedding for message ${message.id}:`,
                error,
              );
            }
          }

          if (i + batch_size < messages.length) {
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
    const supabase = this.supabaseService.getAdminClient();

    try {
      const { data, error } = await supabase.rpc('check_embeddings_status');

      if (error) throw new Error(error.message);

      return {
        success: true,
        config: this.embeddingService.getConfig(),
        stats: data,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error checking embedding status: ${error.message}`,
      };
    }
  }
}
