#!/usr/bin/env node

/**
 * TaskClaw MCP Server — Standalone Entry Point
 *
 * This is a standalone Node.js process that communicates with the
 * TaskClaw backend via HTTP REST API. It uses the MCP stdio transport
 * so it can be used with Claude Code, Cursor, and other MCP clients.
 *
 * Environment variables:
 *   TASKCLAW_API_URL      - Backend URL (default: http://localhost:3003)
 *   TASKCLAW_EMAIL        - Login email (required unless using API key)
 *   TASKCLAW_PASSWORD     - Login password (required unless using API key)
 *   TASKCLAW_ACCOUNT_ID   - Account UUID (optional, uses first account if not set)
 *   TASKCLAW_API_KEY      - API key (optional, takes priority over email/password)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initialize } from './api-client.js';
import { createMcpServer } from './mcp-server.js';

async function main() {
  // Authenticate with TaskClaw API
  await initialize();

  // Create and start MCP server
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('TaskClaw MCP server failed to start:', err.message);
  process.exit(1);
});
