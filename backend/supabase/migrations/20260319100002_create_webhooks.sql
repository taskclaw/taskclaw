-- Webhook Event System
-- Creates webhooks and webhook_deliveries tables for event-driven integrations

-- ============================================================
-- 1. WEBHOOKS (user-configured webhook endpoints)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT '{}',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_account
  ON public.webhooks(account_id);

CREATE INDEX IF NOT EXISTS idx_webhooks_active
  ON public.webhooks(account_id, active) WHERE active = TRUE;

CREATE TRIGGER update_webhooks_updated_at
  BEFORE UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.webhooks IS
  'User-configured webhook endpoints that receive event notifications';

-- ============================================================
-- 2. WEBHOOK DELIVERIES (delivery history and retry tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed')),
  response_code INTEGER,
  response_body TEXT,
  attempts      INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
  ON public.webhook_deliveries(webhook_id);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON public.webhook_deliveries(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON public.webhook_deliveries(next_retry_at) WHERE status = 'pending' AND next_retry_at IS NOT NULL;

COMMENT ON TABLE public.webhook_deliveries IS
  'Tracks individual webhook delivery attempts with retry support';

-- ============================================================
-- 3. ROW-LEVEL SECURITY
-- ============================================================
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view webhooks in their accounts"
  ON public.webhooks FOR SELECT
  USING (account_id IN (SELECT get_auth_user_account_ids()));

CREATE POLICY "Users can create webhooks in their accounts"
  ON public.webhooks FOR INSERT
  WITH CHECK (account_id IN (SELECT get_auth_user_account_ids()));

CREATE POLICY "Users can update webhooks in their accounts"
  ON public.webhooks FOR UPDATE
  USING (account_id IN (SELECT get_auth_user_account_ids()));

CREATE POLICY "Users can delete webhooks in their accounts"
  ON public.webhooks FOR DELETE
  USING (account_id IN (SELECT get_auth_user_account_ids()));

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deliveries of their webhooks"
  ON public.webhook_deliveries FOR SELECT
  USING (webhook_id IN (
    SELECT id FROM public.webhooks
    WHERE account_id IN (SELECT get_auth_user_account_ids())
  ));

-- ============================================================
-- 4. GRANT PERMISSIONS
-- ============================================================
GRANT ALL ON public.webhooks TO service_role;
GRANT ALL ON public.webhook_deliveries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT SELECT ON public.webhook_deliveries TO authenticated;
