-- Lead pipeline Kanban: status, estimated loan on client (lead) rows, optional lost reason
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS lead_status text NOT NULL DEFAULT 'New Lead';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS estimated_loan_amount numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS lead_lost_reason text;

COMMENT ON COLUMN public.clients.lead_status IS 'Kanban: New Lead, Contacted, Meeting Scheduled, Application Started, Closed - Won, Closed - Lost';
COMMENT ON COLUMN public.clients.estimated_loan_amount IS 'Lead pipeline estimated loan (NZD)';
COMMENT ON COLUMN public.clients.lead_lost_reason IS 'Optional reason when lead_status is Closed - Lost';
