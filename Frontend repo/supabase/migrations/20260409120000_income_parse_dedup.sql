-- Prevent duplicate income rows when parse-bank-statement re-processes the same file.
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS source_file_name text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_income_dedup
ON public.income(application_id, source_file_name, gross_salary, salary_frequency)
WHERE source_file_name IS NOT NULL;
