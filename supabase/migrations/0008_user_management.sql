-- User roles and account status for in-app user management.

alter table public.profiles
  add column if not exists role text default 'user';

alter table public.profiles
  add column if not exists status text default 'active';

alter table public.profiles
  add column if not exists updated_at timestamptz default now();

update public.profiles
set
  role = coalesce(role, 'user'),
  status = coalesce(status, 'active'),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.profiles
  alter column role set default 'user',
  alter column role set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('admin', 'user'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('active', 'disabled', 'banned'));
  end if;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role = 'admin'
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.guard_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id
     and (
       new.role is distinct from old.role
       or new.status is distinct from old.status
     ) then
    raise exception 'You cannot change your own role or status.';
  end if;

  if (
    new.role is distinct from old.role
    or new.status is distinct from old.status
  ) and not public.is_admin() then
    raise exception 'Only administrators can change role or status.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_guard_admin_fields on public.profiles;
create trigger profiles_guard_admin_fields
  before update on public.profiles
  for each row execute function public.guard_profile_admin_fields();

drop policy if exists "profiles: read admin" on public.profiles;
create policy "profiles: read admin"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "profiles: update admin" on public.profiles;
create policy "profiles: update admin"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());
