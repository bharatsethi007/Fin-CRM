-- Link commissions to applications; firm lender rates for upfront preview (SubmissionTab).

ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS commissions_application_id_idx ON public.commissions(application_id);

CREATE TABLE IF NOT EXISTS public.lender_commission_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  lender_name text NOT NULL,
  upfront_rate numeric,
  aggregator_fee numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (firm_id, lender_name)
);

CREATE INDEX IF NOT EXISTS lender_commission_rates_firm_idx ON public.lender_commission_rates(firm_id);

ALTER TABLE public.lender_commission_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lender_commission_rates_firm" ON public.lender_commission_rates;
CREATE POLICY "lender_commission_rates_firm" ON public.lender_commission_rates
  FOR ALL USING (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  )
  WITH CHECK (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );
