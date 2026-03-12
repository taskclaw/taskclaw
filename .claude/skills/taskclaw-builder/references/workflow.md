# Orchestrator Workflow Reference

This document describes the internal workflow the TaskClaw Builder follows when creating a full bundle.

## Phase Dependencies

```
Phase 1 (Vision)
    ↓
Phase 2 (Scope)         ← Defines what entities are needed
    ↓
Phase 3 (Board Design)  ← Creates steps, routing, fields
    ↓
Phase 4 (Agent Design)  ← Creates categories, skills, links to steps
    ↓
Phase 5 (Knowledge)     ← Creates knowledge docs, links to agents
    ↓
Phase 6 (Generate)      ← Assembles the JSON bundle
```

## Cross-Referencing Rules

### Categories ↔ Steps
- Steps reference categories via `linked_category_slug`
- The slug must match a category in the same board's `categories` array
- If a category is used by multiple boards, include it in each board's array AND the top-level `categories` array

### Steps ↔ Steps
- `on_success` and `on_error` reference step `id` values (not names)
- These are resolved to UUIDs during import — use slugs freely

### Board Default Agent
- `default_category_slug` references a category slug
- This is the fallback agent when a step has no `linked_category_slug`

## Bundle Assembly

The final JSON is assembled by merging all designed entities:

1. **Top-level categories**: All unique categories across all boards (deduplicated)
2. **Boards**: Each board with its own categories and steps array

```json
{
  "bundle_version": "1.0",
  "categories": [ /* all unique categories */ ],
  "boards": [
    {
      "manifest_version": "1.0",
      "categories": [ /* this board's categories (may overlap with top-level) */ ],
      "steps": [ /* this board's steps */ ]
    }
  ]
}
```

The import system processes in order:
1. Top-level categories → upsert (create or match by name)
2. Board categories → upsert (may reuse already-created ones)
3. Board steps → create with linked_category resolved to UUID

## Specialized Skill Handoff

After generating the bundle, users may want to refine specific pieces. Point them to:

| Need | Skill | Command |
|------|-------|---------|
| Redesign board flow | Board Architect | `/board-architect` |
| Refine skill instructions | Skill Writer | `/skill-writer` |
| Restructure agent groupings | Agent Designer | `/agent-designer` |
| Expand knowledge docs | Knowledge Curator | `/knowledge-curator` |

Each specialized skill outputs JSON in the same bundle format, so the user can merge outputs or import them separately.

## Schema Reference

For the full JSON schema details, see the shared reference:
- `taskclaw-shared/bundle_format.md` — Complete field-by-field documentation
