# Board Step Types Reference

## Overview

Each step in a TaskClaw board has a `type` that determines its behavior. Choose the right type based on what happens at that stage of the workflow.

---

## `input` — Entry Point

The first step where tasks enter the board. Users provide initial data.

```json
{
  "type": "input",
  "trigger_type": "manual",
  "ai_first": false,
  "input_schema": [
    { "key": "topic", "label": "Topic", "type": "text", "required": true }
  ]
}
```

**When to use**: Always use as the first step. This is where new cards are created.

**Typical setup**:
- `trigger_type: "manual"` (user creates cards manually)
- `ai_first: false` (no AI on entry — user is providing data)
- Define `input_schema` for the data the user needs to provide

---

## `ai_process` — AI Automation

AI processes the card automatically. The linked agent's skills are used.

```json
{
  "type": "ai_process",
  "trigger_type": "on_entry",
  "ai_first": true,
  "linked_category_slug": "my-agent",
  "system_prompt": "Analyze the card data and produce a summary..."
}
```

**When to use**: When AI should do work — drafting, analyzing, classifying, summarizing, generating.

**Typical setup**:
- `trigger_type: "on_entry"` (auto-run when card arrives)
- `ai_first: true` (AI acts before human)
- `linked_category_slug` pointing to the agent with relevant skills
- `system_prompt` with specific instructions for this step
- `output_schema` for what the AI should produce

**Key**: The `system_prompt` is step-specific. The agent's skills provide general capability, the system_prompt provides step-specific instructions.

---

## `human_review` — Human Checkpoint

A human reviews, edits, or approves the card.

```json
{
  "type": "human_review",
  "trigger_type": "manual",
  "ai_first": false,
  "linked_category_slug": "my-editor-agent",
  "output_schema": [
    { "key": "approved", "label": "Approved", "type": "boolean" }
  ]
}
```

**When to use**: Quality control between AI steps, approval gates, manual editing.

**Typical setup**:
- `trigger_type: "manual"` (human decides when to proceed)
- `ai_first: false` (human acts first)
- Optional `linked_category_slug` for AI assistance (user can still chat with agent)
- `on_error` pointing back to a previous step for rejection flow

---

## `action` — External Action

Triggers an external action: webhook call, scheduling, API integration.

```json
{
  "type": "action",
  "trigger_type": "manual",
  "webhook_url": "https://api.example.com/publish",
  "webhook_auth_header": "Bearer token123"
}
```

**When to use**: Publishing, sending notifications, scheduling, external system integration.

**Typical setup**:
- `webhook_url` and `webhook_auth_header` for external calls
- `schedule_cron` for time-based triggers
- Can also be manual (user clicks to execute)

---

## `done` — Completion

Terminal step. Cards here are considered finished.

```json
{
  "type": "done",
  "trigger_type": "on_entry",
  "ai_first": false,
  "output_schema": [
    { "key": "result_url", "label": "Result URL", "type": "url" }
  ]
}
```

**When to use**: Always the last step. Every board needs exactly one.

**Typical setup**:
- `trigger_type: "on_entry"` (auto-complete when card arrives)
- Optional `output_schema` for final results/metrics
- `on_success: null`, `on_error: null` (terminal — no routing)

---

## Common Patterns

### Linear Pipeline
```
input → ai_process → human_review → action → done
```

### Review Loop
```
input → ai_process → human_review ←→ ai_process (on_error loops back)
                          ↓
                         done
```

### Triage Fan-Out
```
input → ai_process (classifier)
           ↓ on_success → priority_high → done
           ↓ on_error → priority_low → done
```

### Multi-AI Pipeline
```
input → ai_step_1 → ai_step_2 → human_review → done
```
Each AI step has its own agent category and system prompt.
