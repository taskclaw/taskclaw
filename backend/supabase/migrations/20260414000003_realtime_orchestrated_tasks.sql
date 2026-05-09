-- Enable Supabase Realtime on orchestrated_tasks
-- Allows frontend to receive live status updates without polling
ALTER PUBLICATION supabase_realtime ADD TABLE orchestrated_tasks;

-- RLS policy: users can see their account's tasks
-- (Only add if policy doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orchestrated_tasks'
    AND policyname = 'Users can view their account orchestrated tasks'
  ) THEN
    CREATE POLICY "Users can view their account orchestrated tasks"
      ON orchestrated_tasks FOR SELECT
      USING (account_id IN (
        SELECT account_id FROM account_members WHERE user_id = auth.uid()
      ));
  END IF;
END $$;
