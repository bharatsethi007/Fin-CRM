-- Fix: "aggregate function calls cannot be nested" — jsonb_agg() cannot contain
-- COUNT/AVG/MODE inside jsonb_build_object at the same aggregation level.
-- Inner query: GROUP BY lender → one json row per lender; outer: jsonb_agg those rows.

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

  SELECT COALESCE(jsonb_agg(agg_rows.row_json), '[]'::jsonb)
  INTO v_lender_rates
  FROM (
    SELECT jsonb_build_object(
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
    ) AS row_json
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
    HAVING COUNT(*) >= 2
  ) agg_rows;

  PERFORM public.calculate_decline_risk(p_application_id);

  SELECT jsonb_build_object(
    'anz_risk', anz_decline_risk,
    'asb_risk', asb_decline_risk,
    'bnz_risk', bnz_decline_risk,
    'westpac_risk', westpac_decline_risk,
    'kiwibank_risk', kiwibank_risk,
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
