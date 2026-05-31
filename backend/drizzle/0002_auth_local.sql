-- 0002_auth_local.sql — Epic 1: replace Supabase GoTrue with local NestJS auth.
--
-- Idempotent so it is safe on BOTH:
--   * a fresh DB (baseline 0000 already created the columns/tables → IF NOT EXISTS no-ops;
--     auth.users is absent so the backfill is skipped), and
--   * the existing prod DB (adds the columns/tables, backfills hashes, drops the auth FK).
--
-- ORDER MATTERS: backfill from auth.users BEFORE dropping the FK to it.

-- 1. credential columns on public.users -------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash      text,
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sign_in_at    timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users (lower(email));

-- 2. refresh + reset token tables -------------------------------------------
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  family_id   uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_id   uuid,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid,
  user_agent  text,
  ip          text,
  created_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash   ON public.refresh_tokens(token_hash);
CREATE INDEX        IF NOT EXISTS idx_refresh_tokens_user   ON public.refresh_tokens(user_id);
CREATE INDEX        IF NOT EXISTS idx_refresh_tokens_family ON public.refresh_tokens(family_id);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reset_tokens_hash ON public.password_reset_tokens(token_hash);
CREATE INDEX        IF NOT EXISTS idx_reset_tokens_user ON public.password_reset_tokens(user_id);

-- 3. backfill bcrypt hashes from GoTrue (only if auth.users still exists) ----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'auth' AND table_name = 'users') THEN
    UPDATE public.users u
    SET password_hash      = a.encrypted_password,
        email_confirmed_at = a.email_confirmed_at,
        last_sign_in_at    = a.last_sign_in_at
    FROM auth.users a
    WHERE a.id = u.id
      AND u.password_hash IS NULL;

    -- adopt any auth.users without a public.users row (drift safety)
    INSERT INTO public.users (id, email, name, password_hash, status, email_confirmed_at)
    SELECT a.id, a.email, a.raw_user_meta_data->>'full_name',
           a.encrypted_password, 'active', a.email_confirmed_at
    FROM auth.users a
    LEFT JOIN public.users u ON u.id = a.id
    WHERE u.id IS NULL AND a.encrypted_password IS NOT NULL;
  END IF;
END $$;

-- 4. sever the dependency on GoTrue's auth.users ----------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 5. swap signup provisioning trigger off auth.users -------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_public_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_account_id uuid;
BEGIN
  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NEW.name, 'My Account') || '''s Team', NEW.id)
  RETURNING id INTO new_account_id;

  INSERT INTO public.account_users (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner');

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_public_user_created ON public.users;
CREATE TRIGGER on_public_user_created
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_public_user();
