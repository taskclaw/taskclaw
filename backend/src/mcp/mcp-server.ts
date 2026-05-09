import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBoardTools } from './tools/board-tools.js';
import { registerBoardStepTools } from './tools/board-step-tools.js';
import { registerTaskTools } from './tools/task-tools.js';
import { registerConversationTools } from './tools/conversation-tools.js';
import { registerSkillTools } from './tools/skill-tools.js';
import { registerIntegrationTools } from './tools/integration-tools.js';
import { registerAccountTools } from './tools/account-tools.js';
import { registerAgentTools } from './tools/agent-tools.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'TaskClaw',
    version: '1.0.0',
  });

  // Register all tool groups
  registerBoardTools(server);
  registerBoardStepTools(server);
  registerTaskTools(server);
  registerConversationTools(server);
  registerSkillTools(server);
  registerIntegrationTools(server);
  registerAccountTools(server);
  registerAgentTools(server); // F11: Agent CRUD MCP tools

  return server;
}
