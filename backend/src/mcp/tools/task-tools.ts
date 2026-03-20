import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get, post, patch, del } from '../api-client.js';

export function registerTaskTools(server: McpServer) {
  server.tool(
    'list_tasks',
    'List tasks in the account with optional filters.',
    {
      board_id: z.string().optional().describe('Filter by board UUID'),
      category_id: z.string().optional().describe('Filter by category UUID'),
      source_id: z.string().optional().describe('Filter by source UUID'),
      status: z.string().optional().describe('Filter by status'),
      priority: z.string().optional().describe('Filter by priority (low, medium, high, urgent)'),
      completed: z.boolean().optional().describe('Filter by completion status'),
    },
    async (filters) => {
      const params = new URLSearchParams();
      if (filters.board_id) params.set('board_id', filters.board_id);
      if (filters.category_id) params.set('category_id', filters.category_id);
      if (filters.source_id) params.set('source_id', filters.source_id);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.completed !== undefined) params.set('completed', String(filters.completed));
      const qs = params.toString();
      const result = await get(`/accounts/:accountId/tasks${qs ? `?${qs}` : ''}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_task',
    'Get detailed information about a specific task.',
    {
      task_id: z.string().describe('The UUID of the task'),
    },
    async ({ task_id }) => {
      const result = await get(`/accounts/:accountId/tasks/${task_id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_task',
    'Create a new task.',
    {
      title: z.string().describe('Task title'),
      notes: z.string().optional().describe('Task notes/description'),
      priority: z
        .enum(['low', 'medium', 'high', 'urgent'])
        .optional()
        .describe('Task priority'),
      board_id: z.string().optional().describe('Board UUID to place the task on'),
      board_step_id: z.string().optional().describe('Board step UUID'),
      category_id: z.string().optional().describe('Category UUID'),
      due_date: z.string().optional().describe('Due date (ISO 8601)'),
    },
    async (args) => {
      const result = await post('/accounts/:accountId/tasks', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'update_task',
    'Update fields of an existing task.',
    {
      task_id: z.string().describe('The UUID of the task to update'),
      title: z.string().optional().describe('New title'),
      notes: z.string().optional().describe('New notes/description'),
      priority: z
        .enum(['low', 'medium', 'high', 'urgent'])
        .optional()
        .describe('New priority'),
      due_date: z.string().optional().describe('New due date (ISO 8601)'),
      category_id: z.string().optional().describe('New category UUID'),
    },
    async ({ task_id, ...updates }) => {
      const result = await patch(`/accounts/:accountId/tasks/${task_id}`, updates);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'move_task',
    'Move a task to a different board step (column).',
    {
      task_id: z.string().describe('The UUID of the task to move'),
      board_step_id: z.string().describe('Target board step UUID'),
    },
    async ({ task_id, board_step_id }) => {
      const result = await patch(`/accounts/:accountId/tasks/${task_id}`, {
        board_step_id,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'complete_task',
    'Mark a task as completed.',
    {
      task_id: z.string().describe('The UUID of the task to complete'),
    },
    async ({ task_id }) => {
      const result = await patch(`/accounts/:accountId/tasks/${task_id}`, {
        completed: true,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_task',
    'Delete a task permanently.',
    {
      task_id: z.string().describe('The UUID of the task to delete'),
    },
    async ({ task_id }) => {
      const result = await del(`/accounts/:accountId/tasks/${task_id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'bulk_create_tasks',
    'Create multiple tasks at once for a specific board.',
    {
      board_id: z.string().describe('The UUID of the board'),
      tasks: z
        .array(
          z.object({
            title: z.string().describe('Task title'),
            notes: z.string().optional().describe('Task notes'),
            priority: z
              .enum(['low', 'medium', 'high', 'urgent'])
              .optional()
              .describe('Task priority'),
            board_step_id: z.string().optional().describe('Board step UUID'),
          }),
        )
        .describe('Array of tasks to create'),
    },
    async ({ board_id, tasks }) => {
      const result = await post(`/accounts/:accountId/tasks/bulk/${board_id}`, {
        tasks,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
