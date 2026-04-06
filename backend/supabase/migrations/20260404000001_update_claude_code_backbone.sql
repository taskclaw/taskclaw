-- ============================================================
-- F201: Update claude-code backbone_definition for local CLI
--
-- Changes:
--   - protocol: 'mcp' → 'cli'   (not an HTTP/WebSocket API)
--   - config_schema: removes api_url/api_key, adds model,
--     workspace_path, system_prompt_prefix, timeout_seconds
--   - supports_streaming: false  (subprocess; no SSE)
--   - supports_heartbeat: false
-- ============================================================

UPDATE backbone_definitions
SET
  protocol            = 'cli',
  config_schema       = '{
    "type": "object",
    "properties": {
      "model": {
        "type": "string",
        "title": "Model",
        "description": "Claude model to use (e.g. claude-sonnet-4-6)",
        "default": "claude-sonnet-4-6"
      },
      "workspace_path": {
        "type": "string",
        "title": "Workspace Path",
        "description": "Optional working directory for Claude Code"
      },
      "system_prompt_prefix": {
        "type": "string",
        "title": "System Prompt Prefix",
        "description": "Optional prefix to prepend to all system prompts"
      },
      "timeout_seconds": {
        "type": "number",
        "title": "Timeout (seconds)",
        "description": "Max seconds to wait for response",
        "default": 120
      }
    },
    "required": []
  }',
  supports_streaming  = FALSE,
  supports_heartbeat  = FALSE
WHERE slug = 'claude-code';
