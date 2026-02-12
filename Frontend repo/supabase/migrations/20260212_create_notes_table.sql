-- Notes table: client/application notes
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  content text NOT NULL,
  author_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_avatar_url text
);

CREATE INDEX idx_notes_firm_id ON public.notes(firm_id);
CREATE INDEX idx_notes_client_id ON public.notes(client_id);
CREATE INDEX idx_notes_application_id ON public.notes(application_id);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read notes" ON public.notes FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated insert notes" ON public.notes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update notes" ON public.notes FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated delete notes" ON public.notes FOR DELETE TO anon, authenticated USING (true);
