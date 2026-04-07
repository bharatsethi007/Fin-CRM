-- ============================================================
-- BASELINE MIGRATION: HELPERS FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 16
-- ============================================================

-- ----------------------------------------------------------
-- check_all_conditions_cleared
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_all_conditions_cleared()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_outstanding_count integer;
  v_application_id uuid;
  v_firm_id uuid;
BEGIN
  v_application_id := NEW.application_id;

  SELECT COUNT(*) INTO v_outstanding_count
  FROM public.application_conditions
  WHERE application_id = v_application_id
    AND status = 'outstanding';

  IF v_outstanding_count = 0 THEN
    SELECT firm_id INTO v_firm_id
    FROM public.applications
    WHERE id = v_application_id;

    INSERT INTO public.notifications (
      firm_id,
      type,
      title,
      message,
      metadata
    ) VALUES (
      v_firm_id,
      'all_conditions_cleared',
      'All Conditions Cleared ✓',
      'All lender conditions for application ' || v_application_id::text || ' have been met. Ready to go unconditional.',
      jsonb_build_object('application_id', v_application_id)
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- cleanup_old_fi_conversations
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_fi_conversations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Delete messages from conversations older than 30 days
  DELETE FROM fi_messages 
  WHERE conversation_id IN (
    SELECT id FROM fi_conversations 
    WHERE last_message_at < NOW() - INTERVAL '30 days'
  );
  
  -- Delete the old conversations
  DELETE FROM fi_conversations 
  WHERE last_message_at < NOW() - INTERVAL '30 days';
  
  -- Per advisor: keep only latest 100 conversations
  DELETE FROM fi_messages WHERE conversation_id IN (
    SELECT id FROM fi_conversations WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY advisor_id ORDER BY last_message_at DESC) as rn
        FROM fi_conversations
      ) ranked WHERE rn <= 100
    )
  );
  
  DELETE FROM fi_conversations WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY advisor_id ORDER BY last_message_at DESC) as rn
      FROM fi_conversations
    ) ranked WHERE rn <= 100
  );
END;
$function$;

-- ----------------------------------------------------------
-- generate_daily_insights
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_daily_insights()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_loan record;
  v_best_rate numeric;
  v_saving numeric;
  v_dedup_key text;
BEGIN
  -- Rate opportunity — one per settled loan
  FOR v_loan IN
    SELECT sl.id as loan_id, sl.firm_id, sl.client_id, sl.advisor_id,
      sl.lender_name, sl.loan_amount, sl.current_interest_rate,
      sl.current_rate_expiry_date,
      c.first_name || ' ' || c.last_name as client_name,
      (sl.current_rate_expiry_date - CURRENT_DATE) as days_until_expiry
    FROM public.settled_loans sl
    JOIN public.clients c ON c.id = sl.client_id
    WHERE sl.status = 'active' AND sl.current_rate_type = 'fixed'
      AND sl.current_interest_rate > 5.5
  LOOP
    SELECT MIN(rate_percent) INTO v_best_rate
    FROM public.market_rates
    WHERE is_current = true AND owner_occupied = true AND rate_type = 'fixed_2yr';

    IF v_best_rate IS NULL OR v_loan.current_interest_rate <= v_best_rate THEN CONTINUE; END IF;
    v_saving := ROUND((v_loan.current_interest_rate - v_best_rate) / 100 * v_loan.loan_amount / 12, 0);
    IF v_saving < 50 THEN CONTINUE; END IF;

    v_dedup_key := v_loan.firm_id::text || '|rate_opportunity|' || v_loan.client_name;

    INSERT INTO public.ai_insights (
      firm_id, advisor_id, client_id, settled_loan_id,
      insight_type, priority, title, body,
      is_actioned, is_dismissed, dedup_key, ai_generated
    ) VALUES (
      v_loan.firm_id, v_loan.advisor_id, v_loan.client_id, v_loan.loan_id,
      'rate_opportunity',
      CASE WHEN v_loan.days_until_expiry <= 30 THEN 'critical'
           WHEN v_loan.days_until_expiry <= 60 THEN 'high' ELSE 'medium' END,
      'Rate opportunity — ' || v_loan.client_name,
      v_loan.client_name || ' is on ' || v_loan.current_interest_rate ||
        '% with ' || v_loan.lender_name || '. Market best is ' ||
        v_best_rate || '%. Potential saving ~$' || v_saving || '/month.',
      false, false, v_dedup_key, true
    )
    ON CONFLICT (dedup_key) WHERE is_actioned = false AND is_dismissed = false
    DO UPDATE SET body = EXCLUDED.body, priority = EXCLUDED.priority, created_at = now();
  END LOOP;

  -- Refix due — one per loan
  FOR v_loan IN
    SELECT sl.id as loan_id, sl.firm_id, sl.client_id, sl.advisor_id,
      sl.lender_name, sl.current_interest_rate, sl.current_rate_expiry_date,
      c.first_name || ' ' || c.last_name as client_name,
      (sl.current_rate_expiry_date - CURRENT_DATE) as days_until_expiry
    FROM public.settled_loans sl
    JOIN public.clients c ON c.id = sl.client_id
    WHERE sl.status = 'active' AND sl.current_rate_type = 'fixed'
      AND sl.current_rate_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
  LOOP
    v_dedup_key := v_loan.firm_id::text || '|refix_opportunity|' || v_loan.client_name;

    INSERT INTO public.ai_insights (
      firm_id, advisor_id, client_id, settled_loan_id,
      insight_type, priority, title, body,
      is_actioned, is_dismissed, dedup_key, ai_generated
    ) VALUES (
      v_loan.firm_id, v_loan.advisor_id, v_loan.client_id, v_loan.loan_id,
      'refix_opportunity',
      CASE WHEN v_loan.days_until_expiry <= 30 THEN 'critical'
           WHEN v_loan.days_until_expiry <= 60 THEN 'high' ELSE 'medium' END,
      'Rate refix due — ' || v_loan.client_name,
      v_loan.lender_name || ' fixed rate expires in ' || v_loan.days_until_expiry ||
        ' days (' || v_loan.current_rate_expiry_date || '). Current rate: ' ||
        v_loan.current_interest_rate || '%.',
      false, false, v_dedup_key, true
    )
    ON CONFLICT (dedup_key) WHERE is_actioned = false AND is_dismissed = false
    DO UPDATE SET priority = EXCLUDED.priority, body = EXCLUDED.body, created_at = now();
  END LOOP;
END;
$function$;

-- ----------------------------------------------------------
-- generate_reference_number
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_reference_number(p_firm_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ref text;
  v_exists boolean;
  v_attempt integer := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    -- AF-YYYYMMDD-XXXX where XXXX is sequential + attempt offset
    SELECT COUNT(*) + v_attempt INTO v_attempt 
    FROM public.applications 
    WHERE firm_id = p_firm_id;
    
    v_ref := 'AF-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
             LPAD(v_attempt::text, 4, '0');
    
    SELECT EXISTS(
      SELECT 1 FROM public.applications WHERE reference_number = v_ref
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
    v_attempt := v_attempt + 1;
    IF v_attempt > 9999 THEN EXIT; END IF;
  END LOOP;
  
  RETURN v_ref;
END;
$function$;

-- ----------------------------------------------------------
-- get_broker_benchmarks
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_broker_benchmarks(p_advisor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_my_metrics record;
  v_platform_avg jsonb;
  v_my_rank jsonb;
  v_period text;
BEGIN
  v_period := TO_CHAR(date_trunc('month', CURRENT_DATE - interval '1 month'), 'YYYY-MM-DD');

  SELECT * INTO v_my_metrics
  FROM public.broker_performance_metrics
  WHERE advisor_id = p_advisor_id
  ORDER BY created_at DESC LIMIT 1;

  SELECT jsonb_build_object(
    'avg_approval_rate',           ROUND(AVG(approval_rate), 1),
    'avg_days_full_cycle',         ROUND(AVG(avg_days_full_cycle), 0),
    'avg_readiness_at_submission', ROUND(AVG(avg_readiness_at_submission), 0),
    'avg_applications_settled',    ROUND(AVG(applications_settled), 1),
    'avg_ai_acceptance_rate',      ROUND(AVG(ai_acceptance_rate), 1),
    'sample_size',                 COUNT(DISTINCT advisor_id)
  ) INTO v_platform_avg
  FROM public.broker_performance_metrics
  WHERE period_month = v_period;

  SELECT jsonb_build_object(
    'approval_rate_percentile', ROUND(
      100.0 * COUNT(*) FILTER (WHERE approval_rate <= COALESCE(v_my_metrics.approval_rate, 0))
      / NULLIF(COUNT(*), 0), 0),
    'speed_percentile', ROUND(
      100.0 * COUNT(*) FILTER (WHERE avg_days_full_cycle >= COALESCE(v_my_metrics.avg_days_full_cycle, 999))
      / NULLIF(COUNT(*), 0), 0)
  ) INTO v_my_rank
  FROM public.broker_performance_metrics
  WHERE period_month = v_period;

  RETURN jsonb_build_object(
    'my_metrics',   CASE WHEN v_my_metrics IS NULL THEN '{}'::jsonb
                         ELSE row_to_json(v_my_metrics)::jsonb END,
    'platform_avg', COALESCE(v_platform_avg, '{}'::jsonb),
    'my_rank',      COALESCE(v_my_rank, '{}'::jsonb),
    'generated_at', now()
  );
END;
$function$;

-- ----------------------------------------------------------
-- get_lender_win_rates
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lender_win_rates(p_firm_id uuid, p_dti_band text DEFAULT NULL::text, p_lvr_band text DEFAULT NULL::text, p_income_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(stats))
  INTO v_result
  FROM (
    SELECT
      lender_submitted as lender,
      COUNT(*) as total_applications,
      COUNT(CASE WHEN outcome IN ('approved', 'conditional') THEN 1 END) as approvals,
      ROUND(COUNT(CASE WHEN outcome IN ('approved', 'conditional') THEN 1 END)::numeric /
        NULLIF(COUNT(*), 0) * 100, 0) as approval_rate_pct,
      ROUND(AVG(days_to_outcome), 0) as avg_days_to_outcome,
      ROUND(AVG(conditions_count), 1) as avg_conditions
    FROM public.application_outcomes
    WHERE firm_id = p_firm_id
      AND lender_submitted IS NOT NULL
      AND (p_dti_band IS NULL OR
        CASE
          WHEN dti_ratio <= 3 THEN '0-3x'
          WHEN dti_ratio <= 4.5 THEN '3-4.5x'
          WHEN dti_ratio <= 6 THEN '4.5-6x'
          ELSE '6x+'
        END = p_dti_band)
      AND (p_lvr_band IS NULL OR lvr_band = p_lvr_band)
      AND (p_income_type IS NULL OR income_type = p_income_type)
    GROUP BY lender_submitted
    HAVING COUNT(*) >= 3
    ORDER BY approval_rate_pct DESC
  ) stats;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- ----------------------------------------------------------
-- get_my_firm_id
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_firm_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT firm_id FROM public.advisors WHERE id = auth.uid() LIMIT 1;
$function$;

-- ----------------------------------------------------------
-- get_pdf_data
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pdf_data(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_app    record;
  v_firm   record;
  v_adv    record;
  v_client record;
  v_svc    record;
  v_read   record;
  v_comp   record;
  v_income jsonb;
  v_expenses jsonb;
  v_assets jsonb;
  v_liabilities jsonb;
  v_anomalies jsonb;
  v_ai     record;
  v_part1  jsonb;
  v_part2  jsonb;
BEGIN
  SELECT * INTO v_app    FROM public.applications WHERE id = p_application_id;
  SELECT * INTO v_firm   FROM public.firms         WHERE id = v_app.firm_id;
  SELECT * INTO v_adv    FROM public.advisors      WHERE id = v_app.assigned_to;
  SELECT * INTO v_client FROM public.clients       WHERE id = v_app.client_id;

  SELECT * INTO v_svc FROM public.serviceability_assessments
    WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_read FROM public.application_readiness_scores
    WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_comp FROM public.compliance_checklists
    WHERE application_id = p_application_id LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'description', COALESCE(i.other_income_description, i.income_type),
    'income_type', i.income_type,
    'frequency', COALESCE(i.salary_frequency, 'annual'),
    'annual_gross_total', i.annual_gross_total
  ) ORDER BY i.annual_gross_total DESC NULLS LAST)
  INTO v_income
  FROM public.income i
  JOIN public.applicants ap ON i.applicant_id = ap.id
  WHERE ap.application_id = p_application_id;

  SELECT jsonb_build_object(
    'food_groceries', food_groceries, 'dining_takeaway', dining_takeaway,
    'alcohol_tobacco', alcohol_tobacco, 'entertainment', entertainment,
    'streaming_subscriptions', streaming_subscriptions, 'clothing_personal', clothing_personal,
    'phone_internet', phone_internet, 'utilities', utilities,
    'vehicle_running_costs', vehicle_running_costs, 'public_transport', public_transport,
    'health_insurance', health_insurance, 'medical_dental', medical_dental,
    'gym_sports', gym_sports, 'rent_board', rent_board,
    'other_discretionary', other_discretionary, 'total_monthly', total_monthly
  ) INTO v_expenses
  FROM public.expenses WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  SELECT jsonb_build_object(
    'total', COALESCE(SUM(estimated_value), 0),
    'items', jsonb_agg(jsonb_build_object(
      'type', asset_type, 'value', estimated_value,
      'label', COALESCE(property_address, CONCAT_WS(' ', vehicle_make, vehicle_model),
                        investment_description, other_description, bank_name, asset_type)
    ))
  ) INTO v_assets FROM public.assets WHERE application_id = p_application_id;

  SELECT jsonb_build_object(
    'total', COALESCE(SUM(current_balance), 0),
    'items', jsonb_agg(jsonb_build_object(
      'type', liability_type, 'lender', lender, 'balance', current_balance,
      'repayment', COALESCE(monthly_repayment, repayment_amount), 'frequency', repayment_frequency
    ))
  ) INTO v_liabilities FROM public.liabilities WHERE application_id = p_application_id;

  SELECT jsonb_agg(jsonb_build_object('severity', severity, 'title', title, 'description', description))
  INTO v_anomalies FROM public.anomaly_flags
  WHERE application_id = p_application_id AND status = 'open';

  SELECT advice_summary, needs_objectives_draft, compliance_narrative INTO v_ai
  FROM public.application_intelligence WHERE application_id = p_application_id;

  -- Split into two parts to stay under 100-argument limit
  v_part1 := jsonb_build_object(
    'firm_name',           COALESCE(v_firm.name, 'AdvisorFlow'),
    'firm_address',        CONCAT_WS(', ', NULLIF(v_firm.address,''), NULLIF(v_firm.suburb,''), NULLIF(v_firm.city,''), NULLIF(v_firm.postcode,'')),
    'firm_phone',          v_firm.primary_phone,
    'firm_email',          v_firm.primary_email,
    'firm_website',        v_firm.website,
    'firm_logo_url',       v_firm.logo_url,
    'firm_brand_color',    COALESCE(v_firm.brand_color, '#4f46e5'),
    'fap_licence_number',  v_firm.fap_licence_number,
    'fap_name',            v_firm.fap_name,
    'lender_panel',        COALESCE(v_firm.lender_panel, ARRAY['ANZ','ASB','BNZ','Westpac','Kiwibank']),
    'disputes_scheme',     COALESCE(v_firm.complaints_body, 'Financial Services Complaints Limited (FSCL)'),
    'complaints_url',      v_firm.complaints_url,
    'advisor_name',        COALESCE(v_adv.full_name, CONCAT(v_adv.first_name, ' ', v_adv.last_name)),
    'advisor_email',       v_adv.email,
    'advisor_phone',       COALESCE(v_adv.phone, v_adv.mobile),
    'advisor_title',       v_adv.title,
    'advisor_fsp',         v_adv.fsp_number,
    'advisor_fap_auth',    v_adv.fap_authorisation_number,
    'advisor_licence_status', v_adv.licence_status,
    'advisor_licence_expiry', v_adv.licence_expiry::text,
    'client_name',         CONCAT(v_client.first_name, ' ', v_client.last_name),
    'client_email',        v_client.email,
    'client_phone',        v_client.phone,
    'application_type',    v_app.application_type,
    'loan_purpose',        v_app.loan_purpose,
    'loan_amount',         v_app.loan_amount,
    'property_value',      v_app.property_value,
    'property_address',    v_app.property_address,
    'loan_term_years',     v_app.loan_term_years,
    'workflow_stage',      v_app.workflow_stage,
    'doc_date',            TO_CHAR(now(), 'DD Month YYYY')
  );

  v_part2 := jsonb_build_object(
    'income_items',        COALESCE(v_income, '[]'::jsonb),
    'total_income',        (SELECT COALESCE(SUM(annual_gross_total),0) FROM public.income i JOIN public.applicants ap ON i.applicant_id = ap.id WHERE ap.application_id = p_application_id),
    'expense_items',       COALESCE(v_expenses, '{}'::jsonb),
    'total_expenses',      (SELECT COALESCE(total_monthly,0) FROM public.expenses WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1),
    'assets',              COALESCE(v_assets, '{"total":0,"items":[]}'::jsonb),
    'total_assets',        (SELECT COALESCE(SUM(estimated_value),0) FROM public.assets WHERE application_id = p_application_id),
    'liabilities',         COALESCE(v_liabilities, '{"total":0,"items":[]}'::jsonb),
    'total_liabilities',   (SELECT COALESCE(SUM(current_balance),0) FROM public.liabilities WHERE application_id = p_application_id),
    'passes_svc',          v_svc.passes_serviceability,
    'umi_monthly',         v_svc.umi_monthly,
    'dti_ratio',           v_svc.dti_ratio,
    'lvr_percent',         v_svc.lvr_percent,
    'gross_annual_income', v_svc.gross_annual_income,
    'net_monthly_income',  v_svc.net_monthly_income,
    'hem_benchmark',       v_svc.hem_benchmark_monthly,
    'readiness_score',     v_read.total_score,
    'readiness_grade',     v_read.score_grade,
    'compliance',          CASE WHEN v_comp IS NOT NULL THEN row_to_json(v_comp)::jsonb ELSE '{}'::jsonb END,
    'advice_summary_ai',   v_ai.advice_summary,
    'needs_objectives',    v_ai.needs_objectives_draft,
    'compliance_narrative',v_ai.compliance_narrative,
    'anomalies',           COALESCE(v_anomalies, '[]'::jsonb)
  );

  RETURN v_part1 || v_part2;
END;
$function$;

-- ----------------------------------------------------------
-- get_pending_broker_actions
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_broker_actions(p_firm_id uuid)
 RETURNS TABLE(action_id uuid, application_id uuid, reference_number text, action_type text, action_category text, output_preview text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    aa.id,
    aa.application_id,
    a.reference_number,
    aa.action_type,
    aa.action_category,
    LEFT(aa.output_text, 120) AS output_preview,
    aa.created_at
  FROM public.agent_actions aa
  LEFT JOIN public.applications a ON a.id = aa.application_id
  WHERE aa.firm_id = p_firm_id
    AND aa.status = 'complete'
    AND aa.requires_broker_review = true
    AND aa.broker_reviewed = false
  ORDER BY aa.created_at DESC
  LIMIT 20;
END;
$function$;

-- ----------------------------------------------------------
-- get_relevant_chunks
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_relevant_chunks(query_embedding vector, p_source_types text[] DEFAULT NULL::text[], p_firm_id uuid DEFAULT NULL::uuid, p_top_k integer DEFAULT 5, p_min_similarity double precision DEFAULT 0.70)
 RETURNS TABLE(id uuid, source_type text, source_label text, chunk_text text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    pe.id,
    pe.source_type,
    pe.source_label,
    pe.chunk_text,
    pe.metadata,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM public.policy_embeddings pe
  WHERE pe.is_active = true
    AND (p_source_types IS NULL OR pe.source_type = ANY(p_source_types))
    AND (p_firm_id IS NULL OR pe.firm_id IS NULL OR pe.firm_id = p_firm_id)
    AND 1 - (pe.embedding <=> query_embedding) >= p_min_similarity
  ORDER BY pe.embedding <=> query_embedding
  LIMIT p_top_k;
END;
$function$;

-- ----------------------------------------------------------
-- get_relevant_policies
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_relevant_policies(p_lender_name text, p_is_self_employed boolean DEFAULT false, p_lvr_percent numeric DEFAULT 0, p_dti_ratio numeric DEFAULT 0, p_is_first_home boolean DEFAULT false, p_income_type text DEFAULT 'salary_wages'::text, p_property_type text DEFAULT 'standard'::text)
 RETURNS TABLE(lender_name text, policy_category text, policy_summary text, hard_limits jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    lp.lender_name,
    lp.policy_category,
    lp.policy_summary,
    lp.hard_limits
  FROM public.lender_policies lp
  WHERE lp.lender_name = p_lender_name
    AND lp.is_current = true
    AND (
      -- Always include DTI and general appetite
      lp.policy_category IN ('dti_limits', 'general_appetite', 'credit_requirements')
      -- Self-employed policies
      OR (p_is_self_employed AND lp.policy_category = 'income_self_employed')
      -- High LVR policies
      OR (p_lvr_percent > 80 AND lp.policy_category IN ('lvr_high_lvr', 'lvr_standard'))
      OR (p_lvr_percent <= 80 AND lp.policy_category = 'lvr_standard')
      -- First home buyer
      OR (p_is_first_home AND lp.policy_category IN ('first_home_buyer', 'kiwisaver'))
      -- Rental income
      OR (p_income_type = 'rental' AND lp.policy_category = 'income_rental')
      -- Property type
      OR (p_property_type = 'apartment' AND lp.policy_category = 'property_apartment')
      OR (p_property_type = 'new_build' AND lp.policy_category = 'property_new_build')
    )
  ORDER BY
    CASE lp.policy_category
      WHEN 'dti_limits' THEN 1
      WHEN 'lvr_standard' THEN 2
      WHEN 'lvr_high_lvr' THEN 2
      WHEN 'income_self_employed' THEN 3
      WHEN 'credit_requirements' THEN 4
      ELSE 5
    END;
END;
$function$;

-- ----------------------------------------------------------
-- get_risk_prediction
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_risk_prediction(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_svc record;
  v_app record;
  v_outcomes jsonb;
  v_lender_rates jsonb;
  v_prediction jsonb;
  v_similar_count integer;
  v_confidence text;
  v_dti_band text;
  v_lvr_band text;
  v_income_band text;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  SELECT * INTO v_svc FROM public.serviceability_assessments
    WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  IF v_svc IS NULL THEN
    RETURN jsonb_build_object('error', 'No serviceability data — run assessment first');
  END IF;

  -- Band the key metrics
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

  -- Count similar historical applications
  SELECT COUNT(*) INTO v_similar_count
  FROM public.application_outcomes
  WHERE firm_id = v_app.firm_id
    AND lvr_band = v_lvr_band
    AND (
      CASE WHEN v_svc.dti_ratio <= 3 THEN '0-3x'
           WHEN v_svc.dti_ratio <= 4.5 THEN '3-4.5x'
           WHEN v_svc.dti_ratio <= 6 THEN '4.5-6x'
           ELSE '6x+' END = v_dti_band
    );

  v_confidence := CASE
    WHEN v_similar_count >= 20 THEN 'high'
    WHEN v_similar_count >= 10 THEN 'medium'
    WHEN v_similar_count >= 3  THEN 'low'
    ELSE 'insufficient_data'
  END;

  -- Get per-lender outcomes
  SELECT jsonb_agg(
    jsonb_build_object(
      'lender', lender_submitted,
      'total', COUNT(*),
      'approved', COUNT(*) FILTER (WHERE outcome IN ('approved','conditional')),
      'declined', COUNT(*) FILTER (WHERE outcome = 'declined'),
      'approval_rate', ROUND(
        COUNT(*) FILTER (WHERE outcome IN ('approved','conditional'))::numeric /
        NULLIF(COUNT(*), 0) * 100, 0
      ),
      'avg_days_to_outcome', ROUND(AVG(days_to_outcome), 0),
      'avg_conditions', ROUND(AVG(conditions_count), 1),
      'common_decline_reason', MODE() WITHIN GROUP (ORDER BY decline_reason_category)
    )
  )
  INTO v_lender_rates
  FROM public.application_outcomes
  WHERE firm_id = v_app.firm_id
    AND lender_submitted IS NOT NULL
    AND lvr_band = v_lvr_band
    AND (
      CASE WHEN v_svc.dti_ratio <= 3 THEN '0-3x'
           WHEN v_svc.dti_ratio <= 4.5 THEN '3-4.5x'
           WHEN v_svc.dti_ratio <= 6 THEN '4.5-6x'
           ELSE '6x+' END = v_dti_band
    )
  GROUP BY lender_submitted
  HAVING COUNT(*) >= 2;

  -- Run decline risk calculation and get results
  PERFORM public.calculate_decline_risk(p_application_id);

  SELECT jsonb_build_object(
    'anz_risk', anz_decline_risk,
    'asb_risk', asb_decline_risk,
    'bnz_risk', bnz_decline_risk,
    'westpac_risk', westpac_decline_risk,
    'kiwibank_risk', kiwibank_decline_risk,
    'recommended_lender', recommended_lender,
    'approval_probability', recommended_lender_approval_probability,
    'risk_factors', primary_risk_factors
  ) INTO v_prediction
  FROM public.decline_risk_assessments
  WHERE application_id = p_application_id
  ORDER BY assessed_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'application_id', p_application_id,
    'dti_band', v_dti_band,
    'lvr_band', v_lvr_band,
    'similar_applications', v_similar_count,
    'data_confidence', v_confidence,
    'lender_historical_rates', COALESCE(v_lender_rates, '[]'::jsonb),
    'current_risk_scores', COALESCE(v_prediction, '{}'::jsonb),
    'generated_at', now()
  );
END;
$function$;

-- ----------------------------------------------------------
-- notify_finance_condition_approaching
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_finance_condition_approaching()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- When S&P is created or finance_condition_date is set
  IF NEW.finance_condition_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.finance_condition_date IS DISTINCT FROM NEW.finance_condition_date)
     AND NOT COALESCE(NEW.finance_condition_met, false) THEN

    -- Create a notification
    INSERT INTO public.notifications (
      firm_id,
      type,
      title,
      message,
      due_date,
      reminder_date,
      metadata
    )
    SELECT
      a.firm_id,
      'finance_condition_deadline',
      'Finance Condition Deadline',
      'Finance condition for application ' || COALESCE(a.reference_number, a.id::text) || ' is due on ' || NEW.finance_condition_date::text,
      NEW.finance_condition_date,
      NEW.finance_condition_date - INTERVAL '3 days',
      jsonb_build_object(
        'application_id', NEW.application_id,
        'deadline_type', 'finance_condition',
        'days_remaining', (NEW.finance_condition_date - CURRENT_DATE)::integer
      )
    FROM public.applications a
    WHERE a.id = NEW.application_id
    ON CONFLICT DO NOTHING;

  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- refresh_broker_metrics
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_broker_metrics(p_period_month text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_month text := COALESCE(p_period_month, to_char(now() - interval '1 month', 'YYYY-MM'));
  v_start date := (v_month || '-01')::date;
  v_end date := (v_month || '-01')::date + interval '1 month';
  v_advisor record;
  v_count integer := 0;
BEGIN
  FOR v_advisor IN SELECT DISTINCT advisor_id, firm_id FROM public.applications WHERE created_at >= v_start AND created_at < v_end
  LOOP
    INSERT INTO public.broker_performance_metrics (
      firm_id, advisor_id, period_month,
      applications_created, applications_submitted,
      applications_approved, applications_settled, applications_declined,
      approval_rate
    )
    SELECT
      v_advisor.firm_id,
      v_advisor.advisor_id,
      v_month,
      COUNT(*) FILTER (WHERE created_at >= v_start AND created_at < v_end),
      COUNT(*) FILTER (WHERE workflow_stage = 'submitted'),
      COUNT(*) FILTER (WHERE workflow_stage IN ('approved', 'settled')),
      COUNT(*) FILTER (WHERE workflow_stage = 'settled'),
      COUNT(*) FILTER (WHERE workflow_stage = 'declined'),
      ROUND(
        COUNT(*) FILTER (WHERE workflow_stage IN ('approved', 'settled'))::numeric /
        NULLIF(COUNT(*) FILTER (WHERE workflow_stage = 'submitted'), 0) * 100, 1
      )
    FROM public.applications
    WHERE assigned_to = v_advisor.advisor_id
    ON CONFLICT (advisor_id, period_month) DO UPDATE SET
      applications_created = EXCLUDED.applications_created,
      applications_submitted = EXCLUDED.applications_submitted,
      applications_approved = EXCLUDED.applications_approved,
      applications_settled = EXCLUDED.applications_settled,
      applications_declined = EXCLUDED.applications_declined,
      approval_rate = EXCLUDED.approval_rate;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- ----------------------------------------------------------
-- refresh_broker_metrics_for_firm
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_broker_metrics_for_firm(p_firm_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_period date := date_trunc('month', CURRENT_DATE - interval '1 month')::date;
BEGIN
  INSERT INTO public.broker_performance_metrics (
    firm_id, advisor_id, period_month,
    applications_created, applications_submitted,
    applications_approved, applications_settled, applications_declined,
    approval_rate, trail_book_size, trail_monthly_value
  )
  SELECT
    a.firm_id,
    a.assigned_to,
    v_period,
    COUNT(*) FILTER (WHERE a.created_at >= v_period AND a.created_at < v_period + interval '1 month'),
    COUNT(*) FILTER (WHERE a.workflow_stage IN ('submitted','approved','conditionally_approved','settled')),
    COUNT(*) FILTER (WHERE a.workflow_stage IN ('approved','conditionally_approved','settled')),
    COUNT(*) FILTER (WHERE a.workflow_stage = 'settled'),
    COUNT(*) FILTER (WHERE a.workflow_stage = 'declined'),
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE a.workflow_stage IN ('approved','conditionally_approved','settled'))
      / NULLIF(COUNT(*) FILTER (WHERE a.workflow_stage NOT IN ('draft','withdrawn')), 0)
    , 1),
    (SELECT COUNT(*) FROM public.settled_loans sl WHERE sl.advisor_id = a.assigned_to AND sl.status = 'active'),
    (SELECT COALESCE(SUM(sl.loan_amount * 0.002 / 12), 0) FROM public.settled_loans sl WHERE sl.advisor_id = a.assigned_to AND sl.status = 'active')
  FROM public.applications a
  WHERE a.firm_id = p_firm_id
    AND a.assigned_to IS NOT NULL
  GROUP BY a.firm_id, a.assigned_to
  ON CONFLICT DO NOTHING;
END;
$function$;

-- ----------------------------------------------------------
-- sync_valuation_to_application
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_valuation_to_application()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.valuation_amount IS NOT NULL AND NEW.status IN ('received', 'accepted') THEN
    UPDATE public.applications
    SET
      property_value = NEW.valuation_amount,
      valuation_type = NEW.valuation_type,
      updated_at = now()
    WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$function$;

