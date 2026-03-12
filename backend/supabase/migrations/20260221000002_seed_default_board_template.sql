-- Seed the "Default Task Board" system template
-- This provides the standard 6-column Kanban board that matches the existing hardcoded statuses

INSERT INTO public.board_templates (
  id,
  account_id,
  name,
  slug,
  description,
  icon,
  color,
  tags,
  manifest,
  manifest_version,
  version,
  is_published,
  is_system,
  published_at,
  author_name,
  author_email
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL, -- system template, not owned by any account
  'Default Task Board',
  'default-task-board',
  'Standard Kanban board with To-Do, Today, In Progress, AI Running, In Review, and Done columns. Matches the classic TaskClaw workflow.',
  'layout-grid',
  '#6366f1',
  ARRAY['default', 'kanban', 'tasks'],
  '{
    "manifest_version": "1.0",
    "id": "default-task-board",
    "name": "Default Task Board",
    "description": "Standard Kanban board with 6 columns",
    "version": "1.0.0",
    "author": "system@taskclaw.co",
    "tags": ["default", "kanban", "tasks"],
    "icon": "layout-grid",
    "color": "#6366f1",
    "required_tools": [],
    "settings": {
      "allow_manual_column_move": true,
      "card_retention_days": null
    },
    "steps": [
      {
        "id": "to-do",
        "name": "To-Do",
        "type": "input",
        "position": 0,
        "color": "#71717a",
        "ai_config": { "enabled": false },
        "fields": { "inputs": [], "outputs": [] },
        "on_complete": "today",
        "on_error": null
      },
      {
        "id": "today",
        "name": "Today",
        "type": "input",
        "position": 1,
        "color": "#f59e0b",
        "ai_config": { "enabled": false },
        "fields": { "inputs": [], "outputs": [] },
        "on_complete": "in-progress",
        "on_error": null
      },
      {
        "id": "in-progress",
        "name": "In Progress",
        "type": "human_review",
        "position": 2,
        "color": "#3b82f6",
        "ai_config": { "enabled": false },
        "fields": { "inputs": [], "outputs": [] },
        "on_complete": "ai-running",
        "on_error": null
      },
      {
        "id": "ai-running",
        "name": "AI Running",
        "type": "ai_process",
        "position": 3,
        "color": "#a855f7",
        "ai_config": { "enabled": true, "ai_first": true },
        "fields": { "inputs": [], "outputs": [] },
        "on_complete": "in-review",
        "on_error": "in-progress"
      },
      {
        "id": "in-review",
        "name": "In Review",
        "type": "human_review",
        "position": 4,
        "color": "#f97316",
        "ai_config": { "enabled": false },
        "fields": { "inputs": [], "outputs": [] },
        "on_complete": "done",
        "on_error": null
      },
      {
        "id": "done",
        "name": "Done",
        "type": "done",
        "position": 5,
        "color": "#22c55e",
        "ai_config": { "enabled": false },
        "fields": { "inputs": [], "outputs": [] }
      }
    ]
  }'::jsonb,
  '1.0',
  '1.0.0',
  TRUE,
  TRUE,
  NOW(),
  'TaskClaw',
  'system@taskclaw.co'
)
ON CONFLICT DO NOTHING;
