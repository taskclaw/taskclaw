# Skill JSON Schema Reference

## Skill Object

| Field | Type | Required | Max Length | Description |
|-------|------|----------|-----------|-------------|
| `slug` | string | Yes | - | Kebab-case unique identifier per account |
| `name` | string | Yes | 100 | Display name |
| `description` | string | No | 500 | One-line summary shown in UI |
| `instructions` | string | Yes | 51,200 (50KB) | Full markdown instructions for the AI |
| `is_active` | boolean | No | - | Default `true`. Set `false` to disable without deleting. |

## Slug Convention

Generate from name: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`

Examples:
- "Blog Post Writer" → `blog-post-writer`
- "X Post Reviewer" → `x-post-reviewer`
- "Security Code Analyzer" → `security-code-analyzer`

## Bundle Wrapper

Skills must be wrapped in a category for import:

```json
{
  "bundle_version": "1.0",
  "categories": [
    {
      "slug": "category-slug",
      "name": "Category Name",
      "color": "#6366f1",
      "icon": "brain",
      "skills": [
        {
          "slug": "skill-slug",
          "name": "Skill Name",
          "description": "One-line description",
          "instructions": "Full instructions...",
          "is_active": true
        }
      ],
      "knowledge_docs": []
    }
  ]
}
```

## Instructions Field Structure

The `instructions` field is the core of a skill. It's markdown text that gets injected into the AI's system prompt during conversations.

### Recommended Structure

```markdown
You are a [role] specialized in [domain].

## Your process:
1. [Step 1 - what to analyze/consider]
2. [Step 2 - what to do]
3. [Step 3 - what to produce]

## Output format:
- **Section**: [what to include]
- **Section**: [what to include]

## Guidelines:
- [Positive guidance - what TO do]
- [Constraints - what NOT to do]
- [Quality standards]

## Examples:
### Good example:
[Example of desired output]

### Bad example:
[Example of what to avoid]
```

## How Skills Are Used at Runtime

1. User opens a conversation linked to a category
2. System fetches all active skills for that category
3. Skills are injected into the system prompt:
   ```
   The following specialized skills are active:
   [Skill 1 name]: [Skill 1 instructions]
   [Skill 2 name]: [Skill 2 instructions]
   Apply these skills when responding.
   ```
4. AI reads instructions and applies them to its responses
