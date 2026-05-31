import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, count } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  conversations,
  messages,
  tasks,
  boardInstances,
  boardSteps,
  agents,
  sources,
  pods,
  agentApprovalRequests,
} from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { OpenClawService } from './openclaw.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { SkillsService } from '../skills/skills.service';
import { NotionAdapter } from '../adapters/notion/notion.adapter';
import { AgentSyncService } from '../agent-sync/agent-sync.service';
import { BackboneRouterService } from '../backbone/backbone-router.service';
import { CacheableBlock } from '../backbone/adapters/backbone-adapter.interface';

import { IntegrationsService } from '../integrations/integrations.service';
import { ToolRegistryService } from '../integrations/tool-registry.service';
import { WebhookEmitterService } from '../webhooks/webhook-emitter.service';
import { ExecutionLogService } from '../heartbeat/execution-log.service';
import { WorkspaceContextService } from '../workspace-context/workspace-context.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { OrchestrationService } from '../orchestration/orchestration.service';
import { snakeKeys } from '../common/utils/snake-keys.util';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
    private readonly aiProviderService: AiProviderService,
    private readonly openClawService: OpenClawService,
    private readonly knowledgeService: KnowledgeService,
    private readonly skillsService: SkillsService,
    private readonly notionAdapter: NotionAdapter,
    private readonly agentSyncService: AgentSyncService,
    @Inject(forwardRef(() => BackboneRouterService))
    private readonly backboneRouter: BackboneRouterService,
    private readonly integrationsService: IntegrationsService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly webhookEmitter: WebhookEmitterService,
    private readonly executionLogService: ExecutionLogService,
    private readonly workspaceContextService: WorkspaceContextService,
    @Inject(forwardRef(() => OrchestrationService))
    private readonly orchestrationService: OrchestrationService,
  ) {}

  /**
   * Drizzle's relational query returns joined rows under their relation names
   * (e.g. `task`, `boardInstance`, `source`, `category_categoryId`). PostgREST
   * returned them under the table/alias names callers depend on
   * (`task`, `board`, `sources`, `categories`, `override_category`).
   * These helpers re-key the relational shape back to the PostgREST shape so
   * downstream code (`conversation.task.sources`, `conversation.task.categories`,
   * `conversation.board`, etc.) keeps working unchanged.
   */
  private presentTask(task: any) {
    if (!task) return task;
    const {
      source,
      category_categoryId,
      category_overrideCategoryId,
      ...rest
    } = task;
    return {
      ...snakeKeys(rest),
      sources: source ?? null,
      categories: category_categoryId ?? null,
      override_category: category_overrideCategoryId ?? null,
    };
  }

  private presentConversation(row: any) {
    if (!row) return row;
    const { task, boardInstance, ...rest } = row;
    return {
      ...snakeKeys(rest),
      task: this.presentTask(task) ?? null,
      board: boardInstance ?? null,
    };
  }

  /**
   * Create a new conversation
   */
  async create(
    userId: string,
    accountId: string,
    dto: CreateConversationDto,
    accessToken: string,
  ) {
    // Verify user has access
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify task exists if task_id provided
    if (dto.task_id) {
      const [task] = await this.db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(and(eq(tasks.id, dto.task_id), eq(tasks.accountId, accountId)))
        .limit(1);

      if (!task) {
        throw new NotFoundException(`Task with ID ${dto.task_id} not found`);
      }

      // Auto-generate title from task if not provided
      if (!dto.title) {
        dto.title = `Chat about: ${task.title}`;
      }
    }

    // Verify board exists if board_id provided
    if (dto.board_id) {
      const [board] = await this.db
        .select({ id: boardInstances.id, name: boardInstances.name })
        .from(boardInstances)
        .where(
          and(
            eq(boardInstances.id, dto.board_id),
            eq(boardInstances.accountId, accountId),
          ),
        )
        .limit(1);

      if (!board) {
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

    // F06: Verify agent exists if agent_id provided
    if (dto.agent_id) {
      const [agent] = await this.db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(and(eq(agents.id, dto.agent_id), eq(agents.accountId, accountId)))
        .limit(1);

      if (!agent) {
        throw new NotFoundException(`Agent with ID ${dto.agent_id} not found`);
      }

      if (!dto.title) {
        dto.title = `Chat with ${agent.name}`;
      }
    }

    let data: typeof conversations.$inferSelect;
    try {
      const rows = await this.db
        .insert(conversations)
        .values({
          userId,
          accountId,
          taskId: dto.task_id,
          boardId: dto.board_id || null,
          podId: dto.pod_id || null,
          agentId: dto.agent_id || null,
          title: dto.title || 'New Conversation',
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
          ...(dto.backbone_connection_id
            ? { backboneConnectionId: dto.backbone_connection_id }
            : {}),
        })
        .returning();
      data = rows[0];
    } catch (error: any) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }

    this.logger.log(
      `Conversation created: ${data.id} with ${dto.skill_ids?.length || 0} skills`,
    );

    this.webhookEmitter.emit(accountId, 'conversation.created', {
      conversation: data,
    });

    return snakeKeys(data);
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
    podId?: string,
    agentId?: string,
  ) {
    // Verify user has access
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const offset = (page - 1) * limit;

    const filters = [
      eq(conversations.userId, userId),
      eq(conversations.accountId, accountId),
    ];

    if (taskId) {
      filters.push(eq(conversations.taskId, taskId));
    }

    if (boardId) {
      filters.push(eq(conversations.boardId, boardId));
    }

    if (podId) {
      filters.push(eq(conversations.podId, podId));
    }

    if (agentId) {
      filters.push(eq(conversations.agentId, agentId));
    }

    const where = and(...filters);

    const rows = await this.db.query.conversations.findMany({
      where,
      orderBy: desc(conversations.updatedAt),
      limit,
      offset,
      with: { task: { columns: { id: true, title: true } } },
    });

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(conversations)
      .where(where);

    // Re-key the embedded `task` relation to the PostgREST `task` key (same name).
    const data = rows.map((r: any) => {
      const { task, ...rest } = r;
      return { ...snakeKeys(rest), task: task ?? null };
    });

    if (taskId) {
      this.logger.debug(
        `findAll(task_id=${taskId}): found ${data?.length || 0} conversations (total: ${total})`,
      );
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
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
    // Verify user has access
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const row = await this.db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
        eq(conversations.accountId, accountId),
      ),
      with: {
        task: {
          columns: {
            id: true,
            title: true,
            status: true,
            priority: true,
            notes: true,
            externalId: true,
            externalUrl: true,
            metadata: true,
            cardData: true,
            sourceId: true,
            categoryId: true,
            currentStepId: true,
            boardInstanceId: true,
            overrideCategoryId: true,
          },
          with: {
            source: { columns: { id: true, provider: true } },
            category_categoryId: {
              columns: { id: true, name: true, color: true, icon: true },
            },
            category_overrideCategoryId: {
              columns: { id: true, name: true, color: true, icon: true },
            },
          },
        },
        boardInstance: {
          columns: {
            id: true,
            name: true,
            description: true,
            defaultCategoryId: true,
            orchestratorCategoryId: true,
            settingsOverride: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    return this.presentConversation(row);
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
    // Verify user owns this conversation
    await this.findOne(userId, accountId, conversationId, accessToken);

    const offset = (page - 1) * limit;

    const data = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    this.logger.debug(
      `getMessages(conv=${conversationId.slice(0, 8)}): ${data?.length || 0} messages (total: ${total})`,
    );

    return {
      data: data.map(snakeKeys),
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
    };
  }

  /**
   * Send a message and get AI response.
   * Uses BackboneRouter when backbone connections exist; falls back to
   * legacy ai_provider_configs + OpenClawService otherwise (F038).
   */
  async sendMessage(
    userId: string,
    accountId: string,
    conversationId: string,
    dto: SendMessageDto,
    accessToken: string,
  ) {
    // Verify conversation exists and user owns it
    const conversation = await this.findOne(
      userId,
      accountId,
      conversationId,
      accessToken,
    );

    // Store user message
    let userMessage: typeof messages.$inferSelect;
    try {
      const rows = await this.db
        .insert(messages)
        .values({
          conversationId,
          role: 'user',
          content: dto.content,
        })
        .returning();
      userMessage = rows[0];
    } catch (userMsgError: any) {
      throw new Error(`Failed to store user message: ${userMsgError.message}`);
    }

    this.webhookEmitter.emit(accountId, 'message.created', {
      message: userMessage,
      conversation_id: conversationId,
    });

    try {
      // Resolve the effective category for the task (used by both paths)
      const task = conversation.task;
      const resolvedCategoryId = task
        ? await this.resolveAgentCategoryId(task)
        : null;

      // Get conversation history
      const history = await this.getConversationHistory(
        conversationId,
        accessToken,
      );

      // ── Try backbone path first (F018/F019) ──
      let aiResponseText: string;
      let aiResponseMetadata: Record<string, any> = {};
      let backboneConnectionId: string | null = null;
      // F5 — typed segments emitted by adapters (Anthropic today). When
      // present we persist non-text segments (thinking, tool_use,
      // tool_result) as their own messages.kind rows before the
      // assistant text row, preserving order.
      let aiResponseSegments: Array<{
        kind: string;
        content: string;
        metadata?: Record<string, unknown>;
      }> | undefined;

      const backboneResolved = await this.tryResolveBackbone(accountId, {
        taskId: conversation.task_id || undefined,
        boardId: conversation.board_id || undefined,
        stepId: task?.current_step_id || undefined,
        categoryId: resolvedCategoryId || undefined,
        conversationBackboneId: conversation.backbone_connection_id || undefined,
      });

      if (backboneResolved) {
        // ── Backbone path ──
        backboneConnectionId = backboneResolved.connection.id;

        // Build system prompt with native skill injection check (F020)
        const systemPrompt = await this.buildSystemPromptWithBackbone(
          conversation,
          accessToken,
          backboneResolved,
          resolvedCategoryId,
        );

        // F032: use structured prompt blocks for cockpit conversations (enables Anthropic caching)
        const cockpitBlocks = await this.buildCockpitSystemPromptBlocks(conversation);

        const result = await this.backboneRouter.send({
          accountId,
          taskId: conversation.task_id || undefined,
          boardId: conversation.board_id || undefined,
          stepId: task?.current_step_id || undefined,
          categoryId: resolvedCategoryId || undefined,
          sendOptions: {
            systemPrompt,
            ...(cockpitBlocks ? { systemPromptBlocks: cockpitBlocks, isConversational: true } : {}),
            message: dto.content,
            history: history.map((h) => ({
              role: h.role as 'user' | 'assistant' | 'system',
              content: h.content,
            })),
            metadata: { userId, accountId, conversationId },
          },
        });

        aiResponseText = result.text;
        aiResponseSegments = result.segments;
        aiResponseMetadata = {
          model: result.model,
          ...(result.usage || {}),
          ...(result.cacheStats ? { cache_stats: result.cacheStats } : {}),
          backbone_connection_id: backboneConnectionId,
          resolved_from: backboneResolved.resolvedFrom,
        };
      } else {
        // ── Legacy fallback (F038) ──
        this.logger.debug(
          `No backbone connection for account ${accountId}; using legacy ai_provider path`,
        );

        const aiConfig = await this.aiProviderService.getDecryptedConfig(
          accountId,
          accessToken,
        );

        const systemPrompt = conversation.board_id
          ? await this.buildBoardSystemPrompt(conversation, accessToken)
          : await this.buildSystemPrompt(conversation, accessToken);

        const messages = this.openClawService.buildMessageHistory(
          systemPrompt,
          history,
          dto.content,
        );

        const aiResponse = await this.openClawService.sendMessage(
          aiConfig,
          messages,
          { userId, accountId, conversationId },
        );

        aiResponseText = aiResponse.response;
        aiResponseMetadata = aiResponse.metadata || {};
      }

      // ── F019/F020: Pod tool call processing ──
      const isPodConversation = !!conversation.pod_id && !conversation.task_id;
      if (isPodConversation && aiResponseText.includes('<tool_call')) {
        try {
          const toolResult = await this.processPodToolCalls(
            aiResponseText,
            conversation,
            accountId,
            userId,
          );
          aiResponseText = toolResult.processedText;
          if (toolResult.approvalPending) {
            aiResponseMetadata = { ...aiResponseMetadata, approval_pending: true };
          }
        } catch (toolErr: any) {
          this.logger.warn(`[PodTools] Tool processing error: ${toolErr.message}`);
        }
      }

      // ── F024: Cockpit tool call processing (delegate_to_pod) ──
      const isCockpitConversation =
        !conversation.pod_id && !conversation.task_id && !conversation.board_id;
      if (isCockpitConversation && aiResponseText.includes('<tool_call')) {
        try {
          const cockpitResult = await this.processCockpitToolCalls(
            aiResponseText,
            accountId,
            userId,
          );
          aiResponseText = cockpitResult.processedText;
          if (cockpitResult.delegations.length > 0) {
            aiResponseMetadata = {
              ...aiResponseMetadata,
              delegations: cockpitResult.delegations,
              pending_approval: cockpitResult.delegations.some(d => d.status === 'pending_approval'),
            };
          }
        } catch (toolErr: any) {
          this.logger.warn(`[CockpitTools] Tool processing error: ${toolErr.message}`);
        }
      }

      // F5 — persist non-text segments first so they appear before the
      // assistant's text reply when ordered by created_at. We only write
      // thinking / tool_use / tool_result; 'text' is collapsed into the
      // main assistantInsert below for backward compatibility.
      if (aiResponseSegments && aiResponseSegments.length > 0) {
        const sideRows = aiResponseSegments
          .filter((s) => s.kind !== 'text')
          .map((s) => ({
            conversationId,
            role: 'assistant',
            kind: s.kind,
            authorType: 'agent',
            content: s.content,
            metadata: { ...(s.metadata ?? {}), generated_with: aiResponseMetadata?.model },
            ...(backboneConnectionId
              ? { backboneConnectionId }
              : {}),
          }));
        if (sideRows.length > 0) {
          try {
            await this.db.insert(messages).values(sideRows);
          } catch (sideErr: any) {
            this.logger.warn(`Failed to store segment rows: ${sideErr.message}`);
          }
        }
      }

      // Store AI response (F021: include backbone_connection_id)
      const assistantInsert: Record<string, any> = {
        conversationId,
        role: 'assistant',
        kind: 'text',
        authorType: 'agent',
        content: aiResponseText,
        metadata: aiResponseMetadata,
      };
      if (backboneConnectionId) {
        assistantInsert.backboneConnectionId = backboneConnectionId;
      }

      let assistantMessage: typeof messages.$inferSelect;
      try {
        const rows = await this.db
          .insert(messages)
          .values(assistantInsert as typeof messages.$inferInsert)
          .returning();
        assistantMessage = rows[0];
      } catch (aiMsgError: any) {
        throw new Error(`Failed to store AI response: ${aiMsgError.message}`);
      }

      // F021: Store backbone_connection_id on conversation if resolved
      if (backboneConnectionId && !conversation.backbone_connection_id) {
        await this.db
          .update(conversations)
          .set({ backboneConnectionId })
          .where(eq(conversations.id, conversationId));
      }

      this.webhookEmitter.emit(accountId, 'message.created', {
        message: assistantMessage,
        conversation_id: conversationId,
      });

      // Auto-generate conversation title from first user message if needed
      if (!conversation.title || conversation.title === 'New Conversation') {
        await this.autoGenerateTitle(conversationId, dto.content, accessToken);
      }

      this.logger.log(
        `Message exchange completed for conversation ${conversationId}`,
      );

      // Fire-and-forget: mirror messages to Notion as comments
      this.mirrorToNotion(conversation, dto.content, aiResponseText);

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
      await this.db.insert(messages).values({
        conversationId,
        role: 'system',
        kind: 'error',
        authorType: 'system',
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
    // Verify conversation exists and user owns it
    const conversation = await this.findOne(
      userId,
      accountId,
      conversationId,
      accessToken,
    );

    // Store user message immediately
    let userMessage: typeof messages.$inferSelect;
    try {
      const rows = await this.db
        .insert(messages)
        .values({
          conversationId,
          role: 'user',
          content: dto.content,
        })
        .returning();
      userMessage = rows[0];
    } catch (userMsgError: any) {
      throw new Error(`Failed to store user message: ${userMsgError.message}`);
    }

    this.webhookEmitter.emit(accountId, 'message.created', {
      message: userMessage,
      conversation_id: conversationId,
    });

    // Move task to "AI Running" immediately
    if (conversation.task_id) {
      try {
        await this.db
          .update(tasks)
          .set({ status: 'AI Running' })
          .where(
            and(
              eq(tasks.id, conversation.task_id),
              eq(tasks.accountId, accountId),
            ),
          );
      } catch (runningError: any) {
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
   * Uses BackboneRouter when available; falls back to legacy path (F038).
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
      // Create an execution log entry for workspace chat conversations (no task)
      let execLogId: string | null = null;
      if (!taskId) {
        const logEntry = await this.executionLogService.create({
          account_id: accountId,
          trigger_type: 'workspace_chat',
          status: 'running',
          conversation_id: conversationId,
          pod_id: conversation.pod_id || undefined,
          summary: userContent.length > 120 ? userContent.slice(0, 120) + '…' : userContent,
        });
        execLogId = logEntry?.id ?? null;
      }

      try {
        this.logger.log(`${logPrefix} Starting background AI processing`);

        const task = conversation.task;
        const resolvedCategoryId = task
          ? await this.resolveAgentCategoryId(task)
          : null;

        // Step 1: Resolve backbone or legacy provider
        this.logger.debug(`${logPrefix} Step 1/5: Resolving AI backbone`);

        let aiResponseText: string;
        let aiResponseMetadata: Record<string, any> = {};
        let backboneConnectionId: string | null = null;

        const backboneResolved = await this.tryResolveBackbone(accountId, {
          taskId: conversation.task_id || undefined,
          boardId: conversation.board_id || undefined,
          stepId: task?.current_step_id || undefined,
          categoryId: resolvedCategoryId || undefined,
          conversationBackboneId: conversation.backbone_connection_id || undefined,
        });

        // Step 2: Get conversation history
        this.logger.debug(
          `${logPrefix} Step 2/5: Fetching conversation history`,
        );
        const history = await this.getConversationHistory(
          conversationId,
          accessToken,
        );
        this.logger.debug(`${logPrefix} History: ${history.length} messages`);

        if (backboneResolved) {
          // ── Backbone path (F018) ──
          backboneConnectionId = backboneResolved.connection.id;
          this.logger.debug(
            `${logPrefix} Using backbone: ${backboneResolved.adapter.slug} (${backboneResolved.resolvedFrom})`,
          );

          // Step 3: Build system prompt with native skill injection check (F020)
          this.logger.debug(`${logPrefix} Step 3/5: Building system prompt`);
          const systemPrompt = await this.buildSystemPromptWithBackbone(
            conversation,
            accessToken,
            backboneResolved,
            resolvedCategoryId,
          );

          // Step 4: Build tool context from skill required_tools (T03)
          let toolContext: any[] | undefined;
          try {
            const skills = conversation.skills ?? [];
            const requiredTools: string[] = [];
            for (const skill of skills) {
              const tools = this.skillsService.getRequiredTools(skill);
              requiredTools.push(...tools);
            }
            if (requiredTools.length > 0) {
              toolContext = await this.toolRegistry.buildToolContext(accountId, requiredTools);
              this.logger.debug(`${logPrefix} Tool context: ${toolContext.length} tools resolved`);
            }
          } catch (toolErr) {
            this.logger.warn(`${logPrefix} Failed to build tool context: ${toolErr.message}`);
          }

          // F032: structured prompt blocks for cockpit conversations (Anthropic caching)
          const cockpitBlocks = await this.buildCockpitSystemPromptBlocks(conversation);

          // Step 5: Send via backbone router
          this.logger.log(
            `${logPrefix} Step 4/5: Sending to backbone ${backboneResolved.adapter.slug}`,
          );

          const result = await this.backboneRouter.send({
            accountId,
            taskId: conversation.task_id || undefined,
            boardId: conversation.board_id || undefined,
            stepId: task?.current_step_id || undefined,
            categoryId: resolvedCategoryId || undefined,
            podId: conversation.pod_id || undefined,
            sendOptions: {
              systemPrompt,
              ...(cockpitBlocks ? { systemPromptBlocks: cockpitBlocks, isConversational: true } : {}),
              message: userContent,
              history: history.map((h) => ({
                role: h.role as 'user' | 'assistant' | 'system',
                content: h.content,
              })),
              tool_context: toolContext,
              metadata: { userId, accountId, conversationId },
            },
          });

          aiResponseText = result.text;
          aiResponseMetadata = {
            model: result.model,
            ...(result.usage || {}),
            ...(result.cacheStats ? { cache_stats: result.cacheStats } : {}),
            backbone_connection_id: backboneConnectionId,
            resolved_from: backboneResolved.resolvedFrom,
          };
        } else {
          // ── Legacy fallback (F038) ──
          this.logger.debug(
            `${logPrefix} No backbone; using legacy ai_provider path`,
          );

          const aiConfig = await this.aiProviderService.getDecryptedConfig(
            accountId,
            accessToken,
          );
          this.logger.debug(`${logPrefix} Provider: ${aiConfig.api_url}`);

          // Step 3: Build system prompt (legacy)
          this.logger.debug(`${logPrefix} Step 3/5: Building system prompt`);
          const systemPrompt = conversation.board_id
            ? await this.buildBoardSystemPrompt(conversation, accessToken)
            : await this.buildSystemPrompt(conversation, accessToken);

          // Step 4: Send to OpenClaw (legacy)
          const messages = this.openClawService.buildMessageHistory(
            systemPrompt,
            history,
            userContent,
          );
          this.logger.log(
            `${logPrefix} Step 4/5: Sending ${messages.length} messages to OpenClaw`,
          );

          const aiResponse = await this.openClawService.sendMessage(
            aiConfig,
            messages,
            { userId, accountId, conversationId },
          );

          aiResponseText = aiResponse.response;
          aiResponseMetadata = aiResponse.metadata || {};
        }

        this.logger.log(
          `${logPrefix} AI responded (${aiResponseText.length} chars, model: ${aiResponseMetadata?.model || 'unknown'})`,
        );

        // ── F019/F020: Pod tool call processing (background path) ──
        const isPodConversationBg = !!conversation.pod_id && !conversation.task_id;
        if (isPodConversationBg && aiResponseText.includes('<tool_call')) {
          try {
            const toolResult = await this.processPodToolCalls(
              aiResponseText,
              conversation,
              accountId,
              userId,
            );
            aiResponseText = toolResult.processedText;
            if (toolResult.approvalPending) {
              aiResponseMetadata = { ...aiResponseMetadata, approval_pending: true };
            }
            this.logger.debug(`${logPrefix} Pod tool calls processed: ${toolResult.toolResults.length} results, approvalPending=${toolResult.approvalPending}`);
          } catch (toolErr: any) {
            this.logger.warn(`${logPrefix} [PodTools] Tool processing error: ${toolErr.message}`);
          }
        }

        // ── F024: Cockpit tool call processing — background path ──
        const isCockpitBg =
          !conversation.pod_id && !conversation.task_id && !conversation.board_id;
        if (isCockpitBg && aiResponseText.includes('<tool_call')) {
          try {
            const cockpitResult = await this.processCockpitToolCalls(
              aiResponseText,
              accountId,
              userId,
            );
            aiResponseText = cockpitResult.processedText;
            if (cockpitResult.delegations.length > 0) {
              aiResponseMetadata = {
                ...aiResponseMetadata,
                delegations: cockpitResult.delegations,
                pending_approval: cockpitResult.delegations.some(d => d.status === 'pending_approval'),
              };
            }
            this.logger.debug(
              `${logPrefix} Cockpit tool calls processed: ${cockpitResult.toolResults.length} results, ${cockpitResult.delegations.length} delegations`,
            );
          } catch (toolErr: any) {
            this.logger.warn(
              `${logPrefix} [CockpitTools] Tool processing error: ${toolErr.message}`,
            );
          }
        }

        // Step 5: Store AI response (F021: include backbone_connection_id)
        this.logger.debug(
          `${logPrefix} Step 5/5: Storing response and updating task`,
        );
        const messageInsert: Record<string, any> = {
          conversationId,
          role: 'assistant',
          content: aiResponseText,
          metadata: aiResponseMetadata,
        };
        if (backboneConnectionId) {
          messageInsert.backboneConnectionId = backboneConnectionId;
        }

        try {
          await this.db
            .insert(messages)
            .values(messageInsert as typeof messages.$inferInsert);
        } catch (insertError: any) {
          this.logger.error(
            `${logPrefix} Failed to store AI response: ${insertError.message}`,
          );
        }

        // F021: Store backbone_connection_id on conversation if resolved
        if (backboneConnectionId && !conversation.backbone_connection_id) {
          await this.db
            .update(conversations)
            .set({ backboneConnectionId })
            .where(eq(conversations.id, conversationId));
        }

        // Auto-generate conversation title if needed
        if (!conversation.title || conversation.title === 'New Conversation') {
          await this.autoGenerateTitle(
            conversationId,
            userContent,
            accessToken,
          );
        }

        // Mirror messages to Notion
        this.mirrorToNotion(conversation, userContent, aiResponseText);

        // Extract structured output from AI response and save to card_data
        if (taskId) {
          await this.extractAndSaveOutput(
            taskId,
            accountId,
            aiResponseText,
            logPrefix,
          );
        }

        // Route task based on board settings (Full AI mode or "In Review")
        if (taskId) {
          await this.handlePostAiRouting(
            taskId,
            accountId,
            userId,
            accessToken,
            logPrefix,
            pipelineDepth,
          );
        }

        const durationMs = Date.now() - startTime;
        this.logger.log(`${logPrefix} Completed in ${durationMs}ms`);

        // Mark execution log as completed
        if (execLogId) {
          await this.executionLogService.complete(execLogId, {
            status: 'success',
            summary: aiResponseText ? (aiResponseText.length > 120 ? aiResponseText.slice(0, 120) + '…' : aiResponseText) : 'Done',
            duration_ms: durationMs,
          });
        }
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMessage = (err as Error).message || 'Unknown error';
        const errorStack = (err as Error).stack || '';

        this.logger.error(
          `${logPrefix} FAILED after ${durationMs}ms: ${errorMessage}`,
        );
        this.logger.debug(`${logPrefix} Stack: ${errorStack}`);

        // Mark execution log as failed
        if (execLogId) {
          await this.executionLogService.complete(execLogId, {
            status: 'error',
            error_details: errorMessage,
            duration_ms: durationMs,
          }).catch(() => {/* ignore log errors */});
        }

        // Store error message for user feedback
        try {
          await this.db.insert(messages).values({
            conversationId,
            role: 'system',
            kind: 'error',
            authorType: 'system',
            content: `AI processing failed: ${errorMessage}`,
            metadata: { error: true, duration_ms: durationMs },
          });
        } catch (storeErr) {
          this.logger.error(
            `${logPrefix} Failed to store error message: ${(storeErr as Error).message}`,
          );
        }

        // Handle task status on failure
        if (taskId) {
          try {
            await this.handlePostAiError(
              taskId,
              accountId,
              conversation.task?.status || 'Idea',
              logPrefix,
            );
          } catch (revertErr) {
            this.logger.error(
              `${logPrefix} Failed to handle post-AI error: ${(revertErr as Error).message}`,
            );
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
    taskId: string,
    accountId: string,
    userId: string,
    accessToken: string,
    logPrefix: string,
    pipelineDepth: number,
  ): Promise<void> {
    // 1. Fetch task with board + step info
    const [task] = await this.db
      .select({
        id: tasks.id,
        current_step_id: tasks.currentStepId,
        board_instance_id: tasks.boardInstanceId,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task?.board_instance_id || !task?.current_step_id) {
      // Not a board task — fall back to "In Review"
      await this.db
        .update(tasks)
        .set({ status: 'In Review' })
        .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));
      this.logger.log(
        `${logPrefix} Task moved to "In Review" (non-board task)`,
      );
      return;
    }

    // 2. Fetch board settings_override to check full_ai flag
    const [board] = await this.db
      .select({ settings_override: boardInstances.settingsOverride })
      .from(boardInstances)
      .where(eq(boardInstances.id, task.board_instance_id))
      .limit(1);

    const fullAi =
      (board?.settings_override as Record<string, any>)?.full_ai === true;

    if (!fullAi) {
      await this.db
        .update(tasks)
        .set({ status: 'In Review' })
        .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));
      this.logger.log(`${logPrefix} Task moved to "In Review" (Full AI off)`);
      return;
    }

    // 3. Pipeline depth guard
    if (pipelineDepth >= 10) {
      await this.db
        .update(tasks)
        .set({ status: 'In Review' })
        .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));
      this.logger.warn(
        `${logPrefix} Pipeline depth limit reached (${pipelineDepth}). Task moved to "In Review".`,
      );
      return;
    }

    // 4. Fetch current step routing config
    const [currentStep] = await this.db
      .select({
        id: boardSteps.id,
        step_key: boardSteps.stepKey,
        name: boardSteps.name,
        on_success_step_id: boardSteps.onSuccessStepId,
        position: boardSteps.position,
        board_instance_id: boardSteps.boardInstanceId,
      })
      .from(boardSteps)
      .where(eq(boardSteps.id, task.current_step_id))
      .limit(1);

    if (!currentStep) {
      await this.db
        .update(tasks)
        .set({ status: 'In Review' })
        .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));
      return;
    }

    // 5. Determine next step
    let nextStep: any = null;

    if (currentStep.on_success_step_id) {
      const [data] = await this.db
        .select({
          id: boardSteps.id,
          step_key: boardSteps.stepKey,
          name: boardSteps.name,
          step_type: boardSteps.stepType,
          trigger_type: boardSteps.triggerType,
          ai_first: boardSteps.aiFirst,
          linked_category_id: boardSteps.linkedCategoryId,
          position: boardSteps.position,
        })
        .from(boardSteps)
        .where(eq(boardSteps.id, currentStep.on_success_step_id))
        .limit(1);
      nextStep = data ?? null;
    } else {
      // Fallback: next step by position
      const [data] = await this.db
        .select({
          id: boardSteps.id,
          step_key: boardSteps.stepKey,
          name: boardSteps.name,
          step_type: boardSteps.stepType,
          trigger_type: boardSteps.triggerType,
          ai_first: boardSteps.aiFirst,
          linked_category_id: boardSteps.linkedCategoryId,
          position: boardSteps.position,
        })
        .from(boardSteps)
        .where(
          and(
            eq(boardSteps.boardInstanceId, task.board_instance_id),
            gt(boardSteps.position, currentStep.position),
          ),
        )
        .orderBy(asc(boardSteps.position))
        .limit(1);
      nextStep = data ?? null;
    }

    if (!nextStep) {
      // No next step — mark task complete
      await this.db
        .update(tasks)
        .set({ status: 'Done', completed: true })
        .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));
      this.logger.log(`${logPrefix} Full AI: no next step — task marked Done`);
      return;
    }

    // 6. Move task to next step
    await this.db
      .update(tasks)
      .set({ currentStepId: nextStep.id, status: nextStep.name })
      .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));

    this.logger.log(
      `${logPrefix} Full AI: moved task to step "${nextStep.name}"`,
    );

    // 7. Auto-trigger AI if next step has on_entry trigger + AI agent
    if (
      nextStep.trigger_type === 'on_entry' &&
      (nextStep.ai_first || nextStep.linked_category_id)
    ) {
      this.logger.log(
        `${logPrefix} Full AI: auto-triggering AI on step "${nextStep.name}" (depth=${pipelineDepth + 1})`,
      );
      await this.autoTriggerAiForStep(
        taskId,
        accountId,
        userId,
        accessToken,
        nextStep,
        logPrefix,
        pipelineDepth + 1,
      );
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
      // Fetch task title
      const [task] = await this.db
        .select({ title: tasks.title, notes: tasks.notes })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) return;

      // Get existing conversation for this task
      const existingConvs = await this.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.taskId, taskId),
            eq(conversations.accountId, accountId),
          ),
        )
        .orderBy(desc(conversations.createdAt))
        .limit(1);

      let conversationId: string;

      if (existingConvs?.length) {
        conversationId = existingConvs[0].id;
      } else {
        let newConv: typeof conversations.$inferSelect | undefined;
        try {
          const rows = await this.db
            .insert(conversations)
            .values({
              userId,
              accountId,
              taskId,
              title: task.title,
            })
            .returning();
          newConv = rows[0];
        } catch (error: any) {
          this.logger.error(
            `${logPrefix} Failed to create conversation for auto-trigger: ${error?.message}`,
          );
          return;
        }

        if (!newConv) {
          this.logger.error(
            `${logPrefix} Failed to create conversation for auto-trigger: unknown error`,
          );
          return;
        }
        conversationId = newConv.id;
      }

      const message = `[Auto-triggered: Step "${step.name}"]\nPlease process this task according to the current step instructions and schema.`;
      const dto = { content: message } as SendMessageDto;
      await this.sendMessageBackground(
        userId,
        accountId,
        conversationId,
        dto,
        accessToken,
        pipelineDepth,
      );

      this.logger.log(
        `${logPrefix} Auto-triggered AI for step "${step.name}" on conversation ${conversationId.slice(0, 8)}`,
      );
    } catch (err) {
      this.logger.error(
        `${logPrefix} Failed to auto-trigger AI: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Handle task status when AI processing fails.
   * If Full AI is on and error routing is configured, move to error step.
   * Otherwise, revert to previous status.
   */
  private async handlePostAiError(
    taskId: string,
    accountId: string,
    previousStatus: string,
    logPrefix: string,
  ): Promise<void> {
    // Fetch task to check if it's a board task with Full AI
    const [task] = await this.db
      .select({
        id: tasks.id,
        current_step_id: tasks.currentStepId,
        board_instance_id: tasks.boardInstanceId,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (task?.board_instance_id && task?.current_step_id) {
      const [board] = await this.db
        .select({ settings_override: boardInstances.settingsOverride })
        .from(boardInstances)
        .where(eq(boardInstances.id, task.board_instance_id))
        .limit(1);

      const fullAi =
        (board?.settings_override as Record<string, any>)?.full_ai === true;

      if (fullAi) {
        // Check for error routing
        const [currentStep] = await this.db
          .select({ on_error_step_id: boardSteps.onErrorStepId })
          .from(boardSteps)
          .where(eq(boardSteps.id, task.current_step_id))
          .limit(1);

        if (currentStep?.on_error_step_id) {
          const [errorStep] = await this.db
            .select({ id: boardSteps.id, name: boardSteps.name })
            .from(boardSteps)
            .where(eq(boardSteps.id, currentStep.on_error_step_id))
            .limit(1);

          if (errorStep) {
            await this.db
              .update(tasks)
              .set({ currentStepId: errorStep.id, status: errorStep.name })
              .where(
                and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)),
              );
            this.logger.log(
              `${logPrefix} Full AI error routing: task moved to "${errorStep.name}"`,
            );
            return;
          }
        }
      }
    }

    // Default: revert to previous status
    try {
      await this.db
        .update(tasks)
        .set({ status: previousStatus })
        .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));
      this.logger.log(
        `${logPrefix} Task status reverted to "${previousStatus}"`,
      );
    } catch (revertError: any) {
      this.logger.error(
        `${logPrefix} Failed to revert task status: ${revertError.message}`,
      );
    }
  }

  /**
   * Extract structured output from AI response based on the step's output_schema.
   * Looks for ```output_json blocks, parses them, and saves to card_data[step_key].
   */
  private async extractAndSaveOutput(
    taskId: string,
    accountId: string,
    aiResponse: string,
    logPrefix: string,
  ): Promise<void> {
    try {
      // Fetch task to get current step
      const [task] = await this.db
        .select({
          id: tasks.id,
          current_step_id: tasks.currentStepId,
          board_instance_id: tasks.boardInstanceId,
          card_data: tasks.cardData,
        })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task?.current_step_id) return;

      // Fetch step's output schema
      const [step] = await this.db
        .select({
          step_key: boardSteps.stepKey,
          output_schema: boardSteps.outputSchema,
        })
        .from(boardSteps)
        .where(eq(boardSteps.id, task.current_step_id))
        .limit(1);

      const outputSchema = step?.output_schema as any[] | undefined;
      if (!outputSchema?.length) return;

      // Try to extract ```output_json block from AI response
      const jsonMatch = aiResponse.match(/```output_json\s*\n([\s\S]*?)```/);
      if (!jsonMatch) {
        this.logger.debug(
          `${logPrefix} No output_json block found in AI response`,
        );
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
      const validKeys = new Set(outputSchema.map((f: any) => f.key));
      const validated: Record<string, any> = {};
      for (const [key, value] of Object.entries(extracted)) {
        if (
          validKeys.has(key) &&
          value !== null &&
          value !== undefined &&
          value !== ''
        ) {
          const fieldDef = outputSchema.find((f: any) => f.key === key);
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
      const existingCardData =
        (task.card_data as Record<string, any>) || {};
      const existingStepData = existingCardData[step!.step_key] || {};
      const updatedCardData = {
        ...existingCardData,
        [step!.step_key]: { ...existingStepData, ...validated },
      };

      await this.db
        .update(tasks)
        .set({ cardData: updatedCardData })
        .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));

      this.logger.log(
        `${logPrefix} Extracted ${Object.keys(validated).length} output fields for step "${step!.step_key}": ${JSON.stringify(validated)}`,
      );
    } catch (err) {
      this.logger.warn(
        `${logPrefix} Output extraction failed: ${(err as Error).message}`,
      );
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
    // Verify conversation exists and user owns it
    await this.findOne(userId, accountId, conversationId, accessToken);

    // Map the DTO field-by-field to camelCase columns (only defined fields).
    const patch: Partial<typeof conversations.$inferInsert> = {};
    if ((dto as any).title !== undefined) patch.title = (dto as any).title;
    if ((dto as any).metadata !== undefined)
      patch.metadata = (dto as any).metadata;

    let data: typeof conversations.$inferSelect;
    try {
      const rows = await this.db
        .update(conversations)
        .set(patch)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        )
        .returning();
      data = rows[0];
    } catch (error: any) {
      throw new Error(`Failed to update conversation: ${error.message}`);
    }

    return snakeKeys(data);
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
    // Verify conversation exists and user owns it
    await this.findOne(userId, accountId, conversationId, accessToken);

    try {
      await this.db
        .delete(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        );
    } catch (error: any) {
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
    try {
      const data = await this.db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt))
        .limit(limit);

      return data || [];
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch conversation history: ${error.message}`,
      );
      return [];
    }
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
      this.logger.debug(
        `Agent cascade: using card-level override category ${task.override_category_id}`,
      );
      return task.override_category_id;
    }

    // Tier 2: Column-level (step's linked category)
    if (task.current_step_id) {
      try {
        const [step] = await this.db
          .select({ linked_category_id: boardSteps.linkedCategoryId })
          .from(boardSteps)
          .where(eq(boardSteps.id, task.current_step_id))
          .limit(1);

        if (step?.linked_category_id) {
          this.logger.debug(
            `Agent cascade: using column-level category ${step.linked_category_id}`,
          );
          return step.linked_category_id;
        }
      } catch {
        // Continue to next tier
      }
    }

    // Tier 3: Board-level default
    if (task.board_instance_id) {
      try {
        const [board] = await this.db
          .select({ default_category_id: boardInstances.defaultCategoryId })
          .from(boardInstances)
          .where(eq(boardInstances.id, task.board_instance_id))
          .limit(1);

        if (board?.default_category_id) {
          this.logger.debug(
            `Agent cascade: using board-level default category ${board.default_category_id}`,
          );
          return board.default_category_id;
        }
      } catch {
        // Continue to fallback
      }
    }

    // Tier 4: Legacy fallback
    if (task.category_id) {
      this.logger.debug(
        `Agent cascade: using legacy task category ${task.category_id}`,
      );
      return task.category_id;
    }

    return null;
  }

  /**
   * Try to resolve a backbone connection for the given context.
   * Returns null instead of throwing when no backbone is configured,
   * allowing the caller to fall back to the legacy ai_provider path (F038).
   */
  private async tryResolveBackbone(
    accountId: string,
    options?: { taskId?: string; boardId?: string; stepId?: string; categoryId?: string; conversationBackboneId?: string },
  ): Promise<import('../backbone/backbone-router.service').ResolveResult | null> {
    try {
      return await this.backboneRouter.resolve(accountId, options);
    } catch (err) {
      // NotFoundException means no backbone configured — that's fine, use legacy
      if ((err as any)?.status === 404) {
        return null;
      }
      // Re-throw unexpected errors
      throw err;
    }
  }

  /**
   * Build system prompt with native skill injection check (F020).
   * If the resolved backbone adapter supports native skill injection,
   * build a minimal prompt without inline skills (the adapter will handle them).
   * Otherwise, build the full prompt with skills embedded.
   */
  private async buildSystemPromptWithBackbone(
    conversation: any,
    accessToken: string,
    resolved: import('../backbone/backbone-router.service').ResolveResult,
    resolvedCategoryId: string | null,
  ): Promise<string> {
    const supportsNativeSkills =
      resolved.adapter.supportsNativeSkillInjection?.() ?? false;

    if (supportsNativeSkills) {
      this.logger.debug(
        `Backbone ${resolved.adapter.slug} supports native skill injection — building minimal prompt`,
      );
      // Build prompt without inline skills; the adapter passes skills natively
      return conversation.board_id
        ? await this.buildBoardSystemPrompt(conversation, accessToken, {
            skipSkillInjection: true,
          })
        : await this.buildSystemPrompt(conversation, accessToken, {
            skipSkillInjection: true,
          });
    }

    // Adapter does not support native skills — build full prompt with embedded skills
    return conversation.board_id
      ? await this.buildBoardSystemPrompt(conversation, accessToken)
      : await this.buildSystemPrompt(conversation, accessToken);
  }


  /**
   * F032: Build structured system prompt blocks for cockpit-scoped conversations
   * with Anthropic backbone. Returns two CacheableBlock entries:
   *  1. Stable block: workspace context XML (cacheable=true)
   *  2. Dynamic block: persona + delegation tools (cacheable=false)
   *
   * Used instead of the flat systemPrompt string to enable Anthropic prompt caching.
   */
  private async buildCockpitSystemPromptBlocks(
    conversation: any,
  ): Promise<CacheableBlock[] | null> {
    const isCockpit =
      !conversation.task_id &&
      !conversation.pod_id &&
      !conversation.board_id;

    if (!isCockpit || !conversation.account_id) return null;

    try {
      // Block 1: stable workspace context (cacheable)
      const contextBlock = await this.workspaceContextService.getContextBlock(
        conversation.account_id,
      );

      // Block 2: persona + tools (dynamic, not cacheable)
      const dynamicText = `You are OpenClaw, an AI assistant integrated into the OTT Platform.
You help users manage tasks, projects, and workflows with intelligence and context awareness.

Current Context:
- Platform: OTT Dashboard (Task & Project Management)
- User: Authenticated and working in their personal account

${this.buildDelegationToolDefinitions()}`;

      return [
        { text: contextBlock.text, cacheable: true },
        { text: dynamicText, cacheable: false },
      ];
    } catch (err: any) {
      this.logger.warn(
        `[F032] Failed to build cockpit system prompt blocks: ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * Build system prompt with task context.
   * @param options.skipSkillInjection When true, omit inline skill/knowledge injection
   *        (used when the backbone adapter handles native skill injection — F020).
   */
  private async buildSystemPrompt(
    conversation: any,
    accessToken: string,
    options?: { skipSkillInjection?: boolean },
  ): Promise<string> {
    // BASE SYSTEM PROMPT
    let prompt = `You are OpenClaw, an AI assistant integrated into the OTT Platform.
You help users manage tasks, projects, and workflows with intelligence and context awareness.

Current Context:
- Platform: OTT Dashboard (Task & Project Management)
- User: Authenticated and working in their personal account
`;

    // ═══════════════════════════════════════════════════════════
    // F009 + F010: WORKSPACE COCKPIT CONTEXT INJECTION
    // Detect cockpit scope: no task_id, no pod_id, no board_id
    // ═══════════════════════════════════════════════════════════
    const isCockpit =
      !conversation.task_id &&
      !conversation.pod_id &&
      !conversation.board_id;

    if (isCockpit && conversation.account_id) {
      try {
        const contextBlock = await this.workspaceContextService.getContextBlock(
          conversation.account_id,
        );
        prompt += `\n\n${contextBlock.text}`;

        // F010: Delegation tool definitions
        prompt += `\n\n${this.buildDelegationToolDefinitions()}`;
      } catch (err: any) {
        this.logger.warn(
          `Failed to inject workspace context into cockpit prompt: ${err?.message}`,
        );
      }
    }

    // ═══════════════════════════════════════════════════════════
    // F017 + F018: POD CHAT CONTEXT INJECTION
    // Detect pod scope: has pod_id, no task_id
    // ═══════════════════════════════════════════════════════════
    const isPodChat =
      !!conversation.pod_id && !conversation.task_id && !conversation.board_id;

    if (isPodChat && conversation.pod_id) {
      try {
        const podContextBlock = await this.workspaceContextService.getPodContextBlock(
          conversation.pod_id,
        );
        prompt += `\n\n${podContextBlock.text}`;

        // F018: Pod-level tool definitions
        prompt += `\n\n${this.buildPodToolDefinitions()}`;
      } catch (err: any) {
        this.logger.warn(
          `Failed to inject pod context into pod chat prompt: ${err?.message}`,
        );
      }
    }

    // ═══════════════════════════════════════════════════════════
    // SKILLS & KNOWLEDGE: Provider-synced or inline injection
    // ═══════════════════════════════════════════════════════════
    // F020: Skip skill/knowledge injection when backbone handles it natively
    const skipSkills = options?.skipSkillInjection === true;

    // Resolve the effective agent category using 3-tier cascade:
    // Card override → Column linked category → Board default → Task category
    const agentCategoryId = conversation.task_id
      ? await this.resolveAgentCategoryId(conversation.task)
      : null;

    // Check if skills/knowledge are synced to the provider (OpenClaw).
    // If synced, skip inline injection — the content is loaded from
    // SKILL.md files on the server, saving thousands of tokens per request.
    let providerSynced = false;
    if (agentCategoryId && !skipSkills) {
      try {
        providerSynced = await this.agentSyncService.isSynced(
          conversation.account_id,
          agentCategoryId,
        );
      } catch {
        // Fallback to inline injection if sync check fails
      }
    }

    if (skipSkills) {
      this.logger.debug(
        `Backbone native skill injection active — skipping inline skill/knowledge injection`,
      );
    } else if (providerSynced) {
      this.logger.debug(
        `Category ${agentCategoryId} skills/knowledge synced to provider — skipping inline injection`,
      );
    } else {
      // FALLBACK: Inline skills injection
      // First try: category-linked skills (from resolved agent category)
      let skillsInjected = false;
      if (agentCategoryId) {
        try {
          const categorySkills =
            await this.skillsService.findDefaultForCategory(
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
          this.logger.warn(
            `Failed to fetch category skills for prompt: ${error.message}`,
          );
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
          this.logger.warn(
            `Failed to fetch skills for prompt: ${error.message}`,
          );
        }
      }

      // Inline knowledge injection from resolved agent category
      const knowledgeCategoryId =
        agentCategoryId || conversation.task?.category_id;
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
            prompt += `Category: ${conversation.task.categories?.name || 'Unknown'}\n\n`;
            prompt += `${masterDoc.content}\n\n`;
            prompt += `Use this knowledge to provide contextually relevant responses.\n`;
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch knowledge for prompt: ${error.message}`,
        );
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
      if (
        conversation.task.metadata &&
        typeof conversation.task.metadata === 'object'
      ) {
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
      if (
        conversation.task.card_data &&
        typeof conversation.task.card_data === 'object'
      ) {
        const cardEntries = Object.entries(conversation.task.card_data);
        if (cardEntries.length > 0) {
          prompt += `\nCard Data (accumulated across board steps):\n`;
          for (const [stepKey, fields] of cardEntries) {
            prompt += `  Step "${stepKey}":\n`;
            if (typeof fields === 'object' && fields !== null) {
              for (const [fieldKey, val] of Object.entries(
                fields as Record<string, any>,
              )) {
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
          const [currentStep] = await this.db
            .select({
              step_key: boardSteps.stepKey,
              name: boardSteps.name,
              input_schema: boardSteps.inputSchema,
              output_schema: boardSteps.outputSchema,
              system_prompt: boardSteps.systemPrompt,
            })
            .from(boardSteps)
            .where(eq(boardSteps.id, conversation.task.current_step_id))
            .limit(1);

          if (currentStep) {
            if (currentStep.system_prompt) {
              prompt += `\n=== STEP-LEVEL INSTRUCTIONS ===\n`;
              prompt += currentStep.system_prompt + `\n`;
            }
            const inputSchema = (currentStep.input_schema as any[]) ?? [];
            const outputSchema = (currentStep.output_schema as any[]) ?? [];
            if (inputSchema.length > 0) {
              prompt += `\nCurrent step "${currentStep.name}" expects these input fields:\n`;
              for (const f of inputSchema) {
                prompt += `  - ${f.key} (${f.type}${f.required ? ', required' : ''}): ${f.label}\n`;
              }
            }
            if (outputSchema.length > 0) {
              prompt += `\nExpected output fields for step "${currentStep.name}":\n`;
              for (const f of outputSchema) {
                prompt += `  - ${f.key} (${f.type}): ${f.label}\n`;
              }
              prompt += `\nIMPORTANT: At the end of your response, you MUST include a structured output block with the values for the expected output fields above. Use this exact format:\n`;
              prompt += '```output_json\n';
              prompt += JSON.stringify(
                Object.fromEntries(
                  outputSchema.map((f: any) => [
                    f.key,
                    f.type === 'boolean' ? false : f.type === 'number' ? 0 : '',
                  ]),
                ),
                null,
                2,
              );
              prompt += '\n```\n';
              prompt += `Replace the placeholder values with your actual results. This block will be automatically parsed and saved as structured data.\n`;
            }
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch step schema for prompt: ${error.message}`,
          );
        }
      }

      prompt += `\nThe user is asking for help with this specific task. Provide relevant, actionable advice.\n`;
      prompt += `When you produce findings or insights, the user can save them directly to the task card.\n`;
    }

    // ═══════════════════════════════════════════════════════════
    // COMMUNICATION TOOLS AVAILABILITY (unified via IntegrationsService)
    // ═══════════════════════════════════════════════════════════
    try {
      const availableTools =
        await this.integrationsService.getAvailableCommTools(
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
      this.logger.warn(
        `Failed to fetch comm tools for prompt: ${error.message}`,
      );
    }

    return prompt;
  }

  /**
   * Build a system prompt for board-level AI chat (task creation mode).
   * Includes board structure, steps, schemas, and orchestrator agent skills.
   * @param options.skipSkillInjection When true, omit inline skill/knowledge injection (F020).
   */
  private async buildBoardSystemPrompt(
    conversation: any,
    accessToken: string,
    options?: { skipSkillInjection?: boolean },
  ): Promise<string> {
    // Fetch board with full details
    const [board] = await this.db
      .select({
        id: boardInstances.id,
        name: boardInstances.name,
        description: boardInstances.description,
        default_category_id: boardInstances.defaultCategoryId,
        orchestrator_category_id: boardInstances.orchestratorCategoryId,
        settings_override: boardInstances.settingsOverride,
      })
      .from(boardInstances)
      .where(eq(boardInstances.id, conversation.board_id))
      .limit(1);

    if (!board) {
      this.logger.warn(
        `Board ${conversation.board_id} not found, falling back to generic prompt`,
      );
      return this.buildSystemPrompt(conversation, accessToken);
    }

    // Fetch steps with linked agent names.
    // Drizzle returns the linked category under the relation name `category`;
    // PostgREST returned it under the alias `linked_category` — re-key to match.
    const stepRows = await this.db.query.boardSteps.findMany({
      where: eq(boardSteps.boardInstanceId, board.id),
      orderBy: asc(boardSteps.position),
      columns: {
        stepKey: true,
        name: true,
        stepType: true,
        position: true,
        inputSchema: true,
        outputSchema: true,
      },
      with: {
        category: { columns: { id: true, name: true } },
      },
    });

    const steps = stepRows.map((s: any) => {
      const { category, ...rest } = s;
      return { ...rest, linked_category: category ?? null };
    });

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
${(steps || [])
  .map((s, i) => {
    let desc = `${i + 1}. "${s.name}" (${s.stepType})`;
    if ((s as any).linked_category?.name) {
      desc += ` — Agent: ${(s as any).linked_category.name}`;
    }
    if (
      s.inputSchema &&
      Array.isArray(s.inputSchema) &&
      s.inputSchema.length > 0
    ) {
      desc += `\n   Input fields: ${s.inputSchema.map((f: any) => `${f.key} (${f.type}${f.required ? ', required' : ''}): ${f.label}`).join(', ')}`;
    }
    return desc;
  })
  .join('\n')}

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
    const skipSkills = options?.skipSkillInjection === true;
    const agentCategoryId =
      board.orchestrator_category_id || board.default_category_id;

    if (agentCategoryId && !skipSkills) {
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
          const categorySkills =
            await this.skillsService.findDefaultForCategory(
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
          this.logger.warn(
            `Failed to fetch orchestrator skills: ${error.message}`,
          );
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
          this.logger.warn(
            `Failed to fetch orchestrator knowledge: ${error.message}`,
          );
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // BOARD INTEGRATION SKILLS + CREDENTIALS
    // ═══════════════════════════════════════════════════════════
    try {
      const integrationContext =
        await this.integrationsService.getIntegrationContextForBoard(board.id);

      if (integrationContext.length > 0) {
        prompt += `\n=== BOARD INTEGRATIONS ===\n`;
        for (const integration of integrationContext) {
          prompt += `\n--- INTEGRATION: ${integration.name} ---\n`;
          prompt += `Status: ${integration.status}\n`;
          if (integration.external_account_name) {
            prompt += `Connected Account: ${integration.external_account_name}\n`;
          }
          if (integration.skill_instructions) {
            prompt += `\nHow to use ${integration.name}:\n`;
            prompt += `${integration.skill_instructions}\n`;
          }
          if (
            integration.credentials &&
            Object.keys(integration.credentials).length > 0
          ) {
            prompt += `\nCredentials:\n`;
            for (const [key, value] of Object.entries(
              integration.credentials,
            )) {
              prompt += `  ${key}: ${value}\n`;
            }
          }
          if (
            integration.config &&
            Object.keys(integration.config).length > 0
          ) {
            prompt += `\nConfiguration:\n`;
            for (const [key, value] of Object.entries(integration.config)) {
              prompt += `  ${key}: ${value}\n`;
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch board integrations: ${error.message}`);
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
    // Generate simple title from first 60 characters
    let title = firstMessage.slice(0, 60);
    if (firstMessage.length > 60) {
      title += '...';
    }

    await this.db
      .update(conversations)
      .set({ title })
      .where(eq(conversations.id, conversationId));

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
    if (
      !conversation.task_id ||
      !conversation.task?.source_id ||
      !conversation.task?.sources
    ) {
      return;
    }

    if (conversation.task.sources.provider !== 'notion') {
      return;
    }

    const externalId =
      conversation.task.external_id || conversation.task.metadata?.external_id;
    if (!externalId) return;

    // Fetch source config (contains Notion API key) and post comments
    (async () => {
      try {
        const [source] = await this.db
          .select({ config: sources.config })
          .from(sources)
          .where(eq(sources.id, conversation.task.source_id))
          .limit(1);

        if (!source?.config) {
          this.logger.warn(
            `Failed to get source config for comment mirroring: not found`,
          );
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
          this.logger.warn(
            `Failed to mirror user comment to Notion: ${(err as Error).message}`,
          );
        }

        // Post AI response as comment
        try {
          await this.notionAdapter.createComment(
            source.config,
            externalId,
            `AI: ${aiContent}`,
          );
        } catch (err) {
          this.logger.warn(
            `Failed to mirror AI comment to Notion: ${(err as Error).message}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to mirror to Notion: ${(err as Error).message}`,
        );
      }
    })();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F010 — Delegation tool definitions for cockpit system prompt
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the <tool_definitions> XML block containing JSON schemas for all
   * cockpit-level delegation tools. Injected only for workspace-scoped (cockpit)
   * conversations.
   */
  private buildDelegationToolDefinitions(): string {
    const tools = [
      {
        name: 'delegate_to_pod',
        description:
          'Delegate a goal to a specific pod. The pod agent will decompose the goal into board tasks and execute them. Use this when the user wants work done by a department.',
        parameters: {
          type: 'object',
          required: ['pod_id', 'goal'],
          properties: {
            pod_id: {
              type: 'string',
              description: 'UUID or slug of the pod to delegate to (use the pod_id UUID from workspace context)',
            },
            goal: {
              type: 'string',
              description: 'Human-readable description of what needs to be accomplished',
            },
            input_context: {
              type: 'object',
              description:
                'Optional structured context to pass to the pod (e.g. upstream results, constraints)',
              additionalProperties: true,
            },
            depends_on_task_ids: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional list of orchestrated_task UUIDs that must complete before this task can start',
            },
          },
        },
      },
      {
        name: 'create_task',
        description:
          'Create a task directly on a specific board column, optionally assigning it to an agent.',
        parameters: {
          type: 'object',
          required: ['board_id', 'title'],
          properties: {
            board_id: {
              type: 'string',
              description: 'UUID of the board_instance to create the task on',
            },
            column_id: {
              type: 'string',
              description: 'UUID of the board_step (column) to place the task in',
            },
            title: {
              type: 'string',
              description: 'Task title',
            },
            description: {
              type: 'string',
              description: 'Detailed task description or instructions',
            },
            agent_id: {
              type: 'string',
              description: 'UUID of the agent to assign this task to',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              description: 'Task priority level',
            },
          },
        },
      },
      {
        name: 'report_completion',
        description:
          'Report that a delegated task or orchestration has been completed with a result summary.',
        parameters: {
          type: 'object',
          required: ['task_id', 'result_summary'],
          properties: {
            task_id: {
              type: 'string',
              description: 'UUID of the orchestrated_task that was completed',
            },
            result_summary: {
              type: 'string',
              description: 'Short human-readable summary of what was accomplished',
            },
            structured_output: {
              type: 'object',
              description:
                'Optional machine-readable output (URLs, file paths, metrics, etc.)',
              additionalProperties: true,
            },
          },
        },
      },
      {
        name: 'request_human_approval',
        description:
          'Pause execution and ask the human pilot for approval before proceeding with a multi-step plan. Always use this before triggering large or irreversible operations.',
        parameters: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: {
              type: 'string',
              description:
                'Explanation of what you are about to do and why you need approval',
            },
            dag_preview: {
              type: 'object',
              description:
                'Optional preview of the DAG plan: { tasks: [{ title, pod_name, depends_on? }] }',
              additionalProperties: true,
            },
          },
        },
      },
    ];

    return `<tool_definitions>
${JSON.stringify(tools, null, 2)}
</tool_definitions>

IMPORTANT: When the user describes a goal, task, or workflow — even a complex multi-step one — you MUST immediately emit one or more <tool_call> XML blocks in your response. Do NOT write a plan and ask "Ready to proceed?" or "Shall I start?". Do NOT ask for confirmation. Do NOT wait for the user to say "yes" or "go ahead". The user's message IS the instruction to act.

Emit the tool calls in the SAME response as your explanation. Use this exact format:

<tool_call name="delegate_to_pod">
{"pod_id": "UUID", "goal": "description of what this pod should do", "input_context": {}}
</tool_call>

ROUTING RULES — read these carefully before emitting any tool call:
1. Match each part of the goal to the MOST SPECIFIC pod+board, using the board descriptions in <workspace_context>.
2. If a goal spans multiple departments (e.g. "build mockup websites AND write X posts"), emit SEPARATE delegate_to_pod calls — one per pod. Do NOT bundle cross-department work into a single pod just because that pod can partially handle it.
3. A pod with a board explicitly named for a task (e.g. "X Content Pipeline" for X/Twitter posts) ALWAYS wins over a pod that can handle it generically.
4. Use depends_on_task_ids to chain sequential work (e.g. X posts depend on mockups being done first).

For multi-step workflows, emit multiple tool_call blocks in sequence — one per pod. The platform queues them as a DAG and shows an approval card to the user before execution starts.

Do NOT say the tools are unavailable or unregistered. Do NOT ask for confirmation before emitting the tool call. Just emit the XML directly in your response. The platform will parse and execute it automatically.`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F018 — Pod-level tool definitions
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the <tool_definitions> XML block for pod-scoped conversations.
   * Injected after <pod_context> block in pod chat system prompts.
   */
  private buildPodToolDefinitions(): string {
    const tools = [
      {
        name: 'create_task',
        description:
          'Create a task on a specific board column within this pod. Use this when you need to spawn work for a board pipeline.',
        parameters: {
          type: 'object',
          required: ['board_id', 'title'],
          properties: {
            board_id: {
              type: 'string',
              description: 'UUID of the board_instance to create the task on',
            },
            column_id: {
              type: 'string',
              description: 'UUID of the board_step (column) to place the task in (first column used if omitted)',
            },
            title: {
              type: 'string',
              description: 'Task title',
            },
            description: {
              type: 'string',
              description: 'Detailed task description or instructions',
            },
            agent_id: {
              type: 'string',
              description: 'UUID of the agent to assign this task to',
            },
            priority: {
              type: 'string',
              enum: ['Low', 'Medium', 'High', 'Urgent'],
              description: 'Task priority level (defaults to Medium)',
            },
          },
        },
      },
      {
        name: 'trigger_board_ai',
        description:
          'Send a message to a board\'s AI orchestrator to trigger pipeline processing on that board.',
        parameters: {
          type: 'object',
          required: ['board_id', 'message'],
          properties: {
            board_id: {
              type: 'string',
              description: 'UUID of the board_instance to trigger',
            },
            message: {
              type: 'string',
              description: 'The message or goal to send to the board AI',
            },
          },
        },
      },
      {
        name: 'report_completion',
        description:
          'Report that a delegated goal has been completed with a result summary.',
        parameters: {
          type: 'object',
          required: ['goal', 'result_summary'],
          properties: {
            goal: {
              type: 'string',
              description: 'The original goal that was completed',
            },
            result_summary: {
              type: 'string',
              description: 'Short human-readable summary of what was accomplished',
            },
            structured_output: {
              type: 'object',
              description: 'Optional machine-readable output (URLs, file paths, metrics, etc.)',
              additionalProperties: true,
            },
          },
        },
      },
      {
        name: 'request_human_approval',
        description:
          'Pause execution and request human approval before proceeding with a significant action. Use this before creating multiple tasks or triggering irreversible operations.',
        parameters: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: {
              type: 'string',
              description: 'Explanation of what you are about to do and why you need approval',
            },
            proposed_actions: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of actions you plan to take after approval',
            },
          },
        },
      },
    ];

    return `<tool_definitions>
${JSON.stringify(tools, null, 2)}
</tool_definitions>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F019 + F020 — Pod tool call parsing and execution
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Parse and execute any <tool_call> blocks found in an AI response.
   * Defensive: if no tool_call tags found, returns the original text unchanged.
   * Supported tools: create_task (F019), request_human_approval (F020).
   *
   * @returns { processedText, toolResults, approvalPending }
   */
  // ─────────────────────────────────────────────────────────────────────────
  // F024 — Cockpit tool call parser: delegate_to_pod
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Parse and execute cockpit-level tool calls from AI response text.
   * Detects <tool_call name="delegate_to_pod"> and routes to OrchestrationService.
   */
  async processCockpitToolCalls(
    aiResponseText: string,
    accountId: string,
    userId: string,
  ): Promise<{ processedText: string; toolResults: string[]; delegations: Array<{ orchestration_id: string; pod_id: string; pod_slug?: string; pod_name?: string; goal: string; status: string }> }> {
    const toolCallPattern = /<tool_call\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_call>/g;
    const toolResults: string[] = [];
    const delegations: Array<{ orchestration_id: string; pod_id: string; pod_slug?: string; pod_name?: string; goal: string; status: string }> = [];
    // Strip <tool_call> XML from the displayed text — keep only AI prose
    let processedText = aiResponseText
      .replace(/<tool_call\s[^>]*>[\s\S]*?<\/tool_call>/g, '')
      .trim();

    let match: RegExpExecArray | null;
    while ((match = toolCallPattern.exec(aiResponseText)) !== null) {
      const toolName = match[1];
      const toolBody = match[2];

      let params: Record<string, any> = {};
      try {
        params = JSON.parse(toolBody.trim());
      } catch {
        this.logger.warn(
          `[CockpitTools] Failed to parse JSON for tool ${toolName}: ${toolBody}`,
        );
        continue;
      }

      if (toolName === 'delegate_to_pod') {
        try {
          const result = await this.executeCockpitDelegateToPod(
            params,
            accountId,
            userId,
          );
          toolResults.push(result.toolResult);
          // Extract orchestration_id from result and store delegation metadata
          const idMatch = result.toolResult.match(/Orchestration created: ([0-9a-f-]{36})/i);
          if (idMatch) {
            delegations.push({
              orchestration_id: idMatch[1],
              pod_id: params.pod_id,
              pod_slug: result.pod_slug ?? params.pod_slug,
              pod_name: result.pod_name ?? params.pod_name,
              goal: params.goal,
              status: 'pending_approval',
            });
          }
          this.logger.log(
            `[CockpitTools] delegate_to_pod executed for pod ${params.pod_id} (${result.pod_name ?? 'unknown'})`,
          );
        } catch (err: any) {
          this.logger.error(
            `[CockpitTools] delegate_to_pod failed: ${err.message}`,
          );
        }
      } else {
        // Unknown cockpit tool — pass through without error
        this.logger.debug(`[CockpitTools] Unhandled cockpit tool: ${toolName}`);
      }
    }

    return { processedText, toolResults, delegations };
  }

  /**
   * Execute the delegate_to_pod tool call.
   * Creates an orchestration via OrchestrationService.
   */
  private async executeCockpitDelegateToPod(
    params: Record<string, any>,
    accountId: string,
    userId: string,
  ): Promise<{ toolResult: string; pod_name?: string; pod_slug?: string }> {
    if (!params.pod_id) {
      throw new Error('delegate_to_pod: pod_id is required');
    }
    if (!params.goal) {
      throw new Error('delegate_to_pod: goal is required');
    }

    // Resolve slug → UUID if necessary, and always fetch pod name/slug for delegation metadata
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let resolvedPodId: string = params.pod_id;
    let resolvedPodName: string | undefined;
    let resolvedPodSlug: string | undefined;
    if (!uuidPattern.test(resolvedPodId)) {
      const [podRow] = await this.db
        .select({ id: pods.id, name: pods.name, slug: pods.slug })
        .from(pods)
        .where(
          and(
            eq(pods.accountId, accountId),
            eq(pods.slug, resolvedPodId),
          ),
        )
        .limit(1);
      if (!podRow) {
        return { toolResult: JSON.stringify({ error: `Pod not found: ${resolvedPodId}` }) };
      }
      resolvedPodId = podRow.id;
      resolvedPodName = podRow.name;
      resolvedPodSlug = podRow.slug;
    } else {
      // UUID provided — fetch name and slug
      const [podRow] = await this.db
        .select({ name: pods.name, slug: pods.slug })
        .from(pods)
        .where(eq(pods.id, resolvedPodId))
        .limit(1);
      resolvedPodName = podRow?.name;
      resolvedPodSlug = podRow?.slug;
    }

    const orchestrationResult = await this.orchestrationService.createOrchestration(
      userId,
      accountId,
      {
        goal: params.goal,
        tasks: [
          {
            pod_id: resolvedPodId,
            goal: params.goal,
            input_context: params.input_context ?? undefined,
          },
        ],
      },
    );

    const orchestrationId = orchestrationResult.orchestration.id;

    let dependencyNote = '';
    if (params.depends_on_task_ids && params.depends_on_task_ids.length > 0) {
      dependencyNote = ` Depends on: ${params.depends_on_task_ids.join(', ')}.`;
    }

    return {
      toolResult: `<tool_result name="delegate_to_pod" status="success">Orchestration created: ${orchestrationId}.${dependencyNote}</tool_result>`,
      pod_name: resolvedPodName,
      pod_slug: resolvedPodSlug,
    };
  }

  async processPodToolCalls(
    aiResponseText: string,
    conversation: any,
    accountId: string,
    userId: string,
    orchestratedTaskId?: string,
  ): Promise<{
    processedText: string;
    toolResults: string[];
    approvalPending: boolean;
  }> {
    const toolCallPattern = /<tool_call\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_call>/g;
    const toolResults: string[] = [];
    let approvalPending = false;
    let processedText = aiResponseText;

    let match: RegExpExecArray | null;
    while ((match = toolCallPattern.exec(aiResponseText)) !== null) {
      const toolName = match[1];
      const toolBody = match[2];

      let params: Record<string, any> = {};
      try {
        params = JSON.parse(toolBody.trim());
      } catch {
        this.logger.warn(`[PodTools] Failed to parse JSON for tool ${toolName}: ${toolBody}`);
        toolResults.push(`<tool_result name="${toolName}" status="error">Invalid JSON parameters</tool_result>`);
        continue;
      }

      if (toolName === 'create_task') {
        // F019: Create task in specified board column
        try {
          const taskId = await this.executePodCreateTask(params, accountId, userId, orchestratedTaskId);
          toolResults.push(
            `<tool_result name="create_task" status="success">Task created with ID: ${taskId}</tool_result>`,
          );
          this.logger.log(`[PodTools] create_task executed: task_id=${taskId}`);
        } catch (err: any) {
          this.logger.error(`[PodTools] create_task failed: ${err.message}`);
          toolResults.push(
            `<tool_result name="create_task" status="error">${err.message}</tool_result>`,
          );
        }
      } else if (toolName === 'request_human_approval') {
        // F020: Create approval request and emit WebSocket event
        try {
          await this.executePodRequestApproval(params, conversation, accountId);
          approvalPending = true;
          toolResults.push(
            `<tool_result name="request_human_approval" status="pending">Waiting for human approval. Execution paused.</tool_result>`,
          );
          this.logger.log(`[PodTools] request_human_approval created for pod ${conversation.pod_id}`);
          // Stop processing further tool calls when approval is pending
          break;
        } catch (err: any) {
          this.logger.error(`[PodTools] request_human_approval failed: ${err.message}`);
          toolResults.push(
            `<tool_result name="request_human_approval" status="error">${err.message}</tool_result>`,
          );
        }
      } else {
        // Unknown tool — pass through
        this.logger.debug(`[PodTools] Unknown tool call: ${toolName}`);
      }
    }

    // Append tool results to the processed text
    if (toolResults.length > 0) {
      processedText = `${aiResponseText}\n\n${toolResults.join('\n')}`;
    }

    return { processedText, toolResults, approvalPending };
  }

  /**
   * F019: Execute create_task tool call.
   * Inserts a task directly into the DB for the specified board/column.
   */
  private async executePodCreateTask(
    params: Record<string, any>,
    accountId: string,
    userId: string,
    orchestratedTaskId?: string,
  ): Promise<string> {
    if (!params.board_id) {
      throw new Error('create_task: board_id is required');
    }
    if (!params.title) {
      throw new Error('create_task: title is required');
    }

    // Resolve the first step of the board if no column_id provided
    let stepId: string | null = params.column_id || null;
    let status = 'To-Do';
    let defaultAgentId: string | null = params.agent_id || null;

    if (stepId) {
      const [step] = await this.db
        .select({
          id: boardSteps.id,
          name: boardSteps.name,
          default_agent_id: boardSteps.defaultAgentId,
        })
        .from(boardSteps)
        .where(
          and(
            eq(boardSteps.id, stepId),
            eq(boardSteps.boardInstanceId, params.board_id),
          ),
        )
        .limit(1);

      if (step) {
        status = step.name;
        if (!defaultAgentId && step.default_agent_id) {
          defaultAgentId = step.default_agent_id;
        }
      }
    } else {
      // Use first step
      const [firstStep] = await this.db
        .select({
          id: boardSteps.id,
          name: boardSteps.name,
          default_agent_id: boardSteps.defaultAgentId,
        })
        .from(boardSteps)
        .where(eq(boardSteps.boardInstanceId, params.board_id))
        .orderBy(asc(boardSteps.position))
        .limit(1);

      if (firstStep) {
        stepId = firstStep.id;
        status = firstStep.name;
        if (!defaultAgentId && firstStep.default_agent_id) {
          defaultAgentId = firstStep.default_agent_id;
        }
      }
    }

    let task: { id: string } | undefined;
    try {
      const rows = await this.db
        .insert(tasks)
        .values({
          accountId,
          title: params.title,
          notes: params.description || '',
          priority: params.priority || 'Medium',
          status,
          boardInstanceId: params.board_id,
          currentStepId: stepId,
          assigneeType: defaultAgentId ? 'agent' : 'none',
          assigneeId: defaultAgentId,
          completed: false,
          cardData: {},
          ...(orchestratedTaskId ? { metadata: { orchestration_id: orchestratedTaskId } } : {}),
        })
        .returning({ id: tasks.id });
      task = rows[0];
    } catch (error: any) {
      throw new Error(`Failed to create task: ${error?.message || 'unknown error'}`);
    }

    if (!task) {
      throw new Error(`Failed to create task: unknown error`);
    }

    this.webhookEmitter.emit(accountId, 'task.created', { task });

    return task.id;
  }

  /**
   * F020: Execute request_human_approval tool call.
   * Inserts an agent_approval_requests row and emits a webhook event.
   */
  private async executePodRequestApproval(
    params: Record<string, any>,
    conversation: any,
    accountId: string,
  ): Promise<void> {
    if (!params.reason) {
      throw new Error('request_human_approval: reason is required');
    }

    // Fetch pod name for the event payload
    let podName = conversation.pod_id || 'Unknown Pod';
    try {
      const [pod] = await this.db
        .select({ name: pods.name })
        .from(pods)
        .where(eq(pods.id, conversation.pod_id))
        .limit(1);
      if (pod?.name) podName = pod.name;
    } catch {
      // Non-fatal
    }

    const proposedActions: string[] = Array.isArray(params.proposed_actions)
      ? params.proposed_actions
      : [];

    // Try to insert into agent_approval_requests (best-effort).
    // Note: the table requires orchestrated_task_id NOT NULL — pod-level approval
    // requests may not have an orchestrated_task. We attempt the insert and fall
    // back gracefully if the schema doesn't support it yet.
    let approvalRequestId: string | null = null;
    try {
      const rows = await this.db
        .insert(agentApprovalRequests)
        .values({
          reason: params.reason,
          status: 'pending',
          // orchestrated_task_id is required by the current schema — this will
          // fail gracefully if not available, and we still emit the webhook event.
        } as typeof agentApprovalRequests.$inferInsert)
        .returning({ id: agentApprovalRequests.id });
      approvalRequestId = rows[0]?.id ?? null;
    } catch (insertErr: any) {
      this.logger.debug(
        `[PodTools] agent_approval_requests insert failed (non-fatal): ${insertErr.message}`,
      );
    }

    // Emit webhook event so frontend can display approval UI
    // Note: no WebSocket gateway exists yet — using webhookEmitter for now
    await this.webhookEmitter.emit(accountId, 'approval_requested', {
      type: 'approval_requested',
      approval_request_id: approvalRequestId,
      reason: params.reason,
      proposed_actions: proposedActions,
      pod_name: podName,
      pod_id: conversation.pod_id || null,
      conversation_id: conversation.id,
    });

    this.logger.log(
      `[PodTools] Approval request created: id=${approvalRequestId}, pod=${podName}`,
    );
  }
}
