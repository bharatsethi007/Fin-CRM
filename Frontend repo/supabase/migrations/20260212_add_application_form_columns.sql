-- Add LoanApplicationForm fields to applications table
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS loan_purpose text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS property_details jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS selected_lenders text[] DEFAULT '{}';

COMMENT ON COLUMN public.applications.loan_purpose IS 'First Home Purchase, Next Home Purchase, Investment Property, Refinance, Top-up';
COMMENT ON COLUMN public.applications.property_details IS 'OneRoof/CoreLogic property data as JSON';
COMMENT ON COLUMN public.applications.selected_lenders IS 'Array of lender names selected for submission';
