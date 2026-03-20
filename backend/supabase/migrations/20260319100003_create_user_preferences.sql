-- User Preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  locale TEXT NOT NULL DEFAULT 'en',
  notifications_email BOOLEAN NOT NULL DEFAULT true,
  notifications_push BOOLEAN NOT NULL DEFAULT true,
  notifications_in_app BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own preferences
CREATE POLICY "Users can view own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypass
CREATE POLICY "Service role full access to user_preferences"
  ON public.user_preferences FOR ALL
  USING (auth.role() = 'service_role');

-- Grants
GRANT ALL ON public.user_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
