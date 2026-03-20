# MCP Server

> Status: Production-ready
> Stack: Model Context Protocol SDK, Node.js, stdio transport
> Related Docs: [Architecture](./architecture.md), [Authentication](./documentation/authentication-authorization.md), [Development](./development.md)

## Overview & Key Concepts

The TaskClaw MCP Server is a **standalone Node.js process** that provides AI agents (like Claude Code, Cursor, and Windsurf) with programmatic access to the TaskClaw API through the Model Context Protocol (MCP). It exposes 27 tools that agents can call to manage boards, tasks, conversations, skills, integrations, and more — all without leaving their development environment.

### What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open standard developed by Anthropic that allows AI assistants to connect with external tools and data sources through a standardized interface. MCP servers communicate via stdio (standard input/output), making them portable across different AI platforms.

### Why MCP for TaskClaw?

TaskClaw's vision is **"One Backend, Two Front Doors"** — humans use the web UI, agents use the API. The MCP server is the agent front door, providing:

- **Discoverability**: Agents can explore TaskClaw's capabilities without reading API docs
- **Type Safety**: Tools define schemas that agents understand automatically
- **Persistent Access**: Configure once in your IDE, use across all sessions
- **Workflow Integration**: Create tasks, manage boards, and chat with the AI assistant directly from Claude Code or Cursor

### How It Fits in TaskClaw Architecture

```
┌────────────────────────────────────────────────────────┐
│                   AI Agent (Claude Code)               │
│                 Cursor, Windsurf, etc.                 │
└─────────────────────┬──────────────────────────────────┘
                      │ stdio (MCP Protocol)
                      ▼
┌────────────────────────────────────────────────────────┐
│              TaskClaw MCP Server (Node.js)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Board   │ │   Task   │ │   Chat   │ │  Skill   │  │
│  │  Tools   │ │  Tools   │ │  Tools   │ │  Tools   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │  Step    │ │ Integrate│ │ Account  │               │
│  │  Tools   │ │  Tools   │ │  Tools   │               │
│  └──────────┘ └──────────┘ └──────────┘               │
└─────────────────────┬──────────────────────────────────┘
                      │ HTTP (REST API)
                      ▼
┌────────────────────────────────────────────────────────┐
│                TaskClaw Backend (NestJS)               │
│               http://localhost:3003                    │
└─────────────────────┬──────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL + Auth)              │
└────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- **Node.js 20+** installed
- **Running TaskClaw instance** (local or remote)
- **User account** with credentials OR **API key**

### Step 1: Build the MCP Server

```bash
cd backend
npm run build:mcp
```

This compiles the MCP server entry point to `backend/dist/mcp-entry.js`.

### Step 2: Configure in Your IDE

#### Claude Code

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "taskclaw": {
      "command": "node",
      "args": ["/absolute/path/to/taskclaw/backend/dist/mcp-entry.js"],
      "env": {
        "TASKCLAW_API_URL": "http://localhost:3003",
        "TASKCLAW_EMAIL": "your-email@example.com",
        "TASKCLAW_PASSWORD": "your-password"
      }
    }
  }
}
```

**Or with API key (recommended for agents):**

```json
{
  "mcpServers": {
    "taskclaw": {
      "command": "node",
      "args": ["/absolute/path/to/taskclaw/backend/dist/mcp-entry.js"],
      "env": {
        "TASKCLAW_API_URL": "http://localhost:3003",
        "TASKCLAW_API_KEY": "tc_live_xxxxxxxxxxxxx"
      }
    }
  }
}
```

**Important**: Replace `/absolute/path/to/taskclaw/` with your actual project path.

#### Cursor

Add to Cursor settings (File > Preferences > MCP):

```json
{
  "taskclaw": {
    "command": "node",
    "args": ["/absolute/path/to/taskclaw/backend/dist/mcp-entry.js"],
    "env": {
      "TASKCLAW_API_URL": "http://localhost:3003",
      "TASKCLAW_API_KEY": "tc_live_xxxxxxxxxxxxx"
    }
  }
}
```

#### Windsurf

Add to Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "taskclaw": {
      "command": "node",
      "args": ["/absolute/path/to/taskclaw/backend/dist/mcp-entry.js"],
      "env": {
        "TASKCLAW_API_URL": "http://localhost:3003",
        "TASKCLAW_API_KEY": "tc_live_xxxxxxxxxxxxx"
      }
    }
  }
}
```

### Step 3: Verify Installation

Restart your IDE and try calling a tool:

```
@mcp taskclaw list_boards
```

If configured correctly, you'll see a list of your TaskClaw boards.

---

## Authentication

The MCP server supports two authentication methods.

### Method 1: Email/Password (JWT)

**Best for**: Personal use, interactive sessions

Set these environment variables:

```bash
TASKCLAW_EMAIL=your-email@example.com
TASKCLAW_PASSWORD=your-password
```

The MCP server will:

1. Call `POST /auth/login` on startup
2. Store the JWT access token
3. Auto-refresh the token before expiry
4. Use the token in all API requests: `Authorization: Bearer <token>`

**Pros**: Simple setup
**Cons**: Stores password in config, token expires

### Method 2: API Key (Recommended)

**Best for**: Agents, CI/CD, production use

Set this environment variable:

```bash
TASKCLAW_API_KEY=tc_live_xxxxxxxxxxxxx
```

The MCP server will use the API key directly in all requests: `Authorization: Bearer tc_live_xxxxxxxxxxxxx` or `X-API-Key: tc_live_xxxxxxxxxxxxx`.

**Pros**: No password storage, no expiry, scoped permissions
**Cons**: Requires creating a key first

#### Creating an API Key

1. Log in to TaskClaw web UI
2. Go to **Settings > API Keys**
3. Click **Create API Key**
4. Enter a name (e.g., "Claude Code MCP")
5. Select scopes (for full access, select all)
6. Click **Create**
7. **Copy the key immediately** (it's only shown once)
8. Paste it into your MCP config as `TASKCLAW_API_KEY`

See [Authentication & Authorization](./documentation/authentication-authorization.md#api-key-authentication) for full API key documentation.

---

## Tool Reference

The MCP server exposes **27 tools** across 7 categories:

### Board Tools (7 tools)

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `list_boards` | List all boards | `account_id` (string, required) | Array of boards |
| `get_board` | Get board details with steps | `account_id` (string, required)<br>`board_id` (string, required) | Board object with steps |
| `create_board` | Create a new board | `account_id` (string, required)<br>`name` (string, required)<br>`description` (string, optional) | Created board |
| `update_board` | Update board properties | `account_id` (string, required)<br>`board_id` (string, required)<br>`name` (string, optional)<br>`description` (string, optional) | Updated board |
| `delete_board` | Delete a board | `account_id` (string, required)<br>`board_id` (string, required) | Success confirmation |
| `import_board` | Import board from manifest JSON | `account_id` (string, required)<br>`manifest` (object, required) | Imported board |
| `export_board` | Export board as manifest | `account_id` (string, required)<br>`board_id` (string, required) | Manifest JSON |

**Example: List boards**

Request:
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Response:
```json
{
  "boards": [
    {
      "id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Development Tasks",
      "description": "Engineering work queue",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

**Example: Create board**

Request:
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Q1 Roadmap",
  "description": "Product roadmap for Q1 2025"
}
```

Response:
```json
{
  "id": "new-board-id",
  "name": "Q1 Roadmap",
  "description": "Product roadmap for Q1 2025",
  "created_at": "2025-01-15T10:00:00Z"
}
```

### Board Step Tools (4 tools)

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `list_board_steps` | List columns/steps in a board | `account_id` (string, required)<br>`board_id` (string, required) | Array of steps |
| `create_board_step` | Add a step to board | `account_id` (string, required)<br>`board_id` (string, required)<br>`name` (string, required)<br>`position` (number, optional) | Created step |
| `update_board_step` | Update step config | `account_id` (string, required)<br>`board_id` (string, required)<br>`step_id` (string, required)<br>`name` (string, optional)<br>`config` (object, optional) | Updated step |
| `reorder_steps` | Reorder columns | `account_id` (string, required)<br>`board_id` (string, required)<br>`step_ids` (array of strings, required) | Success confirmation |

**Example: List board steps**

Request:
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000",
  "board_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

Response:
```json
{
  "steps": [
    {
      "id": "step-1",
      "name": "Backlog",
      "position": 0
    },
    {
      "id": "step-2",
      "name": "In Progress",
      "position": 1
    },
    {
      "id": "step-3",
      "name": "Done",
      "position": 2
    }
  ]
}
```

### Task Tools (8 tools)

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `list_tasks` | List tasks with filters | `account_id` (string, required)<br>`board_id` (string, optional)<br>`step_id` (string, optional)<br>`status` (string, optional) | Array of tasks |
| `get_task` | Get task details + content | `account_id` (string, required)<br>`task_id` (string, required) | Task object |
| `create_task` | Create a task | `account_id` (string, required)<br>`title` (string, required)<br>`board_id` (string, required)<br>`step_id` (string, optional)<br>`description` (string, optional)<br>`priority` (string, optional) | Created task |
| `update_task` | Update task fields | `account_id` (string, required)<br>`task_id` (string, required)<br>`title` (string, optional)<br>`description` (string, optional)<br>`priority` (string, optional) | Updated task |
| `move_task` | Move task to different step | `account_id` (string, required)<br>`task_id` (string, required)<br>`step_id` (string, required) | Updated task |
| `complete_task` | Mark task completed | `account_id` (string, required)<br>`task_id` (string, required) | Updated task |
| `delete_task` | Delete a task | `account_id` (string, required)<br>`task_id` (string, required) | Success confirmation |
| `bulk_create_tasks` | Create multiple tasks | `account_id` (string, required)<br>`board_id` (string, required)<br>`tasks` (array of objects, required) | Array of created tasks |

**Example: Create task**

Request:
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Fix authentication bug",
  "board_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "step_id": "step-2",
  "description": "Users can't log in with GitHub OAuth",
  "priority": "high"
}
```

Response:
```json
{
  "id": "task-123",
  "title": "Fix authentication bug",
  "description": "Users can't log in with GitHub OAuth",
  "priority": "high",
  "board_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "step_id": "step-2",
  "created_at": "2025-01-15T10:00:00Z"
}
```

**Example: Bulk create tasks**

Request:
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000",
  "board_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "tasks": [
    {
      "title": "Design login page",
      "priority": "medium"
    },
    {
      "title": "Write unit tests",
      "priority": "low"
    }
  ]
}
```

Response:
```json
{
  "tasks": [
    { "id": "task-124", "title": "Design login page", "priority": "medium" },
    { "id": "task-125", "title": "Write unit tests", "priority": "low" }
  ]
}
```

### Conversation Tools (3 tools)

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `list_conversations` | List conversations | `account_id` (string, required)<br>`task_id` (string, optional) | Array of conversations |
| `create_conversation` | Start a conversation | `account_id` (string, required)<br>`task_id` (string, optional)<br>`title` (string, optional) | Created conversation |
| `send_message` | Send message & get AI response | `account_id` (string, required)<br>`conversation_id` (string, required)<br>`message` (string, required) | AI response message |

**Example: Create conversation and send message**

Request (create conversation):
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000",
  "task_id": "task-123",
  "title": "Debug OAuth issue"
}
```

Response:
```json
{
  "id": "conv-456",
  "title": "Debug OAuth issue",
  "task_id": "task-123",
  "created_at": "2025-01-15T10:00:00Z"
}
```

Request (send message):
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000",
  "conversation_id": "conv-456",
  "message": "What could cause GitHub OAuth to fail?"
}
```

Response:
```json
{
  "id": "msg-789",
  "role": "assistant",
  "content": "GitHub OAuth failures can be caused by:\n1. Incorrect OAuth callback URL...",
  "created_at": "2025-01-15T10:01:00Z"
}
```

### Skill & Knowledge Tools (3 tools)

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `list_skills` | List available skills | `account_id` (string, required) | Array of skills |
| `list_categories` | List agent categories | `account_id` (string, required) | Array of categories |
| `list_knowledge_docs` | List knowledge documents | `account_id` (string, required) | Array of knowledge docs |

**Example: List skills**

Request:
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Response:
```json
{
  "skills": [
    {
      "id": "skill-1",
      "name": "Code Review",
      "description": "Review code for bugs and best practices",
      "category_id": "cat-1"
    }
  ]
}
```

### Integration Tools (2 tools)

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `list_integrations` | List integration definitions | `account_id` (string, required) | Array of integrations |
| `trigger_sync` | Trigger source sync | `account_id` (string, required)<br>`source_id` (string, required) | Sync job status |

**Example: Trigger sync**

Request:
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000",
  "source_id": "source-123"
}
```

Response:
```json
{
  "job_id": "job-456",
  "status": "queued",
  "message": "Sync job queued successfully"
}
```

### Account Tools (2 tools)

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `get_account` | Get account details | `account_id` (string, required) | Account object |
| `list_members` | List team members | `account_id` (string, required) | Array of members |

**Example: Get account**

Request:
```json
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Acme Corp",
  "plan": "pro",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## Troubleshooting

### Error: "Connection refused" or "ECONNREFUSED"

**Cause**: MCP server can't reach the TaskClaw backend.

**Solution**:

1. Verify backend is running: `curl http://localhost:3003/health`
2. Check `TASKCLAW_API_URL` in MCP config matches your backend URL
3. If using Docker, ensure services are healthy (see [CLAUDE.md troubleshooting](/Users/macbook/Workspace/Devotts/taskclaw/CLAUDE.md))

### Error: "Invalid JWT" or "Authentication failed"

**Cause**: JWT expired or credentials incorrect.

**Solution**:

1. **Using email/password**: Verify credentials are correct
2. **Using API key**: Verify key is valid (check Settings > API Keys in UI)
3. Restart your IDE to force MCP server to re-authenticate

### Error: "Tool not found" or "Unknown tool"

**Cause**: IDE isn't detecting the MCP server or using an outdated build.

**Solution**:

1. Rebuild the MCP server: `cd backend && npm run build:mcp`
2. Verify `mcp-entry.js` exists at the path in your config
3. Restart your IDE
4. Check IDE logs for MCP connection errors

### Error: "Account ID required"

**Cause**: Most tools require an `account_id` parameter.

**Solution**:

1. Get your account ID: Call `get_account` without parameters (if supported) or check the UI URL
2. Pass `account_id` in every tool call
3. Consider storing it as a variable in your agent workflow

### MCP Server Logs

To debug issues, run the MCP server manually:

```bash
cd backend
node dist/mcp-entry.js
```

Set environment variables first:

```bash
export TASKCLAW_API_URL=http://localhost:3003
export TASKCLAW_API_KEY=tc_live_xxxxxxxxxxxxx
node dist/mcp-entry.js
```

The server will log to stdout. Look for:
- `[MCP] Server started` — successful startup
- `[MCP] Authenticated as <email>` — login successful
- `[MCP] Tool call: <tool_name>` — tool invocations
- `[MCP] Error: <message>` — errors

---

## IDE Setup Guides

### Claude Code

1. Open `~/.claude/mcp.json` in your editor
2. Add the TaskClaw MCP server config (see [Installation](#installation))
3. Save the file
4. Restart Claude Code
5. Verify by typing `@mcp taskclaw list_boards` in a conversation

**Tip**: You can also add the config via Claude Code UI: Settings > MCP > Add Server

### Cursor

1. Open Cursor settings: File > Preferences > Settings
2. Search for "MCP"
3. Click "Edit in settings.json"
4. Add the TaskClaw MCP server config under `mcp.servers`
5. Save and restart Cursor
6. Verify by invoking a TaskClaw tool in the AI chat

### Windsurf

1. Open Windsurf settings: File > Preferences > MCP
2. Click "Add Server"
3. Enter the TaskClaw MCP server config
4. Save and restart Windsurf
5. Verify by calling a tool in the Windsurf AI panel

---

## Best Practices

### 1. Use API Keys for Agents

Email/password authentication is convenient for testing, but **API keys are safer and more reliable** for production use:

- No password storage in config files
- Scoped permissions (limit access to specific resources)
- No token expiry (keys don't expire unless revoked)
- Easier to rotate (revoke old key, create new one)

### 2. Store Account ID as a Variable

Most tools require `account_id`. To avoid repeating it:

```
@mcp taskclaw get_account account_id=550e8400-e29b-41d4-a716-446655440000

# Store the ID in a variable (agent-specific syntax)
# Then reference it in subsequent calls
@mcp taskclaw list_boards account_id=$ACCOUNT_ID
```

### 3. Use `get_board` to Discover Step IDs

Before creating tasks, get the board details to see available steps:

```
@mcp taskclaw get_board account_id=... board_id=...
# Returns board with steps array
# Use step IDs when creating tasks
```

### 4. Combine Tools for Workflows

Build multi-step workflows:

```
1. list_boards → find the board ID
2. list_board_steps → get step IDs
3. create_task → create task in a specific step
4. create_conversation → start a conversation about the task
5. send_message → discuss the task with the AI
```

### 5. Handle Errors Gracefully

Tools return errors as JSON objects. Check for `error` field:

```json
{
  "error": "Board not found",
  "statusCode": 404
}
```

Agents should handle errors and retry with corrected parameters.

---

## Extension Guide

### Adding a New Tool

To add a new MCP tool:

1. **Create tool file**: `backend/src/mcp/tools/my-tool.ts`

```typescript
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const myTool: Tool = {
  name: 'my_tool',
  description: 'Description of what this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      account_id: { type: 'string', description: 'Account ID' },
      param1: { type: 'string', description: 'Parameter 1' },
    },
    required: ['account_id', 'param1'],
  },
};

export async function handleMyTool(args: any, httpClient: any) {
  const { account_id, param1 } = args;

  // Call TaskClaw API
  const response = await httpClient.get(`/accounts/${account_id}/my-endpoint`, {
    params: { param1 },
  });

  return response.data;
}
```

2. **Register tool**: Add to `backend/src/mcp/mcp-server.ts`

```typescript
import { myTool, handleMyTool } from './tools/my-tool.js';

// In tool registration
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'my_tool':
      return { content: [{ type: 'text', text: JSON.stringify(await handleMyTool(args, httpClient)) }] };
    // ... other tools
  }
});
```

3. **Rebuild**: `npm run build:mcp`

4. **Test**: Restart your IDE and call the new tool

---

## Related Documentation

- [Architecture](./architecture.md) — System architecture overview
- [Authentication & Authorization](./documentation/authentication-authorization.md) — JWT and API key auth
- [Development Guide](./development.md) — Local development setup
- [Webhooks](./documentation/webhooks.md) — Webhook event system

### External Resources

- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [Claude Code MCP Guide](https://docs.anthropic.com/claude-code/mcp)
