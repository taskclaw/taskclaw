-- ============================================================
-- F004: Seed backbone_definitions with 7 backbone types
-- ============================================================

INSERT INTO backbone_definitions (name, slug, protocol, config_schema, supports_streaming, supports_heartbeat, supports_agent_mode, supports_tool_use, icon, color)
VALUES
  ('OpenClaw', 'openclaw', 'websocket', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "Server URL", "description": "Your OpenClaw instance URL" },
      "api_key": { "type": "string", "title": "API Token", "format": "password" },
      "agent_id": { "type": "string", "title": "Agent ID", "description": "The OpenClaw agent to use" }
    },
    "required": ["api_url", "api_key", "agent_id"]
  }', TRUE, TRUE, TRUE, TRUE, 'brain-circuit', '#10b981'),

  ('Claude Code', 'claude-code', 'mcp', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "API URL", "description": "Claude Code API endpoint" },
      "api_key": { "type": "string", "title": "API Key", "format": "password" },
      "workspace_path": { "type": "string", "title": "Workspace Path", "description": "Local workspace directory for file access" }
    },
    "required": ["api_url", "api_key"]
  }', TRUE, FALSE, TRUE, TRUE, 'terminal', '#f97316'),

  ('Codex (OpenAI)', 'codex', 'http', '{
    "type": "object",
    "properties": {
      "api_key": { "type": "string", "title": "OpenAI API Key", "format": "password" },
      "model": { "type": "string", "title": "Model", "default": "codex-mini-latest" },
      "organization_id": { "type": "string", "title": "Organization ID (optional)" }
    },
    "required": ["api_key"]
  }', TRUE, FALSE, FALSE, TRUE, 'code', '#000000'),

  ('OpenRouter', 'openrouter', 'http', '{
    "type": "object",
    "properties": {
      "api_key": { "type": "string", "title": "OpenRouter API Key", "format": "password" },
      "default_model": { "type": "string", "title": "Default Model", "default": "anthropic/claude-sonnet-4-20250514" }
    },
    "required": ["api_key"]
  }', TRUE, FALSE, FALSE, FALSE, 'router', '#6366f1'),

  ('ZeroClaw', 'zeroclaw', 'websocket', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "Server URL" },
      "api_key": { "type": "string", "title": "API Token", "format": "password" },
      "agent_id": { "type": "string", "title": "Agent ID" }
    },
    "required": ["api_url", "api_key", "agent_id"]
  }', TRUE, TRUE, TRUE, TRUE, 'zap', '#eab308'),

  ('PinaClaw', 'pinaclaw', 'websocket', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "Server URL" },
      "api_key": { "type": "string", "title": "API Token", "format": "password" },
      "agent_id": { "type": "string", "title": "Agent ID" }
    },
    "required": ["api_url", "api_key", "agent_id"]
  }', TRUE, TRUE, TRUE, TRUE, 'pine-cone', '#84cc16'),

  ('Custom HTTP', 'custom-http', 'http', '{
    "type": "object",
    "properties": {
      "api_url": { "type": "string", "title": "API URL (OpenAI-compatible)" },
      "api_key": { "type": "string", "title": "API Key", "format": "password" },
      "model": { "type": "string", "title": "Model ID" },
      "headers": { "type": "object", "title": "Custom Headers" }
    },
    "required": ["api_url", "api_key", "model"]
  }', TRUE, FALSE, FALSE, FALSE, 'globe', '#8b5cf6');
