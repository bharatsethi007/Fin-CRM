-- Add missing columns to existing public.applicants table.
-- Run this in Supabase SQL Editor if you get "Could not find the 'driver_licence_expiry' column" (or similar).
-- Then in Dashboard: Settings → API → "Reload schema cache" if needed.

ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS client_id uuid;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS middle_name text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS preferred_name text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS mobile_phone text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS email_primary text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS preferred_contact_method text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS current_address text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS current_suburb text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS current_city text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS current_region text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS current_postcode text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS current_country text DEFAULT 'New Zealand';
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS residential_status text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS current_address_since date;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS residency_status text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS country_of_birth text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS ird_number text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS driver_licence_number text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS driver_licence_version text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS driver_licence_expiry date;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS passport_number text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS passport_expiry_date date;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS marital_status text;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS number_of_dependants integer;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
