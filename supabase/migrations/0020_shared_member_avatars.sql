-- 0020_shared_member_avatars.sql
-- Profile photos of the people the caller shares a board with. Profiles are
-- only readable by their owner (and admins); this exposes just the photo.
-- The ids come from other clients, hence text: a malformed one must not make
-- the whole request fail.

create or replace function public.shared_member_avatars(p_user_ids text[])
returns table (user_id uuid, avatar text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id, p.avatar
  from public.shared_board_members me
  join public.shared_board_members other on other.board_id = me.board_id
  join public.profiles p on p.id = other.user_id
  where me.user_id = auth.uid()
    and other.user_id::text = any (p_user_ids)
    and p.avatar is not null;
$$;

revoke all on function public.shared_member_avatars(text[]) from public, anon;
grant execute on function public.shared_member_avatars(text[]) to authenticated;

select pg_notify('pgrst', 'reload schema');
