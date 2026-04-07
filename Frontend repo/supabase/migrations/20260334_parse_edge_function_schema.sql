-- Schema for parse-bank-statement edge function: queue metadata, income parse link, bank analysis.

ALTER TABLE public.document_parse_queue ADD COLUMN IF NOT EXISTS extracted_data jsonb;
ALTER TABLE public.document_parse_queue ADD COLUMN IF NOT EXISTS fields_populated text[];
ALTER TABLE public.document_parse_queue ADD COLUMN IF NOT EXISTS tokens_used integer;
ALTER TABLE public.document_parse_queue ADD COLUMN IF NOT EXISTS model_used text;
ALTER TABLE public.document_parse_queue ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.document_parse_queue ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.income ADD COLUMN IF NOT EXISTS parsed_from_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS parsed_bank_name text;

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS detected_type text;

CREATE INDEX IF NOT EXISTS income_parsed_from_document_id_idx ON public.income(parsed_from_document_id);

CREATE TABLE IF NOT EXISTS public.bank_statement_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  regular_income_monthly numeric,
  has_gambling_transactions boolean NOT NULL DEFAULT false,
  has_buy_now_pay_later boolean NOT NULL DEFAULT false,
  has_dishonour_fees boolean NOT NULL DEFAULT false,
  months_analysed integer,
  CONSTRAINT bank_statement_analysis_app_doc_unique UNIQUE (application_id, document_id)
);

CREATE INDEX IF NOT EXISTS bank_statement_analysis_application_id_idx ON public.bank_statement_analysis(application_id);
CREATE INDEX IF NOT EXISTS bank_statement_analysis_firm_id_idx ON public.bank_statement_analysis(firm_id);

ALTER TABLE public.bank_statement_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_statement_analysis_service_all" ON public.bank_statement_analysis;
CREATE POLICY "bank_statement_analysis_service_all"
  ON public.bank_statement_analysis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "bank_statement_analysis_select_firm" ON public.bank_statement_analysis;
CREATE POLICY "bank_statement_analysis_select_firm"
  ON public.bank_statement_analysis
  FOR SELECT
  TO authenticated
  USING (
    firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "bank_statement_analysis_insert_firm" ON public.bank_statement_analysis;
CREATE POLICY "bank_statement_analysis_insert_firm"
  ON public.bank_statement_analysis
  FOR INSERT
  TO authenticated
  WITH CHECK (
    firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "bank_statement_analysis_update_firm" ON public.bank_statement_analysis;
CREATE POLICY "bank_statement_analysis_update_firm"
  ON public.bank_statement_analysis
  FOR UPDATE
  TO authenticated
  USING (
    firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  )
  WITH CHECK (
    firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );
