-- Add columns required by ApplicationDetailPage Assets tab.
-- Fixes: "Could not find the 'monthly_rental_income' column of 'assets' in the schema cache"
-- Run in Supabase SQL Editor or via `supabase db push`.

-- Core property fields
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS property_address text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS property_suburb text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS property_city text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS property_region text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS property_postcode text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS property_type text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS zoning text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS valuation_type text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS valuation_date date;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS monthly_rental_income numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS to_be_sold boolean DEFAULT false;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS will_become_investment boolean DEFAULT false;

-- Vehicle fields
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_type text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_make text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_model text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_year integer;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_value numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_rego text;

-- Bank account fields
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS account_type text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS account_balance numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS is_direct_debit boolean DEFAULT false;

-- KiwiSaver fields
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS kiwisaver_provider text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS kiwisaver_member_number text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS kiwisaver_balance numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS kiwisaver_contribution_rate numeric;

-- Investment fields
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS investment_description text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS investment_value numeric;

-- Other assets
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS other_description text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS other_value numeric;

