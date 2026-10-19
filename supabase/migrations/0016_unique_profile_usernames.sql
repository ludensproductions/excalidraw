-- Usernames are unique again (case-insensitive), reverting 0010.
-- Fails if duplicates already exist: resolve them first with
--   select lower(btrim(username)), count(*) from public.profiles group by 1 having count(*) > 1;

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(btrim(username)));

-- Lets the signup form report a taken username before GoTrue
-- falls back to the generic "Database error saving new user" message.
create or replace function public.is_username_registered(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where lower(btrim(username)) = lower(btrim(p_username))
  );
$$;

revoke all on function public.is_username_registered(text) from public;
grant execute on function public.is_username_registered(text) to anon, authenticated;
