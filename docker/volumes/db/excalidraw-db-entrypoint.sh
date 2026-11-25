#!/bin/bash
# Ensures service role passwords are set after every boot.
# The supabase/postgres base migrations may recreate roles without passwords.
set -e

# Start postgres via the original entrypoint in background
/usr/local/bin/docker-entrypoint.sh "$@" &
DB_PID=$!

# Wait for postgres to accept unix socket connections
until pg_isready -U postgres -h /var/run/postgresql 2>/dev/null; do
  sleep 0.5
done

echo "excalidraw-db: Setting service role passwords..."

# Only alter roles that exist (some are created by migrations on first boot)
for role in authenticator pgbouncer supabase_admin supabase_auth_admin supabase_storage_admin supabase_functions_admin; do
  if psql -qAt -U postgres -h /var/run/postgresql -c "SELECT 1 FROM pg_roles WHERE rolname='${role}'" 2>/dev/null | grep -q 1; then
    psql -q -U postgres -h /var/run/postgresql -c "ALTER USER ${role} WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>/dev/null || true
  fi
done

auth_admin_psql() {
  PGPASSWORD="${POSTGRES_PASSWORD}" \
    psql -v ON_ERROR_STOP=1 -q -U supabase_auth_admin -h 127.0.0.1 -d postgres -c "$1"
}

wait_for_excalidraw_schema() {
  local retries=120

  until psql -qAt -U postgres -h /var/run/postgresql -d postgres -c \
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles'" \
    2>/dev/null | grep -q 1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "excalidraw-db: WARNING: Timed out waiting for app schema initialization; skipping auth compatibility fix." >&2
      return 1
    fi
    sleep 0.5
  done
}

wait_for_auth_runtime_schema() {
  local retries=240

  until psql -qAt -U postgres -h /var/run/postgresql -d postgres -c \
    "SELECT 1
     FROM information_schema.columns
     WHERE table_schema='auth'
       AND table_name='users'
       AND column_name='reauthentication_token'" \
    2>/dev/null | grep -q 1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "excalidraw-db: WARNING: Timed out waiting for GoTrue auth schema migrations." >&2
      return 1
    fi
    sleep 0.5
  done
}

# Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD, only while there are
# no accounts at all: later boots never recreate it or change its password.
seed_first_admin() {
  if [ -z "${ADMIN_EMAIL:-}" ] || [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
    echo "excalidraw-db: No first admin: set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters)." >&2
    return 0
  fi

  psql -X -v ON_ERROR_STOP=1 -q --single-transaction -U postgres -h /var/run/postgresql -d postgres <<'SQL'
\getenv admin_email ADMIN_EMAIL
\getenv admin_password ADMIN_PASSWORD
-- same lock as scripts/migrate.sh: both touch auth.users and profiles and
-- would deadlock on a first boot
do 'begin perform pg_advisory_xact_lock(8421); end';
alter table public.profiles disable trigger profiles_guard_admin_fields;
with new_admin as (
  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    email_change_token_current, reauthentication_token,
    phone_change_token, phone_change,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    is_super_admin
  )
  select
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    lower(:'admin_email'),
    crypt(:'admin_password', gen_salt('bf')),
    '', '', '', '', '', '', '', '',
    now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('username', 'admin'),
    now(), now(),
    false
  where not exists (select 1 from auth.users)
  returning id
)
-- the profile itself is created by the on_auth_user_created trigger;
-- max() always returns a row, gset fails without one
select max(id::text) as new_admin_id from new_admin \gset
\if :{?new_admin_id}
update public.profiles set role = 'admin' where id = :'new_admin_id';
\echo excalidraw-db: First admin created.
\endif
alter table public.profiles enable trigger profiles_guard_admin_fields;
SQL
}

reconcile_auth_runtime_state() {
  wait_for_excalidraw_schema || return 0
  wait_for_auth_runtime_schema || return 0

  echo "excalidraw-db: Fixing GoTrue required columns with empty string defaults..."
  psql -v ON_ERROR_STOP=1 -q -U postgres -h /var/run/postgresql -d postgres -c "
  DO \$\$
  DECLARE
    target_column text;
    update_sql text := 'UPDATE auth.users SET ';
    where_sql text := '';
    first_column boolean := true;
  BEGIN
    IF to_regclass('auth.users') IS NULL THEN
      RETURN;
    END IF;

    FOREACH target_column IN ARRAY ARRAY[
      'confirmation_token',
      'recovery_token',
      'email_change_token_new',
      'email_change_token_current',
      'reauthentication_token',
      'phone_change_token',
      'email_change'
    ]
    LOOP
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'auth'
          AND table_name = 'users'
          AND column_name = target_column
      ) THEN
        IF NOT first_column THEN
          update_sql := update_sql || ', ';
          where_sql := where_sql || ' OR ';
        END IF;

        update_sql := update_sql || format('%I = COALESCE(%I, '''')', target_column, target_column);
        where_sql := where_sql || format('%I IS NULL', target_column);
        first_column := false;
      END IF;
    END LOOP;

    IF first_column THEN
      RETURN;
    END IF;

    EXECUTE update_sql || ' WHERE ' || where_sql;
  END
  \$\$;
  " >/dev/null

  seed_first_admin ||
    echo "excalidraw-db: WARNING: Failed to create the first admin." >&2

  if psql -qAt -U postgres -h /var/run/postgresql -c "SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin'" 2>/dev/null | grep -q 1; then
    if ! auth_admin_psql "
    DO \$\$
    DECLARE
      target_column text;
      alter_sql text := 'ALTER TABLE auth.users ';
      first_column boolean := true;
    BEGIN
      IF to_regclass('auth.users') IS NULL THEN
        RETURN;
      END IF;

      FOREACH target_column IN ARRAY ARRAY[
        'confirmation_token',
        'recovery_token',
        'email_change_token_new',
        'email_change_token_current',
        'reauthentication_token',
        'phone_change_token',
        'email_change'
      ]
      LOOP
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'auth'
            AND table_name = 'users'
            AND column_name = target_column
        ) THEN
          IF NOT first_column THEN
            alter_sql := alter_sql || ', ';
          END IF;

          alter_sql := alter_sql || format('ALTER COLUMN %I SET DEFAULT ''''', target_column);
          first_column := false;
        END IF;
      END LOOP;

      IF first_column THEN
        RETURN;
      END IF;

      EXECUTE alter_sql;
    END
    \$\$;
    " >/dev/null; then
      echo "excalidraw-db: WARNING: Failed to enforce auth.users defaults as supabase_auth_admin." >&2
    fi
  else
    echo "excalidraw-db: WARNING: supabase_auth_admin role not found; auth.users defaults were not enforced." >&2
  fi
}

reconcile_auth_runtime_state &

echo "excalidraw-db: Fixing auth helper function ownership for GoTrue migrations..."
psql -q -U postgres -h /var/run/postgresql -d postgres -c "
DO \$\$
DECLARE
  helper_name text;
BEGIN
  FOREACH helper_name IN ARRAY ARRAY['uid', 'role', 'email']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'auth'
        AND p.proname = helper_name
        AND pg_get_function_identity_arguments(p.oid) = ''
    ) THEN
      EXECUTE format(
        'ALTER FUNCTION auth.%I() OWNER TO supabase_auth_admin',
        helper_name
      );
    END IF;
  END LOOP;
END
\$\$;" 2>/dev/null || true

echo "excalidraw-db: Ready."

# Create excalidraw-files bucket (best-effort; may fail during init)
psql -q -U postgres -h /var/run/postgresql -c "INSERT INTO storage.buckets (id, name, \"public\", file_size_limit) VALUES ('excalidraw-files', 'excalidraw-files', true, 26214400) ON CONFLICT (id) DO NOTHING;" 2>/dev/null || true
psql -q -U postgres -h /var/run/postgresql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'excalidraw-files: public read') THEN CREATE POLICY \"excalidraw-files: public read\" ON storage.objects FOR SELECT USING (bucket_id = 'excalidraw-files'); CREATE POLICY \"excalidraw-files: public upload\" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'excalidraw-files'); CREATE POLICY \"excalidraw-files: public update\" ON storage.objects FOR UPDATE USING (bucket_id = 'excalidraw-files'); CREATE POLICY \"excalidraw-files: public delete\" ON storage.objects FOR DELETE USING (bucket_id = 'excalidraw-files'); END IF; END \$\$;" 2>/dev/null || true

# Keep postgres running
wait $DB_PID
