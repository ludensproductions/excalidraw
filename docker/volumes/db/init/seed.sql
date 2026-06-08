-- =====================================================================
-- Seed data: test users for development
--   admin@admin.com  / 12345
--   test@test.com    / 12345
-- =====================================================================

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, confirmed_at,
  raw_user_meta_data,
  created_at, updated_at,
  is_super_admin
)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@admin.com',
  crypt('12345', gen_salt('bf')),
  now(),
  jsonb_build_object('username', 'admin'),
  now(), now(),
  false
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@admin.com');

INSERT INTO public.profiles (id, username, email)
SELECT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'admin', 'admin@admin.com'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'admin@admin.com');

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, confirmed_at,
  raw_user_meta_data,
  created_at, updated_at,
  is_super_admin
)
SELECT
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'test@test.com',
  crypt('12345', gen_salt('bf')),
  now(),
  jsonb_build_object('username', 'test'),
  now(), now(),
  false
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'test@test.com');

INSERT INTO public.profiles (id, username, email)
SELECT 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'test', 'test@test.com'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'test@test.com');
