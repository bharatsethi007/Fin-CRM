-- Cached client DNA analysis for SOA / lender filtering (one row per application).

CREATE TABLE IF NOT EXISTS public.soa_client_dna (
  deal_id uuid NOT NULL PRIMARY KEY REFERENCES public.applications (id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms (id) ON DELETE CASCADE,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_tier text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS soa_client_dna_firm_id_idx ON public.soa_client_dna (firm_id);

ALTER TABLE public.soa_client_dna ADD COLUMN IF NOT EXISTS income_stability numeric;
ALTER TABLE public.soa_client_dna ADD COLUMN IF NOT EXISTS lvr numeric;
ALTER TABLE public.soa_client_dna ADD COLUMN IF NOT EXISTS dti numeric;
ALTER TABLE public.soa_client_dna ADD COLUMN IF NOT EXISTS property_risk_count integer;

ALTER TABLE public.soa_client_dna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "soa_client_dna_service_all" ON public.soa_client_dna;
CREATE POLICY "soa_client_dna_service_all" ON public.soa_client_dna FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "soa_client_dna_select_firm" ON public.soa_client_dna;
CREATE POLICY "soa_client_dna_select_firm" ON public.soa_client_dna FOR SELECT TO authenticated USING (
  firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "soa_client_dna_insert_firm" ON public.soa_client_dna;
CREATE POLICY "soa_client_dna_insert_firm" ON public.soa_client_dna FOR INSERT TO authenticated WITH CHECK (
  firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "soa_client_dna_update_firm" ON public.soa_client_dna;
CREATE POLICY "soa_client_dna_update_firm" ON public.soa_client_dna FOR UPDATE TO authenticated USING (
  firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
) WITH CHECK (firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid()));
