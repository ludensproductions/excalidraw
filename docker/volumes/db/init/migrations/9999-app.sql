-- =====================================================================
-- Excalidraw App Migrations (combined from supabase/migrations/)
-- Runs after Supabase base schema is initialized.
-- =====================================================================

-- 0001_init.sql
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  email       text unique not null,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);

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
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
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

create index if not exists boards_owner_updated_idx on public.boards (owner_id, updated_at desc);

alter table public.boards enable row level security;

create policy "boards: owner select" on public.boards for select using (auth.uid() = owner_id);
create policy "boards: owner insert" on public.boards for insert with check (auth.uid() = owner_id);
create policy "boards: owner update" on public.boards for update using (auth.uid() = owner_id);
create policy "boards: owner delete" on public.boards for delete using (auth.uid() = owner_id);

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

create table if not exists public.share_links (
  id           text primary key,
  payload      text not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.share_links enable row level security;

create policy "share_links: public read" on public.share_links for select using (true);
create policy "share_links: auth insert" on public.share_links for insert with check (auth.uid() is not null);
create policy "share_links: owner delete" on public.share_links for delete using (auth.uid() = created_by);

create table if not exists public.collab_rooms (
  room_id        text primary key,
  scene_version  integer not null default 0,
  iv             text not null,
  ciphertext     text not null,
  updated_at     timestamptz not null default now()
);

alter table public.collab_rooms enable row level security;

create policy "collab_rooms: public read" on public.collab_rooms for select using (true);
create policy "collab_rooms: public write" on public.collab_rooms for insert with check (true);
create policy "collab_rooms: public update" on public.collab_rooms for update using (true);

-- 0002_shared_boards.sql
create table if not exists public.shared_boards (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null unique,
  room_key    text not null,
  name        text not null default 'Tablero compartido',
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shared_boards_created_by_idx on public.shared_boards (created_by);

create table if not exists public.shared_board_members (
  board_id   uuid not null references public.shared_boards (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  username   text not null default 'Usuario',
  joined_at  timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index if not exists shared_board_members_user_idx on public.shared_board_members (user_id);

drop function if exists public.is_shared_board_member(uuid) cascade;
create or replace function public.is_shared_board_member(p_board_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.shared_board_members
    where board_id = p_board_id and user_id = auth.uid()
  );
$$;

alter table public.shared_boards enable row level security;

create policy "shared_boards: member read"
  on public.shared_boards for select
  using (auth.uid() = created_by or public.is_shared_board_member(id));

create policy "shared_boards: auth insert"
  on public.shared_boards for insert
  with check (auth.uid() = created_by);

create policy "shared_boards: creator update"
  on public.shared_boards for update
  using (auth.uid() = created_by);

create policy "shared_boards: creator delete"
  on public.shared_boards for delete
  using (auth.uid() = created_by);

alter table public.shared_board_members enable row level security;

create policy "shared_board_members: read"
  on public.shared_board_members for select
  using (user_id = auth.uid() or public.is_shared_board_member(board_id));

create policy "shared_board_members: self insert"
  on public.shared_board_members for insert
  with check (auth.uid() = user_id);

create policy "shared_board_members: self delete"
  on public.shared_board_members for delete
  using (auth.uid() = user_id);

drop function if exists public.join_shared_board(text, text, text, text) cascade;
create or replace function public.join_shared_board(
  p_room_id  text,
  p_room_key text,
  p_name     text default 'Tablero compartido',
  p_username text default 'Usuario'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_board_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.shared_boards (room_id, room_key, name, created_by)
  values (p_room_id, p_room_key, p_name, v_user_id)
  on conflict (room_id) do update set updated_at = now();

  select sb.id into v_board_id
  from public.shared_boards sb where sb.room_id = p_room_id;

  insert into public.shared_board_members (board_id, user_id, username)
  values (v_board_id, v_user_id, p_username)
  on conflict (board_id, user_id) do update set username = excluded.username;

  update public.shared_boards set updated_at = now() where id = v_board_id;
end;
$$;

-- 0003_join_existing_shared_board.sql
drop function if exists public.join_existing_shared_board(text, text, text) cascade;
create or replace function public.join_existing_shared_board(
  p_room_id  text,
  p_room_key text,
  p_username text default 'Usuario'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_board_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select sb.id into v_board_id
  from public.shared_boards sb
  where sb.room_id = p_room_id and sb.room_key = p_room_key;

  if v_board_id is null then
    return;
  end if;

  insert into public.shared_board_members (board_id, user_id, username)
  values (v_board_id, v_user_id, p_username)
  on conflict (board_id, user_id) do update set username = excluded.username;

  update public.shared_boards set updated_at = now() where id = v_board_id;
end;
$$;

-- 0004_collab_storage.sql
-- Bucket and policies are created in init-scripts/99-buckets.sql

-- 0005_readonly_member.sql
alter table public.shared_board_members
  add column if not exists read_only boolean not null default false;

drop function if exists public.join_existing_shared_board(text, text, text) cascade;
create or replace function public.join_existing_shared_board(
  p_room_id   text,
  p_room_key  text,
  p_username  text default 'Usuario',
  p_read_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_board_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select sb.id into v_board_id
  from public.shared_boards sb
  where sb.room_id = p_room_id and sb.room_key = p_room_key;

  if v_board_id is null then
    return;
  end if;

  insert into public.shared_board_members (board_id, user_id, username, read_only)
  values (v_board_id, v_user_id, p_username, p_read_only)
  on conflict (board_id, user_id) do update
    set username = excluded.username,
        read_only = (shared_board_members.read_only and excluded.read_only);

  update public.shared_boards set updated_at = now() where id = v_board_id;
end;
$$;

-- 0006_board_comments.sql
create table if not exists public.board_comments (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  author_name text not null default 'Usuario',
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists board_comments_board_created_idx on public.board_comments (board_id, created_at asc);
create index if not exists board_comments_owner_idx on public.board_comments (owner_id);

alter table public.board_comments enable row level security;

create policy "board_comments: board owner read" on public.board_comments for select
  using (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy "board_comments: board owner insert" on public.board_comments for insert
  with check (auth.uid() = owner_id and exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy "board_comments: author update" on public.board_comments for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "board_comments: author delete" on public.board_comments for delete
  using (auth.uid() = owner_id);

drop trigger if exists board_comments_touch_updated_at on public.board_comments;
create trigger board_comments_touch_updated_at
  before update on public.board_comments
  for each row execute function public.touch_updated_at();

-- 0007_shared_board_comments.sql
create table if not exists public.shared_board_comments (
  id              uuid primary key default gen_random_uuid(),
  shared_board_id uuid not null references public.shared_boards (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  author_name     text not null default 'Usuario',
  body            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists shared_board_comments_board_created_idx on public.shared_board_comments (shared_board_id, created_at asc);
create index if not exists shared_board_comments_owner_idx on public.shared_board_comments (owner_id);

alter table public.shared_board_comments enable row level security;

create policy "shared_board_comments: member read" on public.shared_board_comments for select
  using (
    exists (
      select 1
      from public.shared_boards sb
      where sb.id = shared_board_id
        and (sb.created_by = auth.uid() or public.is_shared_board_member(sb.id))
    )
  );

create policy "shared_board_comments: member insert" on public.shared_board_comments for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1
      from public.shared_boards sb
      where sb.id = shared_board_id
        and (sb.created_by = auth.uid() or public.is_shared_board_member(sb.id))
    )
  );

create policy "shared_board_comments: author update" on public.shared_board_comments for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "shared_board_comments: author delete" on public.shared_board_comments for delete
  using (auth.uid() = owner_id);

drop trigger if exists shared_board_comments_touch_updated_at on public.shared_board_comments;
create trigger shared_board_comments_touch_updated_at
  before update on public.shared_board_comments
  for each row execute function public.touch_updated_at();
