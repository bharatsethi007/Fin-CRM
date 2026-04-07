-- ============================================================
-- BASELINE MIGRATION: TRIGGERS FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 17
-- ============================================================

-- ----------------------------------------------------------
-- audit_trail_trigger_fn
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trail_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_action text;
  v_category text;
  v_firm_id uuid;
  v_client_id uuid;
  v_application_id uuid;
  v_user_name text;
  v_changes jsonb := '{}';
BEGIN
  -- Get current user name from session setting (set by frontend) or fall back to auth
  v_user_name := COALESCE(
    current_setting('app.current_user_name', true),
    current_setting('request.jwt.claims', true)::jsonb->>'email',
    'System'
  );

  -- Determine action
  IF TG_OP = 'INSERT' THEN v_action := 'Created ' || TG_TABLE_NAME;
  ELSIF TG_OP = 'UPDATE' THEN v_action := 'Updated ' || TG_TABLE_NAME;
  ELSIF TG_OP = 'DELETE' THEN v_action := 'Deleted ' || TG_TABLE_NAME;
  END IF;

  -- Handle each table
  IF TG_TABLE_NAME = 'applications' THEN
    v_firm_id := COALESCE(NEW.firm_id, OLD.firm_id);
    v_client_id := COALESCE(NEW.client_id, OLD.client_id);
    v_application_id := COALESCE(NEW.id, OLD.id);
    v_category := 'Application';
    IF TG_OP = 'INSERT' THEN
      v_action := 'Application created';
    ELSIF TG_OP = 'UPDATE' AND OLD.workflow_stage != NEW.workflow_stage THEN
      v_action := 'Workflow stage changed: ' || OLD.workflow_stage || ' → ' || NEW.workflow_stage;
    ELSIF TG_OP = 'UPDATE' THEN
      v_action := 'Application details updated';
    END IF;

  ELSIF TG_TABLE_NAME = 'clients' THEN
    v_firm_id := COALESCE(NEW.firm_id, OLD.firm_id);
    v_client_id := COALESCE(NEW.id, OLD.id);
    v_category := 'Profile';
    IF TG_OP = 'INSERT' THEN
      v_action := 'Client profile created';
    ELSIF TG_OP = 'UPDATE' THEN
      -- Track specific field changes
      v_action := 'Client profile updated';
      IF OLD.first_name != NEW.first_name OR OLD.last_name != NEW.last_name THEN
        v_changes := v_changes || jsonb_build_object('name', OLD.first_name || ' ' || OLD.last_name || ' → ' || NEW.first_name || ' ' || NEW.last_name);
      END IF;
      IF COALESCE(OLD.email,'') != COALESCE(NEW.email,'') THEN
        v_changes := v_changes || jsonb_build_object('email', 'changed');
      END IF;
      IF COALESCE(OLD.phone,'') != COALESCE(NEW.phone,'') THEN
        v_changes := v_changes || jsonb_build_object('phone', 'changed');
      END IF;
      IF COALESCE(OLD.residential_address,'') != COALESCE(NEW.residential_address,'') THEN
        v_changes := v_changes || jsonb_build_object('address', COALESCE(OLD.residential_address,'(none)') || ' → ' || COALESCE(NEW.residential_address,'(none)'));
      END IF;
      IF COALESCE(OLD.employment_status,'') != COALESCE(NEW.employment_status,'') THEN
        v_changes := v_changes || jsonb_build_object('employment_status', COALESCE(OLD.employment_status,'') || ' → ' || COALESCE(NEW.employment_status,''));
      END IF;
      IF COALESCE(OLD.stage,'') != COALESCE(NEW.stage,'') THEN
        v_changes := v_changes || jsonb_build_object('stage', OLD.stage || ' → ' || NEW.stage);
        v_action := 'Client stage changed: ' || COALESCE(OLD.stage,'') || ' → ' || COALESCE(NEW.stage,'');
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'applicants' THEN
    SELECT firm_id, client_id INTO v_firm_id, v_client_id FROM public.applications WHERE id = COALESCE(NEW.application_id, OLD.application_id);
    v_application_id := COALESCE(NEW.application_id, OLD.application_id);
    v_category := 'KYC';
    IF TG_OP = 'INSERT' THEN
      v_action := 'Applicant added: ' || COALESCE(NEW.first_name || ' ' || NEW.surname, 'Unknown');
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'Applicant removed: ' || COALESCE(OLD.first_name || ' ' || OLD.surname, 'Unknown');
    END IF;

  ELSIF TG_TABLE_NAME = 'documents' THEN
    v_firm_id := COALESCE(NEW.firm_id, OLD.firm_id);
    v_client_id := COALESCE(NEW.client_id, OLD.client_id);
    v_application_id := COALESCE(NEW.application_id, OLD.application_id);
    v_category := 'Document';
    IF TG_OP = 'INSERT' THEN
      v_action := 'Document uploaded: ' || COALESCE(NEW.name, 'Unknown');
      v_changes := jsonb_build_object('category', NEW.category);
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'Document deleted: ' || COALESCE(OLD.name, 'Unknown');
    END IF;

  ELSIF TG_TABLE_NAME = 'compliance_checklists' THEN
    SELECT firm_id, client_id INTO v_firm_id, v_client_id FROM public.applications WHERE id = COALESCE(NEW.application_id, OLD.application_id);
    v_application_id := COALESCE(NEW.application_id, OLD.application_id);
    v_category := 'CCCFA';
    v_action := 'Compliance checklist updated (score: ' || COALESCE(NEW.compliance_score::text, '0') || '%)';

  ELSIF TG_TABLE_NAME = 'needs_objectives' THEN
    SELECT firm_id, client_id INTO v_firm_id, v_client_id FROM public.applications WHERE id = COALESCE(NEW.application_id, OLD.application_id);
    v_application_id := COALESCE(NEW.application_id, OLD.application_id);
    v_category := 'Advice';
    v_action := 'Needs & objectives updated';

  ELSIF TG_TABLE_NAME = 'notes' THEN
    v_firm_id := COALESCE(NEW.firm_id, OLD.firm_id);
    v_client_id := COALESCE(NEW.client_id, OLD.client_id);
    v_application_id := COALESCE(NEW.application_id, OLD.application_id);
    v_category := 'Note';
    v_user_name := COALESCE(NEW.author_name, v_user_name);
    v_action := 'Note added';
  END IF;

  -- Insert audit record
  IF v_firm_id IS NOT NULL THEN
    INSERT INTO public.audit_trail (
      firm_id, client_id, application_id,
      user_name, action, action_category, action_detail
    ) VALUES (
      v_firm_id, v_client_id, v_application_id,
      v_user_name, v_action, v_category, v_changes
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ----------------------------------------------------------
-- auto_assign_reference_number
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_assign_reference_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := public.generate_reference_number(NEW.firm_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- auto_populate_condition_ids
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_populate_condition_ids()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.application_id IS NOT NULL AND NEW.firm_id IS NULL THEN
    SELECT firm_id INTO NEW.firm_id
    FROM public.applications WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- auto_populate_sp_ids
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_populate_sp_ids()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.application_id IS NOT NULL AND NEW.firm_id IS NULL THEN
    SELECT firm_id INTO NEW.firm_id
    FROM public.applications WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- auto_populate_submission_ids
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_populate_submission_ids()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.application_id IS NOT NULL AND NEW.firm_id IS NULL THEN
    SELECT firm_id INTO NEW.firm_id
    FROM public.applications WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- fire_automation_rules
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fire_automation_rules(p_trigger_type text, p_firm_id uuid, p_application_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_trigger_data jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_rule record; v_app record; v_tasks_created integer := 0;
  v_task_id uuid; v_title text; v_description text;
  v_due_date date; v_assigned_to uuid; v_already_fired boolean;
BEGIN
  IF p_application_id IS NOT NULL THEN
    SELECT a.*, c.first_name || ' ' || c.last_name as client_name, c.id as cid
    INTO v_app FROM public.applications a JOIN public.clients c ON c.id = a.client_id
    WHERE a.id = p_application_id;
  END IF;

  FOR v_rule IN SELECT * FROM public.task_automation_rules WHERE firm_id = p_firm_id AND trigger_type = p_trigger_type AND is_active = true LOOP
    IF p_application_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM public.task_automation_log WHERE rule_id = v_rule.id AND application_id = p_application_id AND task_created = true AND created_at > now() - (v_rule.dedup_window_days || ' days')::interval) INTO v_already_fired;
      IF v_already_fired THEN
        INSERT INTO public.task_automation_log (firm_id,rule_id,application_id,trigger_type,task_created,skip_reason) VALUES (p_firm_id,v_rule.id,p_application_id,p_trigger_type,false,'dedup_window');
        CONTINUE;
      END IF;
    END IF;

    v_title := COALESCE(v_rule.task_title_template,'Automated task');
    v_title := REPLACE(REPLACE(REPLACE(REPLACE(v_title,'{{client_name}}',COALESCE(v_app.client_name,'Client')),'{{lender}}',COALESCE(v_app.lender_name,'lender')),'{{days_inactive}}',COALESCE((p_trigger_data->>'days_inactive')::text,'')),'{{anomaly_title}}',COALESCE(p_trigger_data->>'anomaly_title','anomaly'));
    v_description := COALESCE(v_rule.task_description_template,'');
    v_description := REPLACE(REPLACE(v_description,'{{client_name}}',COALESCE(v_app.client_name,'Client')),'{{lender}}',COALESCE(v_app.lender_name,'lender'));
    v_due_date := CURRENT_DATE + v_rule.task_due_days_offset;
    v_assigned_to := CASE v_rule.assign_to WHEN 'application_owner' THEN COALESCE(v_app.assigned_to,(p_trigger_data->>'advisor_id')::uuid) WHEN 'specific_advisor' THEN v_rule.specific_advisor_id ELSE (p_trigger_data->>'advisor_id')::uuid END;

    INSERT INTO public.tasks (firm_id,assigned_to,application_id,client_id,created_by,title,description,priority,status,due_date,task_type,automation_rule_id,auto_generated)
    VALUES (p_firm_id,v_assigned_to,p_application_id,COALESCE(p_client_id,v_app.cid),NULL,v_title,v_description,COALESCE(v_rule.task_priority,'medium'),'pending',v_due_date,v_rule.trigger_type,v_rule.id,true) RETURNING id INTO v_task_id;

    INSERT INTO public.task_automation_log (firm_id,rule_id,task_id,application_id,client_id,trigger_type,trigger_data,task_created) VALUES (p_firm_id,v_rule.id,v_task_id,p_application_id,p_client_id,p_trigger_type,p_trigger_data,true);
    UPDATE public.task_automation_rules SET times_fired=times_fired+1,last_fired_at=now() WHERE id=v_rule.id;
    v_tasks_created := v_tasks_created + 1;
  END LOOP;
  RETURN v_tasks_created;
END;
$function$;

-- ----------------------------------------------------------
-- seed_default_automation_rules
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_automation_rules(p_firm_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.task_automation_rules (firm_id, name, description, trigger_type, trigger_conditions, task_title_template, task_description_template, task_priority, task_due_days_offset, assign_to, dedup_window_days, is_active) VALUES
    (p_firm_id,'New Application — Compliance Setup','Auto-create compliance task on new application','application_created','{}','Set up compliance — {{client_name}}','New application. Complete KYC, disclosure, needs & objectives.','high',1,'application_owner',30,true),
    (p_firm_id,'Post-Submission Follow-Up','Follow up lender after 5 days no response','application_stale','{"days_inactive":5,"workflow_stage":"submitted"}','Follow up lender — {{client_name}}','Application submitted {{days_inactive}} days ago. Contact lender BDM.','high',1,'application_owner',7,true),
    (p_firm_id,'Conditional Approval — Chase Conditions','Chase conditions after conditional approval','application_conditionally_approved','{}','Submit conditions — {{client_name}}','Conditionally approved. Collect and submit conditions to lender.','urgent',2,'application_owner',14,true),
    (p_firm_id,'Stale Draft Application','Draft with no activity for 7 days','application_stale','{"days_inactive":7,"workflow_stage":"draft"}','Follow up stale application — {{client_name}}','No activity for 7 days. Contact client to progress or archive.','medium',1,'application_owner',7,true),
    (p_firm_id,'Rate Refix — 60 Days','Rate expiring in 60 days','rate_expiry_approaching','{"days_before":60}','Rate refix review — {{client_name}}','Fixed rate expires in ~60 days. Contact client about refix options.','high',3,'application_owner',30,true),
    (p_firm_id,'Rate Refix — 30 Days (Urgent)','Rate expiring in 30 days — urgent','rate_expiry_approaching','{"days_before":30}','URGENT: Rate refix — {{client_name}}','Rate expires in 30 days. Confirm refix immediately.','urgent',1,'application_owner',14,true),
    (p_firm_id,'Critical Anomaly Detected','Create task when critical anomaly found','anomaly_detected','{"severity":"critical"}','Review critical anomaly — {{client_name}}','Critical anomaly: {{anomaly_title}}. Resolve before submitting.','urgent',1,'application_owner',3,true),
    (p_firm_id,'Weekly Pipeline Review','Every Monday — review pipeline','scheduled_weekly','{"day_of_week":1}','Weekly pipeline review','Review all active applications, deadlines, and required actions.','medium',0,'application_owner',1,true),
    (p_firm_id,'Annual Client Review','12 months after settlement','anniversary_approaching','{"months_after_settlement":11}','Annual review — {{client_name}}','12 months since settlement. Schedule review — rate, insurance, KiwiSaver.','medium',7,'application_owner',30,true),
    (p_firm_id,'Disclosure Not Signed','Disclosure unsigned after 3 days','disclosure_not_signed','{"days_since_created":3}','Chase disclosure — {{client_name}}','Disclosure not signed. Send reminder to client.','high',1,'application_owner',5,true)
  ON CONFLICT DO NOTHING;
END;
$function$;

-- ----------------------------------------------------------
-- trigger_anomaly_rules
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_anomaly_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN IF NEW.severity='critical' THEN PERFORM public.fire_automation_rules('anomaly_detected',NEW.firm_id,NEW.application_id,NULL,jsonb_build_object('severity',NEW.severity,'anomaly_title',NEW.title)); END IF; RETURN NEW; END;
$function$;

-- ----------------------------------------------------------
-- trigger_application_created_rules
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_application_created_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN PERFORM public.fire_automation_rules('application_created',NEW.firm_id,NEW.id,NEW.client_id,jsonb_build_object('advisor_id',NEW.assigned_to)); RETURN NEW; END;
$function$;

-- ----------------------------------------------------------
-- trigger_application_scanner
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_application_scanner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app_id uuid;
BEGIN
  -- Handle different tables - some have application_id, some go through applicants
  IF TG_TABLE_NAME = 'income' OR TG_TABLE_NAME = 'employment' THEN
    -- Income links through applicants
    IF TG_OP = 'DELETE' THEN
      SELECT application_id INTO v_app_id 
      FROM public.applicants WHERE id = OLD.applicant_id;
    ELSE
      SELECT application_id INTO v_app_id 
      FROM public.applicants WHERE id = NEW.applicant_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_app_id := COALESCE(OLD.application_id, NULL);
  ELSE
    v_app_id := COALESCE(NEW.application_id, NULL);
  END IF;

  -- Nothing to do if no application found
  IF v_app_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Async fire automation rules (don't block the insert)
  PERFORM public.fire_automation_rules(
    'data_changed', 
    (SELECT firm_id FROM public.applications WHERE id = v_app_id),
    v_app_id,
    NULL,
    jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP)
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- Never block the actual insert due to trigger errors
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

-- ----------------------------------------------------------
-- trigger_application_stage_rules
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_application_stage_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_trigger text;
BEGIN
  IF OLD.workflow_stage = NEW.workflow_stage THEN RETURN NEW; END IF;
  v_trigger := CASE NEW.workflow_stage WHEN 'submitted' THEN 'application_submitted' WHEN 'approved' THEN 'application_approved' WHEN 'conditionally_approved' THEN 'application_conditionally_approved' WHEN 'declined' THEN 'application_declined' WHEN 'settled' THEN 'application_settled' ELSE 'application_stage_changed' END;
  PERFORM public.fire_automation_rules(v_trigger,NEW.firm_id,NEW.id,NEW.client_id,jsonb_build_object('from_stage',OLD.workflow_stage,'to_stage',NEW.workflow_stage,'advisor_id',NEW.assigned_to));
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_application_conditions_updated_at
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_application_conditions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_insurance_referrals_updated_at
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_insurance_referrals_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_lender_submissions_updated_at
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_lender_submissions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_referrals_updated_at
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_referrals_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_sale_and_purchase_updated_at
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_sale_and_purchase_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_updated_at_column
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

