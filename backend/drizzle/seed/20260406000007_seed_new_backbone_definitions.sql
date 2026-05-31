-- M07: Seed Anthropic and Ollama backbone definitions
INSERT INTO backbone_definitions (name, slug, protocol, description, config_schema, supports_streaming, supports_heartbeat, supports_agent_mode, supports_tool_use, supports_code_execution, icon, color, is_active)
VALUES
  ('Anthropic (Claude)', 'anthropic', 'http', 'Direct Anthropic API access for Claude models.',
   '{"type":"object","properties":{"api_key":{"type":"string","title":"Anthropic API Key","format":"password"},"model":{"type":"string","title":"Model","default":"claude-opus-4-5"},"max_tokens":{"type":"number","title":"Max Output Tokens","default":8192}},"required":["api_key"]}',
   TRUE, FALSE, FALSE, TRUE, FALSE, 'brain', '#d97706', TRUE),
  ('Ollama (Local)', 'ollama', 'http', 'Local LLM support via Ollama for privacy-sensitive workflows.',
   '{"type":"object","properties":{"api_url":{"type":"string","title":"Ollama Server URL","default":"http://ollama:11434"},"model":{"type":"string","title":"Model Name (e.g. llama3.2:3b)"}},"required":["api_url","model"]}',
   TRUE, FALSE, FALSE, FALSE, FALSE, 'server', '#64748b', TRUE)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, config_schema = EXCLUDED.config_schema, is_active = TRUE;
