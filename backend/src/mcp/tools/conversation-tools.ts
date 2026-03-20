import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get, post } from '../api-client.js';

export function registerConversationTools(server: McpServer) {
  server.tool(
    'list_conversations',
    'List conversations with pagination. Optionally filter by task or board.',
    {
      page: z.number().optional().describe('Page number (default 1)'),
      limit: z.number().optional().describe('Items per page (default 20)'),
      task_id: z.string().optional().describe('Filter by task UUID'),
      board_id: z.string().optional().describe('Filter by board UUID'),
    },
    async ({ page, limit, task_id, board_id }) => {
      const params = new URLSearchParams();
      if (page !== undefined) params.set('page', String(page));
      if (limit !== undefined) params.set('limit', String(limit));
      if (task_id) params.set('task_id', task_id);
      if (board_id) params.set('board_id', board_id);
      const qs = params.toString();
      const result = await get(
        `/accounts/:accountId/conversations${qs ? `?${qs}` : ''}`,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_conversation',
    'Create a new conversation, optionally linked to a task or board.',
    {
      title: z.string().optional().describe('Conversation title'),
      task_id: z.string().optional().describe('Task UUID to link to'),
      board_id: z.string().optional().describe('Board UUID to link to'),
      skill_id: z.string().optional().describe('Skill UUID to use'),
    },
    async (args) => {
      const result = await post('/accounts/:accountId/conversations', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'send_message',
    'Send a message to a conversation and get the AI response.',
    {
      conversation_id: z.string().describe('The UUID of the conversation'),
      message: z.string().describe('The message text to send'),
    },
    async ({ conversation_id, message }) => {
      const result = await post(
        `/accounts/:accountId/conversations/${conversation_id}/messages`,
        { message },
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
