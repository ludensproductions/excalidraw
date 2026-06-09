-- Wrapper: loads Excalidraw custom init scripts from /excalidraw-init/
-- Order: infrastructure first, then app schema, then seed data
\i /excalidraw-init/migrations/97-_supabase.sql
\i /excalidraw-init/migrations/98-pooler.sql
\i /excalidraw-init/migrations/99-logs.sql
\i /excalidraw-init/init-scripts/98-webhooks.sql
\i /excalidraw-init/init-scripts/99-set-passwords.sql
\i /excalidraw-init/init-scripts/99-jwt.sql
\i /excalidraw-init/migrations/9999-app.sql
