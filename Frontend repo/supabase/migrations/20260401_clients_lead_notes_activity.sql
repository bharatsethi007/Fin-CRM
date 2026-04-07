-- Lead detail drawer: notes (JSON array), activity timeline, follow-up date
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS lead_notes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS lead_activity jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS next_follow_up_date date;

COMMENT ON COLUMN public.clients.lead_notes IS 'Array of {id, text, created_at, author_name?} for pipeline notes';
COMMENT ON COLUMN public.clients.lead_activity IS 'Timeline: {at, type, message} e.g. created, status_change, note';
COMMENT ON COLUMN public.clients.next_follow_up_date IS 'Broker follow-up reminder for lead pipeline';
