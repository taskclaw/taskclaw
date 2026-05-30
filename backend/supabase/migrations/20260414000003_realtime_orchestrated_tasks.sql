-- Enable Supabase Realtime on orchestrated_tasks
-- Allows frontend to receive live status updates without polling
-- fix: guard so a re-run (after a partial failure) doesn't error with
-- "table already member of publication"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orchestrated_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orchestrated_tasks;
  END IF;
END $$;

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
        -- fix: membership table is account_users, not account_members
        SELECT account_id FROM account_users WHERE user_id = auth.uid()
      ));
  END IF;
END $$;
