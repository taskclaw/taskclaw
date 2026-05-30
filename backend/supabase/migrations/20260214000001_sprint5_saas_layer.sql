-- Sprint 5: SaaS Layer Enhancements
-- Adds onboarding tracking, Stripe price IDs, and knowledge attachment storage

-- 1. Onboarding tracking on accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- 2. Stripe price ID mapping on plans
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- 3. Create the storage bucket for knowledge attachments
-- fix: older self-hosted storage schemas have no "public" column on
-- storage.buckets, which made the insert fail on a fresh DB. Only reference the
-- "public" column when it exists; otherwise insert id+name only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('knowledge-attachments', 'knowledge-attachments', false)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO storage.buckets (id, name)
    VALUES ('knowledge-attachments', 'knowledge-attachments')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 4. Storage policies for knowledge attachments
-- Allow authenticated users to upload to their own account folder
CREATE POLICY "Users can upload knowledge attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'knowledge-attachments'
);

CREATE POLICY "Users can view knowledge attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'knowledge-attachments'
);

CREATE POLICY "Users can delete knowledge attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'knowledge-attachments'
);

-- 5. Ensure all OTT tables have proper role grants (knowledge_docs and skills were missing)
GRANT ALL ON public.knowledge_docs TO anon, authenticated, service_role;
GRANT ALL ON public.skills TO anon, authenticated, service_role;

-- 6. Mark existing accounts as onboarding completed (they were created before onboarding existed)
UPDATE public.accounts SET onboarding_completed = true WHERE onboarding_completed IS NULL OR onboarding_completed = false;
