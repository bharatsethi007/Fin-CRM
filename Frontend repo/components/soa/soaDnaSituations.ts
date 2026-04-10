/** Optional client situation tags for Client DNA analysis (Step 0). */
export const SITUATION_OPTIONS = [
  { id: 'self_employed', label: 'Self-employed <2 years', risk: 'Income verification required' },
  { id: 'contractor', label: 'Contractor income', risk: 'Lender appetite varies' },
  { id: 'recent_job_change', label: 'Job change <6 months', risk: 'Probation period' },
  { id: 'overseas_income', label: 'Overseas income', risk: 'FX shading applies' },
  { id: 'trust_structure', label: 'Trust ownership', risk: 'Guarantee required' },
  { id: 'construction', label: 'Construction loan', risk: 'Progress payments' },
  { id: 'interest_only', label: 'Interest only', risk: 'Serviceability at P&I' },
  { id: 'debt_consolidation', label: 'Debt consolidation', risk: 'Evidence of closure' },
  { id: 'first_home', label: 'First home buyer', risk: 'LVR restrictions' },
  { id: 'investment', label: 'Investment property', risk: 'Rental shading 75%' },
] as const;
