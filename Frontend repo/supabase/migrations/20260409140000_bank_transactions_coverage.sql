-- Bank transaction line items + per-month statement coverage for 3-month tracking.

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  transaction_date date,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'debit' CHECK (direction IN ('credit', 'debit')),
  ai_category text,
  categorisation_confidence text,
  broker_category text,
  broker_overridden boolean NOT NULL DEFAULT false,
  needs_review boolean NOT NULL DEFAULT false,
  review_reason text,
  is_flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  ignored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transactions_application_id_idx ON public.bank_transactions(application_id);
CREATE INDEX IF NOT EXISTS bank_transactions_document_id_idx ON public.bank_transactions(document_id);

CREATE TABLE IF NOT EXISTS public.bank_statement_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  statement_month date NOT NULL,
  bank_name text NOT NULL DEFAULT '',
  transaction_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_coverage_doc_month
  ON public.bank_statement_coverage(application_id, document_id, statement_month);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_transactions_select ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (firm_id = public.get_my_firm_id());

CREATE POLICY bank_transactions_insert ON public.bank_transactions
  FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.get_my_firm_id());

CREATE POLICY bank_transactions_update ON public.bank_transactions
  FOR UPDATE TO authenticated
  USING (firm_id = public.get_my_firm_id())
  WITH CHECK (firm_id = public.get_my_firm_id());

CREATE POLICY bank_transactions_delete ON public.bank_transactions
  FOR DELETE TO authenticated
  USING (firm_id = public.get_my_firm_id());

CREATE POLICY bank_statement_coverage_select ON public.bank_statement_coverage
  FOR SELECT TO authenticated
  USING (firm_id = public.get_my_firm_id());

CREATE POLICY bank_statement_coverage_insert ON public.bank_statement_coverage
  FOR INSERT TO authenticated
  WITH CHECK (firm_id = public.get_my_firm_id());

CREATE POLICY bank_statement_coverage_update ON public.bank_statement_coverage
  FOR UPDATE TO authenticated
  USING (firm_id = public.get_my_firm_id())
  WITH CHECK (firm_id = public.get_my_firm_id());

CREATE POLICY bank_statement_coverage_delete ON public.bank_statement_coverage
  FOR DELETE TO authenticated
  USING (firm_id = public.get_my_firm_id());

-- Coverage summary for UI: last 3 calendar months must each have at least one row.
CREATE OR REPLACE FUNCTION public.get_statement_coverage(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm uuid;
  v_uploaded int := 0;
  v_missing text[] := ARRAY[]::text[];
  m date;
BEGIN
  SELECT firm_id INTO v_firm FROM public.applications WHERE id = p_application_id;
  IF v_firm IS NULL OR v_firm <> public.get_my_firm_id() THEN
    RETURN jsonb_build_object(
      'is_complete', false,
      'months_uploaded', 0,
      'missing_month_labels', '[]'::jsonb,
      'required_months', 3
    );
  END IF;

  FOR m IN
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE)::date - interval '2 months',
      date_trunc('month', CURRENT_DATE)::date,
      interval '1 month'
    )::date
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.bank_statement_coverage c
      WHERE c.application_id = p_application_id
        AND date_trunc('month', c.statement_month)::date = date_trunc('month', m)::date
    ) THEN
      v_uploaded := v_uploaded + 1;
    ELSE
      v_missing := array_append(v_missing, trim(to_char(m, 'Mon YYYY')));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'is_complete', coalesce(array_length(v_missing, 1), 0) = 0 AND v_uploaded >= 3,
    'months_uploaded', v_uploaded,
    'missing_month_labels', coalesce(to_jsonb(v_missing), '[]'::jsonb),
    'required_months', 3
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_statement_coverage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_statement_coverage(uuid) TO service_role;
