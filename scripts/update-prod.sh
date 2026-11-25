#!/usr/bin/env bash
# Updates a running Excalidraw deployment after `git pull`:
#   1. backs up the database
#   2. applies the supabase/migrations files that have not run yet
#   3. turns on email verification, restarts auth (new env and templates) and
#      replaces the 12345 password of the accounts older versions created
#   4. reloads the API schema and rebuilds the frontend
#
# Usage (from anywhere):   bash scripts/update-prod.sh
# Optional:                ADMIN_EMAIL=persona@empresa.com bash scripts/update-prod.sh
#                          (also gives that account the admin role)
#
# docker-entrypoint only runs 9999-app.sql when the database is created;
# migrations added later are applied by the `migrate` service (scripts/migrate.sh),
# which also runs on every `docker compose up`. This script adds the backup.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME="${DB_NAME:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

psql_db() {
  docker compose exec -T db psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -q "$@"
}

echo "==> 1/5 Respaldo de la base de datos"
mkdir -p "$BACKUP_DIR"
backup="$BACKUP_DIR/excalidraw-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U postgres -d "$DB_NAME" -Fc >"$backup"
echo "    $backup"

echo "==> 2/5 Migraciones"
docker compose run --rm -T --no-deps -e PGDATABASE="$DB_NAME" migrate

if [[ -n "${ADMIN_EMAIL:-}" ]]; then
  echo "    rol admin para $ADMIN_EMAIL"
  psql_db --single-transaction -v email="$ADMIN_EMAIL" <<'SQL'
alter table public.profiles disable trigger profiles_guard_admin_fields;
update public.profiles set role = 'admin' where lower(email) = lower(:'email');
alter table public.profiles enable trigger profiles_guard_admin_fields;
SQL
fi

echo "==> 3/5 Autenticacion"
if [[ "${SKIP_SERVICES:-}" == "1" ]]; then
  echo "    omitido (SKIP_SERVICES=1)"
else
  # variables renamed in .env; the old names are silently ignored
  if [[ -f .env ]]; then
    sed -i -E \
      -e 's/^AZURE_(ENABLED|CLIENT_ID|SECRET|URL)=/MICROSOFT_\1=/' \
      -e 's/^EMAIL_RATE_LIMIT_PER_MINUTE=/EMAIL_RATE_LIMIT_PER_HOUR=/' .env
  fi
  # new accounts must confirm their email before they can sign in
  if [[ -f .env ]] && grep -q '^ENABLE_EMAIL_AUTOCONFIRM=true' .env; then
    sed -i 's/^ENABLE_EMAIL_AUTOCONFIRM=true/ENABLE_EMAIL_AUTOCONFIRM=false/' .env
    echo "    verificacion de correo activada (ENABLE_EMAIL_AUTOCONFIRM=false)"
  fi
  # the links in the auth emails are built from SITE_URL
  PROD_URL="${PROD_URL:-https://excalidraw.issirmax.mx}"
  if [[ -f .env ]] && ! grep -qxF "SITE_URL=$PROD_URL" .env; then
    if grep -q '^SITE_URL=' .env; then
      sed -i "s|^SITE_URL=.*|SITE_URL=$PROD_URL|" .env
    else
      echo "SITE_URL=$PROD_URL" >>.env
    fi
    echo "    enlaces de correo apuntando a $PROD_URL (SITE_URL)"
  fi
  # OAuth callbacks and token issuer; only a leftover local URL is replaced
  if [[ -f .env ]] && grep -qE '^API_EXTERNAL_URL=https?://(localhost|127\.0\.0\.1)' .env; then
    sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=$PROD_URL|" .env
    echo "    callbacks de OAuth apuntando a $PROD_URL (API_EXTERNAL_URL)"
  fi
  # recreates auth only when its env changed; templates are re-read on start
  docker compose up -d auth auth-email-templates
  docker compose restart auth auth-email-templates
fi

# Older versions created these accounts with the password 12345. Accounts whose
# password was already changed are left alone; nothing is deleted.
psql_db --single-transaction <<'SQL'
\set admin_password ''
\getenv admin_password ADMIN_PASSWORD
with old_seed as (
  update auth.users
  set encrypted_password = crypt(
    case when email = 'admin@admin.com' then :'admin_password' else gen_random_uuid()::text end,
    gen_salt('bf')
  )
  -- `case` fixes the order: crypt() fails on accounts without a password (OAuth)
  where case
    when email = 'test@test.com'
      or (email = 'admin@admin.com' and length(:'admin_password') >= 12)
    then encrypted_password = crypt('12345', nullif(encrypted_password, ''))
  end
  returning id
)
delete from auth.sessions where user_id in (select id from old_seed);
SQL
old_password="$(psql_db -At <<'SQL'
select 1 from auth.users
where case when email = 'admin@admin.com'
  then encrypted_password = crypt('12345', nullif(encrypted_password, '')) end;
SQL
)"
if [[ "$old_password" == 1 ]]; then
  echo "    AVISO: admin@admin.com sigue con la contrasena 12345." >&2
  echo "    Define ADMIN_PASSWORD (12+ caracteres) en .env y repite este script sin SKIP_SERVICES." >&2
fi

echo "==> 4/5 Recargando el esquema de la API"
psql_db -c "notify pgrst, 'reload schema';"

if [[ "${SKIP_BUILD:-}" == "1" ]]; then
  echo "==> 5/5 Frontend omitido (SKIP_BUILD=1)"
else
  echo "==> 5/5 Reconstruyendo el frontend"
  docker compose --profile prod up -d --build excalidraw
fi

echo
echo "Listo. Si algo salio mal, restaura el respaldo con:"
echo "  docker compose exec -T db pg_restore -U postgres -d $DB_NAME --clean --if-exists < $backup"
