-- Commission tracking: table, summary RPC, clawback risk view (used by CommissionPage).

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  client_name text,
  lender text,
  commission_type text CHECK (commission_type IS NULL OR lower(commission_type) IN ('upfront', 'trail', 'clawback')),
  loan_amount numeric,
  gross_amount numeric,
  gst numeric,
  aggregator_fee numeric,
  net_amount numeric,
  settlement_date date,
  expected_date date,
  received_date date,
  clawback_risk_until date,
  status text CHECK (status IS NULL OR lower(status) IN ('expected', 'received', 'overdue', 'clawback')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commissions_firm_id_idx ON public.commissions(firm_id);
CREATE INDEX IF NOT EXISTS commissions_status_idx ON public.commissions(status);
CREATE INDEX IF NOT EXISTS commissions_expected_date_idx ON public.commissions(expected_date);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commissions_select_firm" ON public.commissions;
DROP POLICY IF EXISTS "commissions_modify_firm" ON public.commissions;

CREATE POLICY "commissions_select_firm" ON public.commissions
  FOR SELECT USING (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );
CREATE POLICY "commissions_modify_firm" ON public.commissions
  FOR ALL USING (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  )
  WITH CHECK (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.get_commission_summary(p_firm_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  m_start date;
  m_end date;
  today date;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.advisors WHERE id = auth.uid() AND firm_id = p_firm_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  m_start := date_trunc('month', timezone('UTC', now()))::date;
  m_end := (date_trunc('month', timezone('UTC', now())) + interval '1 month - 1 day')::date;
  today := (timezone('UTC', now()))::date;

  RETURN json_build_object(
    'expected_this_month', COALESCE((
      SELECT SUM(c.net_amount) FROM public.commissions c
      WHERE c.firm_id = p_firm_id AND lower(coalesce(c.status, '')) = 'expected'
        AND c.expected_date >= m_start AND c.expected_date <= m_end
    ), 0),
    'received_this_month', COALESCE((
      SELECT SUM(c.net_amount) FROM public.commissions c
      WHERE c.firm_id = p_firm_id AND lower(coalesce(c.status, '')) = 'received'
        AND c.received_date >= m_start AND c.received_date <= m_end
    ), 0),
    'overdue', COALESCE((
      SELECT SUM(c.net_amount) FROM public.commissions c
      WHERE c.firm_id = p_firm_id AND lower(coalesce(c.status, '')) = 'overdue'
    ), 0),
    'clawback_at_risk', COALESCE((
      SELECT SUM(c.gross_amount) FROM public.commissions c
      WHERE c.firm_id = p_firm_id
        AND c.clawback_risk_until IS NOT NULL
        AND c.clawback_risk_until > today
    ), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_commission_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.v_clawback_risk AS
SELECT
  c.id,
  c.firm_id,
  c.client_name,
  c.lender,
  c.net_amount,
  c.clawback_risk_until,
  CASE
    WHEN c.clawback_risk_until IS NULL THEN NULL
    ELSE (c.clawback_risk_until - (timezone('UTC', now()))::date)
  END AS days_until_safe
FROM public.commissions c
WHERE c.clawback_risk_until IS NOT NULL
  AND c.clawback_risk_until >= (timezone('UTC', now()))::date;

GRANT SELECT ON public.v_clawback_risk TO authenticated;
