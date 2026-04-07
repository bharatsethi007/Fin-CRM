-- Extended lender rates + Xero connection (CommissionSettings.tsx)

ALTER TABLE public.lender_commission_rates ADD COLUMN IF NOT EXISTS upfront_rate_percent numeric;
ALTER TABLE public.lender_commission_rates ADD COLUMN IF NOT EXISTS trail_rate_percent numeric;
ALTER TABLE public.lender_commission_rates ADD COLUMN IF NOT EXISTS clawback_months integer;
ALTER TABLE public.lender_commission_rates ADD COLUMN IF NOT EXISTS aggregator_split_percent numeric;
ALTER TABLE public.lender_commission_rates ADD COLUMN IF NOT EXISTS trail_paid_by text;

ALTER TABLE public.lender_commission_rates DROP CONSTRAINT IF EXISTS lender_commission_rates_trail_paid_by_check;
ALTER TABLE public.lender_commission_rates
  ADD CONSTRAINT lender_commission_rates_trail_paid_by_check
  CHECK (trail_paid_by IS NULL OR trail_paid_by IN ('lender', 'aggregator', 'none'));

CREATE TABLE IF NOT EXISTS public.xero_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  connected boolean NOT NULL DEFAULT false,
  tenant_name text,
  last_synced_at timestamptz,
  income_account_code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (firm_id)
);

ALTER TABLE public.xero_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xero_config_firm" ON public.xero_config;
CREATE POLICY "xero_config_firm" ON public.xero_config
  FOR ALL USING (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  )
  WITH CHECK (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );
