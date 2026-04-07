-- Aggregator statement uploads and per-line reconciliation (AggregatorStatement.tsx)

CREATE TABLE IF NOT EXISTS public.aggregator_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  aggregator_name text NOT NULL,
  period_start date,
  period_end date,
  storage_path text NOT NULL,
  file_name text,
  parse_status text NOT NULL DEFAULT 'pending'
    CHECK (parse_status IN ('pending', 'parsing', 'parsed', 'failed')),
  parse_error text,
  reconciled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aggregator_statements_firm_idx ON public.aggregator_statements(firm_id);

CREATE TABLE IF NOT EXISTS public.aggregator_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.aggregator_statements(id) ON DELETE CASCADE,
  line_index int NOT NULL DEFAULT 0,
  lender_name text,
  loan_amount numeric,
  statement_amount numeric,
  matched_commission_id uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  manual_override boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aggregator_statement_lines_statement_idx ON public.aggregator_statement_lines(statement_id);

ALTER TABLE public.aggregator_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregator_statement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aggregator_statements_firm" ON public.aggregator_statements;
CREATE POLICY "aggregator_statements_firm" ON public.aggregator_statements
  FOR ALL USING (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  )
  WITH CHECK (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "aggregator_statement_lines_firm" ON public.aggregator_statement_lines;
CREATE POLICY "aggregator_statement_lines_firm" ON public.aggregator_statement_lines
  FOR ALL USING (
    statement_id IN (
      SELECT id FROM public.aggregator_statements s
      WHERE s.firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    statement_id IN (
      SELECT id FROM public.aggregator_statements s
      WHERE s.firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
    )
  );
