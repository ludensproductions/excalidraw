#!/usr/bin/env bash
# Applies the supabase/migrations files that have not run yet. Runs inside the
# `migrate` service of docker-compose.yml on every `docker compose up`.
#
# Each file runs in its own transaction and is recorded in
# public.schema_migrations; if one fails, it is rolled back, the service exits
# with an error and the frontend is not started.
set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

psql_db() {
  psql -X -q -v ON_ERROR_STOP=1 "$@"
}

# a new database only accepts TCP once its init scripts are done; the db
# healthcheck passes before that, because it uses the unix socket
for attempt in $(seq 120); do
  if pg_isready -q; then
    break
  fi
  if [[ "$attempt" == 120 ]]; then
    echo "migrate: la base de datos no respondio" >&2
    exit 1
  fi
  sleep 1
done

# Databases created before this script existed have no record of what ran.
# 0001-0006 are in every deployed database, later files are safe to re-run.
psql_db <<'SQL'
do $$
begin
  if to_regclass('public.schema_migrations') is null then
    create table public.schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    );
    insert into public.schema_migrations (version)
    select v from unnest(array[
      '0001_init.sql',
      '0002_shared_boards.sql',
      '0003_join_existing_shared_board.sql',
      '0004_collab_storage.sql',
      '0005_readonly_member.sql',
      '0006_board_comments.sql'
    ]) as v;
  end if;
end $$;
-- tables in public are reachable through the API; this one is not for it
alter table public.schema_migrations enable row level security;
SQL

applied="$(psql_db -At -c "select version from public.schema_migrations")"
pending=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  if grep -qxF "$name" <<<"$applied"; then
    continue
  fi
  echo "migrate: aplicando $name"
  {
    # same lock as seed_first_admin in excalidraw-db-entrypoint.sh
    echo "select pg_advisory_xact_lock(8421);"
    cat "$file"
    echo
    echo "insert into public.schema_migrations (version) values ('$name');"
  } | psql_db --single-transaction >/dev/null
  pending=$((pending + 1))
done

if ((pending > 0)); then
  psql_db -c "notify pgrst, 'reload schema';"
fi
echo "migrate: $pending migracion(es) aplicada(s)"
