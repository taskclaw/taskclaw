# Knowledge Doc JSON Schema Reference

## Knowledge Doc Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Document title |
| `content` | string | Yes | Full markdown content |
| `is_master` | boolean | No | Default `false`. If `true`, auto-injected into AI context. |

## Master Document Rules

- **One master per category**: Only one knowledge doc can be `is_master: true` per agent category
- **Auto-injected**: Master doc content is included in every AI conversation for that agent
- **Token cost**: Keep master docs concise (under 10KB recommended) since they're injected every time
- **Purpose**: Essential knowledge the agent always needs — guidelines, rules, context

## Supplementary Documents

- **Not auto-injected**: Available as reference but not included by default
- **No limit**: Multiple supplementary docs per category
- **Purpose**: Detailed specs, archives, situational reference

## Content Format

Use markdown for structure:

```markdown
# Document Title

## Section 1
Key information...

## Section 2
More information...

### Subsection
Detailed content...

## Quick Reference
| Item | Value |
|------|-------|
| ... | ... |
```

## Bundle Wrapper

Knowledge docs must be embedded in a category for import:

```json
{
  "bundle_version": "1.0",
  "categories": [
    {
      "slug": "agent-slug",
      "name": "Agent Name",
      "color": "#6366f1",
      "icon": "brain",
      "skills": [],
      "knowledge_docs": [
        {
          "title": "Main Guidelines",
          "content": "# Guidelines\n\n## Rules\n...",
          "is_master": true
        },
        {
          "title": "Detailed Reference",
          "content": "# Reference\n\n...",
          "is_master": false
        }
      ]
    }
  ]
}
```

## How Knowledge is Injected

At runtime, master knowledge is added to the system prompt:

```
=== KNOWLEDGE BASE ===
Title: Main Guidelines
Content:
# Guidelines
## Rules
...
```

This appears after the skill instructions and before the task context.
