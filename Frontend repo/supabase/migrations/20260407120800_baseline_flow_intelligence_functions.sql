-- ============================================================
-- BASELINE MIGRATION: FLOW_INTELLIGENCE FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 10
-- ============================================================

-- ----------------------------------------------------------
-- fi_check_missing_fields
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_check_missing_fields(p_action text, p_params jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_missing text[] := '{}';
  v_questions text[] := '{}';
  v_has_name boolean;
  v_has_email boolean;
BEGIN
  -- Check if we have any form of name
  v_has_name := (
    p_params->>'first_name' IS NOT NULL OR
    p_params->>'name' IS NOT NULL OR
    p_params->>'client_name' IS NOT NULL OR
    p_params->>'full_name' IS NOT NULL
  );

  v_has_email := p_params->>'email' IS NOT NULL;

  IF p_action IN ('create_client', 'create_client_and_application') THEN
    IF NOT v_has_name THEN
      v_missing := array_append(v_missing, 'name');
      v_questions := array_append(v_questions, 'What is the client''s full name?');
    END IF;
    IF NOT v_has_email THEN
      v_missing := array_append(v_missing, 'email');
      v_questions := array_append(v_questions, 'What is the client''s email address?');
    END IF;
    IF p_params->>'phone' IS NULL THEN
      v_missing := array_append(v_missing, 'phone');
      v_questions := array_append(v_questions, 'What is the client''s phone number?');
    END IF;
  END IF;

  IF p_action IN ('create_application', 'create_client_and_application') THEN
    IF p_params->>'loan_purpose' IS NULL AND p_params->>'application_type' IS NULL THEN
      v_missing := array_append(v_missing, 'loan_purpose');
      v_questions := array_append(v_questions, 'What is the loan purpose? (e.g. first home, investment, refinance)');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'has_missing_fields', array_length(v_missing, 1) > 0,
    'missing_fields', v_missing,
    'questions', v_questions,
    'can_proceed_without', ARRAY['phone', 'loan_purpose']  -- These are optional
  );
END;
$function$;

-- ----------------------------------------------------------
-- fi_create_application
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_create_application(p_firm_id uuid, p_advisor_id uuid, p_params jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_application_id uuid;
  v_client_id uuid;
  v_ref text;
  v_client_name text;
BEGIN
  v_client_id := (p_params->>'client_id')::uuid;

  -- Verify client belongs to this firm
  SELECT first_name || ' ' || last_name INTO v_client_name
  FROM public.clients 
  WHERE id = v_client_id AND firm_id = p_firm_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found in your firm');
  END IF;

  v_ref := public.generate_reference_number(p_firm_id);

  INSERT INTO public.applications (
    firm_id, client_id, assigned_to,
    reference_number, application_type,
    loan_amount, property_value, deposit_amount,
    loan_purpose, property_address,
    property_city, loan_term_years,
    workflow_stage, status
  ) VALUES (
    p_firm_id, v_client_id, p_advisor_id,
    v_ref,
    COALESCE(p_params->>'application_type', 'purchase'),
    CASE WHEN p_params->>'loan_amount' IS NOT NULL 
         THEN (p_params->>'loan_amount')::numeric ELSE NULL END,
    CASE WHEN p_params->>'property_value' IS NOT NULL 
         THEN (p_params->>'property_value')::numeric ELSE NULL END,
    CASE WHEN p_params->>'deposit_amount' IS NOT NULL 
         THEN (p_params->>'deposit_amount')::numeric ELSE NULL END,
    p_params->>'loan_purpose',
    p_params->>'property_address',
    p_params->>'property_city',
    COALESCE((p_params->>'loan_term_years')::integer, 30),
    'draft', 'active'
  ) RETURNING id INTO v_application_id;

  -- Run initial serviceability if we have enough data
  IF (p_params->>'loan_amount') IS NOT NULL THEN
    PERFORM public.calculate_serviceability(v_application_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', v_application_id,
    'reference_number', v_ref,
    'client_name', v_client_name,
    'workflow_stage', 'draft',
    'summary', 'Application ' || v_ref || ' created for ' || v_client_name,
    'next_actions', ARRAY[
      'Add applicant details', 
      'Enter income details',
      'Run serviceability',
      'Generate needs and objectives'
    ]
  );
END;
$function$;

-- ----------------------------------------------------------
-- fi_create_client
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_create_client(p_firm_id uuid, p_advisor_id uuid, p_params jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_client_id uuid;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_full_name text;
  v_name_parts text[];
BEGIN
  -- Handle ALL name formats the AI might send:
  -- first_name + last_name, name, client_name, full_name
  IF p_params->>'first_name' IS NOT NULL THEN
    v_first_name := TRIM(p_params->>'first_name');
    v_last_name  := TRIM(COALESCE(p_params->>'last_name', ''));
  ELSE
    -- Try every possible full-name field
    v_full_name := TRIM(COALESCE(
      p_params->>'name',
      p_params->>'client_name',
      p_params->>'full_name',
      p_params->>'contact_name'
    ));
    
    IF v_full_name IS NULL OR v_full_name = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Name is required');
    END IF;
    
    v_name_parts := string_to_array(v_full_name, ' ');
    v_first_name := v_name_parts[1];
    v_last_name  := CASE 
      WHEN array_length(v_name_parts, 1) > 1 
      THEN array_to_string(v_name_parts[2:array_length(v_name_parts,1)], ' ')
      ELSE '' 
    END;
  END IF;

  -- Email: use provided or generate placeholder
  v_email := LOWER(TRIM(COALESCE(
    p_params->>'email',
    REGEXP_REPLACE(LOWER(v_first_name), '[^a-z0-9]', '', 'g') || '.' ||
    REGEXP_REPLACE(LOWER(v_last_name), '[^a-z0-9]', '', 'g') ||
    '@placeholder.advisorflow.co.nz'
  )));

  -- Duplicate check (skip placeholders)
  IF NOT v_email LIKE '%@placeholder.advisorflow.co.nz' THEN
    IF EXISTS (
      SELECT 1 FROM public.clients 
      WHERE firm_id = p_firm_id AND email = v_email
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'A client with email ' || v_email || ' already exists.',
        'duplicate', true
      );
    END IF;
  END IF;

  INSERT INTO public.clients (
    firm_id, assigned_to,
    first_name, last_name, email,
    phone, date_of_birth,
    residential_address, city, postal_code,
    employment_status, annual_income,
    status, stage, notes
  ) VALUES (
    p_firm_id, p_advisor_id,
    v_first_name, v_last_name, v_email,
    p_params->>'phone',
    CASE WHEN p_params->>'date_of_birth' IS NOT NULL 
         THEN (p_params->>'date_of_birth')::date ELSE NULL END,
    p_params->>'address',
    COALESCE(
      p_params->>'city',
      p_params->>'property_location',
      p_params->>'location'
    ),
    p_params->>'postal_code',
    COALESCE(p_params->>'employment_status', 'employed'),
    CASE 
      WHEN p_params->>'annual_income' IS NOT NULL THEN (p_params->>'annual_income')::numeric
      WHEN p_params->>'income' IS NOT NULL THEN (p_params->>'income')::numeric
      WHEN p_params->>'salary' IS NOT NULL THEN (p_params->>'salary')::numeric
      ELSE NULL 
    END,
    'active', 'new',
    p_params->>'notes'
  ) RETURNING id INTO v_client_id;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client_id,
    'client_name', v_first_name || ' ' || v_last_name,
    'email', v_email,
    'summary', 'Client created: ' || v_first_name || ' ' || v_last_name,
    'next_actions', ARRAY[
      'Start a new application for ' || v_first_name || ' ' || v_last_name,
      'Add contact details',
      'Request documents'
    ]
  );
END;
$function$;

-- ----------------------------------------------------------
-- fi_create_client_and_application
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_create_client_and_application(p_firm_id uuid, p_advisor_id uuid, p_params jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_client_result jsonb;
  v_app_result jsonb;
  v_client_id uuid;
BEGIN
  v_client_result := public.fi_create_client(p_firm_id, p_advisor_id, p_params);
  
  IF NOT (v_client_result->>'success')::boolean THEN
    RETURN v_client_result;
  END IF;

  v_client_id := (v_client_result->>'client_id')::uuid;

  -- Create application if we have loan/property data
  IF p_params->>'loan_amount' IS NOT NULL 
     OR p_params->>'property_value' IS NOT NULL
     OR p_params->>'loan_purpose' IS NOT NULL THEN

    -- Calculate loan amount if not provided (80% of property value)
    DECLARE v_enriched_params jsonb;
    BEGIN
      v_enriched_params := p_params || jsonb_build_object('client_id', v_client_id);
      
      -- If loan_amount missing but property_value exists, assume 80% LVR
      IF (p_params->>'loan_amount') IS NULL AND (p_params->>'property_value') IS NOT NULL THEN
        v_enriched_params := v_enriched_params || jsonb_build_object(
          'loan_amount', ((p_params->>'property_value')::numeric * 0.8)::text,
          'deposit_amount', ((p_params->>'property_value')::numeric * 0.2)::text
        );
      END IF;

      v_app_result := public.fi_create_application(p_firm_id, p_advisor_id, v_enriched_params);
    END;

    RETURN jsonb_build_object(
      'success', true,
      'client_id', v_client_id,
      'client_name', v_client_result->>'client_name',
      'application_id', v_app_result->>'application_id',
      'reference_number', v_app_result->>'reference_number',
      'summary', 'Created client ' || (v_client_result->>'client_name') || 
                 ' and application ' || COALESCE(v_app_result->>'reference_number', ''),
      'next_actions', ARRAY[
        'Add applicant details for ' || (v_client_result->>'client_name'),
        'Enter income details',
        'Run serviceability check',
        'Generate needs and objectives'
      ]
    );
  END IF;

  RETURN v_client_result;
END;
$function$;

-- ----------------------------------------------------------
-- fi_execute_action
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_execute_action(p_action_key text, p_parameters jsonb, p_advisor_id uuid, p_firm_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
  v_app_id uuid;
  v_count integer;
BEGIN
  v_app_id := (p_parameters->>'application_id')::uuid;

  CASE p_action_key

    WHEN 'get_pipeline_summary' THEN
      SELECT public.get_flow_intelligence_data(p_firm_id) INTO v_result;
      RETURN jsonb_build_object('success', true, 'data', v_result, 'summary', 'Pipeline data retrieved');

    WHEN 'find_client' THEN
      RETURN public.fi_find_client(p_firm_id,
        COALESCE(p_parameters->>'search', p_parameters->>'name',
                 p_parameters->>'client_name', p_parameters->>'query', '')
      );

    WHEN 'run_serviceability' THEN
      IF v_app_id IS NOT NULL THEN
        PERFORM public.calculate_serviceability(v_app_id);
        SELECT jsonb_build_object('application_id', v_app_id,
          'umi_monthly', umi_monthly, 'dti_ratio', dti_ratio,
          'lvr_percent', lvr_percent, 'passes', passes_serviceability)
        INTO v_result FROM public.serviceability_assessments
        WHERE application_id = v_app_id ORDER BY created_at DESC LIMIT 1;
        RETURN jsonb_build_object('success', true, 'data', v_result, 'summary', 'Serviceability calculated');
      ELSE
        SELECT COUNT(*) INTO v_count FROM public.applications
        WHERE firm_id = p_firm_id AND workflow_stage = 'draft';
        PERFORM public.calculate_serviceability(id) FROM public.applications
        WHERE firm_id = p_firm_id AND workflow_stage = 'draft';
        RETURN jsonb_build_object('success', true, 'affected_count', v_count,
          'summary', 'Serviceability run on ' || v_count || ' draft applications');
      END IF;

    WHEN 'run_readiness_score' THEN
      IF v_app_id IS NOT NULL THEN
        PERFORM public.calculate_readiness_score(v_app_id);
        SELECT jsonb_build_object('score', total_score, 'grade', score_grade,
          'critical_count', critical_count, 'high_count', high_count)
        INTO v_result FROM public.application_readiness_scores
        WHERE application_id = v_app_id ORDER BY scored_at DESC LIMIT 1;
        RETURN jsonb_build_object('success', true, 'data', v_result,
          'summary', 'Readiness grade: ' || (v_result->>'grade'));
      END IF;

    WHEN 'detect_anomalies' THEN
      IF v_app_id IS NOT NULL THEN
        SELECT public.detect_anomalies(v_app_id) INTO v_count;
        RETURN jsonb_build_object('success', true, 'flags_created', v_count,
          'summary', v_count || ' anomaly flags detected');
      ELSE
        SELECT SUM(public.detect_anomalies(id)) INTO v_count FROM public.applications
        WHERE firm_id = p_firm_id AND status = 'active';
        RETURN jsonb_build_object('success', true, 'total_flags', v_count,
          'summary', 'Anomaly detection complete — ' || COALESCE(v_count,0) || ' flags found');
      END IF;

    WHEN 'get_market_rates' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'lender', lender_name, 'type', rate_type, 'rate', rate_percent
      ) ORDER BY rate_percent) INTO v_result
      FROM public.market_rates WHERE is_current = true AND owner_occupied = true;
      RETURN jsonb_build_object('success', true, 'data', v_result, 'summary', 'Current market rates retrieved');

    WHEN 'get_refix_alerts' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'client', c.first_name || ' ' || c.last_name,
        'lender', sl.lender_name, 'loan_amount', sl.loan_amount,
        'current_rate', sl.current_interest_rate,
        'expiry_date', sl.current_rate_expiry_date,
        'days_until', (sl.current_rate_expiry_date - CURRENT_DATE)
      ) ORDER BY sl.current_rate_expiry_date) INTO v_result
      FROM public.settled_loans sl JOIN public.clients c ON c.id = sl.client_id
      WHERE sl.firm_id = p_firm_id AND sl.status = 'active'
        AND sl.current_rate_type = 'fixed'
        AND sl.current_rate_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90;
      RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result,'[]'::jsonb),
        'summary', 'Refix alerts retrieved');

    WHEN 'create_task' THEN
      INSERT INTO public.tasks (firm_id, assigned_to, application_id, client_id, title,
        description, priority, status, due_date, task_type)
      VALUES (p_firm_id, p_advisor_id, v_app_id,
        (p_parameters->>'client_id')::uuid,
        p_parameters->>'title', p_parameters->>'description',
        COALESCE(p_parameters->>'priority', 'medium'), 'pending',
        (p_parameters->>'due_date')::date, 'to_do');
      RETURN jsonb_build_object('success', true,
        'summary', 'Task created: ' || (p_parameters->>'title'));

    WHEN 'get_commission_summary' THEN
      SELECT jsonb_build_object(
        'expected_this_month', COALESCE(SUM(net_amount) FILTER (WHERE status='expected'
          AND settlement_date >= date_trunc('month',CURRENT_DATE)),0),
        'received_this_month', COALESCE(SUM(net_amount) FILTER (WHERE status='received'
          AND received_date >= date_trunc('month',CURRENT_DATE)),0),
        'total_clawback_risk', COALESCE(SUM(gross_amount) FILTER (WHERE status='received'
          AND clawback_risk_until > CURRENT_DATE),0),
        'overdue_count', COUNT(*) FILTER (WHERE status='overdue')
      ) INTO v_result FROM public.commissions WHERE firm_id = p_firm_id;
      RETURN jsonb_build_object('success', true, 'data', v_result, 'summary', 'Commission summary retrieved');

    WHEN 'check_kiwisaver' THEN
      IF v_app_id IS NOT NULL THEN
        SELECT public.check_kiwisaver_eligibility(v_app_id) INTO v_result;
        RETURN jsonb_build_object('success', true, 'data', v_result, 'summary', 'KiwiSaver eligibility checked');
      END IF;

    WHEN 'get_anomaly_summary' THEN
      SELECT jsonb_agg(jsonb_build_object('severity', severity, 'title', title,
        'application_id', application_id)
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END)
      INTO v_result FROM public.anomaly_flags
      WHERE firm_id = p_firm_id AND status = 'open';
      RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result,'[]'::jsonb),
        'summary', 'Open anomaly flags retrieved');

    WHEN 'update_workflow_stage' THEN
      IF v_app_id IS NOT NULL AND p_parameters->>'stage' IS NOT NULL THEN
        UPDATE public.applications SET workflow_stage = p_parameters->>'stage', updated_at = now()
        WHERE id = v_app_id AND firm_id = p_firm_id;
        RETURN jsonb_build_object('success', true,
          'summary', 'Application stage updated to: ' || (p_parameters->>'stage'));
      END IF;

    WHEN 'create_client' THEN
      RETURN public.fi_create_client(p_firm_id, p_advisor_id, p_parameters);

    WHEN 'create_application' THEN
      RETURN public.fi_create_application(p_firm_id, p_advisor_id, p_parameters);

    WHEN 'create_client_and_application' THEN
      RETURN public.fi_create_client_and_application(p_firm_id, p_advisor_id, p_parameters);

    ELSE
      RETURN jsonb_build_object('success', false,
        'error', 'Action not yet implemented: ' || p_action_key);
  END CASE;

  RETURN jsonb_build_object('success', false, 'error', 'Execution failed');
END;
$function$;

-- ----------------------------------------------------------
-- fi_find_client
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_find_client(p_firm_id uuid, p_search text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_results jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'client_id', c.id,
    'name', c.first_name || ' ' || c.last_name,
    'email', c.email,
    'phone', c.phone,
    'city', c.city,
    'annual_income', c.annual_income,
    'status', c.status,
    'application_count', (
      SELECT COUNT(*) FROM public.applications a
      WHERE a.client_id = c.id AND a.status = 'active'
    )
  ) ORDER BY c.first_name, c.last_name)
  INTO v_results
  FROM public.clients c
  WHERE c.firm_id = p_firm_id
    AND (
      c.first_name ILIKE '%' || p_search || '%'
      OR c.last_name ILIKE '%' || p_search || '%'
      OR CONCAT(c.first_name, ' ', c.last_name) ILIKE '%' || p_search || '%'
      OR c.email ILIKE '%' || p_search || '%'
      OR c.phone ILIKE '%' || p_search || '%'
    )
  LIMIT 5;

  IF v_results IS NULL THEN
    RETURN jsonb_build_object('success', true, 'found', false,
      'message', 'No clients found matching: ' || p_search);
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'found', true,
    'count', jsonb_array_length(v_results),
    'clients', v_results,
    'summary', jsonb_array_length(v_results)::text || ' client(s) found matching "' || p_search || '"'
  );
END;
$function$;

-- ----------------------------------------------------------
-- fi_get_conversation_context
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_get_conversation_context(p_conversation_id uuid, p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE 
  v_messages jsonb;
  v_conv record;
BEGIN
  SELECT * INTO v_conv FROM public.fi_conversations WHERE id = p_conversation_id;
  
  SELECT jsonb_agg(jsonb_build_object(
    'role', role,
    'content', content,
    'intent', intent,
    'action_result', action_result,
    'created_at', created_at
  ) ORDER BY created_at)
  INTO v_messages
  FROM (
    SELECT * FROM public.fi_messages
    WHERE conversation_id = p_conversation_id
    ORDER BY created_at DESC
    LIMIT p_limit
  ) recent 
  ORDER BY created_at;

  RETURN jsonb_build_object(
    'conversation_id',           p_conversation_id,
    'context_application_id',   v_conv.context_application_id,
    'session_memory',            COALESCE(v_conv.session_memory, '{}'::jsonb),
    'session_summary',           v_conv.session_summary,
    'messages',                  COALESCE(v_messages, '[]'::jsonb),
    'message_count',             jsonb_array_length(COALESCE(v_messages, '[]'::jsonb))
  );
END;
$function$;

-- ----------------------------------------------------------
-- fi_safe_query
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_safe_query(p_sql text, p_firm_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_upper text;
  v_result jsonb;
BEGIN
  v_upper := upper(trim(p_sql));

  -- Only allow SELECT
  IF NOT (v_upper LIKE 'SELECT%') THEN
    RETURN jsonb_build_object('error', 'Only SELECT queries are allowed');
  END IF;

  -- Block dangerous keywords
  IF v_upper ~ '(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|PG_READ_FILE|PG_LS_DIR|COPY)' THEN
    RETURN jsonb_build_object('error', 'Query contains disallowed keywords');
  END IF;

  -- Must reference firm_id
  IF lower(p_sql) NOT LIKE '%firm_id%' THEN
    RETURN jsonb_build_object('error', 'Query must include firm_id filter');
  END IF;

  -- Execute and return as JSON array
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', p_sql)
  INTO v_result;

  RETURN COALESCE(v_result, '[]'::jsonb);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$function$;

-- ----------------------------------------------------------
-- fi_update_session_memory
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fi_update_session_memory(p_conversation_id uuid, p_memory_update jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.fi_conversations
  SET 
    session_memory = session_memory || p_memory_update,
    updated_at = now()
  WHERE id = p_conversation_id;
END;
$function$;

-- ----------------------------------------------------------
-- get_flow_intelligence_data
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_flow_intelligence_data(p_firm_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pipeline jsonb; v_anomalies jsonb; v_commissions jsonb;
  v_refix jsonb; v_deadlines jsonb; v_ai_insights jsonb; v_market jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_active',     COUNT(*) FILTER (WHERE status = 'active'),
    'in_draft',         COUNT(*) FILTER (WHERE workflow_stage = 'draft'),
    'submitted',        COUNT(*) FILTER (WHERE workflow_stage = 'submitted'),
    'approved',         COUNT(*) FILTER (WHERE workflow_stage IN ('approved','conditionally_approved')),
    'settled_this_month', COUNT(*) FILTER (WHERE workflow_stage = 'settled' AND updated_at >= date_trunc('month', CURRENT_DATE)),
    'total_loan_value', COALESCE(SUM(loan_amount) FILTER (WHERE status = 'active'), 0)
  ) INTO v_pipeline FROM public.applications WHERE firm_id = p_firm_id;

  SELECT jsonb_build_object(
    'total',    COUNT(*),
    'critical', COUNT(*) FILTER (WHERE severity = 'critical'),
    'high',     COUNT(*) FILTER (WHERE severity = 'high'),
    'medium',   COUNT(*) FILTER (WHERE severity = 'medium')
  ) INTO v_anomalies FROM public.anomaly_flags WHERE firm_id = p_firm_id AND status = 'open';

  SELECT jsonb_build_object(
    'expected_this_month', COALESCE(SUM(net_amount) FILTER (WHERE status = 'expected' AND settlement_date >= date_trunc('month', CURRENT_DATE)), 0),
    'received_this_month', COALESCE(SUM(net_amount) FILTER (WHERE status = 'received' AND received_date >= date_trunc('month', CURRENT_DATE)), 0),
    'clawback_at_risk',    COALESCE(SUM(gross_amount) FILTER (WHERE status = 'received' AND clawback_risk_until > CURRENT_DATE), 0),
    'overdue_count',       COUNT(*) FILTER (WHERE status = 'overdue')
  ) INTO v_commissions FROM public.commissions WHERE firm_id = p_firm_id;

  SELECT jsonb_build_object(
    'due_30_days',        COUNT(*) FILTER (WHERE (current_rate_expiry_date - CURRENT_DATE) <= 30),
    'due_60_days',        COUNT(*) FILTER (WHERE (current_rate_expiry_date - CURRENT_DATE) <= 60),
    'due_90_days',        COUNT(*) FILTER (WHERE (current_rate_expiry_date - CURRENT_DATE) <= 90),
    'total_at_risk_value', COALESCE(SUM(loan_amount) FILTER (WHERE current_rate_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90), 0)
  ) INTO v_refix FROM public.settled_loans
  WHERE firm_id = p_firm_id AND status = 'active'
    AND current_rate_type = 'fixed' AND current_rate_expiry_date IS NOT NULL;

  SELECT jsonb_agg(jsonb_build_object(
    'type',         deadline_type,
    'description',  description,
    'due_date',     deadline_date,
    'days_until',   days_remaining,
    'application_id', application_id
  ) ORDER BY deadline_date)
  INTO v_deadlines FROM public.v_critical_deadlines
  WHERE firm_id = p_firm_id AND days_remaining <= 7;

  SELECT jsonb_build_object(
    'total',      COUNT(*),
    'critical',   COUNT(*) FILTER (WHERE priority = 'critical'),
    'high',       COUNT(*) FILTER (WHERE priority = 'high'),
    'with_draft', COUNT(*) FILTER (WHERE draft_content IS NOT NULL)
  ) INTO v_ai_insights FROM public.ai_insights
  WHERE firm_id = p_firm_id AND is_actioned = false AND is_dismissed = false;

  SELECT jsonb_object_agg(rate_type, rate_percent) INTO v_market
  FROM (
    SELECT rate_type, MIN(rate_percent) as rate_percent
    FROM public.market_rates WHERE is_current = true AND owner_occupied = true
    GROUP BY rate_type ORDER BY rate_type
  ) r;

  RETURN jsonb_build_object(
    'pipeline',     COALESCE(v_pipeline,    '{}'::jsonb),
    'anomalies',    COALESCE(v_anomalies,   '{}'::jsonb),
    'commissions',  COALESCE(v_commissions, '{}'::jsonb),
    'refix_alerts', COALESCE(v_refix,       '{}'::jsonb),
    'deadlines',    COALESCE(v_deadlines,   '[]'::jsonb),
    'ai_insights',  COALESCE(v_ai_insights, '{}'::jsonb),
    'market_rates', COALESCE(v_market,      '{}'::jsonb),
    'generated_at', now()
  );
END;
$function$;

