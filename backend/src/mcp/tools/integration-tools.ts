import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get, post } from '../api-client.js';

export function registerIntegrationTools(server: McpServer) {
  server.tool(
    'list_integrations',
    'List integration definitions available in the account.',
    {
      category: z
        .string()
        .optional()
        .describe('Filter by integration category'),
    },
    async ({ category }) => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      const qs = params.toString();
      const result = await get(
        `/accounts/:accountId/integrations/definitions${qs ? `?${qs}` : ''}`,
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'trigger_sync',
    'Trigger a sync for a specific source.',
    {
      source_id: z.string().describe('The UUID of the source to sync'),
    },
    async ({ source_id }) => {
      const result = await post(
        `/accounts/:accountId/sync/sources/${source_id}`,
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
