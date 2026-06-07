-- Creates the _supabase database (used by Supavisor metadata)
\set pguser `echo "$POSTGRES_USER"`

SELECT 'CREATE DATABASE _supabase WITH OWNER ' || quote_ident(:'pguser')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '_supabase')\gexec
