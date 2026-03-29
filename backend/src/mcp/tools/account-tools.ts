import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get, getAccountId } from '../api-client.js';

export function registerAccountTools(server: McpServer) {
  server.tool(
    'get_account',
    'Get details of the current account (the one configured for this MCP session).',
    {},
    async () => {
      const accountId = await getAccountId();
      const result = await get('/accounts');
      // The /accounts endpoint returns all user accounts; find the active one
      const accounts = result as Array<{ id: string }>;
      const account = accounts.find((a) => a.id === accountId) || accounts[0];
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(account, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'list_members',
    'List members of the current account.',
    {},
    async () => {
      // Members are typically part of account data or a sub-resource.
      // The accounts endpoint returns members, so we fetch the account.
      const result = await get('/accounts');
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
