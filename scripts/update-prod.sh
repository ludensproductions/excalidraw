#!/usr/bin/env bash
# Updates a running Excalidraw deployment after `git pull`:
#   1. backs up the database
#   2. applies the supabase/migrations files that have not run yet
#   3. turns on email verification and restarts auth (new env and templates)
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
  # recreates auth only when its env changed; templates are re-read on start
  docker compose up -d auth auth-email-templates
  docker compose restart auth auth-email-templates
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
