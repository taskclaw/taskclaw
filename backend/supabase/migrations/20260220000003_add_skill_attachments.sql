-- Add file_attachments column to skills table (same pattern as knowledge_docs)
ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS file_attachments JSONB DEFAULT '[]';

-- Create Supabase Storage bucket for skill attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('skill-attachments', 'skill-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for skill-attachments bucket
CREATE POLICY "Users can upload skill attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'skill-attachments'
);

CREATE POLICY "Users can view skill attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'skill-attachments'
);

CREATE POLICY "Users can delete skill attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'skill-attachments'
);

-- Ensure supabase_storage_admin can SET ROLE to authenticated/service_role
-- (required for the Storage API to switch roles based on the API key used)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_auth_members am
    JOIN pg_roles r ON am.member = r.oid
    JOIN pg_roles m ON am.roleid = m.oid
    WHERE r.rolname = 'supabase_storage_admin' AND m.rolname = 'authenticator'
  ) THEN
    GRANT authenticator TO supabase_storage_admin;
  END IF;
END
$$;

-- Notify PostgREST to reload its schema cache (picks up new columns)
NOTIFY pgrst, 'reload schema';
