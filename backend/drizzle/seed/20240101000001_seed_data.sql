-- Seed: plans + a dev super-admin (local-auth version; no GoTrue/auth.users).

-- Plans
INSERT INTO plans (name, price_cents, currency, interval, features) VALUES
  ('Hobby', 0, 'usd', 'month', '["Up to 3 projects", "Basic analytics", "Community support"]'),
  ('Pro', 2900, 'usd', 'month', '["Unlimited projects", "Advanced analytics", "Priority support", "Team members"]'),
  ('Enterprise', 9900, 'usd', 'month', '["SSO", "Audit logs", "Dedicated account manager", "SLA"]')
ON CONFLICT DO NOTHING;

-- Dev super-admin (email super@admin.com / password "password123").
-- Inserts into public.users; the on_public_user_created trigger provisions an
-- account + owner membership. Status 'active' so it can log in immediately.
-- For real deployments, sign up via /auth/signup and approve the account instead.
INSERT INTO public.users (email, name, password_hash, status)
VALUES (
  'super@admin.com',
  'Super Admin',
  '$2b$12$RUnmCV22RXWKNjrAgyh6uOeEEsPK0SRisIFyrsWvayQNiHTPdnR3e',
  'active'
)
ON CONFLICT (email) DO NOTHING;
