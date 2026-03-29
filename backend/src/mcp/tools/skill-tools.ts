import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get } from '../api-client.js';

export function registerSkillTools(server: McpServer) {
  server.tool(
    'list_skills',
    'List available skills/agents in the account.',
    {
      active_only: z.boolean().optional().describe('Only return active skills'),
      skill_type: z.string().optional().describe('Filter by skill type'),
      include_system: z.boolean().optional().describe('Include system skills'),
    },
    async ({ active_only, skill_type, include_system }) => {
      const params = new URLSearchParams();
      if (active_only !== undefined)
        params.set('active_only', String(active_only));
      if (skill_type) params.set('skill_type', skill_type);
      if (include_system !== undefined)
        params.set('include_system', String(include_system));
      const qs = params.toString();
      const result = await get(
        `/accounts/:accountId/skills${qs ? `?${qs}` : ''}`,
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'list_categories',
    'List agent categories in the account.',
    {},
    async () => {
      const result = await get('/accounts/:accountId/categories');
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'list_knowledge_docs',
    'List knowledge documents in the account.',
    {
      category_id: z.string().optional().describe('Filter by category UUID'),
    },
    async ({ category_id }) => {
      const params = new URLSearchParams();
      if (category_id) params.set('category_id', category_id);
      const qs = params.toString();
      const result = await get(
        `/accounts/:accountId/knowledge${qs ? `?${qs}` : ''}`,
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
