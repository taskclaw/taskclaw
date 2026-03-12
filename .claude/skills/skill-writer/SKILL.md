---
name: skill-writer
description: Write effective AI skill instructions for TaskClaw agents through guided conversation. Asks about the skill's purpose, persona, output format, and generates skill JSON ready for import. Use when creating skills, writing AI prompts, designing agent capabilities, or crafting AI instructions.
license: MIT
triggers:
  - create a skill
  - write a skill
  - skill writer
  - new skill
  - AI instructions
  - write prompt
  - design skill
  - agent capability
  - skill instructions
metadata:
  version: 1.0.0
  author: TaskClaw
  category: taskclaw-builder
  domain: prompt-engineering
  updated: 2026-03-12
---

# Skill Writer

Write effective AI skill instructions for TaskClaw agents. Generates skill JSON files ready for import.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Wizard Flow](#wizard-flow)
- [Skill JSON Schema](#skill-json-schema)
- [Prompt Engineering Patterns](#prompt-engineering-patterns)
- [Output Format](#output-format)
- [Best Practices](#best-practices)

---

## Quick Start

1. User describes what the skill should do
2. You define the AI persona and role
3. You structure the process/steps the AI should follow
4. You define the expected output format
5. You add constraints and guardrails
6. You generate the skill JSON with complete instructions

---

## Wizard Flow

### Phase 1: Purpose

Ask the user:
- "What should this skill do? What problem does it solve?"
- "Who is the target user? What's their context?"
- "Can you give me a real example of input and desired output?"

### Phase 2: Persona

Ask:
- "What role should the AI adopt?" (e.g., "senior copywriter", "data analyst", "code reviewer")
- "What tone should it use?" (professional, casual, encouraging, direct)
- "What domain expertise should it have?"

### Phase 3: Process

Ask:
- "What steps should the AI follow?" (build a numbered process)
- "What should it analyze or consider?"
- "Are there decision points or branches?"

### Phase 4: Output Format

Ask:
- "What format should the output be?" (markdown, JSON, bullet points, table, code)
- "Should it include specific sections or headings?"
- "Are there any templates to follow?"

### Phase 5: Constraints

Ask:
- "What should the AI NOT do?"
- "Are there length limits?"
- "Any common mistakes to avoid?"
- "Any brand guidelines or style rules?"

### Phase 6: Generate

Compose the full `instructions` field by combining:
1. Persona statement
2. Process steps
3. Output format specification
4. Constraints and guidelines
5. Examples (if provided)

Generate the skill JSON and tell the user how to import it.

---

## Skill JSON Schema

A skill can be standalone or embedded in a category:

### Standalone (for bundle import)

```json
{
  "bundle_version": "1.0",
  "categories": [
    {
      "slug": "my-agent-category",
      "name": "My Agent",
      "color": "#6366f1",
      "icon": "brain",
      "skills": [
        {
          "slug": "my-skill-slug",
          "name": "My Skill Name",
          "description": "One-line description of what the skill does (max 500 chars)",
          "instructions": "Full AI instructions in markdown...",
          "is_active": true
        }
      ],
      "knowledge_docs": []
    }
  ]
}
```

### Embedded in board manifest

When part of a board, skills go inside the `categories` array of the board manifest. See `references/skill_schema.md` for details.

### Field Reference

| Field | Type | Required | Max Length | Description |
|-------|------|----------|-----------|-------------|
| `slug` | string | Yes | - | Kebab-case unique identifier |
| `name` | string | Yes | 100 | Display name |
| `description` | string | No | 500 | One-line summary for UI |
| `instructions` | string | Yes | 50KB | Full markdown instructions |
| `is_active` | boolean | No | - | Default `true` |

---

## Prompt Engineering Patterns

See `references/prompt_patterns.md` for detailed patterns.

### Pattern: Persona + Process + Format

```markdown
You are a [role] specialized in [domain].

## Your process:
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Output format:
- **Section 1**: [what to include]
- **Section 2**: [what to include]

## Guidelines:
- [Do this]
- [Don't do that]
```

### Pattern: Checklist Evaluator

```markdown
You are a [role]. You review [thing] against this checklist:

## Review checklist:
1. **Criteria 1** (1-10): [what to evaluate]
2. **Criteria 2** (1-10): [what to evaluate]

## Output:
- **Score**: X/10 overall
- **Strengths**: What works
- **Improvements**: Specific suggestions with rewrites
- **Improved version**: Ready to use
```

### Pattern: Wizard/Conversational

```markdown
You are a [role] who helps users [goal].

## Process:
1. Ask the user about [topic 1]
2. Based on their answer, suggest [options]
3. Once confirmed, proceed to [next step]
4. Generate [output]

## Important:
- Don't skip steps
- Confirm with the user before generating
- Be specific, avoid generic advice
```

---

## Output Format

Output the skill JSON in a code block:

~~~
```json
{
  "bundle_version": "1.0",
  "categories": [ ... ]
}
```
~~~

Tell the user:

> Save this as a `.json` file and import it into TaskClaw at **Import** (`/dashboard/import`). The skill will be created and linked to the specified agent category.

---

## Best Practices

### Instructions Quality
- Start with a clear persona ("You are a...")
- Be specific — vague instructions get vague results
- Include examples of good output when possible
- Specify what NOT to do (as important as what TO do)
- Structure with markdown headings and lists
- Keep under 5KB for focused skills, up to 50KB for comprehensive ones

### Naming
- `slug`: kebab-case, descriptive (e.g., `blog-post-writer`, `code-review-security`)
- `name`: Title Case, concise (e.g., "Blog Post Writer", "Security Code Reviewer")
- `description`: One sentence, action-oriented (e.g., "Writes SEO-optimized blog posts with proper heading structure and keyword density")

### Common Mistakes
- Instructions too vague: "Help the user with content" (bad) vs specific process steps (good)
- No output format: AI doesn't know what structure to use
- No constraints: AI rambles or goes off-topic
- Trying to do too much: One skill = one capability. Split if needed.
