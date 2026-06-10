<p align="center">
  <h1 align="center">TaskClaw</h1>
  <p align="center">
    Open-source AI-powered task management with Kanban, integrations, and team collaboration.
  </p>
</p>

<p align="center">
  <a href="./LICENSE.md"><img src="https://img.shields.io/badge/license-Sustainable%20Use-blue" alt="License" /></a>
  <a href="https://hub.docker.com/u/taskclaw"><img src="https://img.shields.io/docker/pulls/taskclaw/backend" alt="Docker Pulls" /></a>
  <a href="https://github.com/taskclaw/taskclaw/actions"><img src="https://img.shields.io/github/actions/workflow/status/taskclaw/taskclaw/ci.yml" alt="CI" /></a>
</p>

---

## What is TaskClaw?

TaskClaw is a self-hostable task management platform that combines a visual Kanban board with AI chat, knowledge management, and bidirectional sync with tools like Notion and ClickUp. Think of it as your AI-powered command center for tasks.

**Key Features:**

- **Kanban Board** — Drag-and-drop task management with status columns
- **AI Chat** — Talk to an AI assistant about your tasks (bring your own API key)
- **Knowledge Base** — Feed context to the AI for smarter assistance
- **Integrations** — Bidirectional sync with Notion, ClickUp, and more (community-extensible)
- **MCP Server** — Model Context Protocol server for AI agents (Claude Code, Cursor, Windsurf)
- **API Keys & Webhooks** — Programmatic access and real-time event notifications
- **OpenAPI Spec** — Full REST API documentation at `/api/docs`
- **Team Collaboration** — Share projects and tasks with your team
- **Skills & Categories** — Organize tasks by context and teach the AI custom skills
- **Pomodoro Timer** — Built-in focus timer with task association
- **Dark Mode** — Premium, distraction-free interface

## Quick Start

Try TaskClaw instantly with [npx](https://docs.npmjs.com/cli/v10/commands/npx) (requires [Node.js](https://nodejs.org) + [Docker](https://docs.docker.com/get-docker/)). This runs a **local** instance on your own machine at **[http://localhost:3000](http://localhost:3000)** — nothing is deployed to a remote server:

```bash
npx taskclaw
```

Or deploy with [Docker](https://docs.docker.com/get-docker/) directly:

```bash
curl -fsSL https://raw.githubusercontent.com/taskclaw/taskclaw/main/scripts/install.sh | sh
```

Open **[http://localhost:3000](http://localhost:3000)** and log in:

| | |
|---|---|
| **Email** | `super@admin.com` |
| **Password** | `password123` |

That's it! Everything starts automatically: database, auth, API, and frontend — all behind a single port.

```bash
npx taskclaw stop       # Stop TaskClaw
npx taskclaw logs       # View logs
npx taskclaw upgrade    # Pull latest & restart
npx taskclaw reset      # Stop + delete all data
```

### Deploy to a server (VPS)

The quickstart above runs on **your local machine**. To run TaskClaw on a remote
server that others can reach, point one command at any fresh Ubuntu/Debian host:

```bash
npx taskclaw remote --host <your-server-ip>
```

This single command provisions Docker on the server, generates unique secrets,
brings up the full stack, and saves a credentials file you can keep. To serve
over HTTPS at your own domain (DNS A-record + TLS-terminating proxy required),
add:

```bash
npx taskclaw remote --host <your-server-ip> --domain <example.com>
```

See [docs/self-hosting.md](./docs/self-hosting.md) for the full server guide.

### Alternative: Docker Compose (manual)

```bash
git clone https://github.com/taskclaw/taskclaw.git && cd taskclaw
docker compose -f docker-compose.quickstart.yml up -d
```

### For AI Agents (MCP Server)

If you're an AI agent like Claude Code, Cursor, or Windsurf, you can access TaskClaw programmatically via the MCP server:

1. **Build the MCP server**:
   ```bash
   cd backend && npm run build:mcp
   ```

2. **Configure in your IDE** (example for Claude Code):
   ```json
   {
     "mcpServers": {
       "taskclaw": {
         "command": "node",
         "args": ["/path/to/taskclaw/backend/dist/mcp-entry.js"],
         "env": {
           "TASKCLAW_API_URL": "http://localhost:3003",
           "TASKCLAW_API_KEY": "tc_live_xxxxxxxxxxxxx"
         }
       }
     }
   }
   ```

3. **Use TaskClaw tools** directly in your AI conversations:
   ```
   @mcp taskclaw list_boards account_id=...
   @mcp taskclaw create_task account_id=... title="Fix bug" board_id=...
   ```

See [MCP Server Documentation](./docs/mcp-server.md) for full setup and tool reference.

### Advanced Setup

**Customize the stack via env files:**

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit .env files (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, S3/MinIO, etc.)
docker compose up -d
```

This brings up the full plain-PostgreSQL stack: Postgres (pgvector), MinIO (S3-compatible storage), Redis, the NestJS backend, and the Next.js frontend. The backend applies Drizzle migrations + seeds on boot and creates MinIO buckets automatically.

**Self-Hosting on a server (remote host, over HTTP)**

Running on a real server (not `localhost`) needs a few extra steps the quickstart doesn't cover:

1. **Set strong secrets and your public URL.** The quickstart compose reads these from a `.env` file next to the compose file (or the shell environment). CORS and the Server Actions allowed-origin both derive from `SITE_URL` automatically:

   ```bash
   POSTGRES_PASSWORD=<strong-random-password>
   JWT_SECRET=<strong-random-secret>          # openssl rand -hex 32
   ENCRYPTION_KEY=<strong-random-hex-string>  # openssl rand -hex 32
   SITE_URL=http://<your-server-ip>:3000      # or EXTERNAL_PORT=80 + SITE_URL=http://<your-server-ip>
   MINIO_ROOT_USER=<user>
   MINIO_ROOT_PASSWORD=<strong-random-password>
   # MinIO / S3-compatible storage — point S3_PUBLIC_URL at a browser-reachable URL:
   S3_PUBLIC_URL=http://<your-server-ip>:9000
   ```

2. **Over plain HTTP, `COOKIE_SECURE` must be `false`** (the quickstart compose default). Otherwise the auth session cookie is marked `Secure`, browsers silently drop it, and login never reaches the dashboard. (For production, serve HTTPS instead and set it to `true`.)

   The frontend serves a single-origin `/api/[...path]` proxy that forwards to the backend over the Docker network (`INTERNAL_API_URL=http://backend:3003`) and injects the Bearer token from the httpOnly `auth_token` cookie — so the published frontend image works on any host without rebuilding `NEXT_PUBLIC_*` URLs.

3. **First login may need activation.** New signups start as `pending` — set the user's `status='active'` in the DB (or approve via admin) before they can sign in. Live board updates flow over Postgres `LISTEN/NOTIFY` → NestJS SSE (`/events/stream`) and work out of the box.

See [docs/self-hosting.md](./docs/self-hosting.md) for the full self-hosting guide, and [docs/development.md](./docs/development.md) for the full development setup guide.

## Upgrading

```bash
TASKCLAW_VERSION=v2.0.0 docker compose pull && docker compose up -d
```

## Documentation

| Document | Description |
|----------|-------------|
| [Self-Hosting Guide](./docs/self-hosting.md) | Complete self-hosting instructions |
| [Configuration](./docs/configuration.md) | All environment variables |
| [Architecture](./docs/architecture.md) | System architecture overview |
| [Development](./docs/development.md) | Local development setup |
| [MCP Server](./docs/mcp-server.md) | Model Context Protocol server for AI agents |
| [API Keys & Webhooks](./docs/documentation/authentication-authorization.md#api-key-authentication) | Programmatic access and event notifications |
| [Adding Integrations](./docs/integrations/adding-an-integration.md) | How to build a new integration |

### API Reference

- **OpenAPI Spec**: Visit `http://localhost:3003/api/docs` when running locally
- **Interactive Docs**: Test all endpoints directly from the Swagger UI
- **JSON Spec**: Download from `http://localhost:3003/api/docs-json`

## Integrations

TaskClaw uses a pluggable adapter system for integrations. Adding a new integration
is one of the best ways to contribute.

| Integration | Status | Description |
|-------------|--------|-------------|
| Notion | Built-in | Bidirectional sync with Notion databases |
| ClickUp | Built-in | Bidirectional sync with ClickUp tasks |
| Jira | Planned | Community contribution welcome |
| Trello | Planned | Community contribution welcome |
| Asana | Planned | Community contribution welcome |
| Linear | Planned | Community contribution welcome |

See [Adding an Integration](./docs/integrations/adding-an-integration.md) to get started.

## Cloud Version

Don't want to self-host? **[TaskClaw Cloud](https://taskclaw.co)** provides a fully
managed version with additional features:

- Managed infrastructure with automatic updates
- Billing and subscription management
- Advanced AI usage analytics
- Priority support

## Tech Stack

- **Frontend**: Next.js 15, React 18, Tailwind CSS, shadcn/ui, Zustand, TanStack Query
- **Backend**: NestJS 11, TypeScript
- **Database**: PostgreSQL (pgvector) via Drizzle ORM
- **Auth**: Local NestJS JWT auth (bcrypt + refresh tokens)
- **Storage**: MinIO (S3-compatible)
- **Realtime**: Postgres LISTEN/NOTIFY → NestJS SSE
- **AI**: OpenRouter API (bring your own key)
- **Queue**: BullMQ + Redis
- **Drag & Drop**: @dnd-kit

## Claude Code Skills (AI Builder)

TaskClaw ships with **Claude Code skills** that let you create boards, agents, skills, and knowledge bases through guided AI conversations. Just invoke a slash command and Claude walks you through a wizard, then generates a JSON manifest you can import.

### Available Skills

| Skill | Command | What it does |
|-------|---------|-------------|
| **TaskClaw Builder** | `/taskclaw-builder` | Orchestrates all builder skills — design a complete board + agents + skills in one session |
| **Board Architect** | `/board-architect` | Design board workflows — pipeline stages, AI automation, routing |
| **Skill Writer** | `/skill-writer` | Write AI skill instructions — persona, process, output format |
| **Agent Designer** | `/agent-designer` | Design agent categories with optimal skill groupings |
| **Knowledge Curator** | `/knowledge-curator` | Structure knowledge base documents for agents |
| **Dev Setup** | `/dev-setup` | Set up a local development environment (Docker, Postgres, env config) |

### How It Works

1. Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and open the TaskClaw project
2. Run a skill command (e.g. `/board-architect`)
3. Claude guides you through a wizard-like Q&A
4. It generates a JSON manifest in the [TaskClaw bundle format](./.claude/skills/taskclaw-shared/bundle_format.md)
5. Go to **Import** in the TaskClaw sidebar (`/dashboard/import`) and drop your `.json` file
6. Everything is provisioned automatically (boards, agents, skills, knowledge docs)

### Creating Your Own Skill

Skills live in `.claude/skills/<name>/` with this structure:

```
.claude/skills/my-skill/
├── SKILL.md              # Required — main definition (YAML frontmatter + markdown)
├── references/           # Optional — schemas, guides
└── assets/               # Optional — examples, templates
```

See [.claude/skills/README.md](./.claude/skills/README.md) for the full authoring guide.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

The most impactful contributions are **new integrations** — check out the
[integration guide](./docs/integrations/adding-an-integration.md) to add support
for your favorite tool.

## Community

- [GitHub Issues](https://github.com/taskclaw/taskclaw/issues) — Bug reports and feature requests
- [GitHub Discussions](https://github.com/taskclaw/taskclaw/discussions) — Questions and ideas
- [Vision & Roadmap](./VISION.md) — Where TaskClaw is headed

## License

TaskClaw is licensed under the [Sustainable Use License](./LICENSE.md) — free for
personal and internal business use. Enterprise license required for providing
hosted services. Files in `backend/src/ee/` are governed by a separate
[Enterprise License](./LICENSE_EE.md).

## Author

Created by [DevOtts](https://github.com/DevOtts).
