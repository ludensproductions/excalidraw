-- =====================================================================
-- Excalidraw fork — initial schema
-- =====================================================================
-- Tables:
--   profiles        — public profile linked 1:1 to auth.users
--   boards          — user-owned drawings (replaces IndexedDB DrawingsStore)
--   share_links     — encrypted read-only snapshots (replaces Firebase Storage)
--   collab_rooms    — encrypted live-collab scene snapshots (replaces Firestore)
--
-- All non-public tables enforce RLS so each user only sees their own rows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  email       text unique not null,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row when a new auth.users row is inserted.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username',
             split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- boards
-- ---------------------------------------------------------------------
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  elements    jsonb not null default '[]'::jsonb,
  app_state   jsonb not null default '{}'::jsonb,
  files       jsonb not null default '{}'::jsonb,
  thumbnail   text,
  collab_link text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists boards_owner_updated_idx
  on public.boards (owner_id, updated_at desc);

alter table public.boards enable row level security;

create policy "boards: owner select"
  on public.boards for select
  using (auth.uid() = owner_id);

create policy "boards: owner insert"
  on public.boards for insert
  with check (auth.uid() = owner_id);

create policy "boards: owner update"
  on public.boards for update
  using (auth.uid() = owner_id);

create policy "boards: owner delete"
  on public.boards for delete
  using (auth.uid() = owner_id);

-- keep updated_at in sync
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists boards_touch_updated_at on public.boards;
create trigger boards_touch_updated_at
  before update on public.boards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- share_links (read-only encrypted scene snapshots)
-- ---------------------------------------------------------------------
create table if not exists public.share_links (
  id           text primary key,           -- short random id, exposed in URL
  payload      bytea not null,             -- AES-GCM encrypted scene
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.share_links enable row level security;

-- Anyone (even anonymous) can READ a share link if they have the id.
-- The decryption key lives in the URL hash and never reaches the server,
-- so read access is safe.
create policy "share_links: public read"
  on public.share_links for select
  using (true);

-- Only authenticated users can create share links.
create policy "share_links: auth insert"
  on public.share_links for insert
  with check (auth.uid() is not null);

-- Only the creator can delete their own share link.
create policy "share_links: owner delete"
  on public.share_links for delete
  using (auth.uid() = created_by);

-- ---------------------------------------------------------------------
-- collab_rooms (live realtime collab scene snapshots)
-- ---------------------------------------------------------------------
create table if not exists public.collab_rooms (
  room_id        text primary key,
  scene_version  integer not null default 0,
  iv             bytea not null,
  ciphertext     bytea not null,
  updated_at     timestamptz not null default now()
);

alter table public.collab_rooms enable row level security;

-- Same reasoning as share_links: room id + key live in the URL hash,
-- payload is encrypted client-side. Public read/write is acceptable here
-- (matches the original Firestore rules in this fork).
create policy "collab_rooms: public read"
  on public.collab_rooms for select
  using (true);

create policy "collab_rooms: public write"
  on public.collab_rooms for insert
  with check (true);

create policy "collab_rooms: public update"
  on public.collab_rooms for update
  using (true);
