-- Update documents category to support new categories
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_category_check;

ALTER TABLE public.documents ADD CONSTRAINT documents_category_check CHECK (
  category IN (
    '01 Fact Find',
    '02 Financial Evidence',
    '03 Property Documents',
    '04 Lender Application',
    '05 Compliance',
    '06 Insurance',
    '07 Settlement',
    '08 Ongoing Reviews',
    'ID',
    'Financial',
    'Other'
  )
);
