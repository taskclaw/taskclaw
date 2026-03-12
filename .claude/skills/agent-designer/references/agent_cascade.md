# Agent Priority Cascade

## Overview

When TaskClaw needs to determine which AI agent to use for a task, it follows a 4-tier priority cascade. The first non-null value wins.

## Priority Order

```
1. Card-level override     → task.override_category_id    (highest)
2. Column-level (step)     → board_step.linked_category_id
3. Board-level default     → board_instance.default_category_id
4. Task category (legacy)  → task.category_id              (lowest)
```

## How Each Level Works

### 1. Card-Level Override (Highest Priority)
- Set per individual task/card
- Overrides everything else
- Use case: "This specific card needs a different agent than the column default"
- Set via: Task detail panel → Agent override dropdown

### 2. Column-Level (Step)
- Set per board step (Kanban column)
- The `linked_category_slug` in the manifest
- Use case: "All cards in the Drafting column use the Copywriter agent"
- Set via: Board step settings or manifest import

### 3. Board-Level Default
- Set once for the entire board
- The `default_category_slug` in the manifest
- Use case: "Unless a column specifies otherwise, use this agent"
- Set via: Board settings or manifest import

### 4. Task Category (Legacy)
- The task's original category assignment
- Lowest priority — only used if nothing else is set
- Legacy from before the board system existed

## Design Implications

When designing agents for a board:

1. **Set a board-level default** for the most common agent
2. **Set column-level agents** for specialized steps
3. **Leave card-level for users** to override when needed

### Example: Content Pipeline

```
Board default: "Content Writer" (most columns need writing help)

Step "Idea":     linked to "Idea Generator" (specialized)
Step "Drafting":  linked to "Copywriter" (specialized)
Step "Visual":    linked to "Visual Advisor" (specialized)
Step "Review":    linked to "Editor" (specialized)
Step "Scheduled": linked to "Scheduler" (specialized)
Step "Published": no agent (done step)
```

A card can still override any of these at the card level.
