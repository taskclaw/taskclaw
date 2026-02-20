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
