-- ============================================================
-- BASELINE MIGRATION: COMMISSION FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 6
-- ============================================================

-- ----------------------------------------------------------
-- calculate_commission_on_settlement
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_commission_on_settlement(p_application_id uuid, p_settlement_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app record;
  v_rate record;
  v_lender text;
  v_gross numeric;
  v_gst numeric;
  v_agg_fee numeric;
  v_net numeric;
  v_commission_id uuid;
BEGIN
  SELECT a.*, adv.id as adv_id
  INTO v_app
  FROM public.applications a
  LEFT JOIN public.advisors adv ON adv.id = a.assigned_to
  WHERE a.id = p_application_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Don't create duplicate
  IF EXISTS (
    SELECT 1 FROM public.commissions 
    WHERE application_id = p_application_id 
    AND commission_type = 'upfront'
  ) THEN RETURN NULL; END IF;

  -- Find lender: approved submission first, then any submission, then 'Unknown'
  SELECT lender_name INTO v_lender
  FROM public.lender_submissions
  WHERE application_id = p_application_id
  ORDER BY CASE WHEN status = 'approved' THEN 0
                WHEN status = 'conditionally_approved' THEN 1
                ELSE 2 END,
           created_at DESC
  LIMIT 1;

  v_lender := COALESCE(v_lender, 'Unknown');

  -- Get commission rate
  SELECT * INTO v_rate
  FROM public.lender_commission_rates
  WHERE firm_id = v_app.firm_id
    AND lender_name = v_lender
    AND is_active = true
  LIMIT 1;

  -- Default to 0.85% if no rate configured
  IF NOT FOUND THEN
    v_rate.upfront_rate := 0.0085;
    v_rate.aggregator_split_pct := 0;
    v_rate.clawback_months := 27;
    v_rate.gst_inclusive := false;
  END IF;

  v_gross    := ROUND(COALESCE(v_app.loan_amount, 0) * v_rate.upfront_rate, 2);
  v_gst      := ROUND(v_gross * 0.15, 2);
  v_agg_fee  := ROUND(v_gross * COALESCE(v_rate.aggregator_split_pct, 0) / 100, 2);
  v_net      := v_gross + v_gst - v_agg_fee;

  INSERT INTO public.commissions (
    firm_id, advisor_id, application_id, client_id,
    commission_type, lender_name, loan_amount,
    gross_amount, gst_amount, aggregator_fee, net_amount,
    rate_applied, aggregator_split_pct,
    settlement_date, expected_date,
    clawback_risk_until, status
  ) VALUES (
    v_app.firm_id,
    v_app.assigned_to,
    p_application_id,
    v_app.client_id,
    'upfront',
    v_lender,
    v_app.loan_amount,
    v_gross, v_gst, v_agg_fee, v_net,
    v_rate.upfront_rate,
    COALESCE(v_rate.aggregator_split_pct, 0),
    p_settlement_date,
    p_settlement_date + interval '45 days',
    p_settlement_date + (COALESCE(v_rate.clawback_months, 27) || ' months')::interval,
    'expected'
  ) RETURNING id INTO v_commission_id;

  RETURN v_commission_id;
END;
$function$;

-- ----------------------------------------------------------
-- create_post_settlement_tasks
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_post_settlement_tasks()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_firm_id uuid;
  v_advisor_id uuid;
BEGIN
  -- Only trigger when settlement date is confirmed for the first time
  IF NEW.settlement_date IS NOT NULL AND NEW.settlement_confirmed = true
     AND (TG_OP = 'INSERT' OR OLD.settlement_confirmed IS DISTINCT FROM NEW.settlement_confirmed) THEN

    -- Get firm and advisor from application
    SELECT firm_id, assigned_to
    INTO v_firm_id, v_advisor_id
    FROM public.applications
    WHERE id = NEW.application_id;

    -- Create annual review task (12 months after settlement)
    INSERT INTO public.tasks (
      firm_id,
      assigned_to,
      application_id,
      title,
      description,
      priority,
      status,
      task_type,
      due_date
    )
    SELECT
      v_firm_id,
      v_advisor_id,
      NEW.application_id,
      'Annual Review — ' || c.first_name || ' ' || c.last_name,
      'Schedule and conduct annual mortgage review. Check rate expiry, financial changes, and new opportunities.',
      'medium',
      'pending',
      'follow_up',
      (NEW.settlement_date + INTERVAL '12 months')::date
    FROM public.applications a
    JOIN public.clients c ON a.client_id = c.id
    WHERE a.id = NEW.application_id;

    -- Create rate refix task (at 80% of fixed term if applicable)
    -- e.g. for 24-month fix, remind at 19 months
    -- This is handled by the settled_loans table and v_rate_refix_alerts view

  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- get_commission_summary
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_commission_summary(p_firm_id uuid, p_from date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date, p_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_expected    numeric;
  v_received    numeric;
  v_overdue     numeric;
  v_clawback    numeric;
  v_upfront_cnt integer;
  v_trail_cnt   integer;
  v_cb_cnt      integer;
  v_by_lender   jsonb;
  v_by_advisor  jsonb;
  v_trend       jsonb;
BEGIN
  -- Scalar aggregates first (no nesting)
  SELECT
    COALESCE(SUM(net_amount) FILTER (WHERE status = 'expected'),    0),
    COALESCE(SUM(net_amount) FILTER (WHERE status = 'received'),    0),
    COALESCE(SUM(net_amount) FILTER (WHERE status = 'overdue'),     0),
    COALESCE(SUM(gross_amount) FILTER (
      WHERE clawback_risk_until > CURRENT_DATE AND status = 'received'), 0),
    COUNT(*) FILTER (WHERE commission_type = 'upfront'),
    COUNT(*) FILTER (WHERE commission_type = 'trail'),
    COUNT(*) FILTER (WHERE commission_type = 'clawback')
  INTO v_expected, v_received, v_overdue, v_clawback,
       v_upfront_cnt, v_trail_cnt, v_cb_cnt
  FROM public.commissions
  WHERE firm_id = p_firm_id
    AND settlement_date BETWEEN p_from AND p_to;

  -- By lender
  SELECT jsonb_agg(row_to_json(t))
  INTO v_by_lender
  FROM (
    SELECT lender_name as lender,
           SUM(net_amount) as total,
           COUNT(*) as count
    FROM public.commissions
    WHERE firm_id = p_firm_id
      AND settlement_date BETWEEN p_from AND p_to
    GROUP BY lender_name
    ORDER BY SUM(net_amount) DESC
  ) t;

  -- By advisor
  SELECT jsonb_agg(row_to_json(t))
  INTO v_by_advisor
  FROM (
    SELECT
      c.advisor_id,
      COALESCE(adv.full_name, CONCAT(adv.first_name,' ',adv.last_name)) as advisor_name,
      SUM(c.net_amount) as total,
      COUNT(*) as count
    FROM public.commissions c
    LEFT JOIN public.advisors adv ON adv.id = c.advisor_id
    WHERE c.firm_id = p_firm_id
      AND c.settlement_date BETWEEN p_from AND p_to
    GROUP BY c.advisor_id, adv.full_name, adv.first_name, adv.last_name
  ) t;

  -- Monthly trend (last 12 months)
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.month)
  INTO v_trend
  FROM (
    SELECT
      DATE_TRUNC('month', settlement_date) as month,
      SUM(net_amount) FILTER (WHERE status = 'received') as received,
      SUM(net_amount) FILTER (WHERE status = 'expected') as expected
    FROM public.commissions
    WHERE firm_id = p_firm_id
      AND settlement_date >= CURRENT_DATE - interval '12 months'
    GROUP BY DATE_TRUNC('month', settlement_date)
  ) t;

  RETURN jsonb_build_object(
    'total_expected',   v_expected,
    'total_received',   v_received,
    'total_overdue',    v_overdue,
    'clawback_at_risk', v_clawback,
    'upfront_count',    v_upfront_cnt,
    'trail_count',      v_trail_cnt,
    'clawback_count',   v_cb_cnt,
    'by_lender',        COALESCE(v_by_lender,  '[]'::jsonb),
    'by_advisor',       COALESCE(v_by_advisor, '[]'::jsonb),
    'monthly_trend',    COALESCE(v_trend,      '[]'::jsonb)
  );
END;
$function$;

-- ----------------------------------------------------------
-- set_settled_loan_dates
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_settled_loan_dates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Set annual review 12 months after settlement
  IF NEW.annual_review_due_date IS NULL AND NEW.settlement_date IS NOT NULL THEN
    NEW.annual_review_due_date = NEW.settlement_date + INTERVAL '12 months';
  END IF;

  -- Set loan end date from term
  IF NEW.loan_end_date IS NULL AND NEW.settlement_date IS NOT NULL AND NEW.loan_term_years IS NOT NULL THEN
    NEW.loan_end_date = NEW.settlement_date + (NEW.loan_term_years || ' years')::interval;
  END IF;

  -- Set initial rate expiry from term in months
  IF NEW.initial_rate_expiry_date IS NULL AND NEW.settlement_date IS NOT NULL
     AND NEW.initial_rate_term_months IS NOT NULL THEN
    NEW.initial_rate_expiry_date = NEW.settlement_date + (NEW.initial_rate_term_months || ' months')::interval;
    NEW.current_rate_expiry_date = NEW.initial_rate_expiry_date;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- trigger_commission_on_settlement
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_commission_on_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.workflow_stage = 'settled' AND OLD.workflow_stage != 'settled' THEN
    PERFORM public.calculate_commission_on_settlement(NEW.id, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_settled_loan_current_rate
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_settled_loan_current_rate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.settled_loans
  SET
    current_interest_rate = NEW.new_interest_rate,
    current_rate_type = NEW.new_rate_type,
    current_rate_expiry_date = NEW.new_rate_expiry_date,
    current_rate_set_date = NEW.new_rate_start_date,
    updated_at = now()
  WHERE id = NEW.settled_loan_id;
  RETURN NEW;
END;
$function$;

