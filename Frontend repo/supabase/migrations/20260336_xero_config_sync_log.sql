-- Xero: columns used by edge functions + sync log for CommissionSettings

ALTER TABLE public.xero_config ADD COLUMN IF NOT EXISTS xero_org_name text;
ALTER TABLE public.xero_config ADD COLUMN IF NOT EXISTS xero_tenant_id text;
ALTER TABLE public.xero_config ADD COLUMN IF NOT EXISTS xero_access_token text;
ALTER TABLE public.xero_config ADD COLUMN IF NOT EXISTS xero_refresh_token text;
ALTER TABLE public.xero_config ADD COLUMN IF NOT EXISTS xero_token_expires_at timestamptz;
ALTER TABLE public.xero_config ADD COLUMN IF NOT EXISTS total_synced integer NOT NULL DEFAULT 0;
ALTER TABLE public.xero_config ADD COLUMN IF NOT EXISTS auto_sync_on_receive boolean NOT NULL DEFAULT false;

ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS lender_name text;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS xero_invoice_id text;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS xero_synced_at timestamptz;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS xero_status text;

CREATE TABLE IF NOT EXISTS public.xero_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  commission_id uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  xero_invoice_id text,
  action text,
  status text,
  error_message text,
  response_payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xero_sync_log_firm_created_idx ON public.xero_sync_log(firm_id, created_at DESC);

ALTER TABLE public.xero_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xero_sync_log_firm_select" ON public.xero_sync_log;
CREATE POLICY "xero_sync_log_firm_select" ON public.xero_sync_log
  FOR SELECT USING (
    firm_id IN (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );
