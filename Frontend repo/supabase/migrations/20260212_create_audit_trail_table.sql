-- Audit trail: activity log for clients
CREATE TABLE public.audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  user_avatar_url text,
  action text NOT NULL,
  recommendation_id text,
  recommendation_summary text
);

CREATE INDEX idx_audit_trail_firm_id ON public.audit_trail(firm_id);
CREATE INDEX idx_audit_trail_client_id ON public.audit_trail(client_id);
CREATE INDEX idx_audit_trail_created_at ON public.audit_trail(created_at DESC);

ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read audit_trail" ON public.audit_trail FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated insert audit_trail" ON public.audit_trail FOR INSERT TO anon, authenticated WITH CHECK (true);
