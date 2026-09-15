-- Usernames are display names in the app, not login identifiers.
-- Keep emails unique, but allow multiple people to share the same visible name.

alter table public.profiles
  drop constraint if exists profiles_username_key;
