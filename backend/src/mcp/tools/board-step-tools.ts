import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get, post, patch, del } from '../api-client.js';

export function registerBoardStepTools(server: McpServer) {
  server.tool(
    'list_board_steps',
    'List all steps (columns) of a board.',
    {
      board_id: z.string().describe('The UUID of the board'),
    },
    async ({ board_id }) => {
      const result = await get(`/accounts/:accountId/boards/${board_id}/steps`);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'create_board_step',
    'Add a new step (column) to a board.',
    {
      board_id: z.string().describe('The UUID of the board'),
      name: z.string().describe('Name of the step'),
      position: z.number().optional().describe('Position index (0-based)'),
      color: z.string().optional().describe('Step color hex code'),
    },
    async ({ board_id, ...stepData }) => {
      const result = await post(
        `/accounts/:accountId/boards/${board_id}/steps`,
        stepData,
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'update_board_step',
    'Update a step (column) on a board.',
    {
      board_id: z.string().describe('The UUID of the board'),
      step_id: z.string().describe('The UUID of the step to update'),
      name: z.string().optional().describe('New step name'),
      color: z.string().optional().describe('New step color hex code'),
    },
    async ({ board_id, step_id, ...updates }) => {
      const result = await patch(
        `/accounts/:accountId/boards/${board_id}/steps/${step_id}`,
        updates,
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'reorder_steps',
    'Reorder the steps (columns) of a board.',
    {
      board_id: z.string().describe('The UUID of the board'),
      step_ids: z.array(z.string()).describe('Ordered array of step UUIDs'),
    },
    async ({ board_id, step_ids }) => {
      const result = await post(
        `/accounts/:accountId/boards/${board_id}/steps/reorder`,
        { step_ids },
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
