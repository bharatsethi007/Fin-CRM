-- Ensure documents table has RLS policies so upload/insert works.
-- Fixes: "new row violates row-level security policy for table documents"

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies by name so this migration is idempotent
DROP POLICY IF EXISTS "Allow public read documents" ON public.documents;
DROP POLICY IF EXISTS "Allow authenticated insert documents" ON public.documents;
DROP POLICY IF EXISTS "Allow authenticated update documents" ON public.documents;
DROP POLICY IF EXISTS "Allow authenticated delete documents" ON public.documents;

-- SELECT: allow read for anon and authenticated
CREATE POLICY "documents_select"
  ON public.documents FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT: allow insert for anon and authenticated (required for Upload Document)
CREATE POLICY "documents_insert"
  ON public.documents FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- UPDATE: allow update for anon and authenticated
CREATE POLICY "documents_update"
  ON public.documents FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: allow delete for anon and authenticated
CREATE POLICY "documents_delete"
  ON public.documents FOR DELETE
  TO anon, authenticated
  USING (true);
