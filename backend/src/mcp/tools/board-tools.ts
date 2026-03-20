import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get, post, patch, del } from '../api-client.js';

export function registerBoardTools(server: McpServer) {
  server.tool(
    'list_boards',
    'List all boards in the account. Optionally filter by archived or favorite status.',
    {
      archived: z.boolean().optional().describe('Filter by archived status'),
      favorite: z.boolean().optional().describe('Filter by favorite status'),
    },
    async ({ archived, favorite }) => {
      const params = new URLSearchParams();
      if (archived !== undefined) params.set('archived', String(archived));
      if (favorite !== undefined) params.set('favorite', String(favorite));
      const qs = params.toString();
      const result = await get(`/accounts/:accountId/boards${qs ? `?${qs}` : ''}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_board',
    'Get details of a specific board including its steps/columns.',
    {
      board_id: z.string().describe('The UUID of the board'),
    },
    async ({ board_id }) => {
      const result = await get(`/accounts/:accountId/boards/${board_id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'create_board',
    'Create a new board in the account.',
    {
      name: z.string().describe('Name of the board'),
      description: z.string().optional().describe('Board description'),
    },
    async (args) => {
      const result = await post('/accounts/:accountId/boards', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'update_board',
    'Update properties of an existing board.',
    {
      board_id: z.string().describe('The UUID of the board to update'),
      name: z.string().optional().describe('New board name'),
      description: z.string().optional().describe('New board description'),
      archived: z.boolean().optional().describe('Archive or unarchive the board'),
      favorite: z.boolean().optional().describe('Mark or unmark as favorite'),
    },
    async ({ board_id, ...updates }) => {
      const result = await patch(`/accounts/:accountId/boards/${board_id}`, updates);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_board',
    'Delete a board permanently.',
    {
      board_id: z.string().describe('The UUID of the board to delete'),
    },
    async ({ board_id }) => {
      const result = await del(`/accounts/:accountId/boards/${board_id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'import_board',
    'Import a board from a manifest JSON object.',
    {
      manifest: z.record(z.string(), z.unknown()).describe('The board manifest JSON to import'),
    },
    async ({ manifest }) => {
      const result = await post('/accounts/:accountId/boards/import', manifest);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'export_board',
    'Export a board as a manifest JSON object.',
    {
      board_id: z.string().describe('The UUID of the board to export'),
    },
    async ({ board_id }) => {
      const result = await get(`/accounts/:accountId/boards/${board_id}/export`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
