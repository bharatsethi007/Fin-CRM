-- ============================================================
-- BASELINE MIGRATION: DOCUMENT FUNCTIONS
-- ============================================================
-- Captured from production on 2026-04-07
-- Project: lfhaaqjinpbkozaoblyo
-- Function count: 13
-- ============================================================

-- ----------------------------------------------------------
-- auto_generate_checklist
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_generate_checklist()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.generate_document_checklist(NEW.id);
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- auto_populate_document_ids
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_populate_document_ids()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.application_id IS NOT NULL AND (NEW.firm_id IS NULL OR NEW.client_id IS NULL) THEN
    SELECT
      COALESCE(NEW.firm_id, a.firm_id),
      COALESCE(NEW.client_id, a.client_id)
    INTO NEW.firm_id, NEW.client_id
    FROM public.applications a
    WHERE a.id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- auto_validate_document
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_validate_document()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Run async-style by scheduling — avoid blocking the insert
  PERFORM public.validate_document(NEW.id);
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- check_akahu_duplicates
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_akahu_duplicates(p_application_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_existing_count integer;
  v_overlap_start date;
  v_overlap_end date;
  v_existing_connection record;
BEGIN
  -- Check if transactions already exist for this period
  SELECT COUNT(*) INTO v_existing_count
  FROM public.akahu_transactions
  WHERE application_id = p_application_id
    AND transaction_date BETWEEN p_period_start AND p_period_end;

  -- Check existing connection period
  SELECT sync_from_date, sync_to_date INTO v_existing_connection
  FROM public.akahu_connections
  WHERE application_id = p_application_id
    AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing_count = 0 THEN
    RETURN jsonb_build_object(
      'has_duplicates', false,
      'can_proceed', true,
      'requires_confirmation', false,
      'message', 'No existing transactions for this period.'
    );
  END IF;

  -- Calculate overlap
  IF v_existing_connection IS NOT NULL THEN
    v_overlap_start := GREATEST(p_period_start, v_existing_connection.sync_from_date);
    v_overlap_end   := LEAST(p_period_end, COALESCE(v_existing_connection.sync_to_date, CURRENT_DATE));
  END IF;

  RETURN jsonb_build_object(
    'has_duplicates', true,
    'can_proceed', true,
    'requires_confirmation', true,
    'existing_transaction_count', v_existing_count,
    'overlap_period_start', v_overlap_start,
    'overlap_period_end', v_overlap_end,
    'message', v_existing_count || ' transactions already imported for '
      || p_period_start || ' to ' || p_period_end || '. '
      || 'Re-importing will update existing records (upsert) — no true duplicates will be created, '
      || 'but any manual corrections to categorisation will be overwritten.',
    'recommendation', 'If you have manually corrected transaction categories, '
      || 'cancel and keep existing data. Otherwise proceed to refresh.'
  );
END;
$function$;

-- ----------------------------------------------------------
-- check_document_duplicates
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_document_duplicates(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_doc record;
  v_duplicates jsonb := '[]'::jsonb;
  v_hash_match record;
  v_period_overlap record;
  v_income_overlap record;
  v_expense_overlap record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- 1. EXACT FILE HASH MATCH (same file uploaded twice)
  IF v_doc.file_hash IS NOT NULL THEN
    SELECT d.id, d.file_name, d.created_at
    INTO v_hash_match
    FROM public.documents d
    WHERE d.application_id = v_doc.application_id
      AND d.file_hash = v_doc.file_hash
      AND d.id != p_document_id
    ORDER BY d.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_duplicates := v_duplicates || jsonb_build_object(
        'type', 'exact_duplicate',
        'severity', 'critical',
        'message', 'This exact file has already been uploaded.',
        'duplicate_document_id', v_hash_match.id,
        'duplicate_file_name', v_hash_match.file_name,
        'uploaded_at', v_hash_match.created_at
      );
    END IF;
  END IF;

  -- 2. OVERLAPPING DATE PERIOD (same category, overlapping dates)
  IF v_doc.period_start IS NOT NULL AND v_doc.period_end IS NOT NULL THEN
    SELECT d.id, d.file_name, d.period_start, d.period_end
    INTO v_period_overlap
    FROM public.documents d
    WHERE d.application_id = v_doc.application_id
      AND d.category = v_doc.category
      AND d.id != p_document_id
      AND d.period_start IS NOT NULL
      AND d.period_end IS NOT NULL
      -- Overlap condition: not (A ends before B starts OR B ends before A starts)
      AND NOT (d.period_end < v_doc.period_start OR d.period_start > v_doc.period_end)
    ORDER BY d.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_duplicates := v_duplicates || jsonb_build_object(
        'type', 'period_overlap',
        'severity', 'high',
        'message', 'Another ' || v_doc.category || ' already covers this period ('
          || v_period_overlap.period_start || ' to ' || v_period_overlap.period_end || ').',
        'duplicate_document_id', v_period_overlap.id,
        'duplicate_file_name', v_period_overlap.file_name,
        'overlap_from', GREATEST(v_doc.period_start, v_period_overlap.period_start),
        'overlap_to', LEAST(v_doc.period_end, v_period_overlap.period_end)
      );
    END IF;
  END IF;

  -- 3. DUPLICATE INCOME ENTRY (same applicant, same type, similar amount)
  -- Check if parsed income would duplicate existing income
  IF v_doc.category IN ('02 Financial Evidence', 'Payslip', 'payslip') THEN
    SELECT COUNT(*) as cnt
    INTO v_income_overlap
    FROM public.income i
    JOIN public.applicants a ON i.applicant_id = a.id
    WHERE a.application_id = v_doc.application_id
      AND i.parsed_from_document_id IS NOT NULL
      AND i.parsed_from_document_id != p_document_id;

    IF (v_income_overlap.cnt > 0) THEN
      v_duplicates := v_duplicates || jsonb_build_object(
        'type', 'income_already_parsed',
        'severity', 'medium',
        'message', v_income_overlap.cnt || ' income record(s) already extracted from documents. '
          || 'Parsing this document may create duplicate income entries.',
        'existing_count', v_income_overlap.cnt
      );
    END IF;
  END IF;

  -- 4. DUPLICATE EXPENSE RECORD (expense already parsed from a document)
  IF v_doc.category IN ('Bank Statement', 'bank_statement') THEN
    SELECT COUNT(*) as cnt
    INTO v_expense_overlap
    FROM public.expenses
    WHERE application_id = v_doc.application_id
      AND parsed_from_document_id IS NOT NULL
      AND parsed_from_document_id != p_document_id;

    IF (v_expense_overlap.cnt > 0) THEN
      v_duplicates := v_duplicates || jsonb_build_object(
        'type', 'expenses_already_parsed',
        'severity', 'medium',
        'message', 'Expense data has already been extracted from a bank statement. '
          || 'This parse may overwrite existing expense records.',
        'existing_count', v_expense_overlap.cnt
      );
    END IF;
  END IF;

  -- 5. AKAHU TRANSACTION OVERLAP (open banking already covers this period)
  IF v_doc.period_start IS NOT NULL AND v_doc.category IN ('Bank Statement','bank_statement') THEN
    IF EXISTS (
      SELECT 1 FROM public.akahu_connections
      WHERE application_id = v_doc.application_id
        AND status = 'active'
        AND sync_from_date <= v_doc.period_end
    ) THEN
      v_duplicates := v_duplicates || jsonb_build_object(
        'type', 'akahu_overlap',
        'severity', 'low',
        'message', 'Open banking (Akahu) is already connected for this application and '
          || 'covers this period. Parsing this statement may duplicate transaction data.',
        'recommendation', 'Consider using Akahu data instead of uploading a bank statement.'
      );
    END IF;
  END IF;

  -- Build result
  v_result := jsonb_build_object(
    'document_id', p_document_id,
    'has_duplicates', jsonb_array_length(v_duplicates) > 0,
    'duplicate_count', jsonb_array_length(v_duplicates),
    'duplicates', v_duplicates,
    'can_proceed', NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_duplicates) d
      WHERE d->>'severity' = 'critical'
    ),
    'requires_confirmation', jsonb_array_length(v_duplicates) > 0,
    'checked_at', now()
  );

  -- Update document as checked
  UPDATE public.documents 
  SET duplicate_checked = true 
  WHERE id = p_document_id;

  RETURN v_result;
END;
$function$;

-- ----------------------------------------------------------
-- generate_document_checklist
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_document_checklist(p_application_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app record;
  v_applicant record;
  v_checklist jsonb := '[]'::jsonb;
  v_item jsonb;
  v_total integer := 0;
  v_required integer := 0;
  v_result_id uuid;

  -- Profile flags
  v_has_employed boolean := false;
  v_has_self_employed boolean := false;
  v_has_rental boolean := false;
  v_is_first_home boolean := false;
  v_is_investment boolean := false;
  v_is_refinance boolean := false;
  v_has_kiwisaver boolean := false;
  v_is_nz_citizen boolean := true;
  v_applicant_count integer := 0;
  v_has_trust boolean := false;
  v_has_company boolean := false;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;

  -- Determine profile flags from applicants and application
  SELECT COUNT(*) INTO v_applicant_count FROM public.applicants WHERE application_id = p_application_id;

  SELECT COUNT(*) > 0 INTO v_has_self_employed
  FROM public.income i
  JOIN public.applicants a ON i.applicant_id = a.id
  WHERE a.application_id = p_application_id AND i.income_type IN ('self_employed', 'business');

  SELECT COUNT(*) > 0 INTO v_has_rental
  FROM public.income i
  JOIN public.applicants a ON i.applicant_id = a.id
  WHERE a.application_id = p_application_id AND i.income_type = 'rental';

  SELECT COUNT(*) > 0 INTO v_has_kiwisaver
  FROM public.assets ass
  WHERE ass.application_id = p_application_id AND ass.kiwisaver_balance > 0;

  v_is_first_home := v_app.loan_purpose ILIKE '%first home%' OR v_app.application_type = 'purchase';
  v_is_investment := v_app.loan_purpose ILIKE '%investment%';
  v_is_refinance := v_app.application_type = 'refinance';

  v_has_company := EXISTS (SELECT 1 FROM public.companies WHERE application_id = p_application_id);

  -- ===== ALWAYS REQUIRED — IDENTITY =====
  v_checklist := v_checklist || jsonb_build_object(
    'id', 'ID_PHOTO_PRIMARY', 'name', 'Primary Photo ID',
    'description', 'Current NZ driver licence or passport — must be valid',
    'category', 'ID', 'required', true,
    'reason', 'AML/CFT Act requirement for identity verification',
    'status', 'pending'
  );
  v_checklist := v_checklist || jsonb_build_object(
    'id', 'ID_PROOF_ADDRESS', 'name', 'Proof of Address',
    'description', 'Utility bill, bank statement or rates notice — dated within 3 months',
    'category', 'ID', 'required', true,
    'reason', 'AML/CFT Act requirement for address verification',
    'status', 'pending'
  );

  -- ===== EMPLOYED INCOME =====
  IF NOT v_has_self_employed THEN
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'INC_PAYSLIPS', 'name', 'Last 3 Payslips',
      'description', 'Most recent 3 payslips showing gross salary and employer name',
      'category', '02 Financial Evidence', 'required', true,
      'reason', 'CCCFA income verification requirement', 'status', 'pending'
    );
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'INC_EMPLOYMENT_LETTER', 'name', 'Employment Confirmation Letter',
      'description', 'Letter from employer confirming position, tenure and salary — if started within 12 months',
      'category', '02 Financial Evidence', 'required', false,
      'reason', 'Required if employed less than 12 months or on probation', 'status', 'pending'
    );
  END IF;

  -- ===== SELF-EMPLOYED INCOME =====
  IF v_has_self_employed THEN
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'SE_IR3_YEAR1', 'name', 'IR3 Tax Return — Most Recent Year',
      'description', 'IRD tax return for the most recent completed tax year, signed by accountant',
      'category', '02 Financial Evidence', 'required', true,
      'reason', 'Self-employed income verification — NZ lenders require 2 years', 'status', 'pending'
    );
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'SE_IR3_YEAR2', 'name', 'IR3 Tax Return — Previous Year',
      'description', 'IRD tax return for the previous tax year',
      'category', '02 Financial Evidence', 'required', true,
      'reason', 'Two years required to show income consistency', 'status', 'pending'
    );
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'SE_FINANCIALS_YEAR1', 'name', 'Financial Statements — Most Recent Year',
      'description', 'Accountant-prepared profit & loss and balance sheet — must be signed',
      'category', '02 Financial Evidence', 'required', true,
      'reason', 'Required by all major NZ lenders for self-employed borrowers', 'status', 'pending'
    );
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'SE_FINANCIALS_YEAR2', 'name', 'Financial Statements — Previous Year',
      'description', 'Previous year accountant-prepared financial statements',
      'category', '02 Financial Evidence', 'required', true,
      'reason', 'Two years required for income averaging', 'status', 'pending'
    );
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'SE_BANK_STATEMENTS', 'name', 'Business Bank Statements — 3 Months',
      'description', 'Business bank account statements for the last 3 months',
      'category', '02 Financial Evidence', 'required', true,
      'reason', 'Shows business cash flow and income consistency', 'status', 'pending'
    );
  END IF;

  -- ===== ALWAYS REQUIRED — BANK STATEMENTS =====
  v_checklist := v_checklist || jsonb_build_object(
    'id', 'BANK_STATEMENTS_3M', 'name', 'Personal Bank Statements — 3 Months',
    'description', 'All personal bank accounts — last 3 months (most lenders require 6 months)',
    'category', '02 Financial Evidence', 'required', true,
    'reason', 'CCCFA expense verification and income consistency check', 'status', 'pending'
  );

  -- ===== RENTAL INCOME =====
  IF v_has_rental THEN
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'RENTAL_APPRAISAL', 'name', 'Rental Appraisal Letter',
      'description', 'Rental appraisal from a licensed property manager — on letterhead',
      'category', '02 Financial Evidence', 'required', true,
      'reason', 'Lenders use rental appraisal to calculate rental income (typically 75%)', 'status', 'pending'
    );
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'TENANCY_AGREEMENT', 'name', 'Current Tenancy Agreement',
      'description', 'Signed tenancy agreement showing rental amount and term',
      'category', '02 Financial Evidence', 'required', false,
      'reason', 'Required if property is currently tenanted', 'status', 'pending'
    );
  END IF;

  -- ===== KIWISAVER =====
  IF v_has_kiwisaver OR v_is_first_home THEN
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'KIWISAVER_STATEMENT', 'name', 'KiwiSaver Statement',
      'description', 'Current KiwiSaver balance statement — from provider, within 3 months',
      'category', '02 Financial Evidence', 'required', true,
      'reason', 'Confirms balance available for deposit and withdrawal eligibility', 'status', 'pending'
    );
  END IF;

  -- ===== PROPERTY =====
  IF NOT v_is_refinance THEN
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'PROP_SPA', 'name', 'Sale and Purchase Agreement',
      'description', 'Signed S&P agreement with all addenda — once property found',
      'category', '03 Property Documents', 'required', true,
      'reason', 'Required by lender to assess property and confirm purchase price', 'status', 'pending'
    );
  END IF;

  IF v_is_refinance THEN
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'REF_MORTGAGE_STATEMENT', 'name', 'Current Mortgage Statement',
      'description', 'Most recent statement from existing lender showing balance and rate',
      'category', '03 Property Documents', 'required', true,
      'reason', 'Confirms existing loan details for refinance assessment', 'status', 'pending'
    );
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'REF_RATES_NOTICE', 'name', 'Council Rates Notice',
      'description', 'Current rates notice confirming property ownership and value',
      'category', '03 Property Documents', 'required', true,
      'reason', 'Confirms property ownership and current valuation', 'status', 'pending'
    );
  END IF;

  -- ===== COMPANY / TRUST =====
  IF v_has_company THEN
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'COMP_CERT_INCORPORATION', 'name', 'Certificate of Incorporation',
      'description', 'Companies Office certificate of incorporation',
      'category', '01 Fact Find', 'required', true,
      'reason', 'Required for company borrowers to confirm entity status', 'status', 'pending'
    );
    v_checklist := v_checklist || jsonb_build_object(
      'id', 'COMP_SHAREHOLDER_LIST', 'name', 'Shareholder Register',
      'description', 'Current shareholder register from Companies Office',
      'category', '01 Fact Find', 'required', true,
      'reason', 'AML/CFT beneficial ownership requirements', 'status', 'pending'
    );
  END IF;

  -- ===== COMPLIANCE =====
  v_checklist := v_checklist || jsonb_build_object(
    'id', 'COMP_DISCLOSURE', 'name', 'Disclosure Statement — Signed by Client',
    'description', 'Adviser disclosure statement provided and acknowledged by client',
    'category', '05 Compliance', 'required', true,
    'reason', 'FMC Act 2013 — mandatory before providing financial advice', 'status', 'pending'
  );

  -- Count items
  v_total := jsonb_array_length(v_checklist);
  SELECT COUNT(*) INTO v_required
  FROM jsonb_array_elements(v_checklist) AS item
  WHERE (item->>'required')::boolean = true;

  -- Insert or replace checklist
  INSERT INTO public.document_checklists (
    application_id, firm_id,
    checklist_items, total_items, required_items,
    profile_snapshot
  )
  VALUES (
    p_application_id, v_app.firm_id,
    v_checklist, v_total, v_required,
    jsonb_build_object(
      'has_self_employed', v_has_self_employed,
      'has_rental', v_has_rental,
      'is_first_home', v_is_first_home,
      'is_investment', v_is_investment,
      'is_refinance', v_is_refinance,
      'has_kiwisaver', v_has_kiwisaver,
      'has_company', v_has_company,
      'applicant_count', v_applicant_count
    )
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$function$;

-- ----------------------------------------------------------
-- save_bank_statement_income
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_bank_statement_income(p_application_id uuid, p_document_id uuid, p_firm_id uuid, p_avg_monthly_credits numeric, p_bank_name text, p_has_gambling boolean DEFAULT false, p_has_bnpl boolean DEFAULT false, p_has_dishonour boolean DEFAULT false, p_months_analysed integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_applicant_id uuid;
  v_existing_id uuid;
BEGIN
  -- Get primary applicant
  SELECT id INTO v_applicant_id
  FROM public.applicants
  WHERE application_id = p_application_id
  ORDER BY CASE applicant_type WHEN 'primary' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_applicant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No applicant found');
  END IF;

  -- Save bank statement analysis
  INSERT INTO public.bank_statement_analysis (
    application_id, document_id, firm_id,
    regular_income_monthly, analysed_at,
    has_gambling_transactions, has_buy_now_pay_later, has_dishonour_fees,
    months_analysed,
    income_trend, expense_trend, income_verification_confidence
  ) VALUES (
    p_application_id, p_document_id, p_firm_id,
    p_avg_monthly_credits, now(),
    p_has_gambling, p_has_bnpl, p_has_dishonour,
    p_months_analysed,
    'stable', 'stable', 'medium'  -- required check constraint values
  )
  ON CONFLICT (application_id, document_id)
  DO UPDATE SET
    regular_income_monthly = EXCLUDED.regular_income_monthly,
    has_gambling_transactions = EXCLUDED.has_gambling_transactions,
    has_buy_now_pay_later = EXCLUDED.has_buy_now_pay_later,
    has_dishonour_fees = EXCLUDED.has_dishonour_fees,
    months_analysed = EXCLUDED.months_analysed,
    analysed_at = now();

  -- Also create/update an income record from bank data
  SELECT id INTO v_existing_id FROM public.income
  WHERE applicant_id = v_applicant_id
    AND parsed_from_document_id = p_document_id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.income SET
      gross_salary = p_avg_monthly_credits,
      salary_frequency = 'monthly',
      annual_gross_total = p_avg_monthly_credits * 12,
      parsed_bank_name = p_bank_name,
      verified = false
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.income (
      applicant_id, income_type,
      gross_salary, salary_frequency, annual_gross_total,
      parsed_from_document_id, parsed_bank_name, verified
    ) VALUES (
      v_applicant_id, 'salary',
      p_avg_monthly_credits, 'monthly', p_avg_monthly_credits * 12,
      p_document_id, p_bank_name, false
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'applicant_id', v_applicant_id,
    'income_monthly', p_avg_monthly_credits,
    'income_annual', p_avg_monthly_credits * 12
  );
END;
$function$;

-- ----------------------------------------------------------
-- search_documents
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_documents(p_firm_id uuid, p_query_embedding vector, p_match_count integer DEFAULT 5, p_source_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, content text, metadata jsonb, source_type text, source_id uuid, client_id uuid, application_id uuid, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.content,
    de.metadata,
    de.source_type,
    de.source_id,
    de.client_id,
    de.application_id,
    1 - (de.embedding <=> p_query_embedding) AS similarity
  FROM document_embeddings de
  WHERE de.firm_id = p_firm_id
    AND (p_source_type IS NULL OR de.source_type = p_source_type)
  ORDER BY de.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$function$;

-- ----------------------------------------------------------
-- sync_document_aliases
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_document_aliases()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If file_name provided but not name, use file_name
  IF NEW.file_name IS NOT NULL AND (NEW.name IS NULL OR NEW.name = '') THEN
    NEW.name := NEW.file_name;
  END IF;
  -- Keep file_name in sync with name
  IF NEW.name IS NOT NULL THEN
    NEW.file_name := NEW.name;
  END IF;
  -- If file_url provided but not url, use file_url
  IF NEW.file_url IS NOT NULL AND (NEW.url IS NULL OR NEW.url = '') THEN
    NEW.url := NEW.file_url;
  END IF;
  -- Keep file_url in sync with url
  IF NEW.url IS NOT NULL THEN
    NEW.file_url := NEW.url;
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- trigger_document_parse_queue
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_document_parse_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Only queue financial documents linked to an application
  IF NEW.application_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.category IN ('ID', 'Identity', 'Other') THEN RETURN NEW; END IF;

  INSERT INTO public.document_parse_queue (
    document_id, application_id, firm_id,
    status,
    detected_type
  ) VALUES (
    NEW.id, NEW.application_id, NEW.firm_id,
    'pending',
    CASE
      WHEN NEW.category ILIKE '%bank%' OR NEW.file_name ILIKE '%bank%'    THEN 'bank_statement'
      WHEN NEW.category ILIKE '%payslip%' OR NEW.file_name ILIKE '%payslip%' THEN 'payslip'
      WHEN NEW.category ILIKE '%tax%' OR NEW.file_name ILIKE '%IR3%'      THEN 'tax_return'
      WHEN NEW.category ILIKE '%financial%' OR NEW.file_name ILIKE '%financial%' THEN 'accountant_financials'
      WHEN NEW.category ILIKE '%rental%'                                  THEN 'rental_statement'
      ELSE 'unknown'
    END
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- update_document_requests_updated_at
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_document_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------
-- validate_all_documents
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_all_documents(p_application_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_doc record;
  v_count integer := 0;
BEGIN
  FOR v_doc IN
    SELECT id FROM public.documents
    WHERE application_id = p_application_id
  LOOP
    PERFORM public.validate_document(v_doc.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- ----------------------------------------------------------
-- validate_document
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_document(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_doc record;
  v_app record;
  v_warnings jsonb := '[]'::jsonb;
  v_status text := 'pass';
  v_doc_age_days integer;
  v_extension text;
  v_is_image boolean;
  v_is_csv boolean;
  v_filename_lower text;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = v_doc.application_id;

  -- Derive extension from filename
  v_filename_lower := LOWER(COALESCE(v_doc.name, ''));
  v_extension := CASE
    WHEN v_filename_lower LIKE '%.pdf'  THEN 'pdf'
    WHEN v_filename_lower LIKE '%.jpg'  THEN 'jpg'
    WHEN v_filename_lower LIKE '%.jpeg' THEN 'jpeg'
    WHEN v_filename_lower LIKE '%.png'  THEN 'png'
    WHEN v_filename_lower LIKE '%.heic' THEN 'heic'
    WHEN v_filename_lower LIKE '%.webp' THEN 'webp'
    WHEN v_filename_lower LIKE '%.csv'  THEN 'csv'
    WHEN v_filename_lower LIKE '%.xls'  THEN 'xls'
    WHEN v_filename_lower LIKE '%.xlsx' THEN 'xlsx'
    WHEN v_filename_lower LIKE '%.doc'  THEN 'doc'
    WHEN v_filename_lower LIKE '%.docx' THEN 'docx'
    ELSE 'unknown'
  END;

  -- Also check file_type field if populated
  v_is_image := v_extension IN ('jpg', 'jpeg', 'png', 'heic', 'webp')
    OR COALESCE(v_doc.file_type, '') LIKE 'image/%';

  v_is_csv := v_extension IN ('csv', 'xls', 'xlsx')
    OR COALESCE(v_doc.file_type, '') LIKE '%csv%'
    OR COALESCE(v_doc.file_type, '') LIKE '%excel%'
    OR COALESCE(v_doc.file_type, '') LIKE '%spreadsheet%';

  -- ================================================================
  -- UNIVERSAL CHECKS
  -- ================================================================

  -- Generic filename
  IF v_filename_lower ~ '^(document|file|scan|image|photo|download|untitled|new|copy|img|pic|screenshot|dsc|capture)[_\-0-9\s]*\.(pdf|jpg|jpeg|png|docx?)$' THEN
    v_warnings := v_warnings || '[{"code":"GENERIC_FILENAME","severity":"warning","message":"File name appears generic. Rename to something descriptive like JohnSmith_Payslip_Mar2026.pdf so lenders and auditors can identify it easily."}]'::jsonb;
    v_status := 'warning';
  END IF;

  -- File too small (if we have size)
  IF v_doc.file_size_bytes IS NOT NULL AND v_doc.file_size_bytes < 10000 THEN
    v_warnings := v_warnings || ('[{"code":"FILE_TOO_SMALL","severity":"warning","message":"File is only ' || ROUND(v_doc.file_size_bytes / 1024.0, 0) || ' KB — this may be a blank page, thumbnail, or corrupted scan. Verify it is complete and legible."}]')::jsonb;
    v_status := 'warning';
  END IF;

  -- ================================================================
  -- IDENTITY DOCUMENTS — strict rules
  -- ================================================================
  IF v_doc.category = 'ID' THEN

    -- Images of logos/icons instead of real IDs
    IF v_is_image AND v_doc.file_size_bytes IS NOT NULL AND v_doc.file_size_bytes < 200000 THEN
      v_warnings := v_warnings || '[{"code":"ID_IMAGE_TOO_SMALL","severity":"fail","message":"Identity document uploaded as a small image file. This may be a logo, thumbnail, or icon rather than a real ID. Upload a clear photo or scanned PDF of the actual NZ driver licence or passport."}]'::jsonb;
      v_status := 'fail';
    ELSIF v_is_image THEN
      v_warnings := v_warnings || '[{"code":"ID_IS_IMAGE","severity":"warning","message":"Identity document uploaded as an image file. Some lenders require certified PDF scans of IDs. Consider converting to PDF, especially if this is a passport or driver licence photo."}]'::jsonb;
      v_status := 'warning';
    END IF;

    -- CSV/spreadsheet as ID — clearly wrong
    IF v_is_csv THEN
      v_warnings := v_warnings || '[{"code":"ID_WRONG_FORMAT","severity":"fail","message":"A spreadsheet or CSV file has been uploaded as an identity document. This is almost certainly the wrong file. Upload a scanned PDF or clear photo of the NZ driver licence or passport."}]'::jsonb;
      v_status := 'fail';
    END IF;

    -- Expiry check if date is set
    IF v_doc.document_date IS NOT NULL THEN
      v_doc_age_days := (CURRENT_DATE - v_doc.document_date)::integer;
      IF v_doc_age_days > 3650 THEN
        v_warnings := v_warnings || '[{"code":"ID_MAY_BE_EXPIRED","severity":"fail","message":"Identity document date suggests it may be expired (over 10 years old). NZ driver licences and passports expire — verify this document is currently valid before submission."}]'::jsonb;
        v_status := 'fail';
      ELSIF v_doc_age_days > 3100 THEN
        v_warnings := v_warnings || '[{"code":"ID_APPROACHING_EXPIRY","severity":"warning","message":"Identity document is approaching 10 years old. Check the expiry date — lenders require a currently valid ID."}]'::jsonb;
        v_status := 'warning';
      END IF;
    END IF;

  -- ================================================================
  -- FINANCIAL EVIDENCE — payslips, bank statements, IR3, financials
  -- ================================================================
  ELSIF v_doc.category = '02 Financial Evidence' THEN

    -- CSV as financial evidence — common mistake (exported bank statement)
    IF v_is_csv THEN
      v_warnings := v_warnings || '[{"code":"FINANCIAL_CSV","severity":"warning","message":"Spreadsheet or CSV file uploaded as financial evidence. Most NZ lenders require original PDF bank statements or payslips directly from the bank or payroll system — not exported CSV files which can be manipulated."}]'::jsonb;
      v_status := 'warning';
    END IF;

    -- Image as financial evidence
    IF v_is_image THEN
      v_warnings := v_warnings || '[{"code":"FINANCIAL_IS_IMAGE","severity":"warning","message":"Financial document uploaded as an image. Consider uploading the original PDF from your bank app or internet banking instead — images can be harder to read and some lenders will not accept them."}]'::jsonb;
      v_status := 'warning';
    END IF;

    -- Date-based checks
    IF v_doc.document_date IS NOT NULL THEN
      v_doc_age_days := (CURRENT_DATE - v_doc.document_date)::integer;

      -- Payslip
      IF v_filename_lower ~ 'payslip|pay.slip|pay slip|salary|wages' THEN
        IF v_doc_age_days > 90 THEN
          v_warnings := v_warnings || ('[{"code":"PAYSLIP_TOO_OLD","severity":"fail","message":"Payslip is ' || v_doc_age_days || ' days old. NZ lenders require payslips dated within 90 days of application. Upload a more recent payslip."}]')::jsonb;
          v_status := 'fail';
        ELSIF v_doc_age_days > 60 THEN
          v_warnings := v_warnings || ('[{"code":"PAYSLIP_AGING","severity":"warning","message":"Payslip is ' || v_doc_age_days || ' days old. Most lenders prefer payslips within 60 days. Upload a more recent one if available."}]')::jsonb;
          v_status := 'warning';
        END IF;

      -- Bank statements
      ELSIF v_filename_lower ~ 'bank|statement|anz|asb|bnz|westpac|kiwibank|sbs|heartland' THEN
        IF v_doc_age_days > 95 THEN
          v_warnings := v_warnings || ('[{"code":"BANK_STATEMENT_TOO_OLD","severity":"fail","message":"Bank statement is ' || v_doc_age_days || ' days old. NZ lenders require statements covering the most recent 3 months (90 days)."}]')::jsonb;
          v_status := 'fail';
        END IF;

      -- IR3 / Tax returns
      ELSIF v_filename_lower ~ 'ir3|tax.return|ird|inland.revenue|tax return' THEN
        IF v_doc_age_days > 730 THEN
          v_warnings := v_warnings || '[{"code":"TAX_RETURN_TOO_OLD","severity":"warning","message":"Tax return appears to be over 2 years old. NZ lenders require the two most recent income years. Ensure both years are uploaded."}]'::jsonb;
          v_status := 'warning';
        END IF;
      END IF;
    END IF;

  -- ================================================================
  -- PROPERTY DOCUMENTS
  -- ================================================================
  ELSIF v_doc.category = '03 Property Documents' THEN

    -- Image as S&P
    IF v_is_image THEN
      v_warnings := v_warnings || '[{"code":"PROPERTY_DOC_IS_IMAGE","severity":"warning","message":"Property document uploaded as an image. Sale and Purchase Agreements and valuations should be uploaded as PDF documents — lenders will not accept image files for property documentation."}]'::jsonb;
      v_status := 'warning';
    END IF;

    -- Check if S&P finance condition has expired
    IF v_filename_lower ~ 'spa|sale|purchase|agreement|contract|s.p' THEN
      IF EXISTS (
        SELECT 1 FROM public.sale_and_purchase sp
        WHERE sp.application_id = v_doc.application_id
          AND sp.finance_condition_date < CURRENT_DATE
          AND sp.finance_condition_date IS NOT NULL
      ) THEN
        v_warnings := v_warnings || '[{"code":"FINANCE_CONDITION_EXPIRED","severity":"fail","message":"The finance condition date on the Sale and Purchase Agreement has passed. Contact the vendor''s agent to extend the finance date before submitting to any lender."}]'::jsonb;
        v_status := 'fail';
      END IF;
    END IF;

    -- Valuation age
    IF v_doc.document_date IS NOT NULL AND v_filename_lower ~ 'valuation|val.report|registered.valuation' THEN
      v_doc_age_days := (CURRENT_DATE - v_doc.document_date)::integer;
      IF v_doc_age_days > 90 THEN
        v_warnings := v_warnings || ('[{"code":"VALUATION_TOO_OLD","severity":"warning","message":"Valuation report is ' || v_doc_age_days || ' days old. Most NZ lenders require valuations within 90 days. Confirm with the lender whether this valuation will be accepted."}]')::jsonb;
        v_status := 'warning';
      END IF;
    END IF;

  -- ================================================================
  -- COMPLIANCE DOCUMENTS
  -- ================================================================
  ELSIF v_doc.category = '05 Compliance' THEN

    IF v_is_image THEN
      v_warnings := v_warnings || '[{"code":"COMPLIANCE_DOC_IS_IMAGE","severity":"warning","message":"Compliance document uploaded as an image. Disclosure statements and compliance records should be PDF documents with signatures clearly visible for audit purposes."}]'::jsonb;
      v_status := 'warning';
    END IF;

  END IF;

  -- ================================================================
  -- FINAL: wrong file in wrong category catch-all
  -- ================================================================
  -- If it looks like a logo/icon (very small image, common logo names)
  IF v_is_image
    AND v_doc.file_size_bytes IS NOT NULL
    AND v_doc.file_size_bytes < 50000
    AND v_doc.category != 'ID' THEN
    v_warnings := v_warnings || '[{"code":"POSSIBLE_WRONG_FILE","severity":"fail","message":"This appears to be a very small image file (possibly a logo, icon, or screenshot). Please verify you have uploaded the correct document and not a placeholder image."}]'::jsonb;
    v_status := 'fail';
  END IF;

  -- Update the document record
  UPDATE public.documents SET
    validation_status = v_status,
    validation_warnings = v_warnings,
    validation_checked_at = now()
  WHERE id = p_document_id;

  RETURN v_warnings;
END;
$function$;

