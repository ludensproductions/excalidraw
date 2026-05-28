-- =====================================================================
-- 0002_shared_boards.sql — Shared / collaborative boards
-- =====================================================================

-- -----------------------------------------------------------------------
-- shared_boards: one record per active collab room
-- -----------------------------------------------------------------------
create table if not exists public.shared_boards (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null unique,
  room_key    text not null,
  name        text not null default 'Tablero compartido',
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shared_boards_created_by_idx
  on public.shared_boards (created_by);

-- -----------------------------------------------------------------------
-- shared_board_members: who has joined each room
-- -----------------------------------------------------------------------
create table if not exists public.shared_board_members (
  board_id   uuid not null references public.shared_boards (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  username   text not null default 'Usuario',
  joined_at  timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index if not exists shared_board_members_user_idx
  on public.shared_board_members (user_id);

-- -----------------------------------------------------------------------
-- Helper: check membership without triggering RLS recursion.
-- SECURITY DEFINER runs as the function owner (bypasses RLS on the table).
-- -----------------------------------------------------------------------
drop function if exists public.is_shared_board_member(uuid) cascade;
create or replace function public.is_shared_board_member(p_board_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_board_members
    where board_id = p_board_id
      and user_id  = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------
-- RLS — shared_boards
-- -----------------------------------------------------------------------
alter table public.shared_boards enable row level security;

drop policy if exists "shared_boards: member read" on public.shared_boards;
create policy "shared_boards: member read"
  on public.shared_boards for select
  using (
    auth.uid() = created_by
    or public.is_shared_board_member(id)
  );

drop policy if exists "shared_boards: auth insert" on public.shared_boards;
create policy "shared_boards: auth insert"
  on public.shared_boards for insert
  with check (auth.uid() = created_by);

drop policy if exists "shared_boards: creator update" on public.shared_boards;
create policy "shared_boards: creator update"
  on public.shared_boards for update
  using (auth.uid() = created_by);

drop policy if exists "shared_boards: creator delete" on public.shared_boards;
create policy "shared_boards: creator delete"
  on public.shared_boards for delete
  using (auth.uid() = created_by);

-- -----------------------------------------------------------------------
-- RLS — shared_board_members
-- -----------------------------------------------------------------------
alter table public.shared_board_members enable row level security;

drop policy if exists "shared_board_members: read" on public.shared_board_members;
create policy "shared_board_members: read"
  on public.shared_board_members for select
  using (
    user_id = auth.uid()
    or public.is_shared_board_member(board_id)
  );

drop policy if exists "shared_board_members: self insert" on public.shared_board_members;
create policy "shared_board_members: self insert"
  on public.shared_board_members for insert
  with check (auth.uid() = user_id);

drop policy if exists "shared_board_members: self delete" on public.shared_board_members;
create policy "shared_board_members: self delete"
  on public.shared_board_members for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- RPC: join_shared_board
-- Creates the shared_board if it doesn't exist yet, then adds the caller
-- as a member (idempotent). Returns the full board row.
-- -----------------------------------------------------------------------
drop function if exists public.join_shared_board(text, text, text, text) cascade;
create or replace function public.join_shared_board(
  p_room_id  text,
  p_room_key text,
  p_name     text    default 'Tablero compartido',
  p_username text    default 'Usuario'
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

  -- Create the room record if it does not exist yet.
  insert into public.shared_boards (room_id, room_key, name, created_by)
  values (p_room_id, p_room_key, p_name, v_user_id)
  on conflict (room_id) do update
    set updated_at = now();

  select sb.id into v_board_id
  from public.shared_boards sb
  where sb.room_id = p_room_id;

  -- Add the user as a member (idempotent — updates username if already a member).
  insert into public.shared_board_members (board_id, user_id, username)
  values (v_board_id, v_user_id, p_username)
  on conflict (board_id, user_id) do update
    set username = excluded.username;

  -- Float the board to the top of the list.
  update public.shared_boards
  set updated_at = now()
  where id = v_board_id;
end;
$$;
