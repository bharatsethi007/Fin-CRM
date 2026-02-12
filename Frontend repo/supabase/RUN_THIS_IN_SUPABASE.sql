-- Fix: "Could not find the 'annual_expenses' column of 'clients' in the schema cache"
-- 1. Open https://supabase.com/dashboard → your project
-- 2. Go to SQL Editor → New query
-- 3. Paste this entire file and click Run

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS annual_income numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS annual_expenses numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_assets numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_liabilities numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS other_borrowings numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_score integer DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_score_provider text DEFAULT '';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_score_last_updated timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_status text DEFAULT 'Not Setup';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_last_login timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS photo_url text;
