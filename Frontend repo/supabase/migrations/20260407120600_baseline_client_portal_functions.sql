-- ============================================================
-- BASELINE MIGRATION: CLIENT_PORTAL FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 5
-- ============================================================

-- ----------------------------------------------------------
-- activate_client_portal
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_client_portal(p_client_id uuid, p_firm_id uuid, p_activated_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_client record;
  v_portal_user record;
  v_portal_user_id uuid;
BEGIN
  -- Get client
  SELECT id, first_name, last_name, email, firm_id, portal_status
  INTO v_client
  FROM clients
  WHERE id = p_client_id AND firm_id = p_firm_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;
  
  IF v_client.email IS NULL OR v_client.email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client must have an email address');
  END IF;
  
  -- Check if portal user already exists
  SELECT id INTO v_portal_user
  FROM client_portal_users
  WHERE client_id = p_client_id AND firm_id = p_firm_id;
  
  IF FOUND THEN
    -- Reactivate existing portal user
    UPDATE client_portal_users
    SET is_active = true, updated_at = now()
    WHERE id = v_portal_user.id;
    
    v_portal_user_id := v_portal_user.id;
  ELSE
    -- Create new portal user with default permissions
    INSERT INTO client_portal_users (
      client_id, firm_id, email, is_active,
      can_view_application, can_upload_documents, can_send_messages,
      can_sign_documents, can_view_rates, email_notifications,
      invite_sent_at
    ) VALUES (
      p_client_id, p_firm_id, v_client.email, true,
      true, true, true, false, true, true,
      now()
    )
    RETURNING id INTO v_portal_user_id;
  END IF;
  
  -- Update client portal status
  UPDATE clients
  SET portal_status = 'Active', portal_last_login = NULL
  WHERE id = p_client_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'portal_user_id', v_portal_user_id,
    'client_name', v_client.first_name || ' ' || v_client.last_name,
    'email', v_client.email,
    'message', 'Portal activated for ' || v_client.first_name || ' ' || v_client.last_name
  );
END;
$function$;

-- ----------------------------------------------------------
-- cleanup_portal_expired
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_portal_expired()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Delete expired OTPs older than 1 hour
  DELETE FROM client_portal_otp
  WHERE expires_at < now() - interval '1 hour';
  
  -- Revoke expired sessions
  UPDATE client_portal_sessions
  SET is_revoked = true, revoked_at = now(), revoked_reason = 'expired'
  WHERE expires_at < now() AND is_revoked = false;
END;
$function$;

-- ----------------------------------------------------------
-- deactivate_client_portal
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_client_portal(p_client_id uuid, p_firm_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Deactivate portal user
  UPDATE client_portal_users
  SET is_active = false, updated_at = now()
  WHERE client_id = p_client_id AND firm_id = p_firm_id;
  
  -- Revoke all active sessions
  UPDATE client_portal_sessions
  SET is_revoked = true, revoked_at = now(), revoked_reason = 'advisor_revoked'
  WHERE client_id = p_client_id AND firm_id = p_firm_id AND is_revoked = false;
  
  -- Update client status
  UPDATE clients
  SET portal_status = 'Deactivated'
  WHERE id = p_client_id AND firm_id = p_firm_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Portal deactivated and all sessions revoked');
END;
$function$;

-- ----------------------------------------------------------
-- sync_client_credit_score
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_client_credit_score()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Mark all previous checks for this client+application as not current
  UPDATE public.credit_checks
  SET is_current = false
  WHERE client_id = NEW.client_id
    AND application_id = NEW.application_id
    AND id != NEW.id;

  -- Update the client's credit score and provider
  UPDATE public.clients
  SET
    credit_score = NEW.credit_score,
    credit_score_provider = NEW.bureau,
    credit_score_last_updated = now()
  WHERE id = NEW.client_id;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_client_reviews_updated_at
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_client_reviews_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

