-- Add columns required by ApplicationDetailPage Liabilities tab.
-- Fixes: "Could not find the 'monthly_repayment' column of 'liabilities' in the schema cache"
-- Run in Supabase SQL Editor or via `supabase db push`.

-- Core liability fields used across types
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS lender text;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS original_limit numeric;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS current_balance numeric;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS interest_rate numeric;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS repayment_amount numeric;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS repayment_frequency text;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS repayment_type text;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS loan_term_end_date date;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS fixed_rate_expiry date;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS mortgage_type text;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS linked_asset_id uuid;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS to_be_refinanced boolean DEFAULT false;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS to_be_paid_out boolean DEFAULT false;

-- Credit card-specific fields
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS card_type text;
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS card_limit numeric;

-- Derived monthly repayment used in UI summary
ALTER TABLE public.liabilities ADD COLUMN IF NOT EXISTS monthly_repayment numeric;

