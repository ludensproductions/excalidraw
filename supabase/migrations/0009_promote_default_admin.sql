-- Promote the seeded local admin account on existing databases.
-- The guard trigger from 0008 only lets admins change roles, and a migration
-- runs without a logged-in user, so it is paused for this one update.

alter table public.profiles disable trigger profiles_guard_admin_fields;

update public.profiles
set role = 'admin'
where lower(email) = 'admin@admin.com';

alter table public.profiles enable trigger profiles_guard_admin_fields;
