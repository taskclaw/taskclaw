-- M02: Add pod_id foreign keys to board_instances and conversations
ALTER TABLE board_instances ADD COLUMN IF NOT EXISTS pod_id uuid REFERENCES pods(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pod_id uuid REFERENCES pods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_board_instances_pod ON board_instances(pod_id);
CREATE INDEX IF NOT EXISTS idx_conversations_pod ON conversations(pod_id);
