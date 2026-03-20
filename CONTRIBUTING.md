# Contributing to TaskClaw

Thank you for your interest in contributing to TaskClaw! This guide will help
you get started.

## Development Setup

### Prerequisites

- Node.js 20+
- npm
- A Supabase instance (cloud or local via Docker)
- Redis (optional, for job queue — falls back to in-process)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/taskclaw/taskclaw.git
cd taskclaw

# Set up backend
cd backend
cp .env.example .env
# Edit .env with your Supabase credentials
npm install

# Set up frontend
cd ../frontend
cp .env.example .env
# Edit .env with your Supabase credentials
npm install

# Start development servers
cd ../backend && npm run start:dev
# In another terminal:
cd ../frontend && npm run dev
```

Frontend: http://localhost:3002
Backend: http://localhost:3003

### Using Local Supabase

```bash
# From the project root
cp .env.example .env
docker compose --profile supabase up -d
# Supabase Studio: http://localhost:7430
```

## Code Style

- **TypeScript** with strict mode enabled
- **ESLint + Prettier** for formatting
- Run `npm run lint` before committing

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Jira integration adapter
fix: handle null status in Kanban board
docs: update self-hosting guide
refactor: extract adapter auto-discovery logic
test: add ClickUp adapter unit tests
chore: update dependencies
```

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main` (`feat/jira-integration`)
3. **Make your changes** with conventional commits
4. **Test** your changes (`npm test` in backend)
5. **Open a PR** against `main`

### PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what and why
- Add tests for new functionality
- Update documentation if needed

## Types of Contributions

### Bug Fixes
Found a bug? Open an issue first, then submit a fix.

### New Integrations
This is one of the best ways to contribute! See the
[Integration Guide](./docs/integrations/adding-an-integration.md) for
step-by-step instructions on adding support for tools like Jira, Trello,
Asana, Linear, and more.

### UI Improvements
Frontend improvements, accessibility fixes, and design enhancements are
always welcome.

### Documentation
Help improve our docs, add examples, fix typos, or translate content.

## What NOT to Contribute

Files in `backend/src/ee/` are governed by the
[Enterprise License](./LICENSE_EE.md) and are not open for community
contributions. These contain cloud-only features (billing, subscriptions,
advanced observability).

## AI-Assisted Code

AI-assisted contributions are welcome. If you use AI tools (Claude, Copilot,
ChatGPT, etc.) to help write your code:

- Be transparent about it in your PR description
- Make sure you understand and can explain the code you submit
- Test it thoroughly — AI-generated code can have subtle bugs

## Code Review

Maintainers will review PRs within 3 business days. We may request changes
or ask questions. Please be responsive to feedback.

## Questions?

- Open a [GitHub Discussion](https://github.com/taskclaw/taskclaw/discussions)
- Check existing issues and discussions first

Thank you for helping make TaskClaw better!
