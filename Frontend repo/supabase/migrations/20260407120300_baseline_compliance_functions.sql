-- ============================================================
-- BASELINE MIGRATION: COMPLIANCE FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 5
-- ============================================================

-- ----------------------------------------------------------
-- analyse_cccfa_transactions
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analyse_cccfa_transactions(p_connection_id uuid, p_application_id uuid, p_hem_benchmark numeric DEFAULT 3000)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_conn record;
  v_period_from date;
  v_period_to date;
  v_result_id uuid;
  v_avg_income numeric;
  v_avg_expenses numeric;
  v_avg_surplus numeric;
  v_lowest_balance numeric;
  v_income_stability integer;
  v_hardship_level text;
  v_flags jsonb := '[]'::jsonb;
  v_lender_concerns jsonb := '[]'::jsonb;
  v_stress_repayment numeric;
  v_app record;
BEGIN
  SELECT * INTO v_conn FROM public.akahu_connections WHERE id = p_connection_id;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;

  v_period_to := CURRENT_DATE;
  v_period_from := CURRENT_DATE - 90;

  -- Average monthly income (credits only, exclude transfers)
  SELECT COALESCE(AVG(monthly_income), 0) INTO v_avg_income
  FROM (
    SELECT DATE_TRUNC('month', transaction_date) as month,
           SUM(amount) as monthly_income
    FROM public.akahu_transactions
    WHERE akahu_connection_id = p_connection_id
      AND is_income = true
      AND transaction_date >= v_period_from
    GROUP BY month
  ) m;

  -- Average monthly expenses
  SELECT COALESCE(AVG(monthly_expenses), 0) INTO v_avg_expenses
  FROM (
    SELECT DATE_TRUNC('month', transaction_date) as month,
           SUM(ABS(amount)) as monthly_expenses
    FROM public.akahu_transactions
    WHERE akahu_connection_id = p_connection_id
      AND is_expense = true
      AND transaction_date >= v_period_from
    GROUP BY month
  ) m;

  -- Average monthly surplus
  v_avg_surplus := v_avg_income - v_avg_expenses;

  -- Lowest balance
  SELECT COALESCE(MIN(balance_after), 0) INTO v_lowest_balance
  FROM public.akahu_transactions
  WHERE akahu_connection_id = p_connection_id
    AND transaction_date >= v_period_from;

  -- Income stability (coefficient of variation approach)
  SELECT CASE
    WHEN STDDEV(monthly_income) = 0 THEN 100
    WHEN AVG(monthly_income) = 0 THEN 0
    ELSE GREATEST(0, LEAST(100, ROUND(100 - (STDDEV(monthly_income) / NULLIF(AVG(monthly_income), 0) * 100))))
  END INTO v_income_stability
  FROM (
    SELECT DATE_TRUNC('month', transaction_date) as month,
           SUM(amount) as monthly_income
    FROM public.akahu_transactions
    WHERE akahu_connection_id = p_connection_id
      AND is_income = true
      AND transaction_date >= v_period_from
    GROUP BY month
  ) m;

  -- Stress test affordability
  IF v_app.loan_amount > 0 THEN
    DECLARE
      r8 numeric := 8.5/100/12;
      n integer := COALESCE(v_app.loan_term_years, 30) * 12;
    BEGIN
      v_stress_repayment := v_app.loan_amount * (r8 * POWER(1+r8, n)) / (POWER(1+r8, n) - 1);
    END;
  END IF;

  -- Build hardship flags
  IF EXISTS(SELECT 1 FROM public.akahu_transactions WHERE akahu_connection_id = p_connection_id AND cccfa_category = 'gambling' AND transaction_date >= v_period_from) THEN
    v_flags := v_flags || '[{"flag":"gambling","severity":"high","detail":"Gambling transactions detected in 90-day period"}]'::jsonb;
  END IF;

  IF EXISTS(SELECT 1 FROM public.akahu_transactions WHERE akahu_connection_id = p_connection_id AND cccfa_category = 'bnpl' AND transaction_date >= v_period_from) THEN
    v_flags := v_flags || '[{"flag":"bnpl","severity":"medium","detail":"Buy Now Pay Later usage detected — lenders assess as ongoing commitment"}]'::jsonb;
  END IF;

  IF EXISTS(SELECT 1 FROM public.akahu_transactions WHERE akahu_connection_id = p_connection_id AND cccfa_category = 'dishonour_fee' AND transaction_date >= v_period_from) THEN
    v_flags := v_flags || '[{"flag":"dishonour_fees","severity":"high","detail":"Dishonour fees indicate payment difficulties"}]'::jsonb;
  END IF;

  IF v_lowest_balance < 0 THEN
    v_flags := v_flags || '[{"flag":"overdraft","severity":"high","detail":"Account went into overdraft during assessment period"}]'::jsonb;
  END IF;

  IF v_avg_expenses < (p_hem_benchmark * 0.5) THEN
    v_flags := v_flags || '[{"flag":"low_expenses","severity":"medium","detail":"Declared expenses significantly below HEM — lender will substitute HEM"}]'::jsonb;
  END IF;

  -- Determine hardship level
  v_hardship_level := CASE
    WHEN jsonb_array_length(v_flags) = 0 THEN 'low'
    WHEN jsonb_array_length(v_flags) <= 2 THEN 'medium'
    WHEN jsonb_array_length(v_flags) <= 4 THEN 'high'
    ELSE 'critical'
  END;

  -- Insert analysis
  INSERT INTO public.cccfa_bank_analysis (
    akahu_connection_id, application_id, firm_id,
    period_from, period_to, months_analysed,
    transactions_analysed,
    avg_monthly_income, avg_monthly_expenses, avg_monthly_surplus,
    lowest_balance_seen, income_stability_score,
    hem_benchmark, expenses_vs_hem, hem_gap,
    has_gambling, has_bnpl, has_dishonour_fees, has_overdraft_usage,
    hardship_risk_level, hardship_risk_flags,
    can_afford_stress_8pct,
    max_affordable_repayment
  ) VALUES (
    p_connection_id, p_application_id, v_conn.firm_id,
    v_period_from, v_period_to, 3,
    (SELECT COUNT(*) FROM public.akahu_transactions WHERE akahu_connection_id = p_connection_id AND transaction_date >= v_period_from),
    v_avg_income, v_avg_expenses, v_avg_surplus,
    v_lowest_balance, v_income_stability,
    p_hem_benchmark,
    CASE WHEN v_avg_expenses > p_hem_benchmark THEN 'above'
         WHEN v_avg_expenses > p_hem_benchmark * 0.9 THEN 'within_10pct'
         ELSE 'below' END,
    v_avg_expenses - p_hem_benchmark,
    EXISTS(SELECT 1 FROM public.akahu_transactions WHERE akahu_connection_id = p_connection_id AND cccfa_category = 'gambling' AND transaction_date >= v_period_from),
    EXISTS(SELECT 1 FROM public.akahu_transactions WHERE akahu_connection_id = p_connection_id AND cccfa_category = 'bnpl' AND transaction_date >= v_period_from),
    EXISTS(SELECT 1 FROM public.akahu_transactions WHERE akahu_connection_id = p_connection_id AND cccfa_category = 'dishonour_fee' AND transaction_date >= v_period_from),
    v_lowest_balance < 0,
    v_hardship_level, v_flags,
    v_stress_repayment IS NOT NULL AND (v_avg_surplus - v_stress_repayment) > 0,
    CASE WHEN v_avg_surplus > 0 THEN v_avg_surplus ELSE 0 END
  ) RETURNING id INTO v_result_id;

  -- Auto-populate expenses tab if below HEM
  IF v_avg_expenses > 100 THEN
    UPDATE public.expenses SET
      total_monthly = v_avg_expenses,
      updated_at = now()
    WHERE application_id = p_application_id
    AND total_monthly = 0;
  END IF;

  RETURN v_result_id;
END;
$function$;

-- ----------------------------------------------------------
-- check_kiwisaver_eligibility
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_kiwisaver_eligibility(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_app record;
  v_appl record;
  v_ks record;
  v_eligible boolean := true;
  v_reasons text[] := '{}';
  v_grant_amount numeric := 0;
  v_property_cap numeric;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;

  -- Get primary applicant (use applicant_type = 'primary' not is_primary)
  SELECT ap.*
  INTO v_appl
  FROM public.applicants ap
  WHERE ap.application_id = p_application_id
    AND ap.applicant_type = 'primary'
  LIMIT 1;

  -- Fallback: get first applicant if no primary found
  IF NOT FOUND THEN
    SELECT ap.* INTO v_appl
    FROM public.applicants ap
    WHERE ap.application_id = p_application_id
    LIMIT 1;
  END IF;

  SELECT * INTO v_ks FROM public.kiwisaver_withdrawals
  WHERE application_id = p_application_id LIMIT 1;

  IF v_ks.previous_property_owner THEN
    v_eligible := false;
    v_reasons := array_append(v_reasons, 'Not eligible: has previously owned property');
  END IF;

  IF v_ks.years_in_kiwisaver IS NOT NULL AND v_ks.years_in_kiwisaver < 3 THEN
    v_eligible := false;
    v_reasons := array_append(v_reasons, 'Not eligible: must be in KiwiSaver 3+ years');
  END IF;

  v_property_cap := CASE
    WHEN v_app.property_address ILIKE '%auckland%' 
      OR v_app.property_city ILIKE '%auckland%' THEN 625000
    ELSE 550000
  END;

  IF COALESCE(v_app.property_value, 0) > v_property_cap THEN
    v_eligible := false;
    v_reasons := array_append(v_reasons,
      'Property value $' || v_app.property_value || ' exceeds cap $' || v_property_cap);
  END IF;

  IF v_eligible AND v_ks.years_in_kiwisaver IS NOT NULL THEN
    v_grant_amount := LEAST(v_ks.years_in_kiwisaver, 5) * 5000;
  END IF;

  RETURN jsonb_build_object(
    'is_eligible', v_eligible,
    'eligibility_reasons', to_jsonb(v_reasons),
    'estimated_homestart_grant', v_grant_amount,
    'property_price_cap', v_property_cap,
    'years_in_kiwisaver', v_ks.years_in_kiwisaver,
    'estimated_balance', v_ks.estimated_balance,
    'recommendation', CASE
      WHEN v_eligible THEN 'Client appears eligible. Submit KiwiSaver withdrawal application. Allow 10-15 business days.'
      ELSE 'Client does not meet all eligibility criteria. Review reasons above.'
    END,
    'checked_at', now()
  );
END;
$function$;

-- ----------------------------------------------------------
-- get_cccfa_report_data
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cccfa_report_data(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_app record;
  v_sa record;
  v_akahu record;
  v_anomalies jsonb;
  v_income jsonb;
  v_expenses jsonb;
  v_existing_report record;
  v_part1 jsonb;
  v_part2 jsonb;
BEGIN
  SELECT
    a.id, a.reference_number, a.application_type, a.loan_purpose,
    a.loan_amount, a.property_value, a.property_address, a.property_city,
    a.lender_name, a.workflow_stage,
    c.first_name || ' ' || c.last_name AS client_name,
    c.email AS client_email, c.phone AS client_phone,
    c.date_of_birth, c.residential_address AS client_address,
    adv.first_name || ' ' || adv.last_name AS adviser_name,
    adv.email AS adviser_email, adv.fsp_number AS adviser_fsp,
    adv.id AS adviser_id,
    f.name AS firm_name, f.fsp_number AS firm_fsp,
    f.fap_licence_number, f.fap_name,
    f.address AS firm_address, f.city AS firm_city,
    f.primary_email AS firm_email, f.primary_phone AS firm_phone,
    f.website AS firm_website, f.logo_url,
    f.brand_color, f.complaints_body, f.complaints_url,
    f.disclaimer_text, f.id AS firm_id
  INTO v_app
  FROM public.applications a
  JOIN public.clients c ON c.id = a.client_id
  JOIN public.firms f ON f.id = a.firm_id
  LEFT JOIN public.advisors adv ON adv.id = a.assigned_to
  WHERE a.id = p_application_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_sa FROM public.serviceability_assessments
  WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_akahu FROM public.cccfa_bank_analysis
  WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'title', title, 'severity', severity, 'description', description
  )) INTO v_anomalies
  FROM public.anomaly_flags WHERE application_id = p_application_id AND status = 'open';

  SELECT jsonb_agg(jsonb_build_object(
    'income_type', income_type, 'gross_salary', gross_salary,
    'salary_frequency', salary_frequency, 'annual_gross_total', annual_gross_total,
    'verified', verified, 'parsed_bank_name', parsed_bank_name
  )) INTO v_income
  FROM public.income i
  JOIN public.applicants ap ON ap.id = i.applicant_id
  WHERE ap.application_id = p_application_id;

  SELECT jsonb_build_object(
    'total_monthly', total_monthly, 'food_groceries', food_groceries,
    'vehicle_running_costs', vehicle_running_costs, 'public_transport', public_transport,
    'health_insurance', health_insurance, 'life_insurance', life_insurance,
    'utilities', utilities, 'rent_board', rent_board,
    'childcare', childcare, 'other_discretionary', other_discretionary
  ) INTO v_expenses
  FROM public.expenses WHERE application_id = p_application_id
  ORDER BY created_at DESC LIMIT 1;

  SELECT id, pdf_url, generated_at INTO v_existing_report
  FROM public.cccfa_assessment_reports WHERE application_id = p_application_id
  ORDER BY created_at DESC LIMIT 1;

  -- Split into two parts to avoid 100-arg limit
  v_part1 := jsonb_build_object(
    'application_id',     p_application_id,
    'reference_number',   COALESCE(v_app.reference_number, 'N/A'),
    'application_type',   v_app.application_type,
    'loan_purpose',       v_app.loan_purpose,
    'loan_amount',        v_app.loan_amount,
    'property_value',     v_app.property_value,
    'property_address',   v_app.property_address,
    'property_city',      v_app.property_city,
    'lender_recommended', v_app.lender_name,
    'client_name',        v_app.client_name,
    'client_email',       v_app.client_email,
    'client_phone',       v_app.client_phone,
    'client_dob',         v_app.date_of_birth,
    'client_address',     v_app.client_address,
    'adviser_name',       v_app.adviser_name,
    'adviser_email',      v_app.adviser_email,
    'adviser_fsp',        v_app.adviser_fsp,
    'adviser_id',         v_app.adviser_id,
    'firm_name',          v_app.firm_name,
    'firm_fsp',           v_app.firm_fsp,
    'fap_licence_number', v_app.fap_licence_number,
    'fap_name',           v_app.fap_name,
    'firm_address',       v_app.firm_address,
    'firm_city',          v_app.firm_city,
    'firm_email',         v_app.firm_email,
    'firm_phone',         v_app.firm_phone,
    'firm_website',       v_app.firm_website,
    'logo_url',           v_app.logo_url,
    'brand_color',        COALESCE(v_app.brand_color, '#6366F1'),
    'complaints_body',    v_app.complaints_body,
    'complaints_url',     v_app.complaints_url,
    'disclaimer_text',    v_app.disclaimer_text,
    'firm_id',            v_app.firm_id,
    'report_date',        CURRENT_DATE,
    'existing_report_id', v_existing_report.id,
    'existing_pdf_url',   v_existing_report.pdf_url
  );

  v_part2 := jsonb_build_object(
    'has_serviceability',          v_sa IS NOT NULL,
    'gross_annual_income',         v_sa.gross_annual_income,
    'net_monthly_income',          v_sa.net_monthly_income,
    'declared_expenses_monthly',   v_sa.declared_expenses_monthly,
    'hem_benchmark_monthly',       v_sa.hem_benchmark_monthly,
    'expenses_used_monthly',       v_sa.expenses_used_monthly,
    'hem_applied',                 COALESCE(v_sa.declared_expenses_monthly < v_sa.hem_benchmark_monthly, false),
    'total_existing_debt_monthly', v_sa.total_existing_debt_monthly,
    'new_loan_amount',             v_sa.new_loan_amount,
    'stress_test_rate',            v_sa.stress_test_rate,
    'stress_repayment_monthly',    v_sa.new_loan_repayment_stress_monthly,
    'umi_monthly',                 v_sa.umi_monthly,
    'dti_ratio',                   v_sa.dti_ratio,
    'lvr_percent',                 v_sa.lvr_percent,
    'passes_serviceability',       v_sa.passes_serviceability,
    'surplus_monthly',             v_sa.serviceability_surplus_monthly,
    'flag_high_dti',               v_sa.flag_high_dti,
    'flag_low_umi',                v_sa.flag_low_umi,
    'flag_high_lvr',               v_sa.flag_high_lvr,
    'lender_matrix',               jsonb_build_object(
      'ANZ', v_sa.passes_anz, 'ASB', v_sa.passes_asb,
      'BNZ', v_sa.passes_bnz, 'Westpac', v_sa.passes_westpac,
      'Kiwibank', v_sa.passes_kiwibank
    ),
    'income_records',      COALESCE(v_income, '[]'::jsonb),
    'expenses',            COALESCE(v_expenses, '{}'::jsonb),
    'has_open_banking',    v_akahu IS NOT NULL,
    'akahu_avg_income',    v_akahu.avg_monthly_income,
    'akahu_has_gambling',  v_akahu.has_gambling,
    'akahu_has_bnpl',      v_akahu.has_bnpl,
    'akahu_has_dishonour', v_akahu.has_dishonour_fees,
    'anomaly_flags',       COALESCE(v_anomalies, '[]'::jsonb),
    'has_anomalies',       v_anomalies IS NOT NULL
  );

  RETURN v_part1 || v_part2;
END;
$function$;

-- ----------------------------------------------------------
-- save_cccfa_report
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_cccfa_report(p_application_id uuid, p_firm_id uuid, p_advisor_id uuid, p_pdf_url text, p_adviser_declaration text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sa record;
  v_report_id uuid;
BEGIN
  SELECT * INTO v_sa
  FROM public.serviceability_assessments
  WHERE application_id = p_application_id
  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.cccfa_assessment_reports (
    application_id, firm_id, advisor_id,
    gross_annual_income, net_monthly_income,
    declared_expenses_monthly, hem_benchmark_monthly,
    expenses_used_monthly, existing_debt_monthly,
    new_loan_amount, stress_rate, stress_repayment_monthly,
    umi_monthly, hem_applied,
    income_verified, expenses_verified,
    affordability_conclusion,
    adviser_declaration, adviser_signed_at, adviser_signed_by,
    pdf_url, pdf_generated_at
  ) VALUES (
    p_application_id, p_firm_id, p_advisor_id,
    v_sa.gross_annual_income, v_sa.net_monthly_income,
    v_sa.declared_expenses_monthly, v_sa.hem_benchmark_monthly,
    v_sa.expenses_used_monthly, v_sa.total_existing_debt_monthly,
    v_sa.new_loan_amount, v_sa.stress_test_rate, v_sa.new_loan_repayment_stress_monthly,
    v_sa.umi_monthly, v_sa.declared_expenses_monthly < v_sa.hem_benchmark_monthly,
    true, true,
    CASE WHEN v_sa.passes_serviceability THEN 'passes'
         WHEN v_sa.umi_monthly > 0 THEN 'marginal'
         ELSE 'fails' END,
    p_adviser_declaration, now(), p_advisor_id,
    p_pdf_url, now()
  ) RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$function$;

-- ----------------------------------------------------------
-- update_kiwisaver_updated_at
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_kiwisaver_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

