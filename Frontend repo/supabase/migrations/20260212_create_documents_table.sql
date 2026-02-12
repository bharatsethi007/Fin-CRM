-- Documents table: client documents (ID, Financial, Other)
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('ID', 'Financial', 'Other')),
  upload_date date DEFAULT CURRENT_DATE,
  url text NOT NULL,
  expiry_date date,
  status text CHECK (status IN ('Valid', 'Expiring Soon', 'Expired')),
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_documents_firm_id ON public.documents(firm_id);
CREATE INDEX idx_documents_client_id ON public.documents(client_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read documents" ON public.documents FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated insert documents" ON public.documents FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update documents" ON public.documents FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated delete documents" ON public.documents FOR DELETE TO anon, authenticated USING (true);
