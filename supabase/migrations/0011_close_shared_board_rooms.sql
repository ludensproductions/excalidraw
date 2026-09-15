-- Permanently disables a collaboration URL once the owner closes the room.
-- The closed room registry prevents the same room_id from being recreated by
-- someone reopening an old #room link.

create table if not exists public.closed_shared_rooms (
  room_id   text primary key,
  room_key  text not null,
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz not null default now()
);

alter table public.closed_shared_rooms enable row level security;

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

  if exists (
    select 1
    from public.closed_shared_rooms csr
    where csr.room_id = p_room_id
  ) then
    return;
  end if;

  insert into public.shared_boards (room_id, room_key, name, created_by)
  values (p_room_id, p_room_key, p_name, v_user_id)
  on conflict (room_id) do update
    set updated_at = now()
    where shared_boards.room_key = excluded.room_key;

  select sb.id into v_board_id
  from public.shared_boards sb
  where sb.room_id = p_room_id
    and sb.room_key = p_room_key;

  if v_board_id is null then
    return;
  end if;

  insert into public.shared_board_members (board_id, user_id, username)
  values (v_board_id, v_user_id, p_username)
  on conflict (board_id, user_id) do update
    set username = excluded.username;

  update public.shared_boards
  set updated_at = now()
  where id = v_board_id;
end;
$$;

drop function if exists public.join_existing_shared_board(text, text, text) cascade;
drop function if exists public.join_existing_shared_board(text, text, text, boolean) cascade;
create or replace function public.join_existing_shared_board(
  p_room_id   text,
  p_room_key  text,
  p_username  text    default 'Usuario',
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

  if exists (
    select 1
    from public.closed_shared_rooms csr
    where csr.room_id = p_room_id
  ) then
    return;
  end if;

  select sb.id into v_board_id
  from public.shared_boards sb
  where sb.room_id = p_room_id
    and sb.room_key = p_room_key;

  if v_board_id is null then
    return;
  end if;

  insert into public.shared_board_members (board_id, user_id, username, read_only)
  values (v_board_id, v_user_id, p_username, p_read_only)
  on conflict (board_id, user_id) do update
    set username   = excluded.username,
        read_only  = (shared_board_members.read_only and excluded.read_only);

  update public.shared_boards
  set updated_at = now()
  where id = v_board_id;
end;
$$;

drop function if exists public.close_shared_board(text, text) cascade;
create or replace function public.close_shared_board(
  p_room_id  text,
  p_room_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_board_id   uuid;
  v_created_by uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select sb.id, sb.created_by
  into v_board_id, v_created_by
  from public.shared_boards sb
  where sb.room_id = p_room_id
    and sb.room_key = p_room_key;

  if v_board_id is null then
    return;
  end if;

  if v_created_by <> v_user_id then
    raise exception 'Only the owner can close this shared board.';
  end if;

  insert into public.closed_shared_rooms (room_id, room_key, closed_by)
  values (p_room_id, p_room_key, v_user_id)
  on conflict (room_id) do update
    set room_key = excluded.room_key,
        closed_by = excluded.closed_by,
        closed_at = now();

  delete from public.shared_boards
  where id = v_board_id;

  delete from public.collab_rooms
  where room_id = p_room_id;
end;
$$;
