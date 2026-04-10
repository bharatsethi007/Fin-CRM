-- Multi-property support: one row per secured / related property on an application.

CREATE TABLE public.application_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  address_full text NOT NULL,
  address_normalized text,
  is_primary boolean DEFAULT true,
  property_type text, -- house, townhouse, apartment, section
  title_number text,
  legal_description text,
  estate_type text, -- Fee Simple, Cross Lease, Unit Title, Leasehold
  land_area_m2 integer,
  floor_area_m2 integer,
  bedrooms integer,
  bathrooms integer,
  year_built integer,
  zoning text,
  capital_value integer,
  land_value integer,
  improvements_value integer,
  valuation_date date,
  last_sale_price integer,
  last_sale_date date,
  homes_estimate_low integer,
  homes_estimate_high integer,
  rental_estimate_weekly integer,
  flood_risk text,
  liquefaction_risk text,
  consents_count integer,
  unconsented_works boolean DEFAULT false,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  linz_parcel_id text,
  data_sources jsonb DEFAULT '{}'::jsonb,
  enriched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_properties_application ON public.application_properties (application_id);

-- Migrate existing data from applications table
INSERT INTO public.application_properties (application_id, address_full, is_primary)
SELECT id, property_address, true
FROM public.applications
WHERE property_address IS NOT NULL;
