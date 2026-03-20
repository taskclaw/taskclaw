---
name: taskclaw-builder
description: >
  Orchestrate the full TaskClaw setup in one session — boards, agents, skills,
  and knowledge bases. Guides you from idea to importable JSON bundle.
  Use when building a complete TaskClaw workflow from scratch, designing an
  end-to-end pipeline, or creating multiple boards and agents at once.
license: MIT
triggers:
  - build a taskclaw project
  - create a taskclaw bundle
  - full taskclaw setup
  - orchestrate taskclaw
  - design everything
  - build boards and agents
  - full pipeline setup
  - create bundle
  - new taskclaw project
metadata:
  version: 1.1.0
  author: TaskClaw
  category: taskclaw-builder
  domain: orchestration
  updated: 2026-03-20
---

# TaskClaw Builder

Orchestrate the full TaskClaw setup in one session. Guides you from a high-level idea to a complete, importable JSON bundle containing boards, agents, skills, and knowledge bases.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Wizard Flow](#wizard-flow)
- [Output Format](#output-format)
- [Tips](#tips)

---

## Quick Start

1. User describes the overall project or workflow they want to build
2. You scope what's needed: boards, agents, skills, knowledge docs
3. You walk through each piece, designing them together
4. You generate one unified JSON bundle ready for import

---

## Wizard Flow

Follow these phases **in order**. Ask questions at each phase before moving on.

### Phase 1: Vision

Ask the user:

- "What are you building? Describe the overall workflow or project."
- "What industry/domain is this for?" (marketing, sales, support, engineering, HR, content, etc.)
- "Who will use it?" (team roles, stakeholders)
- "What's the end goal?" (published content, processed leads, resolved tickets, etc.)

Summarize back what you understood and confirm before continuing.

### Phase 2: Scope

Based on Phase 1, propose what's needed. Present a plan like:

```
Project: [Name]
├── Board: [Board Name] — [purpose]
│   ├── Step 1: [Name] (type)
│   ├── Step 2: [Name] (type)
│   └── ...
├── Agent: [Agent Name] — [role]
│   ├── Skill: [Skill Name]
│   └── Skill: [Skill Name]
├── Agent: [Agent Name] — [role]
│   └── Skill: [Skill Name]
└── Knowledge: [Doc Title] → [Agent]
```

Ask:
- "Does this scope look right?"
- "Anything to add, remove, or change?"
- "Do you need multiple boards or just one?"

### Phase 3: Board Design

For each board in the scope, walk through the board design:

1. **Stages**: Define 4-7 pipeline steps. Draw the flow:
   ```
   Step 1 → Step 2 → Step 3 → ... → Done
   ```
2. **Step types**: For each step, determine the type:
   - `input` — entry point where user provides data
   - `ai_process` — AI does work (draft, analyze, classify)
   - `human_review` — human reviews/approves
   - `action` — external action (webhook, schedule)
   - `done` — terminal step
3. **Routing**: Where does each step go on success? On error?
4. **Fields**: What input/output fields does each step need?

Ask:
- "Which steps should have AI automation?"
- "On failure, should cards go back to a previous step or stay?"

### Phase 3b: Integration Dependencies

For each board, determine if it needs external integrations. Ask:
- "Does this board's AI need to interact with any external services?" (e.g., X API, Slack, SendGrid, image generation, CRM, project management)
- "Which are required vs. optional for the workflow?"
- "Are any of these already in the TaskClaw marketplace?" (check the existing catalog first)

**Decision Guide — Does This Board Need an Integration?**

A board needs an integration when:
- The AI agent must **read from or write to** an external service (e.g., post to X, send emails, query a CRM)
- A board step **automates** an external action (e.g., publish content, create a ticket)
- The workflow needs **live data** from an external source (e.g., analytics, project status)

A board does NOT need an integration when:
- The AI only processes text/data within TaskClaw (drafting, reviewing, classifying)
- External data is manually pasted by users into task fields
- The board is purely internal workflow (approvals, reviews, handoffs)

**Two types of board integrations:**

1. **Marketplace integration (existing)**: Reference by slug. The user connects once in Settings → Integrations, then all boards using that slug share the connection.
   - Check if a definition already exists (e.g., `discord`, `github`, `slack`, `linear`, `notion-source`)
   - If yes, just reference its slug in the board's `integrations` array

2. **Custom integration (new)**: Define inline in the board bundle. Will be created as a new `integration_definition` during import.
   - Provide: `slug`, `name`, `description`, `icon`, `required`
   - Provide: `auth_type` (`api_key`, `oauth2`, or `none`)
   - Provide: `auth_config` with `key_fields` array (drives the credential form in the IntegrationSetupDialog)
   - Optionally provide: `setup_guide` (markdown rendered by SetupGuideRenderer), `config_fields` (non-credential settings)
   - Optionally provide: `categories` (e.g., `['communication']`, `['source']`, or omit for marketplace)

For each integration, define:
- `slug`: unique kebab-case identifier
- `name`, `description`, `icon` (emoji), `required` (boolean)
- `auth_type`: `api_key` | `oauth2` | `none`
- `auth_config`: `{ "key_fields": [{ "key", "label", "type", "required", "placeholder", "help_text" }] }`
- `setup_guide`: step-by-step markdown instructions (supports ## headings, ### sections, numbered lists, **bold**, `code`, [links](url))
- `config_fields`: optional non-credential settings (same field schema as key_fields)

Common patterns: Social APIs (X, LinkedIn), Image gen (Nano Banana), Email (SendGrid), Webhooks (Slack, Discord), CRM (HubSpot, Salesforce).

If the board has no external dependencies, skip this phase.

### Phase 4: Agent Design

For each agent in the scope:

1. **Role**: What persona does this agent adopt?
2. **Skills**: List 1-4 skills with:
   - Name and description
   - What it does (the AI instructions — be detailed)
   - Expected input/output format
3. **Knowledge**: Does this agent need background knowledge?
   - If yes, what should the knowledge doc contain?
   - Mark one as `is_master: true` (auto-injected into AI context)

For each skill, write detailed instructions. A good skill instruction includes:
- **Persona**: "You are a [role] specialized in [domain]."
- **Process**: Numbered steps the AI follows
- **Output format**: Headings, bullet points, tables, etc.
- **Constraints**: What NOT to do, length limits, tone

Ask:
- "How detailed should the AI be?"
- "Any specific constraints or style guidelines?"
- "Should any skill reference external tools or APIs?"

### Phase 5: Knowledge Base

For each knowledge doc identified in Phase 4:

1. **Content**: Write the knowledge document content in markdown
2. **Structure**: Organize as guidelines, FAQs, reference tables, or free-form text
3. **Master flag**: Set `is_master: true` for the primary doc per agent

Ask:
- "Do you have existing docs, FAQs, or guidelines to incorporate?"
- "What domain-specific facts should the agent always know?"

### Phase 6: Review & Generate

Present a final summary:

```
Bundle Summary
══════════════
Boards:      [count]
Agents:      [count]
Skills:      [count]
Knowledge:   [count]

Board: [name]
  Steps: [list with types]

Agent: [name]
  Skills: [list]
  Knowledge: [list]
```

Ask: "Ready to generate the JSON? Any final tweaks?"

Then generate the complete JSON bundle.

---

## Output Format

Output **one unified JSON bundle** that can be imported in a single drop:

```json
{
  "bundle_version": "1.0",
  "categories": [
    {
      "slug": "agent-slug",
      "name": "Agent Name",
      "color": "#6366f1",
      "icon": "brain",
      "skills": [
        {
          "slug": "skill-slug",
          "name": "Skill Name",
          "description": "One-line description",
          "instructions": "Full AI instructions...",
          "is_active": true
        }
      ],
      "knowledge_docs": [
        {
          "title": "Doc Title",
          "content": "Markdown content...",
          "is_master": true
        }
      ]
    }
  ],
  "boards": [
    {
      "manifest_version": "1.0",
      "id": "board-slug",
      "name": "Board Name",
      "description": "What this board does",
      "version": "1.0.0",
      "icon": "layout-grid",
      "color": "#6366f1",
      "tags": [],
      "default_category_slug": "agent-slug",
      "settings": {
        "allow_manual_column_move": true,
        "card_retention_days": null
      },
      "integrations": [
        {
          "slug": "service-slug",
          "name": "Service Name",
          "description": "What this service does for the board",
          "icon": "🔌",
          "required": true,
          "auth_type": "api_key",
          "auth_config": {
            "key_fields": [
              {
                "key": "api_key",
                "label": "API Key",
                "type": "password",
                "required": true,
                "placeholder": "xxx_xxxxx",
                "help_text": "Where to find this key"
              }
            ]
          },
          "setup_guide": "## How to Connect\n\n1. Go to the service dashboard\n2. Generate an API key\n3. Paste it here",
          "config_fields": [
            {
              "key": "default_channel",
              "label": "Default Channel",
              "type": "text",
              "required": false,
              "placeholder": "#general",
              "help_text": "Optional non-credential setting"
            }
          ],
          "categories": ["source"]
        }
      ],
      "categories": [
        {
          "slug": "agent-slug",
          "name": "Agent Name",
          "color": "#6366f1",
          "icon": "brain",
          "skills": [],
          "knowledge_docs": []
        }
      ],
      "steps": [
        {
          "id": "step-id",
          "name": "Step Name",
          "type": "input",
          "position": 0,
          "color": "#71717a",
          "linked_category_slug": null,
          "trigger_type": "manual",
          "ai_first": false,
          "system_prompt": null,
          "input_schema": [],
          "output_schema": [],
          "on_success": "next-step-id",
          "on_error": null
        }
      ]
    }
  ]
}
```

See `references/workflow.md` for the full schema reference.

After outputting the JSON, tell the user:

> Save this as a `.json` file (e.g. `my-project.json`) and import it into TaskClaw at **Import** (`/dashboard/import`). The import will create all boards, agents, skills, and knowledge docs automatically.

If the user wants to iterate on specific pieces, suggest the specialized skills:
- `/board-architect` to redesign a board's pipeline
- `/skill-writer` to refine individual skill instructions
- `/agent-designer` to restructure agent categories
- `/knowledge-curator` to expand knowledge documents

---

## Tips

### Start Big, Refine Later
- The orchestrator is for getting the full picture right. Don't get bogged down in exact prompt wording — that's what `/skill-writer` is for.
- Focus on the right number of boards, the right agents, and the right flow.

### One Board or Many?
- Use **one board** for a single linear process (content pipeline, hiring funnel)
- Use **multiple boards** when processes are independent but share agents (e.g., "Blog Pipeline" and "Social Pipeline" sharing a "Content Writer" agent)

### Agent Reuse
- Categories (agents) are shared across boards. If two boards need the same agent, include it in the top-level `categories` array AND in each board's `categories` array — the import deduplicates by name.

### Size Guidelines
- **Board**: 4-7 steps (sweet spot is 5-6)
- **Agent**: 1-4 skills each (focused > sprawling)
- **Skill instructions**: 200-2000 words (enough to be specific, short enough to fit in context)
- **Knowledge docs**: 500-5000 words per doc

### Color Palette
Use distinct colors for visual clarity:
- Agents: `#6366f1` `#8b5cf6` `#ec4899` `#ef4444` `#f97316` `#22c55e` `#06b6d4` `#3b82f6`
- Steps: gray `#71717a` (input) → blue `#3b82f6` (AI) → amber `#f59e0b` (review) → green `#22c55e` (done)
