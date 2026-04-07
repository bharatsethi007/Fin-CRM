-- ============================================================
-- BASELINE MIGRATION: AI FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 13
-- ============================================================

-- ----------------------------------------------------------
-- check_ai_token_limit
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_ai_token_limit(p_firm_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_usage record;
  v_month text := to_char(now(), 'YYYY-MM');
BEGIN
  SELECT total_tokens, token_limit, total_cost_usd
  INTO v_usage
  FROM public.ai_usage_summary
  WHERE firm_id = p_firm_id AND month_year = v_month;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'tokens_used', 0, 'tokens_limit', 500000, 'percent_used', 0);
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_usage.total_tokens < v_usage.token_limit,
    'tokens_used', v_usage.total_tokens,
    'tokens_limit', v_usage.token_limit,
    'tokens_remaining', v_usage.token_limit - v_usage.total_tokens,
    'percent_used', ROUND((v_usage.total_tokens::numeric / v_usage.token_limit) * 100, 1),
    'cost_usd', v_usage.total_cost_usd
  );
END;
$function$;

-- ----------------------------------------------------------
-- generate_overnight_ai_actions
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_overnight_ai_actions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_loan record;
  v_app record;
  v_count integer := 0;
  v_market_best numeric;
  v_days_stale integer;
  v_monthly_saving numeric;
BEGIN
  SELECT MIN(rate_percent) INTO v_market_best
  FROM public.market_rates
  WHERE rate_type = 'fixed_1yr' AND is_current = true;
  v_market_best := COALESCE(v_market_best, 5.99);

  -- Clear old unactioned overnight drafts
  DELETE FROM public.ai_insights
  WHERE is_actioned = false
    AND is_dismissed = false
    AND draft_content IS NOT NULL
    AND created_at < now() - interval '48 hours';

  -- 1. Rate refix opportunities — draft email per client
  FOR v_loan IN
    SELECT sl.*, c.first_name, c.last_name, c.email as client_email,
           adv.id as advisor_id, sl.firm_id,
           (sl.current_rate_expiry_date - CURRENT_DATE)::integer as days_until
    FROM public.settled_loans sl
    JOIN public.clients c ON sl.client_id = c.id
    JOIN public.advisors adv ON sl.advisor_id = adv.id
    WHERE sl.status = 'active'
      AND sl.current_interest_rate > v_market_best + 0.4
      AND sl.current_rate_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
      AND sl.current_rate_type = 'fixed'
  LOOP
    v_monthly_saving := ROUND(
      sl.loan_amount * ((v_loan.current_interest_rate - v_market_best) / 100) / 12
    );

    INSERT INTO public.ai_insights (
      firm_id, advisor_id, client_id, insight_type, priority,
      title, body, action_label, action_type, action_data,
      draft_type, draft_subject,
      draft_content, valid_until, ai_generated
    ) VALUES (
      v_loan.firm_id, v_loan.advisor_id, v_loan.client_id,
      'refix_opportunity',
      CASE WHEN v_loan.days_until <= 30 THEN 'critical' ELSE 'high' END,
      'Rate refix due — ' || v_loan.first_name || ' ' || v_loan.last_name,
      v_loan.lender_name || ' fixed rate expires in ' || v_loan.days_until ||
      ' days. Current: ' || v_loan.current_interest_rate || '%. Market best: ' ||
      v_market_best || '%. Est. saving: $' || v_monthly_saving || '/mth.',
      'Review & Send Email', 'send_email',
      jsonb_build_object(
        'settled_loan_id', v_loan.id,
        'client_email', v_loan.client_email,
        'lender', v_loan.lender_name,
        'current_rate', v_loan.current_interest_rate,
        'market_rate', v_market_best,
        'monthly_saving', v_monthly_saving
      ),
      'email',
      'Your ' || v_loan.lender_name || ' rate expires soon — let''s review your options',
      jsonb_build_object(
        'greeting', 'Hi ' || v_loan.first_name || ',',
        'body', 'Your fixed rate of ' || v_loan.current_interest_rate ||
                '% with ' || v_loan.lender_name ||
                ' expires in ' || v_loan.days_until ||
                ' days. The current market best rate is ' || v_market_best ||
                '%, which could save you approximately $' || v_monthly_saving ||
                ' per month. I''d love to review your options and make sure you''re on the best possible rate. Would you have 15 minutes for a quick call?',
        'sign_off', 'Kind regards'
      ),
      CURRENT_DATE + LEAST(v_loan.days_until - 7, 30),
      true
    ) ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  -- 2. Stale applications — draft nudge email to client
  FOR v_app IN
    SELECT a.id, a.firm_id, a.assigned_to, a.client_id,
           c.first_name, c.last_name, c.email as client_email,
           a.loan_purpose, a.loan_amount,
           EXTRACT(DAY FROM now() - a.updated_at)::integer as days_stale
    FROM public.applications a
    JOIN public.clients c ON a.client_id = c.id
    WHERE a.status = 'active'
      AND a.workflow_stage = 'draft'
      AND a.updated_at < now() - interval '7 days'
  LOOP
    INSERT INTO public.ai_insights (
      firm_id, advisor_id, application_id, client_id,
      insight_type, priority, title, body,
      action_label, action_type, action_data,
      draft_type, draft_subject, draft_content,
      valid_until, ai_generated
    ) VALUES (
      v_app.firm_id, v_app.assigned_to, v_app.id, v_app.client_id,
      'stale_application', 'medium',
      'Stale application — ' || v_app.first_name || ' ' || v_app.last_name,
      'No activity for ' || v_app.days_stale || ' days. Draft follow-up ready.',
      'Review & Send', 'send_email',
      jsonb_build_object('application_id', v_app.id, 'client_email', v_app.client_email),
      'email',
      'Following up on your mortgage application',
      jsonb_build_object(
        'greeting', 'Hi ' || v_app.first_name || ',',
        'body', 'I wanted to check in on your mortgage application' ||
                CASE WHEN v_app.loan_purpose IS NOT NULL
                     THEN ' for your ' || v_app.loan_purpose
                     ELSE '' END ||
                '. It looks like we may still need a few things from you to move forward. ' ||
                'I''m here to help make this as smooth as possible — would you be free for a quick call this week?',
        'sign_off', 'Kind regards'
      ),
      CURRENT_DATE + 7,
      true
    ) ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ----------------------------------------------------------
-- get_advisor_ai_context
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_advisor_ai_context(p_advisor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_prefs record;
  v_feedback_stats record;
BEGIN
  SELECT * INTO v_prefs FROM public.advisor_preferences WHERE advisor_id = p_advisor_id;

  SELECT
    COUNT(*) as total_interactions,
    ROUND(COUNT(CASE WHEN action = 'accepted' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 0) as acceptance_rate,
    mode() WITHIN GROUP (ORDER BY advisor_chose_lender) as most_chosen_lender
  INTO v_feedback_stats
  FROM public.advisor_ai_feedback
  WHERE advisor_id = p_advisor_id
    AND created_at > now() - interval '90 days';

  RETURN jsonb_build_object(
    'preferred_lenders', COALESCE(v_prefs.preferred_lenders, '{}'),
    'email_tone', COALESCE(v_prefs.email_tone, 'friendly_professional'),
    'typically_skips', COALESCE(v_prefs.typically_skips, '[]'),
    'ai_acceptance_rate', COALESCE(v_feedback_stats.acceptance_rate, 0),
    'most_chosen_lender', v_feedback_stats.most_chosen_lender,
    'typical_loan_purpose', v_prefs.typical_loan_purpose
  );
END;
$function$;

-- ----------------------------------------------------------
-- get_ai_application_context
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ai_application_context(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_ctx jsonb := '{}'::jsonb;
  v_app record;
  v_svc record;
  v_readiness record;
  v_anomalies jsonb;
  v_lender_policies jsonb;
  v_decline_risk record;
  v_win_rates jsonb;
  v_advisor_prefs jsonb;
  v_income_stability integer;
  v_insights jsonb;
BEGIN
  -- Application basics
  SELECT a.*, c.first_name, c.last_name, c.email
  INTO v_app
  FROM public.applications a
  JOIN public.clients c ON a.client_id = c.id
  WHERE a.id = p_application_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Serviceability
  SELECT * INTO v_svc FROM public.serviceability_assessments
  WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  -- Readiness
  SELECT * INTO v_readiness FROM public.application_readiness_scores
  WHERE application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  -- Anomalies
  SELECT jsonb_agg(jsonb_build_object('severity', severity, 'title', title, 'description', description))
  INTO v_anomalies
  FROM public.anomaly_flags
  WHERE application_id = p_application_id AND status = 'open';

  -- Decline risk
  SELECT * INTO v_decline_risk FROM public.decline_risk_assessments
  WHERE application_id = p_application_id ORDER BY assessed_at DESC LIMIT 1;

  -- Lender policies (for recommended lender)
  IF v_decline_risk.recommended_lender IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
      'category', policy_category,
      'summary', policy_summary,
      'limits', hard_limits
    ))
    INTO v_lender_policies
    FROM public.lender_policies
    WHERE lender_name = v_decline_risk.recommended_lender
      AND is_current = true;
  END IF;

  -- Win rates
  SELECT public.get_lender_win_rates(v_app.firm_id) INTO v_win_rates;

  -- Advisor preferences
  SELECT public.get_advisor_ai_context(v_app.assigned_to) INTO v_advisor_prefs;

  -- Income stability
  SELECT public.calculate_income_stability(p_application_id) INTO v_income_stability;

  -- Active insights
  SELECT jsonb_agg(jsonb_build_object('type', insight_type, 'title', title, 'priority', priority))
  INTO v_insights
  FROM public.ai_insights
  WHERE application_id = p_application_id
    AND is_actioned = false AND is_dismissed = false;

  -- Build full context (PII stripped)
  RETURN jsonb_build_object(
    'application_id', p_application_id,
    'application_type', v_app.application_type,
    'loan_purpose', v_app.loan_purpose,
    'loan_amount', v_app.loan_amount,
    'property_value', v_app.property_value,
    'loan_term_years', v_app.loan_term_years,
    'workflow_stage', v_app.workflow_stage,

    -- Serviceability
    'umi_monthly', v_svc.umi_monthly,
    'dti_ratio', v_svc.dti_ratio,
    'lvr_percent', v_svc.lvr_percent,
    'passes_serviceability', v_svc.passes_serviceability,
    'gross_annual_income', v_svc.gross_annual_income,
    'net_monthly_income', v_svc.net_monthly_income,
    'expenses_used_monthly', v_svc.expenses_used_monthly,

    -- Quality
    'readiness_score', v_readiness.total_score,
    'readiness_grade', v_readiness.score_grade,
    'critical_issues', v_readiness.critical_count,

    -- Risk
    'anomaly_count', COALESCE(jsonb_array_length(v_anomalies), 0),
    'anomalies', COALESCE(v_anomalies, '[]'::jsonb),
    'income_stability_score', v_income_stability,

    -- Predictions
    'decline_risk_recommended_lender', v_decline_risk.recommended_lender,
    'decline_risk_approval_probability', v_decline_risk.recommended_lender_approval_probability,
    'decline_risk_factors', COALESCE(v_decline_risk.primary_risk_factors, '[]'::jsonb),

    -- Historical intelligence
    'lender_win_rates', COALESCE(v_win_rates, '[]'::jsonb),
    'relevant_lender_policies', COALESCE(v_lender_policies, '[]'::jsonb),

    -- Advisor context
    'advisor_preferences', COALESCE(v_advisor_prefs, '{}'::jsonb),

    -- Active insights
    'active_insights', COALESCE(v_insights, '[]'::jsonb),

    -- Metadata
    'context_generated_at', now()
  );
END;
$function$;

-- ----------------------------------------------------------
-- get_ai_model
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ai_model(p_feature text, p_firm_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_config record;
BEGIN
  -- Check firm-specific override first
  IF p_firm_id IS NOT NULL THEN
    SELECT model, temperature, max_tokens INTO v_config
    FROM public.ai_model_config
    WHERE firm_id = p_firm_id AND feature = p_feature AND is_active = true;
  END IF;

  -- Fall back to global default
  IF NOT FOUND OR v_config IS NULL THEN
    SELECT model, temperature, max_tokens INTO v_config
    FROM public.ai_model_config
    WHERE firm_id IS NULL AND feature = p_feature AND is_active = true;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('model', 'gpt-4o-mini', 'temperature', 0.3, 'max_tokens', 1000);
  END IF;

  RETURN jsonb_build_object(
    'model', v_config.model,
    'temperature', v_config.temperature,
    'max_tokens', v_config.max_tokens
  );
END;
$function$;

-- ----------------------------------------------------------
-- get_application_context_hash
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_application_context_hash(p_application_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT md5(concat(
    -- Applications core
    a.updated_at::text,
    -- Income
    COALESCE((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.income WHERE application_id = p_application_id), ''),
    -- Expenses
    COALESCE((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.expenses WHERE application_id = p_application_id), ''),
    -- Assets
    COALESCE((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.assets WHERE application_id = p_application_id), ''),
    -- Liabilities
    COALESCE((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.liabilities WHERE application_id = p_application_id), ''),
    -- Documents
    COALESCE((SELECT string_agg(updated_at::text, ',' ORDER BY id) FROM public.documents WHERE application_id = p_application_id), ''),
    -- Bank analysis
    COALESCE((SELECT string_agg(created_at::text, ',' ORDER BY id) FROM public.bank_statement_analysis WHERE application_id = p_application_id), '')
  ))
  INTO v_hash
  FROM public.applications a
  WHERE a.id = p_application_id;
  
  RETURN v_hash;
END;
$function$;

-- ----------------------------------------------------------
-- get_cached_ai_output
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cached_ai_output(p_application_id uuid, p_feature text, p_context_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result record;
BEGIN
  SELECT output_json, output_text, created_at, context_hash
  INTO v_result
  FROM public.ai_outputs
  WHERE application_id = p_application_id
    AND feature = p_feature
    AND cache_valid = true
    AND cache_expires_at > now()
    AND (p_context_hash IS NULL OR context_hash = p_context_hash)
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'output_json', v_result.output_json,
    'output_text', v_result.output_text,
    'created_at', v_result.created_at,
    'context_hash', v_result.context_hash,
    'cached', true
  );
END;
$function$;

-- ----------------------------------------------------------
-- get_latest_agent_outputs
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_latest_agent_outputs(p_application_id uuid)
 RETURNS TABLE(agent_name text, status text, findings jsonb, recommendation jsonb, confidence_score integer, reasoning_trace text, policy_chunks_used jsonb, broker_override jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (ao.agent_name)
    ao.agent_name,
    ao.status,
    ao.findings,
    ao.recommendation,
    ao.confidence_score,
    ao.reasoning_trace,
    ao.policy_chunks_used,
    ao.broker_override,
    ao.created_at
  FROM public.agent_outputs ao
  WHERE ao.application_id = p_application_id
  ORDER BY ao.agent_name, ao.created_at DESC;
END;
$function$;

-- ----------------------------------------------------------
-- get_skill_context_for_feature
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_skill_context_for_feature(p_firm_id uuid, p_feature text, p_advisor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_skills jsonb;
  v_context text := '';
  v_skill record;
BEGIN
  -- Get relevant skills (advisor-specific first, then firm-wide)
  FOR v_skill IN
    SELECT s.*
    FROM public.ai_skill_library s
    WHERE s.firm_id = p_firm_id
      AND s.is_active = true
      AND (
        'all' = ANY(s.applies_to_features)
        OR p_feature = ANY(s.applies_to_features)
      )
      AND (
        s.advisor_id IS NULL           -- firm-wide
        OR s.advisor_id = p_advisor_id -- advisor-specific (takes priority)
      )
    ORDER BY
      CASE WHEN s.advisor_id = p_advisor_id THEN 0 ELSE 1 END,  -- advisor first
      s.created_at DESC
    LIMIT 5
  LOOP
    v_context := v_context || E'\n\n## ' || v_skill.skill_name || E'\n';
    IF v_skill.system_instructions IS NOT NULL THEN
      v_context := v_context || v_skill.system_instructions || E'\n';
    END IF;
    IF v_skill.style_notes IS NOT NULL THEN
      v_context := v_context || 'Style: ' || v_skill.style_notes || E'\n';
    END IF;
    IF v_skill.extracted_content IS NOT NULL THEN
      v_context := v_context || v_skill.extracted_content || E'\n';
    END IF;
    IF v_skill.key_phrases IS NOT NULL AND array_length(v_skill.key_phrases, 1) > 0 THEN
      v_context := v_context || 'Key phrases to use: ' ||
        array_to_string(v_skill.key_phrases, ', ') || E'\n';
    END IF;

    -- Update usage counter
    UPDATE public.ai_skill_library
    SET times_used = times_used + 1, updated_at = now()
    WHERE id = v_skill.id;
  END LOOP;

  IF v_context = '' THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'has_skills', true,
    'skill_count', (
      SELECT COUNT(*) FROM public.ai_skill_library
      WHERE firm_id = p_firm_id AND is_active = true
    ),
    'context_text', v_context,
    'instruction', 'Apply the firm skill guidelines above when generating this output. Match the style, structure, and tone specified.'
  );
END;
$function$;

-- ----------------------------------------------------------
-- init_application_intelligence
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.init_application_intelligence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.application_intelligence (application_id, firm_id)
  VALUES (NEW.id, NEW.firm_id)
  ON CONFLICT (application_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- save_intelligence_output
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_intelligence_output(p_application_id uuid, p_feature text, p_output jsonb, p_model text DEFAULT 'gpt-4o-mini'::text, p_prompt_tokens integer DEFAULT 0, p_completion_tokens integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cost numeric := (p_prompt_tokens * 0.00000015) + (p_completion_tokens * 0.0000006);
BEGIN
  -- Update token tracking for all features
  UPDATE public.application_intelligence SET
    total_tokens_used = total_tokens_used + p_prompt_tokens + p_completion_tokens,
    total_cost_usd    = total_cost_usd + v_cost,
    updated_at        = now()
  WHERE application_id = p_application_id;

  -- Update the specific feature field
  IF p_feature = 'advice_summary' THEN
    UPDATE public.application_intelligence SET advice_summary = p_output, advice_generated_at = now() WHERE application_id = p_application_id;
  ELSIF p_feature = 'needs_objectives_draft' THEN
    UPDATE public.application_intelligence SET needs_objectives_draft = p_output WHERE application_id = p_application_id;
  ELSIF p_feature = 'compliance_narrative' THEN
    UPDATE public.application_intelligence SET compliance_narrative = p_output, compliance_checked_at = now() WHERE application_id = p_application_id;
  ELSIF p_feature = 'serviceability_narrative' THEN
    UPDATE public.application_intelligence SET serviceability_narrative = p_output WHERE application_id = p_application_id;
  ELSIF p_feature = 'document_request' THEN
    UPDATE public.application_intelligence SET document_request_draft = p_output WHERE application_id = p_application_id;
  ELSIF p_feature = 'daily_briefing' THEN
    UPDATE public.application_intelligence SET daily_briefing = p_output WHERE application_id = p_application_id;
  ELSIF p_feature = 'client_summary' THEN
    UPDATE public.application_intelligence SET client_summary = p_output WHERE application_id = p_application_id;
  ELSIF p_feature = 'decline_risk' THEN
    UPDATE public.application_intelligence SET decline_risk_summary = p_output WHERE application_id = p_application_id;
  END IF;
END;
$function$;

-- ----------------------------------------------------------
-- track_ai_token_usage
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_ai_token_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_month text := to_char(NEW.created_at, 'YYYY-MM');
  v_feature_update jsonb;
BEGIN
  -- Upsert monthly summary
  INSERT INTO public.ai_usage_summary (firm_id, month_year, total_calls, total_tokens, total_cost_usd)
  VALUES (NEW.firm_id, v_month, 1, NEW.prompt_tokens + NEW.completion_tokens, NEW.cost_usd)
  ON CONFLICT (firm_id, month_year) DO UPDATE SET
    total_calls = ai_usage_summary.total_calls + 1,
    total_tokens = ai_usage_summary.total_tokens + NEW.prompt_tokens + NEW.completion_tokens,
    total_cost_usd = ai_usage_summary.total_cost_usd + NEW.cost_usd,
    updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_intelligence_state
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_intelligence_state(p_application_id uuid, p_items jsonb, p_blocking integer, p_warning integer, p_passed integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.application_intelligence SET
    intelligence_items = p_items,
    blocking_count = p_blocking,
    warning_count = p_warning,
    passed_count = p_passed,
    submission_ready = (p_blocking = 0),
    intelligence_last_run = now(),
    updated_at = now()
  WHERE application_id = p_application_id;
END;
$function$;

