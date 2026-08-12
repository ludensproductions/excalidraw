-- Promote the seeded local admin account on existing databases.

update public.profiles
set role = 'admin'
where lower(email) = 'admin@admin.com';
