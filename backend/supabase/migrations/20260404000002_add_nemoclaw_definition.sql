INSERT INTO backbone_definitions (
  name, slug, description, icon, color, protocol,
  supports_streaming, supports_heartbeat, supports_agent_mode,
  supports_tool_use, supports_file_access, supports_code_execution,
  config_schema, is_active
) VALUES (
  'NemoClaw',
  'nemoclaw',
  'NVIDIA NeMo Microservice — OpenAI-compatible local AI inference. Run open-source models like LLaMA, Nemotron, and Mistral locally.',
  'cpu',
  '#76b900',
  'http',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  '{"type":"object","properties":{"api_url":{"type":"string","title":"API URL","description":"NeMo Microservice base URL (e.g. http://localhost:8000)","default":"http://localhost:8000"},"model":{"type":"string","title":"Model","description":"Model name (e.g. meta/llama-3.1-8b-instruct)","default":"meta/llama-3.1-8b-instruct"},"api_key":{"type":"string","title":"API Key","format":"password","description":"Optional API key (leave empty for local deployments)"},"max_tokens":{"type":"number","title":"Max Tokens","description":"Maximum tokens in response","default":2048},"temperature":{"type":"number","title":"Temperature","description":"Sampling temperature 0-2","default":0.7}},"required":["api_url","model"]}',
  TRUE
);
