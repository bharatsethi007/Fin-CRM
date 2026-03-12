-- Applicants table for ApplicationDetailPage Add Applicant form.
-- Run in Supabase SQL Editor if "Failed to add applicant" or column errors occur.

CREATE TABLE IF NOT EXISTS public.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  client_id uuid,
  applicant_type text NOT NULL DEFAULT 'primary',
  title text,
  first_name text NOT NULL,
  middle_name text,
  surname text NOT NULL,
  preferred_name text,
  date_of_birth date,
  gender text,
  mobile_phone text,
  email_primary text,
  preferred_contact_method text,
  current_address text,
  current_suburb text,
  current_city text,
  current_region text,
  current_postcode text,
  current_country text DEFAULT 'New Zealand',
  residential_status text,
  current_address_since date,
  residency_status text,
  country_of_birth text,
  ird_number text,
  driver_licence_number text,
  driver_licence_version text,
  driver_licence_expiry date,
  passport_number text,
  passport_expiry_date date,
  marital_status text,
  number_of_dependants integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applicants_application_id ON public.applicants(application_id);

ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;

-- Allow select/insert/update/delete for authenticated users (scope by application's firm_id if you use firm-based RLS elsewhere).
CREATE POLICY "Applicants select" ON public.applicants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Applicants insert" ON public.applicants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Applicants update" ON public.applicants FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Applicants delete" ON public.applicants FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE public.applicants IS 'Applicants linked to an application (primary, secondary, guarantor).';
