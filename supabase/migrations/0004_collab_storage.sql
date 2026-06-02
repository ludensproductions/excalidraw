-- =====================================================================
-- 0004_collab_storage.sql
-- Migrates collab_rooms and share_links from BYTEA to TEXT (base64)
-- for clean JavaScript interop, and creates the excalidraw-files
-- storage bucket used as a replacement for Firebase Storage.
-- =====================================================================

-- Convert collab_rooms binary columns to TEXT (base64-encoded)
ALTER TABLE public.collab_rooms
  ALTER COLUMN iv TYPE text USING encode(iv, 'base64'),
  ALTER COLUMN ciphertext TYPE text USING encode(ciphertext, 'base64');

-- Convert share_links payload to TEXT (base64-encoded)
ALTER TABLE public.share_links
  ALTER COLUMN payload TYPE text USING encode(payload, 'base64');

-- Create storage bucket for collab room files and share links
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('excalidraw-files', 'excalidraw-files', true, 26214400)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read/write (files are encrypted client-side,
-- decryption key lives only in the URL hash)
CREATE POLICY "excalidraw-files: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'excalidraw-files');

CREATE POLICY "excalidraw-files: public upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'excalidraw-files');

CREATE POLICY "excalidraw-files: public update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'excalidraw-files');

CREATE POLICY "excalidraw-files: public delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'excalidraw-files');
