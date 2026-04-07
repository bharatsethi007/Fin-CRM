-- ============================================================
-- BASELINE MIGRATION: SERVICEABILITY FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 7
-- ============================================================

-- ----------------------------------------------------------
-- calculate_decline_risk
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_decline_risk(p_application_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app record;
  v_svc record;
  v_anomaly_count integer;
  v_readiness record;
  v_firm_id uuid;

  -- Risk scores (0-100)
  v_base_risk integer := 0;
  v_anz_risk integer;
  v_asb_risk integer;
  v_bnz_risk integer;
  v_westpac_risk integer;
  v_kiwibank_risk integer;

  v_risk_factors jsonb := '[]'::jsonb;
  v_similar_count integer := 0;
  v_confidence text := 'low';
  v_recommended_lender text;
  v_best_approval_prob numeric := 0;
  v_result_id uuid;

  -- Historical win rates
  v_dti_band text;
  v_lvr_band text;
  v_win_rates jsonb;
BEGIN
  SELECT a.*, a.firm_id INTO v_app FROM public.applications a WHERE id = p_application_id;
  v_firm_id := v_app.firm_id;

  SELECT * INTO v_svc FROM public.serviceability_assessments
  WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  SELECT COUNT(*) INTO v_anomaly_count FROM public.anomaly_flags
  WHERE application_id = p_application_id AND status = 'open';

  SELECT total_score, score_grade, critical_count INTO v_readiness
  FROM public.application_readiness_scores
  WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  -- ================================================================
  -- RULE-BASED RISK SCORING
  -- ================================================================

  -- DTI risk
  IF v_svc.dti_ratio IS NOT NULL THEN
    v_base_risk := v_base_risk + CASE
      WHEN v_svc.dti_ratio > 6.0 THEN 50
      WHEN v_svc.dti_ratio > 5.5 THEN 30
      WHEN v_svc.dti_ratio > 5.0 THEN 15
      WHEN v_svc.dti_ratio > 4.5 THEN 8
      ELSE 0
    END;

    IF v_svc.dti_ratio > 5.0 THEN
      v_risk_factors := v_risk_factors || jsonb_build_array(jsonb_build_object(
        'factor', 'high_dti',
        'impact', CASE WHEN v_svc.dti_ratio > 6.0 THEN 'critical' WHEN v_svc.dti_ratio > 5.5 THEN 'high' ELSE 'medium' END,
        'description', 'DTI of ' || ROUND(v_svc.dti_ratio, 1) || 'x is elevated. BNZ internal limit is 5.5x.'
      ));
    END IF;
  END IF;

  -- LVR risk
  IF v_svc.lvr_percent IS NOT NULL THEN
    v_base_risk := v_base_risk + CASE
      WHEN v_svc.lvr_percent > 90 THEN 35
      WHEN v_svc.lvr_percent > 85 THEN 20
      WHEN v_svc.lvr_percent > 80 THEN 10
      ELSE 0
    END;

    IF v_svc.lvr_percent > 80 THEN
      v_risk_factors := v_risk_factors || jsonb_build_array(jsonb_build_object(
        'factor', 'high_lvr',
        'impact', CASE WHEN v_svc.lvr_percent > 90 THEN 'critical' ELSE 'high' END,
        'description', 'LVR of ' || ROUND(v_svc.lvr_percent, 0) || '% requires low equity lending — limited lender appetite.'
      ));
    END IF;
  END IF;

  -- UMI risk
  IF v_svc.umi_monthly IS NOT NULL THEN
    IF v_svc.umi_monthly < 0 THEN
      v_base_risk := v_base_risk + 60;
      v_risk_factors := v_risk_factors || jsonb_build_array(jsonb_build_object(
        'factor', 'negative_umi',
        'impact', 'critical',
        'description', 'Negative UMI of ' || fmt_money(v_svc.umi_monthly) || '/mth — fails serviceability at all lenders.'
      ));
    ELSIF v_svc.umi_monthly < 500 THEN
      v_base_risk := v_base_risk + 20;
    END IF;
  END IF;

  -- Anomaly risk
  IF v_anomaly_count > 0 THEN
    v_base_risk := v_base_risk + (v_anomaly_count * 8);
    v_risk_factors := v_risk_factors || jsonb_build_array(jsonb_build_object(
      'factor', 'open_anomalies',
      'impact', CASE WHEN v_anomaly_count >= 3 THEN 'high' ELSE 'medium' END,
      'description', v_anomaly_count || ' unresolved anomaly flag(s) — lenders may identify the same issues.'
    ));
  END IF;

  -- Readiness risk
  IF v_readiness.score_grade IN ('D', 'F') THEN
    v_base_risk := v_base_risk + 25;
    v_risk_factors := v_risk_factors || jsonb_build_array(jsonb_build_object(
      'factor', 'low_readiness',
      'impact', 'high',
      'description', 'Application readiness grade ' || v_readiness.score_grade || ' — incomplete application increases decline risk.'
    ));
  END IF;

  -- ================================================================
  -- LENDER-SPECIFIC RISK ADJUSTMENTS
  -- ================================================================
  v_anz_risk := LEAST(100, v_base_risk);
  v_asb_risk := LEAST(100, v_base_risk - 3);  -- ASB slightly more flexible on SE
  v_bnz_risk := LEAST(100, v_base_risk + 8);  -- BNZ stricter DTI
  v_westpac_risk := LEAST(100, v_base_risk);
  v_kiwibank_risk := LEAST(100, v_base_risk - 5);  -- Kiwibank more appetite

  -- BNZ extra penalty for DTI > 5.5
  IF v_svc.dti_ratio > 5.5 THEN
    v_bnz_risk := LEAST(100, v_bnz_risk + 20);
  END IF;

  -- ================================================================
  -- LOOK UP HISTORICAL WIN RATES (if enough data)
  -- ================================================================
  v_dti_band := CASE
    WHEN v_svc.dti_ratio <= 3 THEN '0-3x'
    WHEN v_svc.dti_ratio <= 4.5 THEN '3-4.5x'
    WHEN v_svc.dti_ratio <= 6 THEN '4.5-6x'
    ELSE '6x+'
  END;

  v_lvr_band := CASE
    WHEN v_svc.lvr_percent <= 60 THEN '0-60%'
    WHEN v_svc.lvr_percent <= 70 THEN '60-70%'
    WHEN v_svc.lvr_percent <= 80 THEN '70-80%'
    WHEN v_svc.lvr_percent <= 90 THEN '80-90%'
    ELSE '90%+'
  END;

  SELECT COUNT(*) INTO v_similar_count FROM public.application_outcomes
  WHERE firm_id = v_firm_id
    AND CASE WHEN v_svc.dti_ratio <= 3 THEN '0-3x' WHEN v_svc.dti_ratio <= 4.5 THEN '3-4.5x' WHEN v_svc.dti_ratio <= 6 THEN '4.5-6x' ELSE '6x+' END = v_dti_band;

  v_confidence := CASE
    WHEN v_similar_count >= 20 THEN 'high'
    WHEN v_similar_count >= 10 THEN 'medium'
    WHEN v_similar_count >= 3 THEN 'low'
    ELSE 'insufficient'
  END;

  -- Recommended lender = lowest risk
  v_recommended_lender := CASE LEAST(v_anz_risk, v_asb_risk, v_bnz_risk, v_westpac_risk, v_kiwibank_risk)
    WHEN v_anz_risk THEN 'ANZ'
    WHEN v_asb_risk THEN 'ASB'
    WHEN v_bnz_risk THEN 'BNZ'
    WHEN v_westpac_risk THEN 'Westpac'
    ELSE 'Kiwibank'
  END;

  v_best_approval_prob := ROUND(
    (100 - LEAST(v_anz_risk, v_asb_risk, v_bnz_risk, v_westpac_risk, v_kiwibank_risk))::numeric / 100, 2
  );

  INSERT INTO public.decline_risk_assessments (
    application_id, firm_id,
    anz_decline_risk, asb_decline_risk, bnz_decline_risk,
    westpac_decline_risk, kiwibank_decline_risk,
    recommended_lender, recommended_lender_approval_probability,
    primary_risk_factors, similar_applications_count, data_confidence
  ) VALUES (
    p_application_id, v_firm_id,
    v_anz_risk, v_asb_risk, v_bnz_risk,
    v_westpac_risk, v_kiwibank_risk,
    v_recommended_lender, v_best_approval_prob,
    v_risk_factors, v_similar_count, v_confidence
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$function$;

-- ----------------------------------------------------------
-- calculate_income_stability
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_income_stability(p_application_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_income_records integer;
  v_total_income numeric;
  v_variance numeric := 0;
  v_score integer := 50; -- base score
  v_is_se boolean;
  v_months_of_data integer;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(annual_gross_total), 0)
  INTO v_income_records, v_total_income
  FROM public.income i
  JOIN public.applicants a ON i.applicant_id = a.id
  WHERE a.application_id = p_application_id;

  -- Penalty: no income data
  IF v_income_records = 0 THEN RETURN 0; END IF;

  -- Check self-employed
  SELECT COUNT(*) > 0 INTO v_is_se
  FROM public.income i
  JOIN public.applicants a ON i.applicant_id = a.id
  WHERE a.application_id = p_application_id
    AND i.income_type IN ('self_employed', 'business');

  -- Base score adjustments
  IF v_is_se THEN
    v_score := v_score - 15; -- SE income inherently less stable
  END IF;

  -- Boost for multiple income sources
  IF v_income_records >= 2 THEN v_score := v_score + 10; END IF;

  -- Boost for high income (more buffer)
  IF v_total_income > 150000 THEN v_score := v_score + 10;
  ELSIF v_total_income > 100000 THEN v_score := v_score + 5;
  END IF;

  -- Check for verification
  IF EXISTS (
    SELECT 1 FROM public.income i
    JOIN public.applicants a ON i.applicant_id = a.id
    WHERE a.application_id = p_application_id AND i.verified = true
  ) THEN v_score := v_score + 15; END IF;

  -- Check for parsed data (bank statement verified)
  IF EXISTS (
    SELECT 1 FROM public.income i
    JOIN public.applicants a ON i.applicant_id = a.id
    WHERE a.application_id = p_application_id AND i.parsed_at IS NOT NULL
  ) THEN v_score := v_score + 10; END IF;

  RETURN LEAST(100, GREATEST(0, v_score));
END;
$function$;

-- ----------------------------------------------------------
-- calculate_lvr
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_lvr()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.valuation_amount IS NOT NULL AND NEW.valuation_amount > 0
     AND NEW.loan_amount IS NOT NULL AND NEW.loan_amount > 0 THEN
    NEW.lvr_percent = ROUND((NEW.loan_amount / NEW.valuation_amount * 100)::numeric, 2);
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- calculate_readiness_score
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_readiness_score(p_application_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app record;
  v_firm_id uuid;
  v_score_identity integer := 0;
  v_score_income integer := 0;
  v_score_expenses integer := 0;
  v_score_assets integer := 0;
  v_score_property integer := 0;
  v_score_compliance integer := 0;
  v_score_documents integer := 0;
  v_critical jsonb := '[]'::jsonb;
  v_high jsonb := '[]'::jsonb;
  v_medium jsonb := '[]'::jsonb;
  v_has_identity_doc boolean := false;
  v_has_financial_docs boolean := false;
  v_has_income boolean := false;
  v_has_expenses boolean := false;
  v_has_assets boolean := false;
  v_has_liabilities boolean := false;
  v_has_disclosure boolean := false;
  v_has_needs boolean := false;
  v_has_kyc boolean := false;
  v_has_credit_check boolean := false;
  v_income_count integer := 0;
  v_expense_total numeric := 0;
  v_applicant_count integer := 0;
  v_doc_count integer := 0;
  v_total_score integer;
  v_grade text;
  v_ready boolean;
  v_result_id uuid;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_firm_id := v_app.firm_id;

  SELECT COUNT(*) INTO v_applicant_count FROM public.applicants WHERE application_id = p_application_id;

  -- SECTION 1: IDENTITY & KYC
  SELECT EXISTS(SELECT 1 FROM public.compliance_checklists WHERE application_id = p_application_id AND kyc_identity_verified = true) INTO v_has_kyc;
  SELECT EXISTS(SELECT 1 FROM public.documents WHERE application_id = p_application_id AND category = 'ID') INTO v_has_identity_doc;

  v_score_identity := CASE
    WHEN v_has_kyc AND v_has_identity_doc THEN 100
    WHEN v_has_identity_doc THEN 70
    WHEN v_applicant_count > 0 THEN 40
    ELSE 0
  END;

  IF NOT v_has_identity_doc THEN
    v_critical := v_critical || '[{"code":"NO_ID_DOC","message":"No identity document uploaded","section":"Identity"}]'::jsonb;
  END IF;
  IF NOT v_has_kyc THEN
    v_high := v_high || '[{"code":"KYC_NOT_VERIFIED","message":"KYC identity not verified in compliance checklist","section":"Compliance"}]'::jsonb;
  END IF;

  -- SECTION 2: INCOME
  SELECT COUNT(*) INTO v_income_count
  FROM public.income i JOIN public.applicants a ON i.applicant_id = a.id
  WHERE a.application_id = p_application_id;
  v_has_income := v_income_count > 0;

  SELECT EXISTS(SELECT 1 FROM public.documents WHERE application_id = p_application_id AND category = '02 Financial Evidence') INTO v_has_financial_docs;

  v_score_income := CASE
    WHEN v_has_income AND v_has_financial_docs THEN 100
    WHEN v_has_income THEN 65
    ELSE 0
  END;

  IF NOT v_has_income THEN
    v_critical := v_critical || '[{"code":"NO_INCOME","message":"No income data entered for any applicant","section":"Income"}]'::jsonb;
  ELSIF NOT v_has_financial_docs THEN
    v_high := v_high || '[{"code":"NO_INCOME_DOCS","message":"Income entered but no financial evidence documents uploaded","section":"Income"}]'::jsonb;
  END IF;

  -- SECTION 3: EXPENSES
  SELECT COALESCE(SUM(total_monthly), 0) INTO v_expense_total FROM public.expenses WHERE application_id = p_application_id;
  v_has_expenses := v_expense_total > 0;

  v_score_expenses := CASE
    WHEN v_has_expenses AND v_expense_total > 500 THEN 100
    WHEN v_has_expenses THEN 60
    ELSE 0
  END;

  IF NOT v_has_expenses THEN
    v_critical := v_critical || '[{"code":"NO_EXPENSES","message":"No expenses entered — CCCFA requires expense verification","section":"Expenses"}]'::jsonb;
  END IF;

  -- SECTION 4: ASSETS & LIABILITIES
  SELECT EXISTS(SELECT 1 FROM public.assets WHERE application_id = p_application_id) INTO v_has_assets;
  SELECT EXISTS(SELECT 1 FROM public.liabilities WHERE application_id = p_application_id) INTO v_has_liabilities;

  v_score_assets := CASE
    WHEN v_has_assets AND v_has_liabilities THEN 100
    WHEN v_has_assets OR v_has_liabilities THEN 60
    ELSE 20
  END;

  IF NOT v_has_assets THEN
    v_medium := v_medium || '[{"code":"NO_ASSETS","message":"No assets recorded — include KiwiSaver, bank accounts, property","section":"Assets"}]'::jsonb;
  END IF;

  -- SECTION 5: PROPERTY
  v_score_property := CASE
    WHEN v_app.loan_amount IS NOT NULL AND v_app.property_address IS NOT NULL AND v_app.property_value IS NOT NULL AND v_app.property_type IS NOT NULL THEN 100
    WHEN v_app.loan_amount IS NOT NULL AND v_app.property_address IS NOT NULL THEN 70
    WHEN v_app.loan_amount IS NOT NULL THEN 40
    ELSE 0
  END;

  IF v_app.loan_amount IS NULL THEN
    v_critical := v_critical || '[{"code":"NO_LOAN_AMOUNT","message":"Loan amount not entered","section":"Property"}]'::jsonb;
  END IF;
  IF v_app.property_value IS NULL THEN
    v_high := v_high || '[{"code":"NO_PROPERTY_VALUE","message":"Property value not set — required for LVR calculation","section":"Property"}]'::jsonb;
  END IF;

  -- SECTION 6: COMPLIANCE
  SELECT
    COALESCE(disclosure_statement_provided, false),
    COALESCE(needs_objectives_completed, false)
  INTO v_has_disclosure, v_has_needs
  FROM public.compliance_checklists WHERE application_id = p_application_id LIMIT 1;

  SELECT EXISTS(SELECT 1 FROM public.credit_checks WHERE application_id = p_application_id) INTO v_has_credit_check;

  v_score_compliance := (
    CASE WHEN COALESCE(v_has_disclosure, false) THEN 35 ELSE 0 END +
    CASE WHEN COALESCE(v_has_needs, false) THEN 35 ELSE 0 END +
    CASE WHEN COALESCE(v_has_credit_check, false) THEN 30 ELSE 0 END
  );

  IF NOT COALESCE(v_has_disclosure, false) THEN
    v_critical := v_critical || '[{"code":"NO_DISCLOSURE","message":"Disclosure statement not provided — FMC Act requirement","section":"Compliance"}]'::jsonb;
  END IF;
  IF NOT COALESCE(v_has_needs, false) THEN
    v_high := v_high || '[{"code":"NO_NEEDS_OBJECTIVES","message":"Needs & Objectives not completed — required before submission","section":"Compliance"}]'::jsonb;
  END IF;
  IF NOT COALESCE(v_has_credit_check, false) THEN
    v_high := v_high || '[{"code":"NO_CREDIT_CHECK","message":"No credit check recorded — CCCFA requires credit assessment","section":"Compliance"}]'::jsonb;
  END IF;

  -- SECTION 7: DOCUMENTS
  SELECT COUNT(*) INTO v_doc_count FROM public.documents WHERE application_id = p_application_id;

  v_score_documents := CASE
    WHEN v_doc_count >= 5 THEN 100
    WHEN v_doc_count >= 3 THEN 75
    WHEN v_doc_count >= 1 THEN 40
    ELSE 0
  END;

  IF v_doc_count = 0 THEN
    v_high := v_high || '[{"code":"NO_DOCUMENTS","message":"No documents uploaded — lenders require document evidence","section":"Documents"}]'::jsonb;
  ELSIF v_doc_count < 3 THEN
    v_medium := v_medium || '[{"code":"FEW_DOCUMENTS","message":"Only few documents uploaded — most applications need 5+","section":"Documents"}]'::jsonb;
  END IF;

  -- WEIGHTED TOTAL (weights: identity=15, income=20, expenses=15, assets=10, property=15, compliance=15, documents=10)
  v_total_score := (
    (v_score_identity * 15) +
    (v_score_income * 20) +
    (v_score_expenses * 15) +
    (v_score_assets * 10) +
    (v_score_property * 15) +
    (v_score_compliance * 15) +
    (v_score_documents * 10)
  ) / 100;

  v_grade := CASE
    WHEN v_total_score >= 90 THEN 'A'
    WHEN v_total_score >= 75 THEN 'B'
    WHEN v_total_score >= 60 THEN 'C'
    WHEN v_total_score >= 40 THEN 'D'
    ELSE 'F'
  END;

  v_ready := v_total_score >= 75 AND jsonb_array_length(v_critical) = 0;

  INSERT INTO public.application_readiness_scores (
    application_id, firm_id,
    total_score, score_grade, is_ready_to_submit,
    score_identity_kyc, score_income_verification, score_expense_verification,
    score_assets_liabilities, score_property_details, score_compliance, score_documents,
    issues_critical, issues_high, issues_medium,
    critical_count, high_count, medium_count,
    scored_by, scored_at
  )
  VALUES (
    p_application_id, v_firm_id,
    v_total_score, v_grade, v_ready,
    v_score_identity, v_score_income, v_score_expenses,
    v_score_assets, v_score_property, v_score_compliance, v_score_documents,
    v_critical, v_high, v_medium,
    jsonb_array_length(v_critical), jsonb_array_length(v_high), jsonb_array_length(v_medium),
    'system', now()
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$function$;

-- ----------------------------------------------------------
-- calculate_retention_score
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_retention_score(p_settled_loan_id uuid, p_market_best_rate numeric DEFAULT 6.5)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_loan record;
  v_last_contact date;
  v_last_review date;
  v_days_contact integer;
  v_days_expiry integer;
  v_loan_age_months integer;
  v_equity_pct numeric;
  v_rate_diff_bps integer;

  -- Score components
  v_rate_score integer := 0;
  v_contact_score integer := 0;
  v_expiry_score integer := 0;
  v_equity_score integer := 0;
  v_engagement_score integer := 0;

  -- Final
  v_total_score integer;
  v_risk_level text;
  v_churn_prob numeric;
  v_action text;
  v_action_date date;
  v_result_id uuid;
BEGIN
  SELECT sl.*, c.first_name, c.last_name
  INTO v_loan
  FROM public.settled_loans sl
  JOIN public.clients c ON sl.client_id = c.id
  WHERE sl.id = p_settled_loan_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- === COMPONENT 1: Rate Competitiveness (40% weight) ===
  IF v_loan.current_interest_rate IS NOT NULL THEN
    v_rate_diff_bps := ROUND((v_loan.current_interest_rate - p_market_best_rate) * 100)::integer;
    v_rate_score := LEAST(100, GREATEST(0,
      CASE
        WHEN v_rate_diff_bps <= 0 THEN 0        -- At or below market: 0 risk
        WHEN v_rate_diff_bps <= 25 THEN 10      -- 0.25% above: low risk
        WHEN v_rate_diff_bps <= 50 THEN 25      -- 0.5% above: moderate
        WHEN v_rate_diff_bps <= 100 THEN 50     -- 1% above: significant
        WHEN v_rate_diff_bps <= 150 THEN 75     -- 1.5% above: high risk
        ELSE 100                                 -- 2%+ above: critical
      END
    ));
  ELSE
    v_rate_score := 30; -- Unknown rate: moderate risk
  END IF;

  -- === COMPONENT 2: Contact Recency (25% weight) ===
  SELECT MAX(review_date) INTO v_last_review
  FROM public.client_reviews
  WHERE client_id = v_loan.client_id AND status = 'completed';

  v_days_contact := COALESCE(
    (CURRENT_DATE - v_last_review)::integer,
    (CURRENT_DATE - v_loan.settlement_date::date)::integer,
    365
  );

  v_contact_score := LEAST(100, GREATEST(0,
    CASE
      WHEN v_days_contact <= 90 THEN 0         -- Contacted within 3 months: no risk
      WHEN v_days_contact <= 180 THEN 15       -- 6 months: low risk
      WHEN v_days_contact <= 365 THEN 40       -- 1 year: moderate
      WHEN v_days_contact <= 540 THEN 65       -- 18 months: high
      WHEN v_days_contact <= 730 THEN 85       -- 2 years: very high
      ELSE 100                                  -- 2+ years: critical
    END
  ));

  -- === COMPONENT 3: Rate Expiry Urgency (20% weight) ===
  IF v_loan.current_rate_type = 'fixed' AND v_loan.current_rate_expiry_date IS NOT NULL THEN
    v_days_expiry := (v_loan.current_rate_expiry_date - CURRENT_DATE)::integer;
    v_expiry_score := LEAST(100, GREATEST(0,
      CASE
        WHEN v_days_expiry < 0 THEN 100         -- Already expired!
        WHEN v_days_expiry <= 30 THEN 90        -- Expiring this month: critical
        WHEN v_days_expiry <= 60 THEN 75        -- 2 months: urgent
        WHEN v_days_expiry <= 90 THEN 55        -- 3 months: high
        WHEN v_days_expiry <= 180 THEN 35       -- 6 months: moderate
        WHEN v_days_expiry <= 365 THEN 15       -- 1 year: low
        ELSE 5                                   -- Just refixed: minimal
      END
    ));
  ELSE
    v_expiry_score := 20; -- Floating or unknown: some risk
  END IF;

  -- === COMPONENT 4: Equity & Refinancing Options (10% weight) ===
  v_loan_age_months := EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_loan.settlement_date))::integer
    + EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_loan.settlement_date))::integer * 12;

  -- Approximate equity: loan balance reduces over time (simplified linear)
  IF v_loan.loan_amount > 0 AND v_loan.loan_term_years > 0 THEN
    DECLARE
      principal_paid numeric;
    BEGIN
      -- Simplified: assume P&I repayments reduce balance linearly for estimate
      principal_paid := (v_loan.loan_amount / (v_loan.loan_term_years * 12)) * v_loan_age_months;
      v_equity_pct := LEAST(100, GREATEST(0,
        ((principal_paid / v_loan.loan_amount) * 100) +
        COALESCE(((v_loan.property_value - v_loan.loan_amount) / NULLIF(v_loan.property_value, 0)) * 100, 20)
      ));
    END;
  ELSE
    v_equity_pct := 20;
  END IF;

  -- Higher equity = more refinancing options = higher churn risk
  v_equity_score := LEAST(100, GREATEST(0, v_equity_pct::integer));

  -- === COMPONENT 5: Client Engagement (5% weight) ===
  DECLARE
    v_total_reviews integer;
    v_completed_reviews integer;
  BEGIN
    SELECT COUNT(*), COUNT(CASE WHEN status = 'completed' THEN 1 END)
    INTO v_total_reviews, v_completed_reviews
    FROM public.client_reviews WHERE client_id = v_loan.client_id;

    v_engagement_score := CASE
      WHEN v_total_reviews = 0 THEN 50          -- Never reviewed: moderate disengagement
      WHEN v_completed_reviews::numeric / NULLIF(v_total_reviews, 0) >= 0.8 THEN 10   -- Engaged
      WHEN v_completed_reviews::numeric / NULLIF(v_total_reviews, 0) >= 0.5 THEN 30
      ELSE 60                                    -- Low completion = disengaged
    END;
  END;

  -- === WEIGHTED FINAL SCORE ===
  v_total_score := LEAST(100, GREATEST(0, (
    (v_rate_score * 40) +
    (v_contact_score * 25) +
    (v_expiry_score * 20) +
    (v_equity_score * 10) +
    (v_engagement_score * 5)
  ) / 100));

  -- Risk level and churn probability
  v_risk_level := CASE
    WHEN v_total_score < 30 THEN 'low'
    WHEN v_total_score < 55 THEN 'medium'
    WHEN v_total_score < 75 THEN 'high'
    ELSE 'critical'
  END;

  v_churn_prob := ROUND((v_total_score::numeric / 100) * 0.85, 2); -- Max 85% probability

  -- Recommended action
  v_action := CASE
    WHEN v_total_score < 30 THEN 'monitor'
    WHEN v_total_score < 50 THEN 'schedule_review'
    WHEN v_total_score < 70 THEN 'contact_urgently'
    WHEN v_total_score < 85 THEN 'reprice_now'
    ELSE 'refinance_alert'
  END;

  v_action_date := CASE
    WHEN v_total_score >= 85 THEN CURRENT_DATE + 3        -- Act within 3 days
    WHEN v_total_score >= 70 THEN CURRENT_DATE + 7        -- Act within 1 week
    WHEN v_total_score >= 50 THEN CURRENT_DATE + 14       -- Act within 2 weeks
    WHEN v_total_score >= 30 THEN CURRENT_DATE + 30       -- Act within 1 month
    ELSE CURRENT_DATE + 90                                 -- Act within 3 months
  END;

  -- Insert score
  INSERT INTO public.retention_scores (
    settled_loan_id, client_id, firm_id,
    rate_differential_bps, rate_competitiveness_score,
    days_since_contact, contact_recency_score,
    days_until_rate_expiry, rate_expiry_urgency_score,
    loan_age_months, equity_percent, equity_score,
    engagement_score,
    retention_score, risk_level, predicted_churn_probability,
    recommended_action, action_due_by
  )
  VALUES (
    p_settled_loan_id, v_loan.client_id, v_loan.firm_id,
    v_rate_diff_bps, v_rate_score,
    v_days_contact, v_contact_score,
    v_days_expiry, v_expiry_score,
    v_loan_age_months, v_equity_pct, v_equity_score,
    v_engagement_score,
    v_total_score, v_risk_level, v_churn_prob,
    v_action, v_action_date
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$function$;

-- ----------------------------------------------------------
-- calculate_serviceability
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_serviceability(p_application_id uuid, p_loan_amount numeric DEFAULT NULL::numeric, p_stress_rate numeric DEFAULT 8.5)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app record;
  v_income record;
  v_expenses record;
  v_liabilities record;
  v_applicants_count integer;
  v_dependants_count integer;

  -- Calculated values
  v_gross_income numeric := 0;
  v_net_income numeric := 0;
  v_rental_income numeric := 0;
  v_total_income numeric := 0;
  v_existing_debt_monthly numeric := 0;
  v_credit_card_limits numeric := 0;
  v_declared_expenses numeric := 0;
  v_hem_benchmark numeric := 0;
  v_expenses_used numeric := 0;
  v_loan_amount numeric := 0;
  v_property_value numeric := 0;
  v_loan_term integer := 30;
  v_net_monthly numeric := 0;
  v_stress_repayment numeric := 0;
  v_total_debt numeric := 0;
  v_umi numeric := 0;
  v_dti numeric := 0;
  v_lvr numeric := 0;
  v_max_loan numeric := 0;
  v_passes boolean := false;
  v_result_id uuid;
  v_firm_id uuid;
BEGIN
  -- Get application details
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  v_firm_id := v_app.firm_id;
  v_loan_amount := COALESCE(p_loan_amount, v_app.loan_amount, 0);
  v_property_value := COALESCE(v_app.property_value, 0);
  v_loan_term := COALESCE(v_app.loan_term_years, 30);

  -- Count applicants and dependants
  SELECT COUNT(*) INTO v_applicants_count
  FROM public.applicants WHERE application_id = p_application_id;

  SELECT COALESCE(SUM(number_of_dependants), 0) INTO v_dependants_count
  FROM public.applicants WHERE application_id = p_application_id;

  -- === INCOME AGGREGATION ===
  -- Sum gross salary income across all applicants
  SELECT
    COALESCE(SUM(CASE
      WHEN income_type = 'salary' THEN
        CASE salary_frequency
          WHEN 'weekly' THEN gross_salary * 52
          WHEN 'fortnightly' THEN gross_salary * 26
          WHEN 'monthly' THEN gross_salary * 12
          ELSE gross_salary
        END
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE
      WHEN income_type = 'rental' THEN
        COALESCE(rental_gross_monthly, 0) * 12 * 0.75  -- 75% of rental income (standard NZ)
      ELSE 0
    END), 0),
    COALESCE(SUM(COALESCE(annual_gross_total, 0)), 0)
  INTO v_gross_income, v_rental_income, v_total_income
  FROM public.income i
  JOIN public.applicants a ON i.applicant_id = a.id
  WHERE a.application_id = p_application_id;

  -- Use total_income if available, otherwise gross_income + rental
  IF v_total_income > 0 THEN
    v_gross_income := v_total_income;
  ELSE
    v_gross_income := v_gross_income + v_rental_income;
  END IF;

  -- Estimate net income (NZ tax: roughly 72-78% of gross for typical incomes)
  -- Simplified NZ tax calculation
  v_net_income := CASE
    WHEN v_gross_income <= 14000 THEN v_gross_income * 0.895   -- 10.5% tax
    WHEN v_gross_income <= 48000 THEN v_gross_income * 0.825   -- 17.5% tax avg
    WHEN v_gross_income <= 70000 THEN v_gross_income * 0.785   -- 30% marginal
    WHEN v_gross_income <= 180000 THEN v_gross_income * 0.745  -- 33% marginal
    ELSE v_gross_income * 0.705                                 -- 39% top rate
  END;

  v_net_monthly := v_net_income / 12;

  -- === EXISTING DEBT AGGREGATION ===
  -- Credit cards: NZ standard is 3% of limit per month
  SELECT COALESCE(SUM(CASE
    WHEN liability_type = 'credit_card' THEN COALESCE(card_limit, current_balance, 0) * 0.03
    WHEN liability_type IN ('mortgage', 'personal_loan') THEN
      CASE repayment_frequency
        WHEN 'weekly' THEN COALESCE(repayment_amount, 0) * 52 / 12
        WHEN 'fortnightly' THEN COALESCE(repayment_amount, 0) * 26 / 12
        ELSE COALESCE(repayment_amount, 0)
      END
    ELSE COALESCE(monthly_repayment, repayment_amount, 0)
  END), 0)
  INTO v_existing_debt_monthly
  FROM public.liabilities
  WHERE application_id = p_application_id
    AND NOT COALESCE(to_be_paid_out, false)
    AND NOT COALESCE(to_be_refinanced, false);

  -- === EXPENSES ===
  SELECT COALESCE(SUM(total_monthly), 0) INTO v_declared_expenses
  FROM public.expenses WHERE application_id = p_application_id;

  -- HEM (Household Expenditure Measure) - NZ approximation
  -- Based on household size and income band
  v_hem_benchmark := CASE
    WHEN v_applicants_count = 1 AND v_dependants_count = 0 THEN
      CASE WHEN v_gross_income > 100000 THEN 3200 ELSE 2400 END
    WHEN v_applicants_count = 2 AND v_dependants_count = 0 THEN
      CASE WHEN v_gross_income > 150000 THEN 4800 ELSE 3600 END
    WHEN v_dependants_count = 1 THEN
      CASE WHEN v_gross_income > 120000 THEN 5500 ELSE 4200 END
    WHEN v_dependants_count = 2 THEN
      CASE WHEN v_gross_income > 140000 THEN 6200 ELSE 4900 END
    WHEN v_dependants_count >= 3 THEN
      CASE WHEN v_gross_income > 160000 THEN 7200 ELSE 5800 END
    ELSE 3000
  END;

  -- Use higher of declared or HEM (CCCFA requirement)
  v_expenses_used := GREATEST(v_declared_expenses, v_hem_benchmark);

  -- === STRESS TEST REPAYMENT ===
  -- P&I repayment formula: PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
  -- Where r = monthly rate, n = number of payments
  IF v_loan_amount > 0 THEN
    DECLARE
      r numeric := p_stress_rate / 100 / 12;
      n integer := v_loan_term * 12;
    BEGIN
      IF r > 0 THEN
        v_stress_repayment := v_loan_amount * (r * POWER(1+r, n)) / (POWER(1+r, n) - 1);
      ELSE
        v_stress_repayment := v_loan_amount / n;
      END IF;
    END;
  END IF;

  -- === KEY METRICS ===
  v_total_debt := v_existing_debt_monthly + v_stress_repayment;
  v_umi := v_net_monthly - v_expenses_used - v_total_debt;
  v_dti := CASE WHEN v_gross_income > 0 THEN v_loan_amount / v_gross_income ELSE 0 END;
  v_lvr := CASE WHEN v_property_value > 0 THEN (v_loan_amount / v_property_value) * 100 ELSE 0 END;

  -- Max loan at stress rate with $0 UMI
  IF v_stress_repayment > 0 AND v_loan_amount > 0 THEN
    DECLARE
      available_for_repayment numeric;
      r numeric := p_stress_rate / 100 / 12;
      n integer := v_loan_term * 12;
    BEGIN
      available_for_repayment := v_net_monthly - v_expenses_used - v_existing_debt_monthly;
      IF available_for_repayment > 0 AND r > 0 THEN
        v_max_loan := available_for_repayment * (POWER(1+r, n) - 1) / (r * POWER(1+r, n));
      END IF;
    END;
  END IF;

  -- Serviceability passes if UMI > 0
  v_passes := v_umi > 0 AND v_dti <= 6.0;

  -- Insert result
  INSERT INTO public.serviceability_assessments (
    application_id, firm_id,
    gross_annual_income, net_annual_income, rental_income_annual, total_gross_income,
    existing_mortgage_repayments_monthly, total_existing_debt_monthly,
    declared_expenses_monthly, hem_benchmark_monthly, expenses_used_monthly,
    new_loan_amount, new_loan_term_years, stress_test_rate,
    new_loan_repayment_stress_monthly, total_debt_commitments_monthly,
    net_monthly_income, umi_monthly, dti_ratio, dti_limit, dti_compliant,
    lvr_percent, lvr_limit, lvr_requires_lmi,
    passes_serviceability, serviceability_surplus_monthly, max_loan_amount_stress,
    -- Lender approximations (simplified — each lender has slightly different policies)
    passes_anz, passes_asb, passes_bnz, passes_westpac, passes_kiwibank,
    flag_high_dti, flag_low_umi, flag_high_lvr
  )
  VALUES (
    p_application_id, v_firm_id,
    v_gross_income, v_net_income, v_rental_income, v_gross_income,
    0, v_existing_debt_monthly,
    v_declared_expenses, v_hem_benchmark, v_expenses_used,
    v_loan_amount, v_loan_term, p_stress_rate,
    v_stress_repayment, v_total_debt,
    v_net_monthly, v_umi, v_dti, 6.0, v_dti <= 6.0,
    v_lvr, 80.0, v_lvr > 80,
    v_passes, GREATEST(v_umi, 0), v_max_loan,
    -- Lenders have similar but slightly different criteria
    v_passes AND v_dti <= 6.0,   -- ANZ
    v_passes AND v_dti <= 6.0,   -- ASB
    v_passes AND v_dti <= 5.5,   -- BNZ (slightly stricter)
    v_passes AND v_dti <= 6.0,   -- Westpac
    v_passes AND v_dti <= 6.0,   -- Kiwibank
    v_dti > 5.0, v_umi < 500, v_lvr > 80
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$function$;

-- ----------------------------------------------------------
-- detect_anomalies
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_anomalies(p_application_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app record;
  v_flags_created integer := 0;

  -- Income
  v_gross_annual_income numeric := 0;
  v_monthly_income numeric := 0;
  v_income_count integer := 0;

  -- Expenses
  v_total_expenses_monthly numeric := 0;
  v_lowest_expenses_monthly numeric := 0;
  v_highest_expenses_monthly numeric := 0;
  v_expense_row_count integer := 0;

  -- Liabilities
  v_total_card_limits numeric := 0;
  v_total_monthly_debt numeric := 0;
  v_undeclared_mortgage_risk boolean := false;

  -- Derived ratios
  v_expense_to_income_ratio numeric := 0;
  v_dti_ratio numeric := 0;
  v_lvr numeric := 0;
  v_umi_monthly numeric := 0;
  v_stress_repayment numeric := 0;

  -- Applicant details
  v_applicant_count integer := 0;
  v_dependant_count integer := 0;
  v_self_employed_count integer := 0;

  -- Compliance
  v_credit_check_age_days integer := 0;
  v_has_credit_check boolean := false;

BEGIN
  -- Load application
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Clear existing open flags for this application before re-running
  DELETE FROM public.anomaly_flags
  WHERE application_id = p_application_id AND status = 'open';

  -- ================================================================
  -- GATHER ALL DATA
  -- ================================================================

  -- Applicants
  SELECT COUNT(*) INTO v_applicant_count FROM public.applicants WHERE application_id = p_application_id;

  SELECT COALESCE(SUM(COALESCE(number_of_dependants, 0)), 0) INTO v_dependant_count
  FROM public.applicants WHERE application_id = p_application_id;

  -- Income: aggregate all sources across all applicants
  SELECT
    COUNT(*),
    COALESCE(SUM(
      CASE
        WHEN salary_frequency IN ('Annually', 'annual', 'yearly') THEN COALESCE(annual_gross_total, gross_salary, 0)
        WHEN salary_frequency IN ('Monthly', 'monthly') THEN COALESCE(gross_salary, 0) * 12
        WHEN salary_frequency IN ('Fortnightly', 'fortnightly') THEN COALESCE(gross_salary, 0) * 26
        WHEN salary_frequency IN ('Weekly', 'weekly') THEN COALESCE(gross_salary, 0) * 52
        ELSE COALESCE(annual_gross_total, 0)
      END
    ), 0)
  INTO v_income_count, v_gross_annual_income
  FROM public.income i
  JOIN public.applicants a ON i.applicant_id = a.id
  WHERE a.application_id = p_application_id;

  -- Self-employed count
  SELECT COUNT(*) INTO v_self_employed_count
  FROM public.income i
  JOIN public.applicants a ON i.applicant_id = a.id
  WHERE a.application_id = p_application_id
    AND i.income_type IN ('self_employed', 'business', 'Self Employed', 'Business');

  v_monthly_income := v_gross_annual_income / 12;

  -- Expenses: sum ALL expense rows for this application
  SELECT
    COUNT(*),
    COALESCE(SUM(total_monthly), 0),
    COALESCE(MIN(total_monthly), 0),
    COALESCE(MAX(total_monthly), 0)
  INTO v_expense_row_count, v_total_expenses_monthly, v_lowest_expenses_monthly, v_highest_expenses_monthly
  FROM public.expenses WHERE application_id = p_application_id;

  -- Liabilities
  SELECT
    COALESCE(SUM(CASE WHEN liability_type = 'credit_card' THEN COALESCE(card_limit, current_balance, 0) ELSE 0 END), 0),
    COALESCE(SUM(
      CASE
        WHEN liability_type = 'credit_card' THEN COALESCE(card_limit, current_balance, 0) * 0.03
        WHEN repayment_frequency IN ('Weekly', 'weekly') THEN COALESCE(repayment_amount, monthly_repayment, 0) * 52 / 12
        WHEN repayment_frequency IN ('Fortnightly', 'fortnightly') THEN COALESCE(repayment_amount, monthly_repayment, 0) * 26 / 12
        ELSE COALESCE(monthly_repayment, repayment_amount, 0)
      END
    ), 0)
  INTO v_total_card_limits, v_total_monthly_debt
  FROM public.liabilities
  WHERE application_id = p_application_id;

  -- Stress test repayment (8.5% stress rate, 30 year P&I)
  IF v_app.loan_amount > 0 THEN
    DECLARE
      r numeric := 8.5 / 100 / 12;
      n integer := COALESCE(v_app.loan_term_years, 30) * 12;
    BEGIN
      v_stress_repayment := v_app.loan_amount * (r * POWER(1+r, n)) / (POWER(1+r, n) - 1);
    END;
  END IF;

  -- Key ratios
  IF v_monthly_income > 0 THEN
    v_expense_to_income_ratio := v_total_expenses_monthly / v_monthly_income;
    v_umi_monthly := v_monthly_income - v_total_expenses_monthly - v_total_monthly_debt - v_stress_repayment;
  END IF;

  IF v_gross_annual_income > 0 AND v_app.loan_amount > 0 THEN
    v_dti_ratio := v_app.loan_amount / v_gross_annual_income;
  END IF;

  IF v_app.property_value > 0 AND v_app.loan_amount > 0 THEN
    v_lvr := (v_app.loan_amount / v_app.property_value) * 100;
  END IF;

  -- Credit check age
  SELECT
    EXISTS(SELECT 1 FROM public.credit_checks WHERE application_id = p_application_id),
    COALESCE((CURRENT_DATE - MAX(checked_at))::integer, 999)
  INTO v_has_credit_check, v_credit_check_age_days
  FROM public.credit_checks WHERE application_id = p_application_id;

  -- ================================================================
  -- CHECK 1: EXPENSES EXCEED INCOME (CRITICAL)
  -- This is the most important check — catches what you found
  -- ================================================================
  IF v_monthly_income > 0 AND v_total_expenses_monthly > v_monthly_income THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, expected_value, actual_value, variance_amount, variance_percent)
    VALUES (
      p_application_id, v_app.firm_id, 'EXPENSES_EXCEED_INCOME', 'expense_anomaly', 'critical',
      'Monthly expenses exceed total income',
      'Declared expenses of $' || ROUND(v_total_expenses_monthly) || '/month exceed gross monthly income of $' || ROUND(v_monthly_income) || '/month. This application cannot pass serviceability at any lender. Review and correct expense data.',
      '$' || ROUND(v_monthly_income) || '/month maximum',
      '$' || ROUND(v_total_expenses_monthly) || '/month',
      v_total_expenses_monthly - v_monthly_income,
      ROUND((v_total_expenses_monthly / v_monthly_income - 1) * 100)
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 2: NEGATIVE UMI — CANNOT SERVICE THE LOAN (CRITICAL)
  -- ================================================================
  IF v_monthly_income > 0 AND v_umi_monthly < 0 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, expected_value, actual_value, variance_amount)
    VALUES (
      p_application_id, v_app.firm_id, 'NEGATIVE_UMI', 'cccfa_risk', 'critical',
      'Loan fails serviceability — negative uncommitted income',
      'After expenses ($' || ROUND(v_total_expenses_monthly) || '/mth), existing debt ($' || ROUND(v_total_monthly_debt) || '/mth), and new loan repayment at stress rate ($' || ROUND(v_stress_repayment) || '/mth), the client has $' || ROUND(v_umi_monthly) || '/month uncommitted income. All NZ lenders require a positive UMI.',
      'UMI > $0/month',
      'UMI = $' || ROUND(v_umi_monthly) || '/month',
      v_umi_monthly
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 3: HIGH EXPENSE-TO-INCOME RATIO (HIGH)
  -- NZ lenders want expenses below 70% of net income
  -- ================================================================
  IF v_expense_to_income_ratio > 0.70 AND v_monthly_income > 0 AND NOT (v_total_expenses_monthly > v_monthly_income) THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, expected_value, actual_value)
    VALUES (
      p_application_id, v_app.firm_id, 'HIGH_EXPENSE_RATIO', 'expense_anomaly', 'high',
      'Expense-to-income ratio is very high',
      'Declared expenses consume ' || ROUND(v_expense_to_income_ratio * 100) || '% of gross monthly income. Most NZ lenders flag applications where expenses exceed 70% of income. The bank will use the higher of declared expenses or HEM benchmark.',
      'Under 70% of income',
      ROUND(v_expense_to_income_ratio * 100) || '% of income'
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 4: DTI EXCEEDS RBNZ LIMIT (CRITICAL)
  -- ================================================================
  IF v_dti_ratio > 6.0 AND v_app.loan_amount > 0 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, expected_value, actual_value)
    VALUES (
      p_application_id, v_app.firm_id, 'DTI_EXCEEDS_RBNZ_LIMIT', 'cccfa_risk', 'critical',
      'DTI ratio exceeds RBNZ owner-occupier limit of 6x',
      'Loan of $' || ROUND(v_app.loan_amount) || ' against income of $' || ROUND(v_gross_annual_income) || '/year gives a DTI of ' || ROUND(v_dti_ratio, 1) || 'x. RBNZ limits owner-occupier lending above 6x DTI to 20% of new lending — most banks will decline.',
      'DTI ≤ 6.0x',
      'DTI = ' || ROUND(v_dti_ratio, 1) || 'x'
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 5: SUSPICIOUSLY LOW EXPENSES (HIGH)
  -- Flag if expenses are below HEM benchmark for household size
  -- ================================================================
  DECLARE
    v_hem_benchmark numeric;
  BEGIN
    v_hem_benchmark := CASE
      WHEN v_applicant_count = 1 AND v_dependant_count = 0 THEN 2200
      WHEN v_applicant_count >= 2 AND v_dependant_count = 0 THEN 3400
      WHEN v_dependant_count = 1 THEN 4000
      WHEN v_dependant_count = 2 THEN 4800
      WHEN v_dependant_count >= 3 THEN 5600
      ELSE 2500
    END;

    IF v_total_expenses_monthly > 0 AND v_total_expenses_monthly < (v_hem_benchmark * 0.5) THEN
      INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, expected_value, actual_value)
      VALUES (
        p_application_id, v_app.firm_id, 'EXPENSES_BELOW_HEM', 'expense_anomaly', 'high',
        'Declared expenses appear unrealistically low',
        'Declared expenses of $' || ROUND(v_total_expenses_monthly) || '/month are significantly below the NZ Household Expenditure Measure (HEM) of ~$' || ROUND(v_hem_benchmark) || '/month for this household size. Lenders will use the HEM figure instead, which may change serviceability.',
        '~$' || ROUND(v_hem_benchmark) || '/month (HEM)',
        '$' || ROUND(v_total_expenses_monthly) || '/month declared'
      );
      v_flags_created := v_flags_created + 1;
    END IF;
  END;

  -- ================================================================
  -- CHECK 6: HIGH LVR (HIGH)
  -- ================================================================
  IF v_lvr > 80 AND v_lvr <= 90 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, actual_value)
    VALUES (
      p_application_id, v_app.firm_id, 'HIGH_LVR_80_90', 'cccfa_risk', 'high',
      'LVR between 80-90% — low equity margin may apply',
      'LVR of ' || ROUND(v_lvr, 1) || '% is above 80%. Most NZ banks charge a Low Equity Margin (LEM) of 0.25-1.5% on top of the standard rate. Registered valuation required.',
      ROUND(v_lvr, 1) || '% LVR'
    );
    v_flags_created := v_flags_created + 1;
  ELSIF v_lvr > 90 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, actual_value)
    VALUES (
      p_application_id, v_app.firm_id, 'HIGH_LVR_OVER_90', 'cccfa_risk', 'critical',
      'LVR exceeds 90% — RBNZ high-LVR restriction applies',
      'LVR of ' || ROUND(v_lvr, 1) || '% places this in RBNZ high-LVR restricted territory (above 90%). Banks can only do 10% of new lending above 90% LVR. This application will need a strong case and strong income.',
      ROUND(v_lvr, 1) || '% LVR'
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 7: HIGH CREDIT CARD LIMITS vs INCOME (MEDIUM)
  -- NZ lenders treat 3% of limit as monthly commitment
  -- ================================================================
  IF v_total_card_limits > 0 AND v_gross_annual_income > 0 THEN
    DECLARE
      v_card_monthly_commitment numeric := v_total_card_limits * 0.03;
      v_card_income_ratio numeric := v_total_card_limits / v_gross_annual_income;
    BEGIN
      IF v_card_income_ratio > 0.4 THEN
        INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, expected_value, actual_value, variance_amount)
        VALUES (
          p_application_id, v_app.firm_id, 'HIGH_CREDIT_CARD_LIMITS', 'liability_undisclosed', 'medium',
          'Credit card limits are high relative to income',
          'Total credit card limits of $' || ROUND(v_total_card_limits) || ' represent ' || ROUND(v_card_income_ratio * 100) || '% of annual income. NZ lenders treat 3% of limit ($' || ROUND(v_card_monthly_commitment) || '/month) as a monthly debt commitment. Consider reducing limits before submission.',
          'Under 30% of annual income',
          '$' || ROUND(v_total_card_limits) || ' (' || ROUND(v_card_income_ratio * 100) || '% of income)',
          v_total_card_limits - (v_gross_annual_income * 0.3)
        );
        v_flags_created := v_flags_created + 1;
      END IF;
    END;
  END IF;

  -- ================================================================
  -- CHECK 8: INCOME WITHOUT DOCUMENTS (HIGH)
  -- ================================================================
  DECLARE
    v_has_income_docs boolean := false;
  BEGIN
    SELECT EXISTS(SELECT 1 FROM public.documents WHERE application_id = p_application_id AND category = '02 Financial Evidence') INTO v_has_income_docs;
    IF v_income_count > 0 AND NOT v_has_income_docs THEN
      INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description)
      VALUES (
        p_application_id, v_app.firm_id, 'INCOME_WITHOUT_DOCS', 'income_inconsistency', 'high',
        'Income declared but no supporting documents uploaded',
        'Income of $' || ROUND(v_gross_annual_income) || '/year has been entered but no financial evidence documents (payslips, tax returns, bank statements) have been uploaded. All NZ lenders require documented income evidence.'
      );
      v_flags_created := v_flags_created + 1;
    END IF;
  END;

  -- ================================================================
  -- CHECK 9: STALE CREDIT CHECK (MEDIUM)
  -- CCCFA — credit checks older than 90 days should be refreshed
  -- ================================================================
  IF v_has_credit_check AND v_credit_check_age_days > 90 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, expected_value, actual_value)
    VALUES (
      p_application_id, v_app.firm_id, 'STALE_CREDIT_CHECK', 'cccfa_risk', 'medium',
      'Credit check is older than 90 days',
      'The most recent credit check was ' || v_credit_check_age_days || ' days ago. Most NZ lenders require a credit check within the last 90 days. Consider running a fresh credit check before submission.',
      'Within 90 days',
      v_credit_check_age_days || ' days old'
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 10: NO INCOME DATA AT ALL (CRITICAL)
  -- ================================================================
  IF v_income_count = 0 AND v_applicant_count > 0 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description)
    VALUES (
      p_application_id, v_app.firm_id, 'NO_INCOME_ENTERED', 'income_inconsistency', 'critical',
      'No income data entered for any applicant',
      'There are ' || v_applicant_count || ' applicant(s) on this application but no income has been entered. Serviceability cannot be calculated. Complete the Income tab before proceeding.'
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 11: MISSING LOAN AMOUNT (CRITICAL)
  -- ================================================================
  IF v_app.loan_amount IS NULL OR v_app.loan_amount = 0 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description)
    VALUES (
      p_application_id, v_app.firm_id, 'NO_LOAN_AMOUNT', 'income_inconsistency', 'critical',
      'Loan amount not entered',
      'No loan amount has been set for this application. Enter the loan amount on the Overview tab to enable serviceability, LVR, and DTI calculations.'
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 12: SELF-EMPLOYED — EXTRA SCRUTINY (MEDIUM)
  -- ================================================================
  IF v_self_employed_count > 0 THEN
    DECLARE
      v_has_se_docs boolean;
    BEGIN
      SELECT EXISTS(
        SELECT 1 FROM public.documents d
        WHERE d.application_id = p_application_id
          AND d.category = '02 Financial Evidence'
      ) INTO v_has_se_docs;

      IF NOT v_has_se_docs THEN
        INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description)
        VALUES (
          p_application_id, v_app.firm_id, 'SELF_EMPLOYED_NO_FINANCIALS', 'income_inconsistency', 'high',
          'Self-employed applicant — financial statements required',
          'This application includes self-employed income but no financial documents have been uploaded. NZ lenders require 2 years of accountant-prepared financial statements, IR3 tax returns, and business bank statements for self-employed borrowers.'
        );
        v_flags_created := v_flags_created + 1;
      END IF;
    END;
  END IF;

  -- ================================================================
  -- CHECK 13: MULTIPLE EXPENSE ROWS — POSSIBLE DUPLICATION (MEDIUM)
  -- ================================================================
  IF v_expense_row_count > 1 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, actual_value)
    VALUES (
      p_application_id, v_app.firm_id, 'MULTIPLE_EXPENSE_RECORDS', 'expense_anomaly', 'medium',
      'Multiple expense records found — possible duplication',
      'There are ' || v_expense_row_count || ' separate expense records totalling $' || ROUND(v_total_expenses_monthly) || '/month. This may indicate duplicate entries. Review and ensure only one complete expense record exists per household.',
      v_expense_row_count || ' records, $' || ROUND(v_total_expenses_monthly) || '/month total'
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  -- ================================================================
  -- CHECK 14: INSUFFICIENT UMI BUFFER (HIGH)
  -- Low positive UMI — technically passes but very thin margin
  -- ================================================================
  IF v_monthly_income > 0 AND v_umi_monthly >= 0 AND v_umi_monthly < 500 AND v_stress_repayment > 0 THEN
    INSERT INTO public.anomaly_flags (application_id, firm_id, flag_code, flag_category, severity, title, description, actual_value)
    VALUES (
      p_application_id, v_app.firm_id, 'LOW_UMI_BUFFER', 'cccfa_risk', 'high',
      'Uncommitted monthly income is very thin',
      'After all commitments, the client has only $' || ROUND(v_umi_monthly) || '/month uncommitted income at the stress test rate of 8.5%. Some lenders require a minimum UMI buffer of $500-$1,000/month. Any increase in expenses or interest rates could fail serviceability.',
      '$' || ROUND(v_umi_monthly) || '/month UMI'
    );
    v_flags_created := v_flags_created + 1;
  END IF;

  RETURN v_flags_created;
END;
$function$;

