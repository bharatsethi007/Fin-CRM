-- After insert on documents: enqueue for parsing when linked to an application and not an ID doc.

CREATE TABLE IF NOT EXISTS public.document_parse_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  detected_type text NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS document_parse_queue_firm_id_idx ON public.document_parse_queue(firm_id);
CREATE INDEX IF NOT EXISTS document_parse_queue_status_idx ON public.document_parse_queue(status);

CREATE UNIQUE INDEX IF NOT EXISTS document_parse_queue_document_id_key
  ON public.document_parse_queue (document_id);

ALTER TABLE public.document_parse_queue ENABLE ROW LEVEL SECURITY;

-- Service role / backend: full access (adjust if you use a dedicated role)
DROP POLICY IF EXISTS "document_parse_queue_service_all" ON public.document_parse_queue;
CREATE POLICY "document_parse_queue_service_all"
  ON public.document_parse_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Advisors in the same firm can read queue rows for their firm
DROP POLICY IF EXISTS "document_parse_queue_select_firm" ON public.document_parse_queue;
CREATE POLICY "document_parse_queue_select_firm"
  ON public.document_parse_queue
  FOR SELECT
  TO authenticated
  USING (
    firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );

-- Inserts from the app (optional; trigger uses SECURITY DEFINER and bypasses RLS for inserts)
DROP POLICY IF EXISTS "document_parse_queue_insert_firm" ON public.document_parse_queue;
CREATE POLICY "document_parse_queue_insert_firm"
  ON public.document_parse_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.trigger_document_parse_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat text;
  v_file text;
  v_detected text;
BEGIN
  IF NEW.application_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.category IN ('ID', 'Identity', 'Other') THEN
    RETURN NEW;
  END IF;

  v_cat := COALESCE(NEW.category, '');
  -- file_name (current) or name (legacy documents table)
  v_file := COALESCE(
    NULLIF(to_jsonb(NEW)->>'file_name', ''),
    NULLIF(to_jsonb(NEW)->>'name', ''),
    ''
  );

  v_detected := CASE
    WHEN v_cat ILIKE '%bank%' OR v_file ILIKE '%bank%' THEN 'bank_statement'
    WHEN v_cat ILIKE '%payslip%' OR v_file ILIKE '%payslip%' THEN 'payslip'
    WHEN v_cat ILIKE '%tax%' OR v_file ILIKE '%IR3%' THEN 'tax_return'
    WHEN v_cat ILIKE '%financial%' THEN 'accountant_financials'
    ELSE 'unknown'
  END;

  INSERT INTO public.document_parse_queue (
    document_id,
    application_id,
    firm_id,
    status,
    detected_type
  ) VALUES (
    NEW.id,
    NEW.application_id,
    NEW.firm_id,
    'pending',
    v_detected
  )
  ON CONFLICT (document_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_document_insert_queue_parse ON public.documents;
CREATE TRIGGER on_document_insert_queue_parse
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_document_parse_queue();
