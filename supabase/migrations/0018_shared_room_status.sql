-- 0018_shared_room_status.sql
-- Tells the client the real state of a shared room for the current user.
-- The client used to infer "closed" from an empty RLS-filtered select on
-- shared_boards, so any transient failure (expired JWT after the tab slept,
-- network error, 5xx) was shown as "Colaboración cerrada" and the user was
-- removed from the board. This RPC answers explicitly:
--   'active'    the board exists and the caller is its creator or a member
--   'no_access' the board exists but the caller is not a member (removed)
--   'closed'    the owner closed/deleted it, or it never existed
-- Errors (not authenticated, network) surface as errors, never as 'closed'.

drop function if exists public.shared_room_status(text, text) cascade;
create or replace function public.shared_room_status(
  p_room_id  text,
  p_room_key text
)
returns text
language plpgsql
security definer
stable
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
    return 'closed';
  end if;

  if v_created_by = v_user_id
     or exists (
       select 1
       from public.shared_board_members m
       where m.board_id = v_board_id
         and m.user_id = v_user_id
     ) then
    return 'active';
  end if;

  return 'no_access';
end;
$$;

revoke all on function public.shared_room_status(text, text) from public;
grant execute on function public.shared_room_status(text, text) to authenticated;
