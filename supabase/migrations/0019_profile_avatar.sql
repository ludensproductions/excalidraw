-- 0019_profile_avatar.sql
-- Profile photo, stored as a small raster data URL (the client resizes it).
-- Kept in the row, like board thumbnails, so the existing "update own" policy
-- protects it; the excalidraw-files bucket is publicly writable.

alter table public.profiles
  add column if not exists avatar text;

alter table public.profiles
  drop constraint if exists profiles_avatar_check;

alter table public.profiles
  add constraint profiles_avatar_check check (
    avatar is null
    or (
      length(avatar) <= 100000
      and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$'
    )
  );

select pg_notify('pgrst', 'reload schema');
