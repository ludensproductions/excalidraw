-- Lets each authenticated collaborator keep a board-specific display name
-- without changing their global profile username.

drop function if exists public.update_shared_board_member_username(text, text, text) cascade;
create or replace function public.update_shared_board_member_username(
  p_room_id  text,
  p_room_key text,
  p_username text
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
  v_is_member  boolean;
  v_username   text := coalesce(nullif(btrim(p_username), ''), 'Usuario');
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
    raise exception 'Shared board not found';
  end if;

  select exists (
    select 1
    from public.shared_board_members sbm
    where sbm.board_id = v_board_id
      and sbm.user_id = v_user_id
  ) into v_is_member;

  if not v_is_member and v_created_by <> v_user_id then
    raise exception 'Not a member of this shared board';
  end if;

  insert into public.shared_board_members (board_id, user_id, username)
  values (v_board_id, v_user_id, v_username)
  on conflict (board_id, user_id) do update
    set username = excluded.username;

  update public.shared_boards
  set updated_at = now()
  where id = v_board_id;
end;
$$;

revoke all on function public.update_shared_board_member_username(text, text, text) from public;
grant execute on function public.update_shared_board_member_username(text, text, text) to authenticated;
