-- Run this in Supabase Dashboard: SQL Editor → New query → paste and Run
-- Adds columns required for full client profile (Contact + Financial Summary + Credit + Portal)

-- Financials (run each line if your table already has some of these columns)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS annual_income numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS annual_expenses numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_assets numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_liabilities numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS other_borrowings numeric DEFAULT 0;

-- Credit score
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_score integer DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_score_provider text DEFAULT '';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_score_last_updated timestamptz;

-- Client portal
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_status text DEFAULT 'Not Setup';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_last_login timestamptz;

-- Avatar
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.clients.portal_status IS 'One of: Not Setup, Pending Activation, Active';
