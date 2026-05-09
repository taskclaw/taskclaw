-- BE15: Add pilot_enabled column to heartbeat_configs
-- When true, the heartbeat triggers the pod's PilotService instead of raw backbone call
ALTER TABLE heartbeat_configs ADD COLUMN IF NOT EXISTS pilot_enabled boolean DEFAULT false;
