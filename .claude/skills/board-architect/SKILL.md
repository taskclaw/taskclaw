---
name: board-architect
description: Design TaskClaw board workflows through guided conversation. Asks about your process, stages, AI automation needs, and generates a complete board manifest JSON ready for import. Use when creating boards, designing workflows, building Kanban pipelines, or automating multi-step processes.
license: MIT
triggers:
  - create a board
  - design a board
  - build a workflow
  - board architect
  - new pipeline
  - kanban board
  - automate process
  - board manifest
  - create workflow
  - design pipeline
metadata:
  version: 1.0.0
  author: TaskClaw
  category: taskclaw-builder
  domain: workflow-design
  updated: 2026-03-12
---

# Board Architect

Design TaskClaw board workflows through guided conversation. Generates complete board manifest JSON files ready for import.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Wizard Flow](#wizard-flow)
- [Schema Reference](#schema-reference)
- [Step Types Guide](#step-types-guide)
- [Output Format](#output-format)
- [Best Practices](#best-practices)

---

## Quick Start

1. User describes their process or industry
2. You brainstorm the pipeline stages together
3. You identify which stages benefit from AI automation
4. You design the step routing (success/error paths)
5. You define input/output fields for each step
6. You generate the complete JSON manifest

---

## Wizard Flow

Follow these phases **in order**. Ask questions at each phase before proceeding.

### Phase 1: Discovery

Ask the user:
- "What industry or domain is this for?" (marketing, sales, support, engineering, HR, content, etc.)
- "What process are you trying to manage?" (content pipeline, hiring funnel, bug tracking, client onboarding, etc.)
- "Who are the people involved?" (team roles, handoff points)
- "What's the end goal?" (published content, closed deal, resolved ticket, etc.)

### Phase 2: Pipeline Design

Based on Phase 1, propose 4-7 stages. Present them as a pipeline:

```
Stage 1 → Stage 2 → Stage 3 → ... → Done
```

Ask:
- "Does this flow look right?"
- "Any stages missing? Any that should be split or combined?"
- "Which stages are bottlenecks that could use AI help?"

### Phase 3: AI Automation

For each stage the user wants AI on:
- "What should the AI do at this stage?" (draft content, analyze data, suggest edits, classify, summarize)
- "Should AI run automatically when a card enters, or only when triggered manually?"
- "What agent/category should handle this?" (brainstorm the agent's role)

For each AI stage, you'll set:
- `type: "ai_process"`
- `ai_first: true` (if auto-run on entry)
- `system_prompt` describing what the AI should do
- `linked_category_slug` pointing to the responsible agent

### Phase 3b: Backbone Selection

Before finalizing AI steps, clarify which backbone will power them. Ask:
- "Which AI backbone should this board use?" (Claude Code locally, Anthropic API, OpenRouter, etc.)
- "Does any step need special capabilities like writing files, tool use, or a specific model?"

**Backbone types available in TaskClaw:**

| Type | Use case |
|------|----------|
| `claude-code` | Local automation, file I/O, tool-calling (runs `claude` subprocess) |
| `anthropic` | Direct Claude API, cloud-only |
| `openrouter` | Multi-model routing via one API key |
| `openclaw` | Self-hosted OpenClaw instance |
| `custom-http` | Any REST endpoint |
| `ollama` | Local open-source models |

**Resolution cascade**: task → step → board → agent category → account default → fallback

For steps needing special capabilities (filesystem, tools), assign backbone at step level. Otherwise inherit from board/account default.

In the bundle JSON: `"backbone_slug": "claude-code"` on the step (resolved to active connection at import time).

### Phase 3c: Integration Dependencies

Ask the user:
- "What external services or APIs does this board need to function?" (e.g., X API, Slack, SendGrid, image generation, CRM)
- "Which are **required** for the board to work vs. **optional** enhancements?"

For each integration, define:
- `slug`: kebab-case identifier (e.g., `x-api`, `nano-banana`)
- `name`: display name (e.g., "X (Twitter) API")
- `description`: what it does for the board
- `icon`: emoji (e.g., "𝕏", "🍌", "📧")
- `required`: true if critical, false if optional
- `setup_guide`: step-by-step setup instructions
- `config_fields`: what credentials/settings the user needs to provide

Common integration patterns:
- **Social APIs**: X, LinkedIn, Instagram — API keys, OAuth tokens
- **Image generation**: Nano Banana, DALL-E — API keys
- **Email**: SendGrid, Mailgun — API keys, sender domains
- **Webhooks**: Slack, Discord — webhook URLs
- **CRM**: HubSpot, Salesforce — API keys, instance URLs

If the board has no external dependencies, skip this phase.

### Phase 4: Routing & Error Handling

For each step:
- "On success, where does the card go next?"
- "On failure/rejection, should it go back to a previous step?"

Map out the `on_success` and `on_error` step references.

### Phase 5: Fields & Data

For each step, define what data is collected or produced:

Input fields (what the user provides):
- "What information is needed at this stage?"

Output fields (what the AI or user produces):
- "What does this stage produce?"

Use field types: `text`, `dropdown`, `date`, `number`, `boolean`, `url`

**Key design principle — always define output schemas for AI steps:**
- Every `ai_process` step should produce at least one output field
- Use `type: "url"` for any generated file path or external URL — it renders as a clickable link on the card
- Use `type: "text"` for summaries, notes, or findings
- The platform auto-injects instructions telling the AI to fill these fields via a structured `output_json` block

**URL fields for file outputs:**
If the AI saves a file locally, set the output field to `file:///absolute/path/to/file` — this makes it directly openable in the browser from the card. Always instruct the AI in the step's `system_prompt` to populate this field with the exact file path.

**Chaining inputs → outputs:**
Design schemas so each step's outputs flow naturally into the next step's context. Prior step outputs are automatically injected into the AI context as `card_data`, so downstream steps have access to everything produced upstream.

### Phase 6: Categories & Skills

Based on the AI stages identified in Phase 3, design the agent categories:
- Group related AI capabilities into categories
- Each category = one agent with specific skills
- Define 1-3 skills per category with names, descriptions, and instructions

### Phase 7: Generate

Generate the complete board manifest JSON including:
- Board metadata (name, description, icon, color, tags)
- Integration dependencies (if any external services are needed)
- Categories with embedded skills
- Steps with routing, schemas, and AI config

Output the JSON in a code block and tell the user to save it as a `.json` file and import it into TaskClaw at `/dashboard/import`.

---

## Schema Reference

See `references/manifest_schema.md` for the complete JSON schema.

See `references/step_types.md` for step type details.

See `assets/example_board.json` for a complete working example (X Content Pipeline).

### Minimal Board Structure

```json
{
  "manifest_version": "1.0",
  "id": "my-board-id",
  "name": "My Board",
  "description": "What this board does",
  "version": "1.0.0",
  "icon": "layout-grid",
  "color": "#6366f1",
  "tags": [],
  "default_category_slug": null,
  "settings": {
    "allow_manual_column_move": true,
    "card_retention_days": null
  },
  "categories": [],
  "steps": [
    {
      "id": "inbox",
      "name": "Inbox",
      "type": "input",
      "position": 0,
      "color": "#71717a",
      "linked_category_slug": null,
      "trigger_type": "manual",
      "ai_first": false,
      "system_prompt": null,
      "input_schema": [],
      "output_schema": [],
      "on_success": "in-progress",
      "on_error": null
    },
    {
      "id": "in-progress",
      "name": "In Progress",
      "type": "human_review",
      "position": 1,
      "color": "#3b82f6",
      "linked_category_slug": null,
      "trigger_type": "manual",
      "ai_first": false,
      "system_prompt": null,
      "input_schema": [],
      "output_schema": [],
      "on_success": "done",
      "on_error": "inbox"
    },
    {
      "id": "done",
      "name": "Done",
      "type": "done",
      "position": 2,
      "color": "#22c55e",
      "linked_category_slug": null,
      "trigger_type": "on_entry",
      "ai_first": false,
      "system_prompt": null,
      "input_schema": [],
      "output_schema": [],
      "on_success": null,
      "on_error": null
    }
  ]
}
```

---

## Step Types Guide

| Type | When to use | `ai_first` | `system_prompt` |
|------|------------|------------|-----------------|
| `input` | First step where user adds data | `false` | `null` |
| `ai_process` | AI does work (draft, analyze, classify) | `true` | Required |
| `human_review` | Human reviews, edits, approves | `false` | `null` |
| `action` | External action (webhook, schedule) | `false` | `null` |
| `done` | Terminal step, card is complete | `false` | `null` |

---

## Output Format

Always output the final manifest as a single JSON code block:

~~~
```json
{ ... full manifest ... }
```
~~~

Then tell the user:

> Save this as a `.json` file and import it into TaskClaw at **Import** (`/dashboard/import`). The import will automatically create the board, agent categories, and skills.

If the board has many categories with detailed skill instructions, suggest also running `/skill-writer` to refine each skill individually.

---

## Best Practices

### Board Design
- Keep boards to 4-7 steps (too many = confusing, too few = not useful)
- First step should always be `type: "input"` — the entry point
- Last step should always be `type: "done"` — the exit point
- Use `human_review` between AI steps for quality control

### AI Steps
- Always provide a clear `system_prompt` for `ai_process` steps
- Link each AI step to a specific category with relevant skills
- Set `on_error` to route back to a human step if AI fails

### Naming
- Board `id`: kebab-case, globally descriptive (e.g., `sales-pipeline`, `bug-triage`)
- Step `id`: short kebab-case keys (e.g., `idea`, `drafting`, `review`, `done`)
- Category `slug`: role-based (e.g., `content-writer`, `code-reviewer`, `support-agent`)

### Colors
Use distinct colors for each step so the Kanban board is visually scannable:
- Input steps: purple `#8b5cf6` or gray `#71717a`
- AI steps: blue `#3b82f6` or pink `#ec4899`
- Review steps: amber `#f59e0b`
- Action steps: cyan `#06b6d4`
- Done: green `#22c55e`
