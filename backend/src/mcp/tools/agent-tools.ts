import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get, post, patch } from '../api-client.js';

export function registerAgentTools(server: McpServer) {
  server.tool(
    'list_agents',
    'List all agents in the workspace with their status and stats.',
    {
      status: z
        .enum(['idle', 'working', 'paused', 'error', 'offline'])
        .optional()
        .describe('Filter by agent status'),
      agent_type: z
        .enum(['worker', 'pilot', 'coordinator'])
        .optional()
        .describe('Filter by agent type'),
    },
    async (filters) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.agent_type) params.set('agent_type', filters.agent_type);
      const qs = params.toString();
      const result = await get(
        `/accounts/:accountId/agents${qs ? `?${qs}` : ''}`,
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'get_agent',
    'Get detailed information about a specific agent including stats and recent activity.',
    {
      agent_id: z.string().describe('The UUID of the agent'),
    },
    async ({ agent_id }) => {
      const result = await get(`/accounts/:accountId/agents/${agent_id}`);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'create_agent',
    'Create a new AI agent in the workspace.',
    {
      name: z.string().describe('Agent name (e.g. "Atlas", "Nova")'),
      description: z
        .string()
        .optional()
        .describe('Short description of the agent\'s role'),
      agent_type: z
        .enum(['worker', 'pilot', 'coordinator'])
        .optional()
        .describe('Agent type (default: worker)'),
      persona: z
        .string()
        .optional()
        .describe('System prompt / persona instructions for this agent'),
      color: z
        .string()
        .optional()
        .describe('Hex color for the agent avatar (e.g. #7C3AED)'),
      backbone_connection_id: z
        .string()
        .optional()
        .describe('UUID of the backbone connection to use for this agent'),
      model_override: z
        .string()
        .optional()
        .describe('Model override (e.g. claude-sonnet-4-6)'),
      max_concurrent_tasks: z
        .number()
        .optional()
        .describe('Max tasks the agent can process in parallel (default: 3)'),
    },
    async (body) => {
      const result = await post('/accounts/:accountId/agents', body);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'update_agent',
    'Update an agent\'s name, persona, backbone, or other properties.',
    {
      agent_id: z.string().describe('The UUID of the agent to update'),
      name: z.string().optional().describe('New name for the agent'),
      description: z.string().optional().describe('New description'),
      persona: z.string().optional().describe('New system prompt / persona'),
      status: z
        .enum(['idle', 'working', 'paused', 'error', 'offline'])
        .optional()
        .describe('New status'),
      backbone_connection_id: z
        .string()
        .optional()
        .describe('New backbone connection UUID'),
    },
    async ({ agent_id, ...body }) => {
      const result = await patch(`/accounts/:accountId/agents/${agent_id}`, body);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'assign_task_to_agent',
    'Assign a specific task to an agent.',
    {
      task_id: z.string().describe('The UUID of the task to assign'),
      agent_id: z.string().describe('The UUID of the agent to assign the task to'),
    },
    async ({ task_id, agent_id }) => {
      const result = await patch(`/accounts/:accountId/tasks/${task_id}`, {
        assignee_type: 'agent',
        assignee_id: agent_id,
      });
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'pause_agent',
    'Pause an agent (stops it from processing new tasks).',
    {
      agent_id: z.string().describe('The UUID of the agent to pause'),
    },
    async ({ agent_id }) => {
      const result = await post(
        `/accounts/:accountId/agents/${agent_id}/pause`,
        {},
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'resume_agent',
    'Resume a paused agent.',
    {
      agent_id: z.string().describe('The UUID of the agent to resume'),
    },
    async ({ agent_id }) => {
      const result = await post(
        `/accounts/:accountId/agents/${agent_id}/resume`,
        {},
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'get_agent_activity',
    'Get the recent activity feed for an agent.',
    {
      agent_id: z.string().describe('The UUID of the agent'),
      page: z.number().optional().describe('Page number (default: 1)'),
      limit: z.number().optional().describe('Items per page (default: 20)'),
    },
    async ({ agent_id, page, limit }) => {
      const params = new URLSearchParams();
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      const result = await get(
        `/accounts/:accountId/agents/${agent_id}/activity${qs ? `?${qs}` : ''}`,
      );
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
