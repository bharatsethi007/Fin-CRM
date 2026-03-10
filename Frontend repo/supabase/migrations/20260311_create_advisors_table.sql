-- ============================================================
-- AdvisorFlow: Advisors / User Profiles Table
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================
-- This table stores advisor profile data, linked to Supabase Auth (auth.users).
-- Each row corresponds to one authenticated user.

CREATE TABLE IF NOT EXISTS public.advisors (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id     uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  first_name  text NOT NULL DEFAULT '',
  last_name   text NOT NULL DEFAULT '',
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'broker' CHECK (role IN ('admin', 'broker')),
  avatar_url  text,
  preferred_timezone  text DEFAULT 'Pacific/Auckland',
  start_week_on       text DEFAULT 'Monday' CHECK (start_week_on IN ('Sunday', 'Monday')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS advisors_updated_at ON public.advisors;
CREATE TRIGGER advisors_updated_at
  BEFORE UPDATE ON public.advisors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.advisors ENABLE ROW LEVEL SECURITY;

-- Advisors can read their own profile
CREATE POLICY "advisors_select_own" ON public.advisors
  FOR SELECT USING (id = auth.uid());

-- Admins can read all advisors in their firm
CREATE POLICY "admins_select_firm_advisors" ON public.advisors
  FOR SELECT USING (
    firm_id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
    AND (SELECT role FROM public.advisors WHERE id = auth.uid()) = 'admin'
  );

-- Advisors can update their own profile
CREATE POLICY "advisors_update_own" ON public.advisors
  FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- Firms table RLS (if not already set)
-- ============================================================
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisors_select_own_firm" ON public.firms
  FOR SELECT USING (
    id = (SELECT firm_id FROM public.advisors WHERE id = auth.uid())
  );

-- ============================================================
-- NOTE: You also need to add RLS to clients and applications.
-- See the next migration file for that.
-- ============================================================

-- ============================================================
-- Seed: Create test advisor accounts
-- Run AFTER creating accounts in Supabase Auth dashboard:
--   Dashboard → Authentication → Users → Add user
--   Email: bruce.wayne@wayne-enterprises.com  Password: (set a secure one)
--
-- Then paste the UUID from the Auth dashboard into the INSERT below.
-- ============================================================

-- EXAMPLE (replace the UUIDs with real ones from your Auth dashboard):
/*
INSERT INTO public.advisors (id, firm_id, first_name, last_name, email, role)
VALUES (
  'REPLACE_WITH_AUTH_USER_UUID',
  'REPLACE_WITH_FIRM_UUID_FROM_FIRMS_TABLE',
  'Bruce',
  'Wayne',
  'bruce.wayne@wayne-enterprises.com',
  'admin'
);
*/
