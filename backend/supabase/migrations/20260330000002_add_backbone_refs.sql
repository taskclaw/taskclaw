-- ============================================================
-- F003: Add backbone_connection_id columns to existing tables
-- ============================================================

ALTER TABLE board_instances
  ADD COLUMN default_backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

ALTER TABLE board_steps
  ADD COLUMN backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

ALTER TABLE categories
  ADD COLUMN preferred_backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN backbone_connection_id UUID REFERENCES backbone_connections(id) ON DELETE SET NULL;

ALTER TABLE ai_provider_configs
  ADD COLUMN IF NOT EXISTS migrated_to UUID REFERENCES backbone_connections(id);
