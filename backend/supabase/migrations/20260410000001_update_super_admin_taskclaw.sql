-- Migrate super admin to super@taskclaw.co
-- This migration is idempotent: safe to run multiple times.
-- Password must be set via GoTrue admin API after applying (crypt() hashes don't work with GoTrue).
-- See: backend/scripts/set-super-admin-password.sh

DO $$
DECLARE
  target_user_id uuid := 'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d';
BEGIN
  -- Update auth.users email and metadata
  UPDATE auth.users SET
    email = 'super@taskclaw.co',
    raw_user_meta_data = '{"full_name": "TaskClaw Admin"}'::jsonb,
    email_confirmed_at = now(),
    updated_at = now()
  WHERE id = target_user_id;

  -- Update public.users
  UPDATE public.users SET
    email = 'super@taskclaw.co',
    name = 'TaskClaw Admin'
  WHERE id = target_user_id;

  -- Clean and re-insert identity
  DELETE FROM auth.identities WHERE user_id = target_user_id;
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    target_user_id, target_user_id, 'super@taskclaw.co',
    jsonb_build_object('sub', target_user_id::text, 'email', 'super@taskclaw.co', 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  ) ON CONFLICT (provider_id, provider) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();
END $$;
