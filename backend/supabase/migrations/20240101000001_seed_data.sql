-- Seed plans
insert into plans (name, price_cents, currency, interval, features) values
('Hobby', 0, 'usd', 'month', '["Up to 3 projects", "Basic analytics", "Community support"]'),
('Pro', 2900, 'usd', 'month', '["Unlimited projects", "Advanced analytics", "Priority support", "Team members"]'),
('Enterprise', 9900, 'usd', 'month', '["SSO", "Audit logs", "Dedicated account manager", "SLA"]');

-- Seed Super Admin
-- Note: In a real Supabase environment, you should use the Auth API to create users.
-- This SQL seed is for local development convenience.
-- The password hash below corresponds to "password123" (bcrypt).

INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d',
    'authenticated',
    'authenticated',
    'super@admin.com',
    '$2a$10$jt2IRMOWOhiOyc6dPDbd7u2ZIHq4MuByNfNHQH7UTyncC15lpSCgi', -- Hash for 'admin123456'
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"], "role": "super_admin"}'::jsonb,
    '{"full_name": "Super Admin"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
) ON CONFLICT (id) DO NOTHING;

-- The trigger `on_auth_user_created` will automatically create the public.users, accounts, and account_users records.
-- However, since we are inserting directly into auth.users via SQL seed, the trigger MIGHT fire depending on Supabase config.
-- If it doesn't fire (because triggers on auth.users are sometimes restricted), we manually insert the public data below.

INSERT INTO public.users (id, email, name)
VALUES ('d0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', 'super@admin.com', 'Super Admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, owner_user_id)
VALUES ('a0a8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', 'Super Admin''s Team', 'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.account_users (account_id, user_id, role)
VALUES ('a0a8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', 'd0d8c19c-3b36-4423-8c5d-5d5d5d5d5d5d', 'owner')
ON CONFLICT (account_id, user_id) DO NOTHING;
