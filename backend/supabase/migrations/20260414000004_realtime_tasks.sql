-- Enable Supabase Realtime on the tasks table so the frontend can subscribe
-- to INSERT events and show live task cards inside orchestration groups.
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- RLS policy: allow users to see tasks belonging to their accounts.
-- tasks table already has account_id; account_users links user_id → account_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tasks'
      AND policyname = 'Users can view their account tasks (realtime)'
  ) THEN
    CREATE POLICY "Users can view their account tasks (realtime)"
      ON tasks FOR SELECT
      USING (
        account_id IN (
          SELECT account_id FROM account_users WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
