# Category (Agent) JSON Schema Reference

## Category Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | Yes | Kebab-case, unique per account |
| `name` | string | Yes | Display name (unique per account) |
| `color` | string | No | Hex color for UI |
| `icon` | string | No | Lucide icon name |
| `skills` | Skill[] | No | Embedded skill definitions |
| `knowledge_docs` | KnowledgeDoc[] | No | Embedded knowledge documents |

## Slug Convention

Generate from name: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`

## Deduplication

Categories are upserted by `(account_id, name)`. If a category with the same name already exists:
- The existing category is reused
- New skills and knowledge docs are still added
- This enables multiple imports to build on existing agents

## Colors (suggested)

| Color | Hex | Good for |
|-------|-----|----------|
| Indigo | `#6366f1` | Default, general |
| Purple | `#8b5cf6` | Creative, research |
| Pink | `#ec4899` | Design, visual |
| Red | `#ef4444` | Urgent, alerts |
| Orange | `#f97316` | Review, editing |
| Amber | `#f59e0b` | Analysis, QA |
| Green | `#22c55e` | Completion, success |
| Cyan | `#06b6d4` | Scheduling, planning |
| Blue | `#3b82f6` | Writing, content |

## Icons (commonly used)

| Icon | Good for |
|------|----------|
| `brain` | General AI, analysis |
| `pen-tool` | Writing, content |
| `code` | Engineering, development |
| `search` | Research |
| `image` | Visual, design |
| `check-circle` | Review, QA |
| `calendar` | Scheduling, planning |
| `headphones` | Support |
| `trending-up` | Sales, marketing |
| `shield` | Security |
| `lightbulb` | Ideas, brainstorming |
| `bar-chart` | Analytics, data |

## Bundle Wrapper

```json
{
  "bundle_version": "1.0",
  "categories": [
    {
      "slug": "my-agent",
      "name": "My Agent",
      "color": "#6366f1",
      "icon": "brain",
      "skills": [
        {
          "slug": "skill-1",
          "name": "Skill One",
          "description": "What skill one does",
          "instructions": "You are...",
          "is_active": true
        }
      ],
      "knowledge_docs": [
        {
          "title": "Reference Guide",
          "content": "# Guide\n\n...",
          "is_master": true
        }
      ]
    }
  ]
}
```

## How Categories Link to Board Steps

Board steps reference categories via `linked_category_slug`:

```json
{
  "id": "drafting",
  "name": "Drafting",
  "type": "ai_process",
  "linked_category_slug": "my-agent",
  "ai_first": true,
  "system_prompt": "Do the thing..."
}
```

When a task enters this step, the linked agent's skills and knowledge are available for AI processing.
