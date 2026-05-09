-- Add 'workspace_chat' to the execution_log trigger_type constraint
-- This allows cockpit workspace conversations to appear in the 24h timeline

ALTER TABLE execution_log
  DROP CONSTRAINT IF EXISTS execution_log_trigger_type_check;

ALTER TABLE execution_log
  ADD CONSTRAINT execution_log_trigger_type_check
  CHECK (trigger_type IN ('heartbeat', 'dag_step', 'route_transfer', 'tool_execution', 'coordinator', 'manual', 'workspace_chat'));
