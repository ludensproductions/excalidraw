-- Join an already-published shared board without creating a new shared entry.
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
