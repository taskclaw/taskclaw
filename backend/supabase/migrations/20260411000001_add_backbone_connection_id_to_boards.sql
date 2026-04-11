-- Add backbone_connection_id to board_instances
-- The boards service uses this column name directly (vs default_backbone_connection_id)
ALTER TABLE board_instances
  ADD COLUMN IF NOT EXISTS backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_instances_backbone ON board_instances(backbone_connection_id);
