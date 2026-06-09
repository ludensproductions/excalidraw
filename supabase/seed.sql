-- =====================================================================
-- seed.sql — Usuarios de prueba
-- =====================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
--
--   admin@admin.com  / 12345
--   test@test.com    / 12345
-- =====================================================================

-- -----------------------------------------------------------------------
-- Usuario admin
-- -----------------------------------------------------------------------
do $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, confirmation_token, confirmed_at,
    raw_user_meta_data,
    created_at, updated_at
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@admin.com',
    crypt('12345', gen_salt('bf')),
    '',
    now(),
    jsonb_build_object('username', 'admin'),
    now(), now()
  )
  on conflict (email) do nothing;

  insert into public.profiles (id, username, email)
  values (v_id, 'admin', 'admin@admin.com')
  on conflict (id) do nothing;
end;
$$;

-- -----------------------------------------------------------------------
-- Usuario test
-- -----------------------------------------------------------------------
do $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, confirmation_token, confirmed_at,
    raw_user_meta_data,
    created_at, updated_at
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'test@test.com',
    crypt('12345', gen_salt('bf')),
    '',
    now(),
    jsonb_build_object('username', 'test'),
    now(), now()
  )
  on conflict (email) do nothing;

  insert into public.profiles (id, username, email)
  values (v_id, 'test', 'test@test.com')
  on conflict (id) do nothing;
end;
$$;
