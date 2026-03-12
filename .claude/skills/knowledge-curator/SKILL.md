---
name: knowledge-curator
description: Structure knowledge base documents for TaskClaw agents through guided conversation. Helps organize domain expertise, FAQs, guidelines, and reference materials into importable JSON. Use when creating knowledge docs, building agent knowledge bases, organizing reference materials, or adding domain expertise to agents.
license: MIT
triggers:
  - create knowledge
  - knowledge base
  - knowledge curator
  - write knowledge doc
  - agent knowledge
  - reference document
  - domain expertise
  - FAQ document
  - guidelines document
metadata:
  version: 1.0.0
  author: TaskClaw
  category: taskclaw-builder
  domain: knowledge-management
  updated: 2026-03-12
---

# Knowledge Curator

Structure knowledge base documents for TaskClaw agents. Generates knowledge doc JSON ready for import.

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

1. User describes the domain or agent that needs knowledge
2. You identify what knowledge the agent needs
3. You structure the content (guidelines, FAQs, reference material)
4. You determine master vs supplementary docs
5. You generate knowledge doc JSON for import

---

## Key Concepts

### What is a Knowledge Doc?

A knowledge doc is a reference document attached to an agent category. It provides domain-specific context that the AI uses when responding.

### Master vs Supplementary

- **Master doc** (`is_master: true`): Auto-injected into every AI conversation for that agent. The agent "always knows" this information. **One per category.**
- **Supplementary** (`is_master: false`): Available as reference but not auto-injected. Useful for detailed specs, archives, or situational content.

### How Knowledge is Used

```
User sends message → System builds prompt:
  1. System prompt (base behavior)
  2. Active skills (instructions)
  3. Master knowledge doc (auto-injected)
  4. Task context
  → AI responds with combined knowledge
```

---

## Wizard Flow

### Phase 1: Agent Context

Ask the user:
- "Which agent (category) is this knowledge for?"
- "What does this agent do? What's its role?"
- "What kind of questions or tasks does it handle?"

### Phase 2: Knowledge Audit

Ask:
- "What does the agent need to know to do its job well?"
- "Are there existing documents, guidelines, or FAQs we can incorporate?"
- "What are the most common mistakes or edge cases?"

Suggest knowledge categories:
- **Domain rules**: Industry regulations, company policies, brand guidelines
- **Process guides**: Step-by-step procedures, decision trees
- **FAQs**: Common questions and approved answers
- **Reference data**: Pricing, specifications, feature lists
- **Templates**: Response templates, email formats, report structures
- **Examples**: Good/bad examples of output

### Phase 3: Content Structure

For each knowledge doc:
- "What should the title be?"
- "Let me help you organize the content..."

Structure the content with:
- Clear headings (H2/H3)
- Bullet points for scannable info
- Tables for structured data
- Examples where helpful
- Decision trees for complex logic

### Phase 4: Master Selection

Ask:
- "Should this be the master doc (auto-injected in every conversation)?"
- "Or is it supplementary reference material?"

Rule of thumb:
- Master = essential knowledge the agent always needs
- Supplementary = detailed reference consulted occasionally

### Phase 5: Generate

Generate the knowledge doc JSON and tell the user how to import.

---

## Schema Reference

See `references/knowledge_schema.md` for the full schema.

### Knowledge Doc JSON

```json
{
  "title": "Document Title",
  "content": "Full markdown content...",
  "is_master": true
}
```

### Embedded in Category (for bundle import)

```json
{
  "bundle_version": "1.0",
  "categories": [
    {
      "slug": "my-agent",
      "name": "My Agent",
      "color": "#6366f1",
      "icon": "brain",
      "skills": [],
      "knowledge_docs": [
        {
          "title": "Domain Guidelines",
          "content": "# Domain Guidelines\n\n## Rules\n- Rule 1\n- Rule 2\n\n## FAQs\n\n### Q: Common question?\nA: Answer...",
          "is_master": true
        },
        {
          "title": "Detailed Reference",
          "content": "# Reference Material\n\n...",
          "is_master": false
        }
      ]
    }
  ]
}
```

---

## Output Format

Output as a bundle JSON:

~~~
```json
{
  "bundle_version": "1.0",
  "categories": [
    {
      "slug": "existing-agent-slug",
      "name": "Existing Agent Name",
      "color": "#6366f1",
      "icon": "brain",
      "skills": [],
      "knowledge_docs": [ ... ]
    }
  ]
}
```
~~~

Tell the user:

> Save this as a `.json` file and import it into TaskClaw at **Import** (`/dashboard/import`). The knowledge docs will be attached to the specified agent category.
>
> If the category already exists, it will be reused (matched by name). New knowledge docs will be added to it.

---

## Best Practices

### Content Quality
- **Be specific**: "Reply within 24 hours" not "Reply quickly"
- **Use examples**: Show good and bad output
- **Structure well**: Use headings, lists, tables
- **Keep current**: Outdated knowledge is worse than no knowledge
- **Test it**: Try asking the agent questions your users would ask

### Master Doc Guidelines
- Keep under 10KB (injected in every conversation = token cost)
- Include only essential, always-relevant information
- Structure as: Overview → Rules → FAQs → Examples
- Don't duplicate skill instructions (skills handle "how to do things")

### Content Patterns

#### Brand Guidelines Doc
```markdown
# Brand Guidelines

## Voice & Tone
- Professional but approachable
- Use "we" not "I"
- Avoid jargon unless talking to technical audience

## Key Messages
- [Message 1]
- [Message 2]

## Words to Use / Avoid
| Use | Avoid |
|-----|-------|
| innovative | groundbreaking |
| help | assist |
```

#### FAQ Doc
```markdown
# Frequently Asked Questions

### Q: [Common question 1]?
**A:** [Approved answer]

### Q: [Common question 2]?
**A:** [Approved answer]

### Escalation Triggers
If the user asks about these topics, escalate to a human:
- Refund requests over $500
- Legal complaints
- Security incidents
```

#### Process Guide Doc
```markdown
# Process Guide

## Decision Tree

1. Is the request about billing?
   - Yes → Follow billing process
   - No → Continue to step 2
2. Is it a technical issue?
   - Yes → Follow troubleshooting steps
   - No → General inquiry process

## Billing Process
1. Verify account
2. Check billing history
3. ...
```

### Common Mistakes
- Too much content in master doc (token waste, confuses AI)
- Too little structure (AI can't find relevant info)
- Duplicating skill instructions in knowledge (they serve different purposes)
- No examples (AI doesn't know what "good" looks like)
