-- Lets the signup form provide a clear duplicate-email error before GoTrue
-- falls back to the generic "Database error saving new user" message.

create or replace function public.is_email_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(btrim(p_email))
  );
$$;

revoke all on function public.is_email_registered(text) from public;
grant execute on function public.is_email_registered(text) to anon, authenticated;
