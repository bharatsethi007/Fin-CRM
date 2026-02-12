-- Call transcripts: logged calls (with optional client association)
CREATE TABLE public.call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  duration integer NOT NULL DEFAULT 0,
  transcript text NOT NULL,
  summary text,
  action_items jsonb DEFAULT '[]'::jsonb,
  notes text
);

CREATE INDEX idx_call_transcripts_firm_id ON public.call_transcripts(firm_id);
CREATE INDEX idx_call_transcripts_client_id ON public.call_transcripts(client_id);
CREATE INDEX idx_call_transcripts_timestamp ON public.call_transcripts(timestamp DESC);

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read call_transcripts" ON public.call_transcripts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated insert call_transcripts" ON public.call_transcripts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update call_transcripts" ON public.call_transcripts FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated delete call_transcripts" ON public.call_transcripts FOR DELETE TO anon, authenticated USING (true);
