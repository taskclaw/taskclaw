# TaskClaw Skills for Claude Code

Build boards, agents, skills, and knowledge bases for [TaskClaw](https://taskclaw.co) through guided AI conversations. Generate JSON manifests and import them with one click.

## Quick Start

```
# In Claude Code, invoke any skill:
/taskclaw-builder      # Full orchestrator — boards + agents + skills in one session
/board-architect       # Design a board workflow
/skill-writer          # Write AI skill instructions
/agent-designer        # Design agent categories + skill groupings
/knowledge-curator     # Structure knowledge base documents
/dev-setup             # Set up a local development environment
```

Claude will guide you through a wizard-like Q&A, then generate a JSON manifest. Save it as a `.json` file and drop it into TaskClaw's **Import** page (`/dashboard/import`).

---

## Available Skills

| Skill | Command | What it does |
|-------|---------|-------------|
| **TaskClaw Builder** | `/taskclaw-builder` | Full orchestrator — design boards, agents, skills, and knowledge in one session |
| **Board Architect** | `/board-architect` | Designs full board workflows — pipeline stages, AI automation, routing, input/output fields |
| **Skill Writer** | `/skill-writer` | Writes AI skill instructions — persona, process, output format, constraints |
| **Agent Designer** | `/agent-designer` | Designs agent categories with optimal skill groupings for each role |
| **Knowledge Curator** | `/knowledge-curator` | Structures knowledge docs — guidelines, FAQs, reference material |
| **Dev Setup** | `/dev-setup` | Guides developers through local environment setup (Docker, Supabase, Redis) |

---

## Creating a New Skill

### 1. Directory Structure

Create a new folder under `.claude/skills/` with this structure:

```
.claude/skills/my-skill-name/
├── SKILL.md                    # Required — main skill definition
├── references/                 # Optional — detailed guides
│   ├── schema.md
│   └── patterns.md
└── assets/                     # Optional — examples, templates
    └── example.json
```

### 2. SKILL.md Format

The `SKILL.md` file is the single source of truth. Claude Code reads it to understand when and how to use the skill.

```yaml
---
name: my-skill-name
description: >
  One-line description shown in Claude's skill list. Include keywords
  for auto-detection. Mention when to use it.
license: MIT
triggers:                        # Optional — auto-invoke hints
  - trigger phrase 1
  - trigger phrase 2
metadata:
  version: 1.0.0
  author: Your Name
  category: taskclaw-builder     # or: marketing, engineering, etc.
  domain: specific-domain
  updated: 2026-03-12
---

# Skill Display Name

Short description of what this skill does.

---

## Table of Contents
- [Quick Start](#quick-start)
- [Wizard Flow](#wizard-flow)
- [Schema Reference](#schema-reference)
- [Output Format](#output-format)
- [Best Practices](#best-practices)

---

## Quick Start
1. Step 1
2. Step 2
3. ...

## Wizard Flow
### Phase 1: Discovery
Ask the user: ...

### Phase 2: Design
Based on Phase 1: ...

### Phase N: Generate
Output the final JSON...

## Output Format
Always output as a JSON code block...

## Best Practices
- Tip 1
- Tip 2
```

### 3. Key Sections Explained

#### Frontmatter (YAML)

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Kebab-case identifier (must match folder name) |
| `description` | Yes | Shown in Claude's skill list. Include keywords for auto-detection. |
| `triggers` | No | Phrases that auto-invoke this skill when the user says them |
| `metadata.version` | No | Semantic version |
| `metadata.author` | No | Author name |
| `metadata.category` | No | Grouping (e.g., `taskclaw-builder`, `marketing`) |
| `metadata.updated` | No | Last update date |

#### Description

The `description` field is critical — it tells Claude **when** to activate the skill. Be specific:

```yaml
# Good — specific, mentions use cases
description: Design TaskClaw board workflows through guided conversation.
  Use when creating boards, designing workflows, or building Kanban pipelines.

# Bad — too vague
description: Helps with boards.
```

#### Triggers

Optional phrases that help Claude auto-detect when to use the skill:

```yaml
triggers:
  - create a board
  - design a workflow
  - new pipeline
```

Without triggers, the skill is only invoked via `/skill-name`.

#### Wizard Flow

Structure the flow as numbered phases. Each phase should:
1. **Ask** the user specific questions
2. **Process** their answers
3. **Move** to the next phase

This creates a natural conversation flow instead of dumping everything at once.

#### Output Format

Always specify exactly what format to output (JSON, markdown, etc.) and tell the user what to do with it:

```markdown
## Output Format

Output the result as a JSON code block:

\`\`\`json
{ ... }
\`\`\`

Then tell the user:
> Save this as a `.json` file and import it into TaskClaw at **Import** (`/dashboard/import`).
```

### 4. References and Assets

**`references/`** — Detailed schemas, guides, and patterns the skill can reference:
- Keep `SKILL.md` focused on the wizard flow
- Put detailed schemas in `references/schema.md`
- Put reusable patterns in `references/patterns.md`

**`assets/`** — Examples and templates:
- Working JSON examples (e.g., real board manifests)
- Template files users can start from

Reference them from SKILL.md:
```markdown
See `references/manifest_schema.md` for the full JSON schema.
See `assets/example_board.json` for a complete working example.
```

### 5. Testing Your Skill

1. Save your `SKILL.md` in `.claude/skills/my-skill-name/`
2. Start a new Claude Code conversation
3. Type `/my-skill-name` to invoke it
4. Walk through the wizard flow
5. Verify the JSON output is valid
6. Import the JSON into TaskClaw to confirm it works end-to-end

---

## TaskClaw Bundle Format

All skills that generate importable JSON should use the **bundle format**:

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
          "description": "What it does",
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
      "steps": [ ... ],
      "categories": [ ... ]
    }
  ]
}
```

See [taskclaw-shared/bundle_format.md](taskclaw-shared/bundle_format.md) for the complete schema reference.

---

## Importing into TaskClaw

1. Go to **Import** in the TaskClaw sidebar (`/dashboard/import`)
2. Drop your `.json` file or paste the JSON
3. Preview shows what will be created (agents, skills, knowledge docs, boards)
4. Click **Import All**
5. Everything is provisioned automatically

The import is idempotent — categories with the same name are reused, not duplicated.

---

## File Overview

```
.claude/skills/
├── README.md                       ← You are here
├── taskclaw-shared/                ← Shared schema references
│   └── bundle_format.md
├── board-architect/                ← Board workflow designer
│   ├── SKILL.md
│   ├── references/
│   └── assets/
├── skill-writer/                   ← AI skill instructions writer
│   ├── SKILL.md
│   ├── references/
│   └── assets/
├── agent-designer/                 ← Agent category designer
│   ├── SKILL.md
│   ├── references/
│   └── assets/
├── knowledge-curator/              ← Knowledge base builder
│   ├── SKILL.md
│   ├── references/
│   └── assets/
├── taskclaw-builder/              ← Full orchestrator (all builders in one)
│   ├── SKILL.md
│   └── references/
├── dev-setup/                     ← Local development setup guide
│   ├── SKILL.md
│   └── references/
├── content-creator/                ← Marketing content creation
├── social-media-analyzer/          ← Social media analytics
├── campaign-analytics/             ← Campaign performance
├── app-store-optimization/         ← ASO toolkit
├── marketing-strategy-pmm/         ← Product marketing
└── marketing-demand-acquisition/   ← Demand generation
```
