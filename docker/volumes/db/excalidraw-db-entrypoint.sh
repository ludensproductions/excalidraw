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
for role in authenticator pgbouncer supabase_auth_admin supabase_storage_admin supabase_functions_admin; do
  if psql -qAt -U postgres -h /var/run/postgresql -c "SELECT 1 FROM pg_roles WHERE rolname='${role}'" 2>/dev/null | grep -q 1; then
    psql -q -U postgres -h /var/run/postgresql -c "ALTER USER ${role} WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>/dev/null || true
  fi
done

echo "excalidraw-db: Fixing NULL text/varchar columns for Go service compatibility..."
psql -q -U postgres -h /var/run/postgresql -c "
DO \$\$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema IN ('auth', 'storage')
      AND data_type IN ('text', 'character varying', 'character', 'varchar')
      AND is_nullable = 'YES'
      AND column_default IS NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT '''''', 
      rec.table_schema, rec.table_name, rec.column_name
    );
  END LOOP;

  FOR rec IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema IN ('auth', 'storage')
      AND data_type IN ('text', 'character varying', 'character', 'varchar')
      AND is_nullable = 'YES'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = '''' WHERE %I IS NULL',
      rec.table_schema, rec.table_name, rec.column_name, rec.column_name
    );
  END LOOP;
END
\$\$;" 2>/dev/null || true

echo "excalidraw-db: Fixing auth.uid() ownership for GoTrue migrations..."
psql -q -U postgres -h /var/run/postgresql -c "ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;" 2>/dev/null || true

echo "excalidraw-db: Ready."

# Create excalidraw-files bucket (best-effort; may fail during init)
psql -q -U postgres -h /var/run/postgresql -c "INSERT INTO storage.buckets (id, name, \"public\", file_size_limit) VALUES ('excalidraw-files', 'excalidraw-files', true, 26214400) ON CONFLICT (id) DO NOTHING;" 2>/dev/null || true
psql -q -U postgres -h /var/run/postgresql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'excalidraw-files: public read') THEN CREATE POLICY \"excalidraw-files: public read\" ON storage.objects FOR SELECT USING (bucket_id = 'excalidraw-files'); CREATE POLICY \"excalidraw-files: public upload\" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'excalidraw-files'); CREATE POLICY \"excalidraw-files: public update\" ON storage.objects FOR UPDATE USING (bucket_id = 'excalidraw-files'); CREATE POLICY \"excalidraw-files: public delete\" ON storage.objects FOR DELETE USING (bucket_id = 'excalidraw-files'); END IF; END \$\$;" 2>/dev/null || true

# Keep postgres running
wait $DB_PID
