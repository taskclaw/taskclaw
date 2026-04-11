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
  version: 1.2.0
  author: TaskClaw
  category: taskclaw-builder
  domain: orchestration
  updated: 2026-04-11
---

# TaskClaw Builder

Orchestrate the full TaskClaw setup in one session. Guides you from a high-level idea to a complete, importable JSON bundle containing boards, agents, skills, and knowledge bases.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Wizard Flow](#wizard-flow)
- [Input & Output Schema Design](#input--output-schema-design)
- [AI-First Step Design](#ai-first-step-design)
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
│   ├── Step 1: [Name] (type) — inputs: [fields] → outputs: [fields]
│   ├── Step 2: [Name] (type) — inputs: [fields] → outputs: [fields]
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
4. **Fields**: What input/output fields does each step need? (See [Input & Output Schema Design](#input--output-schema-design))

Ask:
- "Which steps should have AI automation?"
- "What data does each step receive as input? What does it produce?"
- "On failure, should cards go back to a previous step or stay?"

### Phase 3b: Backbone Selection

Every AI step needs a backbone — the AI provider that will process cards. Before designing AI steps, understand what backbones are available and pick the right one.

**Ask the user:**
- "Do you have a preferred AI provider for this board?" (e.g., Claude Code locally, OpenRouter, custom HTTP)
- "Does any step need special capabilities like filesystem access, tool use, or a specific model?"

**Available backbone types** (check `Settings → Backbones` for what's configured in the account):

| Backbone | Best for | Key capability |
|----------|----------|---------------|
| `claude-code` | Local automation, file I/O, tool-calling | Runs `claude --print` as a subprocess; can write files, use tools |
| `anthropic` | Direct Claude API | Reliable, no local setup; no filesystem access |
| `openrouter` | Multi-model routing | Access any model via one connection |
| `openclaw` | OpenClaw self-hosted | WebSocket protocol; good for streaming |
| `custom-http` | Any REST API | Bring your own endpoint |
| `ollama` | Local open-source models | Offline, fast, no API cost |

**Backbone resolution cascade** (highest → lowest priority):
1. **Task-level** override (manual per-card)
2. **Step-level** override (set in step config)
3. **Board-level** default
4. **Agent category** preferred backbone
5. **Account default**
6. **Any active connection** (legacy fallback)

**Design guidance:**
- For boards where AI needs to write files or run local commands → assign `claude-code` backbone at the **step level**
- For boards that are cloud-only text processing → rely on the account default (no step-level backbone needed)
- For boards that mix capabilities (e.g., one step researches with Claude, another posts to Slack via webhook) → set backbone per step

**In the bundle JSON**, set backbone at the step level with:
```json
{
  "id": "processing",
  "type": "ai_process",
  "backbone_slug": "claude-code",
  ...
}
```
The import system resolves this to the matching active backbone connection by type.

**If the account has no backbone configured**, the board will fall back to the legacy AI provider. Alert the user if their workflow requires a specific capability (like file I/O) that needs a particular backbone type.

### Phase 3c: Integration Dependencies

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
  Steps: [list with types, inputs → outputs]

Agent: [name]
  Skills: [list]
  Knowledge: [list]
```

Ask: "Ready to generate the JSON? Any final tweaks?"

Then generate the complete JSON bundle.

---

## Input & Output Schema Design

**This is one of the most impactful things to get right.** Well-defined input/output schemas make task cards actionable and traceable — the card shows exactly what went in and what came out at each step.

### The Core Principle

Every step in a pipeline produces or consumes data. Define this explicitly:
- `input_schema`: what the user (or the previous step) provides to this step
- `output_schema`: what this step produces for the next step

The AI system prompt for `ai_process` steps should always instruct the AI to fill the output schema fields.

### Field Types

| Type | Use for | Example |
|------|---------|---------|
| `text` | Short strings, titles, names | Business name, status |
| `url` | Web addresses (rendered as clickable links) | Source URL, output file path |
| `number` | Numeric values | Word count, confidence score |
| `boolean` | Yes/no flags | Approved, published |
| `dropdown` | Fixed choice lists | Priority, category, language |
| `date` | Dates | Publish date, deadline |

### URL Fields Are Special

Use `type: "url"` for any field that should open in the browser:
- Source URLs the AI should research
- Output file paths (e.g., `file:///tmp/output/report.html` opens in browser)
- Generated asset links (images, documents, deployed pages)

**Key insight**: If your board generates files, always add a `url` output field pointing to the file path. This lets users click the card and open the file directly.

### Schema Design by Step Type

**`input` step** — Capture the user's intent:
```json
"input_schema": [
  { "key": "source_url", "label": "Source URL", "type": "url", "required": true },
  { "key": "notes", "label": "Additional Notes", "type": "text", "required": false }
],
"output_schema": []
```

**`ai_process` step** — What did AI produce?
```json
"input_schema": [],
"output_schema": [
  { "key": "summary", "label": "Research Summary", "type": "text", "required": false },
  { "key": "output_file", "label": "Generated File", "type": "url", "required": false },
  { "key": "confidence", "label": "Quality Score (1-10)", "type": "number", "required": false }
]
```

**`human_review` step** — What does the reviewer decide?
```json
"input_schema": [],
"output_schema": [
  { "key": "approved", "label": "Approved", "type": "boolean", "required": true },
  { "key": "feedback", "label": "Reviewer Notes", "type": "text", "required": false }
]
```

### Chaining Inputs → Outputs

Design schemas so each step's outputs flow naturally into the next step's inputs. The AI receives the full card context including all previous step outputs in the system prompt (`card_data` from prior steps is automatically injected).

**Example — Research & Generate pipeline:**
```
Step 1 (input): input_schema=[source_url]           output_schema=[]
Step 2 (ai):    input_schema=[]                     output_schema=[research_summary, extracted_data]
Step 3 (ai):    input_schema=[]                     output_schema=[output_file, generation_notes]
Step 4 (review):input_schema=[]                     output_schema=[approved, feedback]
Step 5 (done):  input_schema=[]                     output_schema=[]
```

### System Prompt for Output Schema Compliance

When a step has `output_schema`, the platform automatically appends instructions to the system prompt telling the AI to output a structured `output_json` block. The AI **must** include this block for the card to be populated. Reinforce this in your step's `system_prompt`:

```
"After completing your work, you MUST include the structured output block
as specified. The 'output_file' field should contain the full file:/// path
to the generated file so users can open it directly in their browser."
```

---

## AI-First Step Design

`ai_first: true` on an `ai_process` step triggers the AI automatically when a card enters the step — no manual action needed. This is the core of autonomous TaskClaw workflows.

### When to use `ai_first`

Use it on the **first AI step** of any pipeline where the user just needs to drop a card in and let it run. The card's title and all input fields are available to the AI.

### Connecting title to task

The task title is always included in the AI context as:
```
=== TASK CONTEXT ===
Task: [task title]
```

**Best practice**: When the input to the AI is a URL or identifier, put it directly in the task title. This makes cards readable on the board AND gives the AI what it needs without additional input fields.

Example task titles that work well with `ai_first`:
- `https://example.com — Generate HTML page`
- `ACME Corp — Onboarding email sequence`
- `Bug #1234 — Triage and classify`

Alternatively, define an `input_schema` with the URL field and ask users to fill it before the card moves to the AI step.

### System Prompt Best Practices for `ai_first`

The `system_prompt` on the step is injected as `=== STEP-LEVEL INSTRUCTIONS ===` into the AI context. Write it as direct instructions to the AI:

```
You are a [role] agent. When this step activates:
1. Read the task title — it contains [what to extract, e.g., the URL to process]
2. [Action 1]
3. [Action 2]
4. Populate the output fields below with your results.
```

Keep it focused: the step system prompt should describe the step's specific job, not the agent's entire personality (that's what skills are for).

### Backbone Selection

For `ai_process` steps that need special capabilities (e.g., running local tools, accessing the filesystem, using specific models), assign a backbone at the step level to override the board/account default.

In the JSON bundle:
```json
{
  "id": "processing",
  "type": "ai_process",
  "backbone_slug": "claude-code",
  ...
}
```

The import resolves `backbone_slug` to the first active connection of that type in the account.

**When to override at step level vs. board level:**
- All steps need the same capability → set backbone at **board level** (`default_backbone_slug`)
- Only specific steps need special capability (e.g., one step uses Claude Code for file I/O, another just does text) → set backbone at **step level**
- Most boards → just rely on the account default, no explicit backbone needed in the bundle

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
      "integrations": [],
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
          "id": "inbox",
          "name": "Inbox",
          "type": "input",
          "position": 0,
          "color": "#71717a",
          "linked_category_slug": null,
          "trigger_type": "manual",
          "ai_first": false,
          "system_prompt": null,
          "input_schema": [
            {
              "key": "source_url",
              "label": "Source URL",
              "type": "url",
              "required": true
            }
          ],
          "output_schema": [],
          "on_success": "processing",
          "on_error": null
        },
        {
          "id": "processing",
          "name": "AI Processing",
          "type": "ai_process",
          "position": 1,
          "color": "#3b82f6",
          "linked_category_slug": "agent-slug",
          "trigger_type": "on_entry",
          "ai_first": true,
          "system_prompt": "You are a [role] agent.\n\n1. Read the task title — it contains the [input] to process.\n2. [Do the work...]\n3. Save the result to [output location].\n4. Fill in the output fields with your results.",
          "input_schema": [],
          "output_schema": [
            {
              "key": "output_file",
              "label": "Output File",
              "type": "url",
              "required": false
            },
            {
              "key": "summary",
              "label": "Summary",
              "type": "text",
              "required": false
            }
          ],
          "on_success": "review",
          "on_error": "inbox"
        },
        {
          "id": "review",
          "name": "Review",
          "type": "human_review",
          "position": 2,
          "color": "#f59e0b",
          "linked_category_slug": null,
          "trigger_type": "manual",
          "ai_first": false,
          "system_prompt": null,
          "input_schema": [],
          "output_schema": [
            {
              "key": "approved",
              "label": "Approved",
              "type": "boolean",
              "required": true
            },
            {
              "key": "feedback",
              "label": "Reviewer Notes",
              "type": "text",
              "required": false
            }
          ],
          "on_success": "done",
          "on_error": "processing"
        },
        {
          "id": "done",
          "name": "Done",
          "type": "done",
          "position": 3,
          "color": "#22c55e",
          "linked_category_slug": null,
          "trigger_type": "manual",
          "ai_first": false,
          "system_prompt": null,
          "input_schema": [],
          "output_schema": [],
          "on_success": null,
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

### Always Design Input → Output Chains
- Every `ai_process` step should have at least one `output_schema` field
- At minimum: a `text` summary field + a `url` field for any generated file
- This is what makes cards useful after AI runs — not just a chat log, but structured data

### URL Output Fields for File Outputs
If the AI generates a local file, use `file:///absolute/path/to/file.html` in the output field. This makes the card show a clickable link that opens directly in the browser. Instruct the AI in the `system_prompt` to populate this field with the exact path.

### Size Guidelines
- **Board**: 4-7 steps (sweet spot is 5-6)
- **Agent**: 1-4 skills each (focused > sprawling)
- **Skill instructions**: 200-2000 words (enough to be specific, short enough to fit in context)
- **Knowledge docs**: 500-5000 words per doc

### Color Palette
Use distinct colors for visual clarity:
- Agents: `#6366f1` `#8b5cf6` `#ec4899` `#ef4444` `#f97316` `#22c55e` `#06b6d4` `#3b82f6`
- Steps: gray `#71717a` (input) → blue `#3b82f6` (AI) → amber `#f59e0b` (review) → green `#22c55e` (done)
