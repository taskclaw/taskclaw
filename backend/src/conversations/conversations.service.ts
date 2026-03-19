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

    // Verify board exists if board_id provided
    if (dto.board_id) {
      const { data: board, error: boardError } = await client
        .from('board_instances')
        .select('id, name')
        .eq('id', dto.board_id)
        .eq('account_id', accountId)
        .single();

      if (boardError || !board) {
        throw new NotFoundException(`Board with ID ${dto.board_id} not found`);
      }

      // Auto-generate title from board if not provided
      if (!dto.title) {
        dto.title = `Board Chat: ${board.name}`;
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
        board_id: dto.board_id || null,
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
    taskId?: string,
    boardId?: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const offset = (page - 1) * limit;

    let query = client
      .from('conversations')
      .select('*, task:tasks(id, title)', { count: 'exact' })
      .eq('user_id', userId)
      .eq('account_id', accountId);

    if (taskId) {
      query = query.eq('task_id', taskId);
    }

    if (boardId) {
      query = query.eq('board_id', boardId);
    }

    const { data, error, count } = await query
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }

    if (taskId) {
      this.logger.debug(
        `findAll(task_id=${taskId}): found ${data?.length || 0} conversations (total: ${count})`,
      );
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
      .select('*, task:tasks(id, title, status, priority, notes, external_id, external_url, metadata, card_data, source_id, category_id, current_step_id, board_instance_id, override_category_id, sources(id, provider), categories:categories!category_id(id, name, color, icon), override_category:categories!override_category_id(id, name, color, icon)), board:board_instances(id, name, description, default_category_id, orchestrator_category_id, settings_override)')
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

    this.logger.debug(
      `getMessages(conv=${conversationId.slice(0, 8)}): ${data?.length || 0} messages (total: ${count})`,
    );

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

      // Build system prompt with context (board chat uses board-specific prompt)
      const systemPrompt = conversation.board_id
        ? await this.buildBoardSystemPrompt(conversation, accessToken)
        : await this.buildSystemPrompt(conversation, accessToken);

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
   * Task moves to "AI Running" immediately, then routed based on board settings when AI finishes.
   */
  async sendMessageBackground(
    userId: string,
    accountId: string,
    conversationId: string,
    dto: SendMessageDto,
    accessToken: string,
    pipelineDepth = 0,
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
      pipelineDepth,
    );

    return {
      userMessage,
      status: 'processing',
    };
  }

  /**
   * Process AI request in background. When done, stores response, mirrors to Notion,
   * and routes the task based on board settings (Full AI mode or "In Review").
   */
  private processAiInBackground(
    userId: string,
    accountId: string,
    conversationId: string,
    conversation: any,
    userContent: string,
    accessToken: string,
    pipelineDepth = 0,
  ): void {
    const startTime = Date.now();
    const taskId = conversation.task_id;
    const logPrefix = `[BG-AI conv=${conversationId.slice(0, 8)} task=${taskId?.slice(0, 8) || 'none'}]`;

    (async () => {
      const client = this.supabaseAdmin.getClient();
      try {
        this.logger.log(`${logPrefix} Starting background AI processing`);

        // Step 1: Get AI provider config
        this.logger.debug(`${logPrefix} Step 1/5: Fetching AI provider config`);
        const aiConfig = await this.aiProviderService.getDecryptedConfig(
          accountId,
          accessToken,
        );
        this.logger.debug(`${logPrefix} Provider: ${aiConfig.api_url}`);

        // Step 2: Get conversation history
        this.logger.debug(`${logPrefix} Step 2/5: Fetching conversation history`);
        const history = await this.getConversationHistory(
          conversationId,
          accessToken,
        );
        this.logger.debug(`${logPrefix} History: ${history.length} messages`);

        // Step 3: Build system prompt with context (board chat uses board-specific prompt)
        this.logger.debug(`${logPrefix} Step 3/5: Building system prompt`);
        const systemPrompt = conversation.board_id
          ? await this.buildBoardSystemPrompt(conversation, accessToken)
          : await this.buildSystemPrompt(conversation, accessToken);

        // Step 4: Send to OpenClaw
        const messages = this.openClawService.buildMessageHistory(
          systemPrompt,
          history,
          userContent,
        );
        this.logger.log(`${logPrefix} Step 4/5: Sending ${messages.length} messages to OpenClaw`);

        const aiResponse = await this.openClawService.sendMessage(
          aiConfig,
          messages,
          { userId, accountId, conversationId },
        );

        this.logger.log(
          `${logPrefix} AI responded (${aiResponse.response.length} chars, model: ${aiResponse.metadata?.model || 'unknown'})`,
        );

        // Step 5: Store AI response
        this.logger.debug(`${logPrefix} Step 5/5: Storing response and updating task`);
        const { error: insertError } = await client
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: aiResponse.response,
            metadata: aiResponse.metadata || {},
          });

        if (insertError) {
          this.logger.error(`${logPrefix} Failed to store AI response: ${insertError.message}`);
        }

        // Auto-generate conversation title if needed
        if (!conversation.title || conversation.title === 'New Conversation') {
          await this.autoGenerateTitle(conversationId, userContent, accessToken);
        }

        // Mirror messages to Notion
        this.mirrorToNotion(conversation, userContent, aiResponse.response);

        // Extract structured output from AI response and save to card_data
        if (taskId) {
          await this.extractAndSaveOutput(client, taskId, accountId, aiResponse.response, logPrefix);
        }

        // Route task based on board settings (Full AI mode or "In Review")
        if (taskId) {
          await this.handlePostAiRouting(
            client, taskId, accountId, userId, accessToken, logPrefix, pipelineDepth,
          );
        }

        const durationMs = Date.now() - startTime;
        this.logger.log(`${logPrefix} Completed in ${durationMs}ms`);
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMessage = (err as Error).message || 'Unknown error';
        const errorStack = (err as Error).stack || '';

        this.logger.error(
          `${logPrefix} FAILED after ${durationMs}ms: ${errorMessage}`,
        );
        this.logger.debug(`${logPrefix} Stack: ${errorStack}`);

        // Store error message for user feedback
        try {
          await client.from('messages').insert({
            conversation_id: conversationId,
            role: 'system',
            content: `AI processing failed: ${errorMessage}`,
            metadata: { error: true, duration_ms: durationMs },
          });
        } catch (storeErr) {
          this.logger.error(`${logPrefix} Failed to store error message: ${(storeErr as Error).message}`);
        }

        // Handle task status on failure
        if (taskId) {
          try {
            await this.handlePostAiError(
              client, taskId, accountId, conversation.task?.status || 'Idea', logPrefix,
            );
          } catch (revertErr) {
            this.logger.error(`${logPrefix} Failed to handle post-AI error: ${(revertErr as Error).message}`);
          }
        }
      }
    })();
  }

  /**
   * After AI processing completes, route the task based on board "Full AI" setting.
   * Full AI ON: follow on_success_step_id routing and auto-trigger next step.
   * Full AI OFF: move task to "In Review" for human approval.
   */
  private async handlePostAiRouting(
    client: any,
    taskId: string,
    accountId: string,
    userId: string,
    accessToken: string,
    logPrefix: string,
    pipelineDepth: number,
  ): Promise<void> {
    // 1. Fetch task with board + step info
    const { data: task } = await client
      .from('tasks')
      .select('id, current_step_id, board_instance_id')
      .eq('id', taskId)
      .single();

    if (!task?.board_instance_id || !task?.current_step_id) {
      // Not a board task — fall back to "In Review"
      await client.from('tasks').update({ status: 'In Review' }).eq('id', taskId).eq('account_id', accountId);
      this.logger.log(`${logPrefix} Task moved to "In Review" (non-board task)`);
      return;
    }

    // 2. Fetch board settings_override to check full_ai flag
    const { data: board } = await client
      .from('board_instances')
      .select('settings_override')
      .eq('id', task.board_instance_id)
      .single();

    const fullAi = board?.settings_override?.full_ai === true;

    if (!fullAi) {
      await client.from('tasks').update({ status: 'In Review' }).eq('id', taskId).eq('account_id', accountId);
      this.logger.log(`${logPrefix} Task moved to "In Review" (Full AI off)`);
      return;
    }

    // 3. Pipeline depth guard
    if (pipelineDepth >= 10) {
      await client.from('tasks').update({ status: 'In Review' }).eq('id', taskId).eq('account_id', accountId);
      this.logger.warn(`${logPrefix} Pipeline depth limit reached (${pipelineDepth}). Task moved to "In Review".`);
      return;
    }

    // 4. Fetch current step routing config
    const { data: currentStep } = await client
      .from('board_steps')
      .select('id, step_key, name, on_success_step_id, position, board_instance_id')
      .eq('id', task.current_step_id)
      .single();

    if (!currentStep) {
      await client.from('tasks').update({ status: 'In Review' }).eq('id', taskId).eq('account_id', accountId);
      return;
    }

    // 5. Determine next step
    let nextStep: any = null;

    if (currentStep.on_success_step_id) {
      const { data } = await client
        .from('board_steps')
        .select('id, step_key, name, step_type, trigger_type, ai_first, linked_category_id, position')
        .eq('id', currentStep.on_success_step_id)
        .single();
      nextStep = data;
    } else {
      // Fallback: next step by position
      const { data } = await client
        .from('board_steps')
        .select('id, step_key, name, step_type, trigger_type, ai_first, linked_category_id, position')
        .eq('board_instance_id', task.board_instance_id)
        .gt('position', currentStep.position)
        .order('position', { ascending: true })
        .limit(1)
        .single();
      nextStep = data;
    }

    if (!nextStep) {
      // No next step — mark task complete
      await client.from('tasks')
        .update({ status: 'Done', completed: true })
        .eq('id', taskId).eq('account_id', accountId);
      this.logger.log(`${logPrefix} Full AI: no next step — task marked Done`);
      return;
    }

    // 6. Move task to next step
    await client.from('tasks')
      .update({ current_step_id: nextStep.id, status: nextStep.name })
      .eq('id', taskId).eq('account_id', accountId);

    this.logger.log(`${logPrefix} Full AI: moved task to step "${nextStep.name}"`);

    // 7. Auto-trigger AI if next step has on_entry trigger + AI agent
    if (nextStep.trigger_type === 'on_entry' && (nextStep.ai_first || nextStep.linked_category_id)) {
      this.logger.log(`${logPrefix} Full AI: auto-triggering AI on step "${nextStep.name}" (depth=${pipelineDepth + 1})`);
      await this.autoTriggerAiForStep(taskId, accountId, userId, accessToken, nextStep, logPrefix, pipelineDepth + 1);
    }
  }

  /**
   * Auto-trigger AI processing for a task that just entered a step with on_entry trigger.
   */
  async autoTriggerAiForStep(
    taskId: string,
    accountId: string,
    userId: string,
    accessToken: string,
    step: any,
    logPrefix: string,
    pipelineDepth: number,
  ): Promise<void> {
    try {
      const client = this.supabaseAdmin.getClient();

      // Fetch task title
      const { data: task } = await client
        .from('tasks')
        .select('title, notes')
        .eq('id', taskId)
        .single();

      if (!task) return;

      // Get existing conversation for this task
      const { data: existingConvs } = await client
        .from('conversations')
        .select('id')
        .eq('task_id', taskId)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(1);

      let conversationId: string;

      if (existingConvs?.length) {
        conversationId = existingConvs[0].id;
      } else {
        const { data: newConv, error } = await client
          .from('conversations')
          .insert({
            user_id: userId,
            account_id: accountId,
            task_id: taskId,
            title: task.title,
          })
          .select()
          .single();

        if (error || !newConv) {
          this.logger.error(`${logPrefix} Failed to create conversation for auto-trigger: ${error?.message}`);
          return;
        }
        conversationId = newConv.id;
      }

      const message = `[Auto-triggered: Step "${step.name}"]\nPlease process this task according to the current step instructions and schema.`;
      const dto = { content: message } as SendMessageDto;
      await this.sendMessageBackground(userId, accountId, conversationId, dto, accessToken, pipelineDepth);

      this.logger.log(`${logPrefix} Auto-triggered AI for step "${step.name}" on conversation ${conversationId.slice(0, 8)}`);
    } catch (err) {
      this.logger.error(`${logPrefix} Failed to auto-trigger AI: ${(err as Error).message}`);
    }
  }

  /**
   * Handle task status when AI processing fails.
   * If Full AI is on and error routing is configured, move to error step.
   * Otherwise, revert to previous status.
   */
  private async handlePostAiError(
    client: any,
    taskId: string,
    accountId: string,
    previousStatus: string,
    logPrefix: string,
  ): Promise<void> {
    // Fetch task to check if it's a board task with Full AI
    const { data: task } = await client
      .from('tasks')
      .select('id, current_step_id, board_instance_id')
      .eq('id', taskId)
      .single();

    if (task?.board_instance_id && task?.current_step_id) {
      const { data: board } = await client
        .from('board_instances')
        .select('settings_override')
        .eq('id', task.board_instance_id)
        .single();

      const fullAi = board?.settings_override?.full_ai === true;

      if (fullAi) {
        // Check for error routing
        const { data: currentStep } = await client
          .from('board_steps')
          .select('on_error_step_id')
          .eq('id', task.current_step_id)
          .single();

        if (currentStep?.on_error_step_id) {
          const { data: errorStep } = await client
            .from('board_steps')
            .select('id, name')
            .eq('id', currentStep.on_error_step_id)
            .single();

          if (errorStep) {
            await client.from('tasks')
              .update({ current_step_id: errorStep.id, status: errorStep.name })
              .eq('id', taskId).eq('account_id', accountId);
            this.logger.log(`${logPrefix} Full AI error routing: task moved to "${errorStep.name}"`);
            return;
          }
        }
      }
    }

    // Default: revert to previous status
    const { error: revertError } = await client
      .from('tasks')
      .update({ status: previousStatus })
      .eq('id', taskId)
      .eq('account_id', accountId);

    if (revertError) {
      this.logger.error(`${logPrefix} Failed to revert task status: ${revertError.message}`);
    } else {
      this.logger.log(`${logPrefix} Task status reverted to "${previousStatus}"`);
    }
  }

  /**
   * Extract structured output from AI response based on the step's output_schema.
   * Looks for ```output_json blocks, parses them, and saves to card_data[step_key].
   */
  private async extractAndSaveOutput(
    client: any,
    taskId: string,
    accountId: string,
    aiResponse: string,
    logPrefix: string,
  ): Promise<void> {
    try {
      // Fetch task to get current step
      const { data: task } = await client
        .from('tasks')
        .select('id, current_step_id, board_instance_id, card_data')
        .eq('id', taskId)
        .single();

      if (!task?.current_step_id) return;

      // Fetch step's output schema
      const { data: step } = await client
        .from('board_steps')
        .select('step_key, output_schema')
        .eq('id', task.current_step_id)
        .single();

      if (!step?.output_schema?.length) return;

      // Try to extract ```output_json block from AI response
      const jsonMatch = aiResponse.match(/```output_json\s*\n([\s\S]*?)```/);
      if (!jsonMatch) {
        this.logger.debug(`${logPrefix} No output_json block found in AI response`);
        return;
      }

      let extracted: Record<string, any>;
      try {
        extracted = JSON.parse(jsonMatch[1].trim());
      } catch {
        this.logger.warn(`${logPrefix} Failed to parse output_json block`);
        return;
      }

      // Validate against output_schema — only keep declared keys
      const validKeys = new Set(step.output_schema.map((f: any) => f.key));
      const validated: Record<string, any> = {};
      for (const [key, value] of Object.entries(extracted)) {
        if (validKeys.has(key) && value !== null && value !== undefined && value !== '') {
          const fieldDef = step.output_schema.find((f: any) => f.key === key);
          // Coerce types
          if (fieldDef?.type === 'boolean') {
            validated[key] = value === true || value === 'true';
          } else if (fieldDef?.type === 'number') {
            validated[key] = Number(value);
          } else {
            validated[key] = value;
          }
        }
      }

      if (Object.keys(validated).length === 0) {
        this.logger.debug(`${logPrefix} No valid output fields extracted`);
        return;
      }

      // Merge into card_data[step_key]
      const existingCardData = task.card_data || {};
      const existingStepData = existingCardData[step.step_key] || {};
      const updatedCardData = {
        ...existingCardData,
        [step.step_key]: { ...existingStepData, ...validated },
      };

      await client
        .from('tasks')
        .update({ card_data: updatedCardData })
        .eq('id', taskId)
        .eq('account_id', accountId);

      this.logger.log(`${logPrefix} Extracted ${Object.keys(validated).length} output fields for step "${step.step_key}": ${JSON.stringify(validated)}`);
    } catch (err) {
      this.logger.warn(`${logPrefix} Output extraction failed: ${(err as Error).message}`);
      // Non-fatal — pipeline continues
    }
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
   * Resolve the effective agent category ID using the 3-tier priority cascade:
   *   1. Card-level: task.override_category_id (highest priority)
   *   2. Column-level: board_step.linked_category_id
   *   3. Board-level: board_instance.default_category_id
   *   4. Legacy: task.category_id (fallback)
   */
  private async resolveAgentCategoryId(task: any): Promise<string | null> {
    if (!task) return null;

    // Tier 1: Card-level override (highest priority)
    if (task.override_category_id) {
      this.logger.debug(`Agent cascade: using card-level override category ${task.override_category_id}`);
      return task.override_category_id;
    }

    // Tier 2: Column-level (step's linked category)
    if (task.current_step_id) {
      try {
        const client = this.supabaseAdmin.getClient();
        const { data: step } = await client
          .from('board_steps')
          .select('linked_category_id')
          .eq('id', task.current_step_id)
          .single();

        if (step?.linked_category_id) {
          this.logger.debug(`Agent cascade: using column-level category ${step.linked_category_id}`);
          return step.linked_category_id;
        }
      } catch {
        // Continue to next tier
      }
    }

    // Tier 3: Board-level default
    if (task.board_instance_id) {
      try {
        const client = this.supabaseAdmin.getClient();
        const { data: board } = await client
          .from('board_instances')
          .select('default_category_id')
          .eq('id', task.board_instance_id)
          .single();

        if (board?.default_category_id) {
          this.logger.debug(`Agent cascade: using board-level default category ${board.default_category_id}`);
          return board.default_category_id;
        }
      } catch {
        // Continue to fallback
      }
    }

    // Tier 4: Legacy fallback
    if (task.category_id) {
      this.logger.debug(`Agent cascade: using legacy task category ${task.category_id}`);
      return task.category_id;
    }

    return null;
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
    // Resolve the effective agent category using 3-tier cascade:
    // Card override → Column linked category → Board default → Task category
    const agentCategoryId = conversation.task_id
      ? await this.resolveAgentCategoryId(conversation.task)
      : null;

    // Check if skills/knowledge are synced to the provider (OpenClaw).
    // If synced, skip inline injection — the content is loaded from
    // SKILL.md files on the server, saving thousands of tokens per request.
    let providerSynced = false;
    if (agentCategoryId) {
      try {
        providerSynced = await this.agentSyncService.isSynced(
          conversation.account_id,
          agentCategoryId,
        );
      } catch {
        // Fallback to inline injection if sync check fails
      }
    }

    if (providerSynced) {
      this.logger.debug(
        `Category ${agentCategoryId} skills/knowledge synced to provider — skipping inline injection`,
      );
    } else {
      // FALLBACK: Inline skills injection
      // First try: category-linked skills (from resolved agent category)
      let skillsInjected = false;
      if (agentCategoryId) {
        try {
          const categorySkills = await this.skillsService.findDefaultForCategory(
            accessToken,
            conversation.account_id,
            agentCategoryId,
          );

          if (categorySkills && categorySkills.length > 0) {
            prompt += `\n\n=== ACTIVE SKILLS ===\n`;
            prompt += `The following specialized skills are active for this conversation:\n\n`;
            categorySkills.forEach((skill, index) => {
              prompt += `Skill ${index + 1}: ${skill.name}\n`;
              if (skill.description) {
                prompt += `Description: ${skill.description}\n`;
              }
              prompt += `Instructions:\n${skill.instructions}\n\n`;
            });
            prompt += `Apply these skills when responding to the user.\n`;
            skillsInjected = true;
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch category skills for prompt: ${error.message}`);
        }
      }

      // Second try: conversation-level skill_ids (manual selection, original behavior)
      if (!skillsInjected) {
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
      }

      // Inline knowledge injection from resolved agent category
      const knowledgeCategoryId = agentCategoryId || conversation.task?.category_id;
      try {
        if (conversation.task_id && knowledgeCategoryId) {
          const masterDoc = await this.knowledgeService.findMasterForCategory(
            accessToken,
            conversation.account_id,
            knowledgeCategoryId,
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
      // Card data (structured field values accumulated across steps)
      if (conversation.task.card_data && typeof conversation.task.card_data === 'object') {
        const cardEntries = Object.entries(conversation.task.card_data);
        if (cardEntries.length > 0) {
          prompt += `\nCard Data (accumulated across board steps):\n`;
          for (const [stepKey, fields] of cardEntries) {
            prompt += `  Step "${stepKey}":\n`;
            if (typeof fields === 'object' && fields !== null) {
              for (const [fieldKey, val] of Object.entries(fields as Record<string, any>)) {
                if (val !== null && val !== undefined && val !== '') {
                  prompt += `    - ${fieldKey}: ${JSON.stringify(val)}\n`;
                }
              }
            }
          }
        }
      }

      // Current step schema (if board task)
      if (conversation.task.current_step_id) {
        try {
          const client = this.supabaseAdmin.getClient();
          const { data: currentStep } = await client
            .from('board_steps')
            .select('step_key, name, input_schema, output_schema, system_prompt')
            .eq('id', conversation.task.current_step_id)
            .single();

          if (currentStep) {
            if (currentStep.system_prompt) {
              prompt += `\n=== STEP-LEVEL INSTRUCTIONS ===\n`;
              prompt += currentStep.system_prompt + `\n`;
            }
            if (currentStep.input_schema?.length > 0) {
              prompt += `\nCurrent step "${currentStep.name}" expects these input fields:\n`;
              for (const f of currentStep.input_schema) {
                prompt += `  - ${f.key} (${f.type}${f.required ? ', required' : ''}): ${f.label}\n`;
              }
            }
            if (currentStep.output_schema?.length > 0) {
              prompt += `\nExpected output fields for step "${currentStep.name}":\n`;
              for (const f of currentStep.output_schema) {
                prompt += `  - ${f.key} (${f.type}): ${f.label}\n`;
              }
              prompt += `\nIMPORTANT: At the end of your response, you MUST include a structured output block with the values for the expected output fields above. Use this exact format:\n`;
              prompt += '```output_json\n';
              prompt += JSON.stringify(
                Object.fromEntries(currentStep.output_schema.map((f: any) => [f.key, f.type === 'boolean' ? false : f.type === 'number' ? 0 : ''])),
                null, 2,
              );
              prompt += '\n```\n';
              prompt += `Replace the placeholder values with your actual results. This block will be automatically parsed and saved as structured data.\n`;
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch step schema for prompt: ${error.message}`);
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
   * Build a system prompt for board-level AI chat (task creation mode).
   * Includes board structure, steps, schemas, and orchestrator agent skills.
   */
  private async buildBoardSystemPrompt(
    conversation: any,
    accessToken: string,
  ): Promise<string> {
    const client = this.supabaseAdmin.getClient();

    // Fetch board with full details
    const { data: board } = await client
      .from('board_instances')
      .select('id, name, description, default_category_id, orchestrator_category_id, settings_override')
      .eq('id', conversation.board_id)
      .single();

    if (!board) {
      this.logger.warn(`Board ${conversation.board_id} not found, falling back to generic prompt`);
      return this.buildSystemPrompt(conversation, accessToken);
    }

    // Fetch steps with linked agent names
    const { data: steps } = await client
      .from('board_steps')
      .select('step_key, name, step_type, position, input_schema, output_schema, linked_category:categories!linked_category_id(id, name)')
      .eq('board_instance_id', board.id)
      .order('position', { ascending: true });

    const firstStep = steps?.[0];

    let prompt = `You are OpenClaw, an AI assistant acting as the Board Orchestrator for "${board.name}".
${board.description ? `Board purpose: ${board.description}` : ''}

=== YOUR ROLE ===
You help users create and manage tasks on this board through conversation.
- When the user describes tasks they want, ask clarifying questions if the request is vague
- When you have enough information, generate a structured list of tasks
- Be proactive in suggesting good task titles, priorities, and descriptions
- You can create multiple tasks in a single response

=== BOARD PIPELINE ===
This board has the following steps (columns):
${(steps || []).map((s, i) => {
  let desc = `${i + 1}. "${s.name}" (${s.step_type})`;
  if ((s as any).linked_category?.name) {
    desc += ` — Agent: ${(s as any).linked_category.name}`;
  }
  if (s.input_schema && Array.isArray(s.input_schema) && s.input_schema.length > 0) {
    desc += `\n   Input fields: ${s.input_schema.map((f: any) => `${f.key} (${f.type}${f.required ? ', required' : ''}): ${f.label}`).join(', ')}`;
  }
  return desc;
}).join('\n')}

New tasks will be placed in the first step: "${firstStep?.name || 'To-Do'}"

=== TASK OUTPUT FORMAT ===
When you are ready to create tasks, output them inside a fenced code block with the language tag \`tasks_json\`. Example:

\`\`\`tasks_json
[
  {
    "title": "Task title here",
    "priority": "Medium",
    "notes": "Brief description or context for this task"
  }
]
\`\`\`

Rules:
- "title" is REQUIRED for every task
- "priority" must be "High", "Medium", or "Low" (defaults to "Medium")
- "notes" is optional but helpful for providing context
- Always output tasks as a JSON array, even for a single task
- After outputting the tasks_json block, briefly summarize what you proposed
- The user will review and confirm before tasks are actually created

`;

    // ═══════════════════════════════════════════════════════════
    // ORCHESTRATOR AGENT SKILLS & KNOWLEDGE
    // ═══════════════════════════════════════════════════════════
    const agentCategoryId = board.orchestrator_category_id || board.default_category_id;

    if (agentCategoryId) {
      // Check if synced to provider
      let providerSynced = false;
      try {
        providerSynced = await this.agentSyncService.isSynced(
          conversation.account_id,
          agentCategoryId,
        );
      } catch {
        // Fallback to inline injection
      }

      if (!providerSynced) {
        // Inline skills injection
        try {
          const categorySkills = await this.skillsService.findDefaultForCategory(
            accessToken,
            conversation.account_id,
            agentCategoryId,
          );

          if (categorySkills && categorySkills.length > 0) {
            prompt += `\n=== ORCHESTRATOR SKILLS ===\n`;
            categorySkills.forEach((skill, index) => {
              prompt += `Skill ${index + 1}: ${skill.name}\n`;
              if (skill.description) {
                prompt += `Description: ${skill.description}\n`;
              }
              prompt += `Instructions:\n${skill.instructions}\n\n`;
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch orchestrator skills: ${error.message}`);
        }

        // Inline knowledge injection
        try {
          const masterDoc = await this.knowledgeService.findMasterForCategory(
            accessToken,
            conversation.account_id,
            agentCategoryId,
          );

          if (masterDoc) {
            prompt += `\n=== KNOWLEDGE BASE ===\n`;
            prompt += `Master Document: "${masterDoc.title}"\n\n`;
            prompt += `${masterDoc.content}\n\n`;
            prompt += `Use this knowledge to provide contextually relevant task suggestions.\n`;
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch orchestrator knowledge: ${error.message}`);
        }
      }
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
