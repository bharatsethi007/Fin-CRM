-- ============================================================
-- BASELINE MIGRATION: AUDIT FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 1
-- ============================================================

-- ----------------------------------------------------------
-- log_audit_event
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(p_firm_id uuid, p_client_id uuid, p_application_id uuid, p_advisor_id uuid, p_user_name text, p_action text, p_action_category text DEFAULT 'General'::text, p_action_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.audit_trail (
    firm_id, client_id, application_id, advisor_id,
    user_name, action, action_category, action_detail
  ) VALUES (
    p_firm_id, p_client_id, p_application_id, p_advisor_id,
    p_user_name, p_action, p_action_category, p_action_detail
  );
END;
$function$;

