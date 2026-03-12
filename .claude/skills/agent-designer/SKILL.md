---
name: agent-designer
description: Design TaskClaw agent categories with optimal skill groupings through guided conversation. Helps map AI capabilities to workflow stages and generates category JSON with embedded skills. Use when creating agents, grouping skills, designing AI roles, or mapping capabilities to board steps.
license: MIT
triggers:
  - create an agent
  - design an agent
  - agent designer
  - new agent
  - group skills
  - AI roles
  - category skills
  - agent capabilities
  - skill grouping
metadata:
  version: 1.0.0
  author: TaskClaw
  category: taskclaw-builder
  domain: agent-design
  updated: 2026-03-12
---

# Agent Designer

Design TaskClaw agent categories with optimal skill groupings. Generates category JSON with embedded skills and knowledge docs.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Key Concepts](#key-concepts)
- [Wizard Flow](#wizard-flow)
- [Schema Reference](#schema-reference)
- [Output Format](#output-format)
- [Best Practices](#best-practices)

---

## Quick Start

1. User describes the domain or workflow
2. You identify the distinct AI roles needed
3. You map capabilities to skills within each role
4. You design knowledge base requirements
5. You generate category JSON with embedded skills

---

## Key Concepts

### What is an Agent?

In TaskClaw, an **agent** is a **category** with linked **skills** and **knowledge docs**. Categories group related AI capabilities under a single role.

```
Agent (Category)
├── Skill 1: "Research Topics"
├── Skill 2: "Write Drafts"
├── Knowledge Doc: "Brand Guidelines" (master)
└── Knowledge Doc: "Style Reference"
```

### Agent Priority Cascade

When a task needs AI help, TaskClaw resolves the agent using this priority:

1. **Card-level override**: Specific agent assigned to this card
2. **Column-level**: Board step's `linked_category_slug` (agent assigned to the Kanban column)
3. **Board-level default**: Board's `default_category_slug` (fallback agent)
4. **Legacy**: Task's original category

### One Role = One Agent

Each agent should represent a single, coherent role:
- "Content Writer" (writes content)
- "Code Reviewer" (reviews code)
- "Data Analyst" (analyzes data)

Don't create a "General Assistant" agent — split into focused roles.

---

## Wizard Flow

### Phase 1: Domain Mapping

Ask the user:
- "What domain or workflow is this for?"
- "What are the main activities/tasks in this workflow?"
- "Who does each activity today? (people or roles)"

### Phase 2: Role Identification

Based on Phase 1, identify distinct AI roles:
- "I see these distinct roles: [list]. Does this look right?"
- "Should any roles be merged or split?"
- "Are there roles I'm missing?"

Present roles as a table:

| Role | Responsibilities | Board Steps |
|------|-----------------|-------------|
| Content Writer | Drafts posts, threads | Drafting |
| Editor | Reviews, optimizes | Review |
| Visual Advisor | Suggests images | Visual |

### Phase 3: Skill Design

For each role/agent:
- "What specific capabilities does [role] need?"
- "How many skills should it have?" (typically 1-3 per agent)
- "What should each skill's instructions cover?"

For each skill, define:
- Name and description
- Key instructions (brief — suggest using `/skill-writer` for detailed instructions)
- Whether it's active by default

### Phase 4: Knowledge Base

For each agent:
- "Does [role] need domain knowledge beyond its skills?"
- "Are there reference docs, guidelines, or FAQs to include?"
- "Should the knowledge doc be auto-injected (master) or supplementary?"

### Phase 5: Board Step Linking

If the user is also building a board:
- "Which board steps should each agent be linked to?"
- "Should any agent be the board-level default?"

### Phase 6: Generate

Generate the categories JSON with:
- All agents as category objects
- Skills embedded with instructions
- Knowledge docs embedded
- Slugs for cross-referencing with board steps

---

## Schema Reference

See `references/category_schema.md` for the full schema.

See `references/agent_cascade.md` for how agents are resolved at runtime.

### Category JSON Structure

```json
{
  "slug": "content-writer",
  "name": "Content Writer",
  "color": "#3b82f6",
  "icon": "pen-tool",
  "skills": [
    {
      "slug": "blog-post-writer",
      "name": "Blog Post Writer",
      "description": "Writes SEO-optimized blog posts",
      "instructions": "You are a professional blog writer...\n\n## Process:\n1. ...",
      "is_active": true
    },
    {
      "slug": "social-caption-writer",
      "name": "Social Caption Writer",
      "description": "Writes engaging social media captions",
      "instructions": "You are a social media copywriter...",
      "is_active": true
    }
  ],
  "knowledge_docs": [
    {
      "title": "Brand Voice Guidelines",
      "content": "# Brand Voice\n\nOur brand voice is...",
      "is_master": true
    }
  ]
}
```

---

## Output Format

Output as a bundle JSON for import:

~~~
```json
{
  "bundle_version": "1.0",
  "categories": [
    { ... agent 1 ... },
    { ... agent 2 ... }
  ]
}
```
~~~

Tell the user:

> Save this as a `.json` file and import it into TaskClaw at **Import** (`/dashboard/import`). All agent categories, skills, and knowledge docs will be created automatically.
>
> For detailed skill instructions, run `/skill-writer` for each skill individually.
>
> To build a board that uses these agents, run `/board-architect`.

---

## Best Practices

### Agent Scope
- **One role per agent**: "Content Writer", not "Content Writer + Editor + Publisher"
- **2-4 skills per agent**: Enough capability without bloat
- **Focused instructions**: Each skill does one thing well
- **Descriptive slugs**: `email-marketer`, not `agent-1`

### Skill Grouping Heuristics
- Skills that share a persona belong in the same agent
- Skills that operate at different workflow stages belong in different agents
- If you'd hire different people for the roles, they should be different agents

### Knowledge Docs
- One **master** doc per agent (auto-injected into every conversation)
- Master doc = "what the agent always needs to know" (guidelines, rules, context)
- Non-master docs = supplementary reference (not auto-injected)

### Colors & Icons
Assign distinct colors and relevant icons to each agent:

| Domain | Suggested Icon | Suggested Color |
|--------|---------------|-----------------|
| Writing | `pen-tool` | `#3b82f6` |
| Research | `search` | `#8b5cf6` |
| Analysis | `bar-chart` | `#06b6d4` |
| Review | `check-circle` | `#f59e0b` |
| Design | `image` | `#ec4899` |
| Support | `headphones` | `#22c55e` |
| Engineering | `code` | `#6366f1` |
| Sales | `trending-up` | `#ef4444` |

### Naming Conventions
- **Category slug**: `domain-role` (e.g., `x-copywriter`, `support-triage-agent`)
- **Category name**: Role-focused (e.g., "X Copywriter", "Support Triage Agent")
- **Skill slug**: `action-object` (e.g., `write-blog-post`, `analyze-sentiment`)
- **Skill name**: Action-focused (e.g., "Blog Post Writer", "Sentiment Analyzer")
