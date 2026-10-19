-- Profiles for OAuth sign-ups (Discord, Microsoft).
-- The signup form checks the username beforehand, OAuth sign-ups don't: use the
-- provider's display name and, if it's taken (usernames are unique since 0016),
-- add a short suffix instead of failing the whole sign-up.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base     text;
  v_username text;
begin
  v_base := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    40
  );
  v_username := v_base;

  if exists (
    select 1
    from public.profiles
    where lower(btrim(username)) = lower(btrim(v_username))
  ) then
    v_username := v_base || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;

  insert into public.profiles (id, username, email)
  values (new.id, v_username, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
