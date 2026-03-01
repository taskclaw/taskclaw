import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { OpenClawService } from './openclaw.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { SkillsService } from '../skills/skills.service';
import { NotionAdapter } from '../adapters/notion/notion.adapter';
import { AgentSyncService } from '../agent-sync/agent-sync.service';
import { CommToolsService } from '../comm-tools/comm-tools.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
    private readonly aiProviderService: AiProviderService,
    private readonly openClawService: OpenClawService,
    private readonly knowledgeService: KnowledgeService,
    private readonly skillsService: SkillsService,
    private readonly notionAdapter: NotionAdapter,
    private readonly agentSyncService: AgentSyncService,
    private readonly commToolsService: CommToolsService,
  ) {}

  /**
   * Create a new conversation
   */
  async create(
    userId: string,
    accountId: string,
    dto: CreateConversationDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify task exists if task_id provided
    if (dto.task_id) {
      const { data: task, error: taskError } = await client
        .from('tasks')
        .select('id, title')
        .eq('id', dto.task_id)
        .eq('account_id', accountId)
        .single();

      if (taskError || !task) {
        throw new NotFoundException(`Task with ID ${dto.task_id} not found`);
      }

      // Auto-generate title from task if not provided
      if (!dto.title) {
        dto.title = `Chat about: ${task.title}`;
      }
    }

    // Prepare metadata with skill_ids if provided
    const metadata: any = {};
    if (dto.skill_ids && dto.skill_ids.length > 0) {
      metadata.skill_ids = dto.skill_ids;
    }

    const { data, error } = await client
      .from('conversations')
      .insert({
        user_id: userId,
        account_id: accountId,
        task_id: dto.task_id,
        title: dto.title || 'New Conversation',
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    this.logger.log(`Conversation created: ${data.id} with ${dto.skill_ids?.length || 0} skills`);

    return data;
  }

  /**
   * List user's conversations
   */
  async findAll(
    userId: string,
    accountId: string,
    accessToken: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const offset = (page - 1) * limit;

    const { data, error, count } = await client
      .from('conversations')
      .select('*, task:tasks(id, title)', { count: 'exact' })
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get a single conversation
   */
  async findOne(
    userId: string,
    accountId: string,
    conversationId: string,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('conversations')
      .select('*, task:tasks(id, title, status, priority, notes, external_id, external_url, metadata, source_id, sources(id, provider))')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    return data;
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(
    userId: string,
    accountId: string,
    conversationId: string,
    accessToken: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user owns this conversation
    await this.findOne(userId, accountId, conversationId, accessToken);

    const offset = (page - 1) * limit;

    const { data, error, count } = await client
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(
    userId: string,
    accountId: string,
    conversationId: string,
    dto: SendMessageDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify conversation exists and user owns it
    const conversation = await this.findOne(
      userId,
      accountId,
      conversationId,
      accessToken,
    );

    // Get AI provider config
    const aiConfig = await this.aiProviderService.getDecryptedConfig(
      accountId,
      accessToken,
    );

    // Store user message
    const { data: userMessage, error: userMsgError } = await client
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: dto.content,
      })
      .select()
      .single();

    if (userMsgError) {
      throw new Error(`Failed to store user message: ${userMsgError.message}`);
    }

    try {
      // Get conversation history
      const history = await this.getConversationHistory(
        conversationId,
        accessToken,
      );

      // Build system prompt with context
      const systemPrompt = await this.buildSystemPrompt(
        conversation,
        accessToken,
      );

      // Build message array for OpenClaw
      const messages = this.openClawService.buildMessageHistory(
        systemPrompt,
        history,
        dto.content,
      );

      // Send to OpenClaw (with Langfuse trace context)
      const aiResponse = await this.openClawService.sendMessage(
        aiConfig,
        messages,
        {
          userId,
          accountId,
          conversationId,
        },
      );

      // Store AI response
      const { data: assistantMessage, error: aiMsgError } = await client
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: aiResponse.response,
          metadata: aiResponse.metadata || {},
        })
        .select()
        .single();

      if (aiMsgError) {
        throw new Error(
          `Failed to store AI response: ${aiMsgError.message}`,
        );
      }

      // Auto-generate conversation title from first user message if needed
      if (!conversation.title || conversation.title === 'New Conversation') {
        await this.autoGenerateTitle(
          conversationId,
          dto.content,
          accessToken,
        );
      }

      this.logger.log(`Message exchange completed for conversation ${conversationId}`);

      // Fire-and-forget: mirror messages to Notion as comments
      this.mirrorToNotion(conversation, dto.content, aiResponse.response);

      return {
        userMessage,
        assistantMessage,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get AI response for conversation ${conversationId}:`,
        error.message,
      );

      // Store error message for user feedback
      await client.from('messages').insert({
        conversation_id: conversationId,
        role: 'system',
        content: `Error: ${error.message}`,
        metadata: { error: true },
      });

      throw new BadRequestException(
        `Failed to get AI response: ${error.message}`,
      );
    }
  }

  /**
   * Send a message in background mode — stores user message and returns immediately.
   * Task moves to "AI Running" immediately, then to "In Review" when AI finishes.
   */
  async sendMessageBackground(
    userId: string,
    accountId: string,
    conversationId: string,
    dto: SendMessageDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify conversation exists and user owns it
    const conversation = await this.findOne(
      userId,
      accountId,
      conversationId,
      accessToken,
    );

    // Store user message immediately
    const { data: userMessage, error: userMsgError } = await client
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: dto.content,
      })
      .select()
      .single();

    if (userMsgError) {
      throw new Error(`Failed to store user message: ${userMsgError.message}`);
    }

    // Move task to "AI Running" immediately
    if (conversation.task_id) {
      const { error: runningError } = await client
        .from('tasks')
        .update({ status: 'AI Running' })
        .eq('id', conversation.task_id)
        .eq('account_id', accountId);

      if (runningError) {
        this.logger.error(
          `Failed to move task ${conversation.task_id} to "AI Running": ${runningError.message}`,
        );
      }
    }

    // Fire-and-forget: process AI in background
    this.processAiInBackground(
      userId,
      accountId,
      conversationId,
      conversation,
      dto.content,
      accessToken,
    );

    return {
      userMessage,
      status: 'processing',
    };
  }

  /**
   * Process AI request in background. When done, stores response, mirrors to Notion,
   * and moves the task to "In Review" status.
   */
  private processAiInBackground(
    userId: string,
    accountId: string,
    conversationId: string,
    conversation: any,
    userContent: string,
    accessToken: string,
  ): void {
    (async () => {
      const client = this.supabaseAdmin.getClient();
      try {
        // Get AI provider config
        const aiConfig = await this.aiProviderService.getDecryptedConfig(
          accountId,
          accessToken,
        );

        // Get conversation history
        const history = await this.getConversationHistory(
          conversationId,
          accessToken,
        );

        // Build system prompt with context
        const systemPrompt = await this.buildSystemPrompt(
          conversation,
          accessToken,
        );

        // Build message array for OpenClaw
        const messages = this.openClawService.buildMessageHistory(
          systemPrompt,
          history,
          userContent,
        );

        // Send to OpenClaw
        const aiResponse = await this.openClawService.sendMessage(
          aiConfig,
          messages,
          { userId, accountId, conversationId },
        );

        // Store AI response
        await client
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: aiResponse.response,
            metadata: aiResponse.metadata || {},
          });

        // Auto-generate conversation title if needed
        if (!conversation.title || conversation.title === 'New Conversation') {
          await this.autoGenerateTitle(conversationId, userContent, accessToken);
        }

        // Mirror messages to Notion
        this.mirrorToNotion(conversation, userContent, aiResponse.response);

        // Move the task to "In Review" status
        if (conversation.task_id) {
          const { error: updateError } = await client
            .from('tasks')
            .update({ status: 'In Review' })
            .eq('id', conversation.task_id)
            .eq('account_id', accountId);

          if (updateError) {
            this.logger.error(
              `Failed to move task ${conversation.task_id} to "In Review": ${updateError.message}`,
            );
          } else {
            this.logger.log(
              `Task ${conversation.task_id} moved to "In Review" after AI response`,
            );
          }
        }

        this.logger.log(`Background AI processing completed for conversation ${conversationId}`);
      } catch (err) {
        this.logger.error(
          `Background AI processing failed for conversation ${conversationId}: ${(err as Error).message}`,
        );

        // Store error message for user feedback
        await client.from('messages').insert({
          conversation_id: conversationId,
          role: 'system',
          content: `Error: ${(err as Error).message}`,
          metadata: { error: true },
        });
      }
    })();
  }

  /**
   * Update conversation (e.g., change title)
   */
  async update(
    userId: string,
    accountId: string,
    conversationId: string,
    dto: UpdateConversationDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify conversation exists and user owns it
    await this.findOne(userId, accountId, conversationId, accessToken);

    const { data, error } = await client
      .from('conversations')
      .update(dto)
      .eq('id', conversationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update conversation: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete conversation and all its messages
   */
  async remove(
    userId: string,
    accountId: string,
    conversationId: string,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify conversation exists and user owns it
    await this.findOne(userId, accountId, conversationId, accessToken);

    const { error } = await client
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }

    this.logger.log(`Conversation deleted: ${conversationId}`);

    return { message: 'Conversation deleted successfully' };
  }

  /**
   * Get conversation history (recent messages)
   */
  private async getConversationHistory(
    conversationId: string,
    accessToken: string,
    limit: number = 20,
  ): Promise<Array<{ role: string; content: string }>> {
    const client = this.supabaseAdmin.getClient();

    const { data, error } = await client
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      this.logger.warn(
        `Failed to fetch conversation history: ${error.message}`,
      );
      return [];
    }

    return data || [];
  }

  /**
   * Build system prompt with task context
   */
  private async buildSystemPrompt(
    conversation: any,
    accessToken: string,
  ): Promise<string> {
    // BASE SYSTEM PROMPT
    let prompt = `You are OpenClaw, an AI assistant integrated into the OTT Platform.
You help users manage tasks, projects, and workflows with intelligence and context awareness.

Current Context:
- Platform: OTT Dashboard (Task & Project Management)
- User: Authenticated and working in their personal account
`;

    // ═══════════════════════════════════════════════════════════
    // SKILLS & KNOWLEDGE: Provider-synced or inline injection
    // ═══════════════════════════════════════════════════════════
    // Check if skills/knowledge are synced to the provider (OpenClaw).
    // If synced, skip inline injection — the content is loaded from
    // SKILL.md files on the server, saving thousands of tokens per request.
    let providerSynced = false;
    if (conversation.task_id && conversation.task?.category_id) {
      try {
        providerSynced = await this.agentSyncService.isSynced(
          conversation.account_id,
          conversation.task.category_id,
        );
      } catch {
        // Fallback to inline injection if sync check fails
      }
    }

    if (providerSynced) {
      this.logger.debug(
        `Category skills/knowledge synced to provider — skipping inline injection`,
      );
    } else {
      // FALLBACK: Inline skills injection (original Sprint 3 behavior)
      try {
        const skillIds = conversation.metadata?.skill_ids || [];
        if (skillIds.length > 0) {
          const skills = await this.skillsService.findByIds(
            accessToken,
            conversation.account_id,
            skillIds,
          );

          if (skills.length > 0) {
            prompt += `\n\n=== ACTIVE SKILLS ===\n`;
            prompt += `The following specialized skills are active for this conversation:\n\n`;
            skills.forEach((skill, index) => {
              prompt += `Skill ${index + 1}: ${skill.name}\n`;
              if (skill.description) {
                prompt += `Description: ${skill.description}\n`;
              }
              prompt += `Instructions:\n${skill.instructions}\n\n`;
            });
            prompt += `Apply these skills when responding to the user.\n`;
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch skills for prompt: ${error.message}`);
      }

      // FALLBACK: Inline knowledge injection (original Sprint 3 behavior)
      try {
        if (conversation.task_id && conversation.task?.category_id) {
          const masterDoc = await this.knowledgeService.findMasterForCategory(
            accessToken,
            conversation.account_id,
            conversation.task.category_id,
          );

          if (masterDoc) {
            prompt += `\n\n=== KNOWLEDGE BASE ===\n`;
            prompt += `Master Document: "${masterDoc.title}"\n`;
            prompt += `Category: ${conversation.task.category?.name || 'Unknown'}\n\n`;
            prompt += `${masterDoc.content}\n\n`;
            prompt += `Use this knowledge to provide contextually relevant responses.\n`;
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch knowledge for prompt: ${error.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TASK CONTEXT (Enhanced in Sprint 7)
    // ═══════════════════════════════════════════════════════════
    if (conversation.task_id && conversation.task) {
      prompt += `\n\n=== TASK CONTEXT ===\n`;
      prompt += `Task: ${conversation.task.title}\n`;
      prompt += `Status: ${conversation.task.status || 'unknown'}\n`;
      if (conversation.task.priority) {
        prompt += `Priority: ${conversation.task.priority}\n`;
      }
      if (conversation.task.notes) {
        prompt += `Notes: ${conversation.task.notes}\n`;
      }
      if (conversation.task.external_url) {
        prompt += `External URL: ${conversation.task.external_url}\n`;
      }
      // Sprint 7: Include source info
      if (conversation.task.sources) {
        prompt += `Source: Synced from ${conversation.task.sources.provider}\n`;
        prompt += `(Any updates you suggest can be written back to the ${conversation.task.sources.provider} card)\n`;
      }
      // Sprint 7: Include metadata (properties from Notion/ClickUp)
      if (conversation.task.metadata && typeof conversation.task.metadata === 'object') {
        const metaEntries = Object.entries(conversation.task.metadata);
        if (metaEntries.length > 0) {
          prompt += `\nTask Properties:\n`;
          for (const [key, val] of metaEntries) {
            if (val !== null && val !== undefined && val !== '') {
              prompt += `  - ${key}: ${JSON.stringify(val)}\n`;
            }
          }
        }
      }
      prompt += `\nThe user is asking for help with this specific task. Provide relevant, actionable advice.\n`;
      prompt += `When you produce findings or insights, the user can save them directly to the task card.\n`;
    }

    // ═══════════════════════════════════════════════════════════
    // COMMUNICATION TOOLS AVAILABILITY
    // ═══════════════════════════════════════════════════════════
    try {
      const availableTools = await this.commToolsService.getAvailableTools(
        conversation.account_id,
      );
      const allTools = ['telegram', 'whatsapp', 'slack'];
      const unavailable = allTools.filter((t) => !availableTools.includes(t));

      if (availableTools.length > 0) {
        prompt += `\n\n=== AVAILABLE COMMUNICATION TOOLS ===\n`;
        prompt += `These communication tools are confirmed available and healthy:\n`;
        availableTools.forEach((t) => {
          prompt += `- ${t}\n`;
        });
        prompt += `You may use these tools when the user requests communication actions.\n`;
      }

      if (unavailable.length > 0) {
        prompt += `\n=== UNAVAILABLE COMMUNICATION TOOLS ===\n`;
        prompt += `Do NOT attempt to use these tools. If the user asks, explain they are not configured and suggest setting them up in Settings > Integrations:\n`;
        unavailable.forEach((t) => {
          prompt += `- ${t}\n`;
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch comm tools for prompt: ${error.message}`);
    }

    return prompt;
  }

  /**
   * Auto-generate conversation title from first message
   */
  private async autoGenerateTitle(
    conversationId: string,
    firstMessage: string,
    accessToken: string,
  ): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    // Generate simple title from first 60 characters
    let title = firstMessage.slice(0, 60);
    if (firstMessage.length > 60) {
      title += '...';
    }

    await client
      .from('conversations')
      .update({ title })
      .eq('id', conversationId);

    this.logger.log(`Auto-generated title for conversation ${conversationId}`);
  }

  /**
   * Mirror user and AI messages to Notion as page comments.
   * Fire-and-forget — errors are logged but don't block the response.
   */
  private mirrorToNotion(
    conversation: any,
    userContent: string,
    aiContent: string,
  ): void {
    // Only mirror for task-linked conversations with a Notion source
    if (!conversation.task_id || !conversation.task?.source_id || !conversation.task?.sources) {
      return;
    }

    if (conversation.task.sources.provider !== 'notion') {
      return;
    }

    const externalId = conversation.task.external_id || conversation.task.metadata?.external_id;
    if (!externalId) return;

    // Fetch source config (contains Notion API key) and post comments
    (async () => {
      try {
        const client = this.supabaseAdmin.getClient();
        const { data: source, error } = await client
          .from('sources')
          .select('config')
          .eq('id', conversation.task.source_id)
          .single();

        if (error || !source?.config) {
          this.logger.warn(`Failed to get source config for comment mirroring: ${error?.message}`);
          return;
        }

        // Post user message as comment
        try {
          await this.notionAdapter.createComment(
            source.config,
            externalId,
            `User: ${userContent}`,
          );
        } catch (err) {
          this.logger.warn(`Failed to mirror user comment to Notion: ${(err as Error).message}`);
        }

        // Post AI response as comment
        try {
          await this.notionAdapter.createComment(
            source.config,
            externalId,
            `AI: ${aiContent}`,
          );
        } catch (err) {
          this.logger.warn(`Failed to mirror AI comment to Notion: ${(err as Error).message}`);
        }
      } catch (err) {
        this.logger.warn(`Failed to mirror to Notion: ${(err as Error).message}`);
      }
    })();
  }
}
