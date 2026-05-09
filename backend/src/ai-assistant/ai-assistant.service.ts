import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { EmbeddingService } from './services/embedding.service';
import { SYSTEM_PROMPT, PROMPTS } from './system-prompt';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { decrypt } from '../common/utils/encryption.util';
import { createElevenLabsTtsTool } from './tools/elevenlabs-tts.tool';
import { createElevenLabsCloneVoiceTool } from './tools/elevenlabs-clone-voice.tool';
import { createUploadToStorageTool } from './tools/upload-to-storage.tool';
import { createReplicatePredictTool } from './tools/replicate-predict.tool';
import { createReplicatePollTool } from './tools/replicate-poll.tool';
import { createQueryBoardTasksTool } from './tools/query-board-tasks.tool';

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private model: ChatOpenAI;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private supabaseAdmin: SupabaseAdminService,
    private embeddingService: EmbeddingService,
  ) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const modelName =
      this.configService.get<string>('AI_MODEL') || 'openai/gpt-4o-mini';

    if (!apiKey) {
      this.logger.warn(
        'OPENROUTER_API_KEY is not set. AI capabilities will be disabled.',
      );
    } else {
      this.logger.log(`AI Service initialized with model: ${modelName}`);
    }

    // Use ChatOpenAI compatibility for OpenRouter
    // Per @langchain/openai types: apiKey + configuration.baseURL
    this.model = new ChatOpenAI({
      model: modelName,
      temperature: 0.7,
      apiKey: apiKey,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://microlaunch.net',
          'X-Title': 'Microfactory Scaffold',
        },
      },
    });
  }

  async chat(
    message: string,
    history: any[] = [],
    user?: { id: string; email?: string; accountId?: string },
    conversationId?: string,
    systemPromptKey: string = 'default',
  ) {
    try {
      if (!this.configService.get<string>('OPENROUTER_API_KEY')) {
        return {
          response:
            'AI Assistant is not configured. Please set OPENROUTER_API_KEY.',
        };
      }

      const client = this.supabaseService.getAdminClient();
      let currentConversationId = conversationId;

      // 1. Create or Verify Conversation
      if (user?.id) {
        if (!currentConversationId) {
          const { data: conv, error } = await client
            .from('ai_conversations')
            .insert({
              user_id: user.id,
              title:
                message.substring(0, 50) + (message.length > 50 ? '...' : ''),
            })
            .select()
            .single();
          if (!error && conv) currentConversationId = conv.id;
        } else {
          // Verify ownership
          const { data: conv } = await client
            .from('ai_conversations')
            .select('id')
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
            .single();
          if (!conv) {
            // Fallback to new conversation if not found/owned
            currentConversationId = undefined;
            const { data: newConv } = await client
              .from('ai_conversations')
              .insert({
                user_id: user.id,
                title:
                  message.substring(0, 50) + (message.length > 50 ? '...' : ''),
              })
              .select()
              .single();
            if (newConv) currentConversationId = newConv.id;
          }
        }
      }

      // 2. Save User Message
      if (currentConversationId && user?.id) {
        await client.from('ai_messages').insert({
          conversation_id: currentConversationId,
          role: 'user',
          content: message,
        });
      }

      // 3. Prepare System Prompt
      const baseSystemPrompt = PROMPTS[systemPromptKey] || PROMPTS['default'];
      let systemContent = baseSystemPrompt;

      if (user && systemPromptKey === 'default') {
        systemContent += `\n\nCONTEXT:\nCurrent User ID: ${user.id}\nCurrent User Email: ${user.email || 'unknown'}
IMPORTANT: ALWAYS filter data by this User ID when joining tables (e.g., JOIN account_users au ON ... WHERE au.user_id = '${user.id}').
DO NOT use current_setting('my.user_id') or similar PostgreSQL session variables as they are not available. Use the explicit UUID provided above.`;
      }

      // 4. Define Tools
      const sqlTool = new DynamicStructuredTool({
        name: 'perform_sql_query',
        description: 'Execute a read-only SQL query against the database.',
        schema: z.object({
          query: z
            .string()
            .describe('The SQL query to execute. MUST be a SELECT statement.'),
        }),
        func: async ({ query }) => {
          this.logger.log(`Executing SQL: ${query}`);

          // Security check
          const cleanedQuery = query.trim().replace(/;+$/, '');
          if (!cleanedQuery.toLowerCase().startsWith('select')) {
            return 'Error: Only SELECT queries are allowed.';
          }

          try {
            // Use RPC for execution
            const client = this.supabaseService.getAdminClient();
            const { data, error } = await client.rpc('exec_sql', {
              query_text: cleanedQuery,
            });

            if (error) return `Error: ${error.message}`;
            return JSON.stringify(data);
          } catch (e: any) {
            return `Error: ${e.message}`;
          }
        },
      });

      const semanticSearchTool = new DynamicStructuredTool({
        name: 'semantic_search',
        description:
          "Search for projects, users, or AI conversation messages using natural language semantic search. Use this when the user asks for conceptual matches (e.g., 'find projects about authentication', 'search for conversations about billing').",
        schema: z.object({
          query: z.string().describe('The natural language search query'),
          entity_type: z
            .enum(['projects', 'users', 'messages'])
            .describe(
              "The type of entity to search: 'projects', 'users', or 'messages'",
            ),
          conversation_id: z
            .string()
            .optional()
            .describe(
              "For 'messages' search only: filter by specific conversation ID",
            ),
          limit: z
            .number()
            .optional()
            .default(10)
            .describe('Maximum number of results to return (default: 10)'),
        }),
        func: async ({ query, entity_type, conversation_id, limit = 10 }) => {
          this.logger.log(`Semantic search: ${entity_type} - "${query}"`);

          if (!this.embeddingService.isConfigured()) {
            return 'Error: Embedding service is not configured. Vector search is unavailable.';
          }

          try {
            // Generate embedding for the search query
            const queryEmbedding =
              await this.embeddingService.generateEmbedding(query);
            const client = this.supabaseService.getAdminClient();

            let result;

            if (entity_type === 'projects') {
              const { data, error } = await client.rpc(
                'search_projects_vector',
                {
                  query_embedding: JSON.stringify(queryEmbedding),
                  match_limit: limit,
                  similarity_threshold: 0.3,
                },
              );
              if (error) return `Error: ${error.message}`;
              result = data;
            } else if (entity_type === 'users') {
              const { data, error } = await client.rpc('search_users_vector', {
                query_embedding: JSON.stringify(queryEmbedding),
                match_limit: limit,
                similarity_threshold: 0.3,
              });
              if (error) return `Error: ${error.message}`;
              result = data;
            } else if (entity_type === 'messages') {
              const { data, error } = await client.rpc(
                'search_messages_vector',
                {
                  query_embedding: JSON.stringify(queryEmbedding),
                  conversation_id_filter: conversation_id || null,
                  match_limit: limit,
                  similarity_threshold: 0.3,
                },
              );
              if (error) return `Error: ${error.message}`;
              result = data;
            }

            if (!result || result.length === 0) {
              return `No ${entity_type} found matching "${query}". Try a different search term or use perform_sql_query for exact matches.`;
            }

            return JSON.stringify(result);
          } catch (e: any) {
            return `Error: ${e.message}`;
          }
        },
      });

      // 5. Load avatar tools if accountId is available
      const avatarTools = user?.accountId
        ? await this.getAvatarTools(user.accountId)
        : [];

      // 6. Create LangGraph Agent
      const tools = [sqlTool, semanticSearchTool, ...avatarTools];
      const agent = createReactAgent({
        llm: this.model,
        tools,
      });

      // 7. Convert History to LangChain Messages
      const langchainHistory = history.map((msg) => {
        if (msg.role === 'user') return new HumanMessage(msg.content);
        if (msg.role === 'assistant') return new AIMessage(msg.content);
        // Handle complex history if needed, but for now simple linear history is safer
        return new HumanMessage(msg.content);
      });

      const inputs = {
        messages: [
          new SystemMessage(systemContent),
          ...langchainHistory,
          new HumanMessage(message),
        ],
      };

      // 8. Run Agent
      // Using invoke to get the final state
      const result = await agent.invoke(inputs);
      const formattingMessages = result.messages;
      const lastMessage = formattingMessages[formattingMessages.length - 1];
      const responseContent =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);

      // 9. Save Agent Execution Steps (Optional but good for debugging/audit)
      // We'll iterate through new messages and save them to Supabase
      // Note: This is an approximation. LangGraph returns full history.
      // We really only want to save the *new* messages (tool calls, tool outputs, final answer).
      // But our current Supabase schema (ai_messages) is simple (role, content, tool_calls).

      // Simpler approach for now to match previous behavior:
      // Just save the final assistant response.
      // If you want to save tool calls, we'd need to inspect the 'messages' array from the result.

      if (currentConversationId) {
        // Find all new messages since our input
        // The input length was inputs.messages.length
        // actually agent.invoke returns ALL messages including system and input.

        // We want to save everything that happened AFTER the input history+message
        // inputs.messages length is: 1 (system) + history.length + 1 (user message) = history.length + 2
        const newMessages = result.messages.slice(inputs.messages.length);

        // Also save the USER message we already inserted? No, we inserted it manually at step 2.

        for (const msg of newMessages) {
          let role = 'assistant';
          let content = '';
          let tool_calls: any = null;
          let tool_call_id: string | null = null;

          if (msg instanceof AIMessage) {
            role = 'assistant';
            content =
              typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);
            if (msg.tool_calls && msg.tool_calls.length > 0) {
              tool_calls = msg.tool_calls;
            }
          } else if (msg instanceof ToolMessage) {
            role = 'tool';
            content =
              typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);
            tool_call_id = msg.tool_call_id;
          }

          // Only save if it's meaningful
          if (content || tool_calls) {
            const dbMsg: any = {
              conversation_id: currentConversationId,
              role,
              content: content || '', // Ensure content is string
            };
            if (tool_calls) dbMsg.tool_calls = tool_calls; // Supabase handles jsonb
            if (tool_call_id) dbMsg.tool_call_id = tool_call_id;

            await client.from('ai_messages').insert(dbMsg);
          }
        }
      }

      return {
        response: responseContent,
        conversationId: currentConversationId,
      };
    } catch (error) {
      this.logger.error('Error in chat:', error);
      return {
        response:
          'Sorry, I encountered an error while processing your request.',
      };
    }
  }

  private async getAvatarTools(accountId: string): Promise<DynamicStructuredTool[]> {
    const tools: DynamicStructuredTool[] = [];

    try {
      const client = this.supabaseAdmin.getClient();

      // Always include the board tasks query tool
      tools.push(createQueryBoardTasksTool(this.supabaseAdmin, accountId));

      // Resolve definition IDs for elevenlabs and replicate slugs
      const { data: defRows } = await client
        .from('integration_definitions')
        .select('id, slug')
        .in('slug', ['elevenlabs', 'replicate']);

      const defMap: Record<string, string> = {};
      for (const def of defRows ?? []) {
        defMap[def.slug] = def.id;
      }

      // Find ElevenLabs connection
      const elevenLabsDefId = defMap['elevenlabs'];
      let elevenLabsConn: { id: string } | null = null;
      if (elevenLabsDefId) {
        const { data: rows } = await client
          .from('integration_connections')
          .select('id')
          .eq('account_id', accountId)
          .eq('definition_id', elevenLabsDefId)
          .eq('status', 'active')
          .limit(1);
        elevenLabsConn = rows?.[0] ?? null;
      }

      // Find Replicate connection
      const replicateDefId = defMap['replicate'];
      let replicateConn: { id: string } | null = null;
      if (replicateDefId) {
        const { data: rows } = await client
          .from('integration_connections')
          .select('id')
          .eq('account_id', accountId)
          .eq('definition_id', replicateDefId)
          .eq('status', 'active')
          .limit(1);
        replicateConn = rows?.[0] ?? null;
      }

      if (elevenLabsConn) {
        const { data: connRow } = await client
          .from('integration_connections')
          .select('credentials')
          .eq('id', elevenLabsConn.id)
          .single();
        if (connRow?.credentials) {
          try {
            const creds = JSON.parse(decrypt(connRow.credentials));
            const apiKey = creds['api_key'] || creds['apiKey'] || '';
            if (apiKey) {
              tools.push(createElevenLabsTtsTool(apiKey));
              tools.push(createElevenLabsCloneVoiceTool(apiKey));
            }
          } catch (err: any) {
            this.logger.warn(`Failed to decrypt ElevenLabs credentials: ${err.message}`);
          }
        }
      }

      if (replicateConn) {
        const { data: connRow } = await client
          .from('integration_connections')
          .select('credentials')
          .eq('id', replicateConn.id)
          .single();
        if (connRow?.credentials) {
          try {
            const creds = JSON.parse(decrypt(connRow.credentials));
            const apiKey = creds['api_key'] || creds['apiKey'] || '';
            if (apiKey) {
              tools.push(createUploadToStorageTool(apiKey));
              tools.push(createReplicatePredictTool(apiKey));
              tools.push(createReplicatePollTool(apiKey));
            }
          } catch (err: any) {
            this.logger.warn(`Failed to decrypt Replicate credentials: ${err.message}`);
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`getAvatarTools failed for account ${accountId}: ${e.message}`);
    }

    return tools;
  }

  async getUserConversations(userId: string) {
    const client = this.supabaseService.getAdminClient();
    const { data } = await client
      .from('ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    return data || [];
  }

  async getConversationMessages(conversationId: string, userId: string) {
    const client = this.supabaseService.getAdminClient();

    // Check access: Owner OR Public
    const { data: conv, error } = await client
      .from('ai_conversations')
      .select('id, user_id, is_public')
      .eq('id', conversationId)
      .single();

    if (error || !conv) return [];

    // Allow if user owns it OR if it's public
    if (conv.user_id !== userId && !conv.is_public) {
      return [];
    }

    const { data } = await client
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    return data || [];
  }

  async deleteConversation(conversationId: string, userId: string) {
    const client = this.supabaseService.getAdminClient();
    const { error } = await client
      .from('ai_conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  async updateConversationTitle(
    conversationId: string,
    userId: string,
    title: string,
  ) {
    const client = this.supabaseService.getAdminClient();
    const { error } = await client
      .from('ai_conversations')
      .update({ title })
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  async updateConversationVisibility(
    conversationId: string,
    userId: string,
    isPublic: boolean,
  ) {
    const client = this.supabaseService.getAdminClient();
    const { error } = await client
      .from('ai_conversations')
      .update({ is_public: isPublic })
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { success: true, isPublic };
  }

  async deleteConversations(conversationIds: string[], userId: string) {
    const client = this.supabaseService.getAdminClient();
    const { error } = await client
      .from('ai_conversations')
      .delete()
      .in('id', conversationIds)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { success: true };
  }
}
