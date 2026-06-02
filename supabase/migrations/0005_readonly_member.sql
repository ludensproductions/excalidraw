-- =====================================================================
-- 0005_readonly_member.sql — Per-member read-only flag
-- =====================================================================
-- Problem: read-only guests who receive a ",ro" link were not registered
-- in shared_board_members, so the board never appeared in their
-- Compartidos list. But if they had previously joined via an edit link,
-- the board DID appear — and opening it from the dashboard stripped the
-- ",ro" flag, granting edit access.
--
-- Fix: always register members (including read-only ones) but store a
-- read_only flag. The frontend uses this flag to reconstruct the correct
-- URL (with or without ",ro") when opening from the dashboard.
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. Add read_only column to shared_board_members (default false for
--    all existing edit-link joiners).
-- -----------------------------------------------------------------------
alter table public.shared_board_members
  add column if not exists read_only boolean not null default false;

-- -----------------------------------------------------------------------
-- 2. Update join_existing_shared_board to accept p_read_only and use it.
--    On conflict, keep the LEAST restrictive access (false wins over true).
-- -----------------------------------------------------------------------
drop function if exists public.join_existing_shared_board(text, text, text) cascade;
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

  select sb.id into v_board_id
  from public.shared_boards sb
  where sb.room_id = p_room_id
    and sb.room_key = p_room_key;

  -- If the owner hasn't published the board yet, register only for edit members.
  -- Read-only guests don't need a record if the room doesn't exist in shared_boards.
  if v_board_id is null then
    return;
  end if;

  insert into public.shared_board_members (board_id, user_id, username, read_only)
  values (v_board_id, v_user_id, p_username, p_read_only)
  on conflict (board_id, user_id) do update
    set username   = excluded.username,
        -- Preserve the most permissive access: once edit, always edit.
        read_only  = (shared_board_members.read_only and excluded.read_only);

  update public.shared_boards
  set updated_at = now()
  where id = v_board_id;
end;
$$;
