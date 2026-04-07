-- FK columns for PostgREST embeds: commissions.select('*, clients(...), advisors(...)')
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS advisor_id uuid REFERENCES public.advisors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS commissions_client_id_idx ON public.commissions(client_id);
CREATE INDEX IF NOT EXISTS commissions_advisor_id_idx ON public.commissions(advisor_id);

UPDATE public.commissions c
SET client_id = a.client_id,
    advisor_id = a.assigned_to
FROM public.applications a
WHERE c.application_id = a.id;

-- Keep upfront rows in sync with application client/advisor when recalculated
CREATE OR REPLACE FUNCTION public.calculate_commission_on_settlement(
  p_application_id uuid,
  p_settlement_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm_id uuid;
  v_loan numeric;
  v_client_name text;
  v_client_id uuid;
  v_advisor_id uuid;
  v_lender text;
  v_upfront_pct numeric;
  v_upfront_legacy numeric;
  v_agg_fee numeric;
  v_claw_months integer;
  v_gross numeric;
  v_gst numeric;
  v_net numeric;
  v_clawback date;
  v_comm_id uuid;
BEGIN
  SELECT a.firm_id,
         COALESCE(a.loan_amount, 0),
         NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''),
         a.client_id,
         a.assigned_to
    INTO v_firm_id, v_loan, v_client_name, v_client_id, v_advisor_id
  FROM public.applications a
  LEFT JOIN public.clients c ON c.id = a.client_id
  WHERE a.id = p_application_id;

  IF NOT FOUND OR v_firm_id IS NULL THEN
    RAISE EXCEPTION 'Application % not found or missing firm_id', p_application_id;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.advisors adv
    WHERE adv.id = auth.uid() AND adv.firm_id = v_firm_id
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT ls.lender_name INTO v_lender
  FROM public.lender_submissions ls
  WHERE ls.application_id = p_application_id
  ORDER BY (ls.is_primary IS TRUE) DESC,
           CASE WHEN lower(COALESCE(ls.status, '')) IN ('settled', 'approved') THEN 0 ELSE 1 END,
           ls.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_lender IS NULL THEN
    RAISE EXCEPTION 'No lender_submissions row for application %', p_application_id;
  END IF;

  SELECT r.upfront_rate_percent,
         r.upfront_rate,
         r.aggregator_fee,
         r.clawback_months
    INTO v_upfront_pct, v_upfront_legacy, v_agg_fee, v_claw_months
  FROM public.lender_commission_rates r
  WHERE r.firm_id = v_firm_id
    AND r.lender_name = v_lender
  LIMIT 1;

  IF v_upfront_pct IS NOT NULL THEN
    v_gross := v_loan * (v_upfront_pct / 100.0);
  ELSIF v_upfront_legacy IS NOT NULL THEN
    v_gross := v_loan * v_upfront_legacy;
  ELSE
    v_gross := 0;
  END IF;

  v_gst := COALESCE(v_gross, 0) * 0.15;
  v_agg_fee := COALESCE(v_agg_fee, 0);
  v_net := COALESCE(v_gross, 0) + COALESCE(v_gst, 0) - v_agg_fee;

  v_clawback := (p_settlement_date + (COALESCE(v_claw_months, 27) * interval '1 month'))::date;

  DELETE FROM public.commissions
  WHERE application_id = p_application_id
    AND lower(COALESCE(commission_type, '')) = 'upfront';

  INSERT INTO public.commissions (
    firm_id,
    application_id,
    client_id,
    advisor_id,
    client_name,
    lender,
    commission_type,
    loan_amount,
    gross_amount,
    gst,
    aggregator_fee,
    net_amount,
    settlement_date,
    expected_date,
    status,
    clawback_risk_until
  )
  VALUES (
    v_firm_id,
    p_application_id,
    v_client_id,
    v_advisor_id,
    v_client_name,
    v_lender,
    'upfront',
    v_loan,
    v_gross,
    v_gst,
    v_agg_fee,
    v_net,
    p_settlement_date,
    p_settlement_date,
    'expected',
    v_clawback
  )
  RETURNING id INTO v_comm_id;

  RETURN v_comm_id;
END;
$$;
