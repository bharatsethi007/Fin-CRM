-- Add columns required by ApplicationDetailPage Income tab (Salary, Self Employed, Rental, Other).
-- Fixes: "Could not find the 'previous_tax_year' column of 'income' in the schema cache"
-- Run in Supabase SQL Editor or via supabase db push.

-- Salary / Wages
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS salary_frequency text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS allowances numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS allowances_frequency text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS bonus numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS bonus_frequency text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS commission numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS commission_frequency text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS overtime numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS overtime_frequency text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS overtime_guaranteed boolean DEFAULT false;

-- Self Employed (Sole Trader / Company)
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS tax_year integer;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS gross_sales numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS profit_before_tax numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS depreciation numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS interest_addbacks numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS non_recurring_expenses numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS tax_paid numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS net_profit numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS previous_tax_year integer;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS prev_gross_sales numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS prev_profit_before_tax numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS prev_depreciation numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS prev_tax_paid numeric;

-- Rental Income
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS rental_property_address text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS rental_gross_monthly numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS rental_ownership_percent numeric DEFAULT 100;

-- Other Income
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS other_income_description text;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS other_income_amount numeric;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS other_income_frequency text;
