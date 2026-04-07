-- get_commission_summary: optional date range (YYYY-MM-DD) from client; replaces single-arg overload.

DROP FUNCTION IF EXISTS public.get_commission_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_commission_summary(
  p_firm_id uuid,
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d_from date;
  d_to date;
  as_of date;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.advisors WHERE id = auth.uid() AND firm_id = p_firm_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  d_from := p_from;
  d_to := p_to;
  IF d_from IS NULL OR d_to IS NULL THEN
    RAISE EXCEPTION 'p_from and p_to are required';
  END IF;
  IF d_from > d_to THEN
    RAISE EXCEPTION 'p_from must be <= p_to';
  END IF;

  as_of := LEAST(d_to, (timezone('UTC', now()))::date);

  RETURN json_build_object(
    'expected_this_month', COALESCE((
      SELECT SUM(c.net_amount) FROM public.commissions c
      WHERE c.firm_id = p_firm_id AND lower(coalesce(c.status, '')) = 'expected'
        AND c.expected_date IS NOT NULL
        AND c.expected_date >= d_from AND c.expected_date <= d_to
    ), 0),
    'received_this_month', COALESCE((
      SELECT SUM(c.net_amount) FROM public.commissions c
      WHERE c.firm_id = p_firm_id AND lower(coalesce(c.status, '')) = 'received'
        AND c.received_date IS NOT NULL
        AND c.received_date >= d_from AND c.received_date <= d_to
    ), 0),
    'overdue', COALESCE((
      SELECT SUM(c.net_amount) FROM public.commissions c
      WHERE c.firm_id = p_firm_id AND lower(coalesce(c.status, '')) = 'overdue'
    ), 0),
    'clawback_at_risk', COALESCE((
      SELECT SUM(c.gross_amount) FROM public.commissions c
      WHERE c.firm_id = p_firm_id
        AND c.clawback_risk_until IS NOT NULL
        AND c.clawback_risk_until > as_of
    ), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_commission_summary(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(uuid, date, date) TO service_role;
