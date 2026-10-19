-- Usernames are unique again (case-insensitive), reverting 0010.
-- Duplicates created while 0010 allowed them: the oldest profile keeps the
-- name, the others get the same id suffix 0017 uses for OAuth sign-ups.
update public.profiles p
set username = left(btrim(p.username), 40) || '-' || left(replace(p.id::text, '-', ''), 6)
from (
  select id,
         row_number() over (
           partition by lower(btrim(username))
           order by created_at, id
         ) as n
  from public.profiles
) d
where d.id = p.id
  and d.n > 1;

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
