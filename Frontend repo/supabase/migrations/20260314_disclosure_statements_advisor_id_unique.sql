-- Unique constraint on advisor_id for disclosure_statements (one disclosure statement per advisor).
-- Run this in Supabase if the table was created without it; upsert with onConflict: 'advisor_id' requires it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'disclosure_statements_advisor_id_key'
    AND conrelid = 'disclosure_statements'::regclass
  ) THEN
    ALTER TABLE disclosure_statements
    ADD CONSTRAINT disclosure_statements_advisor_id_key UNIQUE (advisor_id);
  END IF;
END $$;
