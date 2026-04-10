import { supabase } from '../../src/lib/supabase';

/** Loads application + related rows for `analyze-client-dna` request body (never throws on missing app). */
export async function buildAnalyzeClientDnaBody(applicationId: string): Promise<{
  factFind: Record<string, unknown>;
  deal: Record<string, unknown>;
  property: unknown;
}> {
  const { data: app, error: appErr } = await supabase.from('applications').select('*').eq('id', applicationId).maybeSingle();
  if (appErr) {
    return {
      factFind: {},
      deal: { id: applicationId, lvr: 80, loan_amount: 500000 },
      property: { property_type: 'House', title_type: 'Freehold' },
    };
  }
  if (!app) {
    return {
      factFind: {},
      deal: { id: applicationId, lvr: 80, loan_amount: 500000 },
      property: { property_type: 'House', title_type: 'Freehold' },
    };
  }

  const [{ data: applicants }, { data: incomeRows }, { data: assets }, { data: liabilities }] = await Promise.all([
    supabase.from('applicants').select('*').eq('application_id', applicationId),
    supabase.from('income').select('*').eq('application_id', applicationId),
    supabase.from('assets').select('*').eq('application_id', applicationId),
    supabase.from('liabilities').select('*').eq('application_id', applicationId),
  ]);

  const row = app as Record<string, unknown>;
  const factFind = {
    income_sources: incomeRows ?? [],
    employment: applicants ?? [],
    assets: assets ?? [],
    liabilities: liabilities ?? [],
    dependents: row.dependents_count ?? row.number_of_dependents ?? 0,
    insurance: row.insurance ?? [],
    credit_history: row.credit_history ?? row.credit_notes ?? [],
  };

  const deal = {
    id: row.id,
    firm_id: row.firm_id,
    tenant_id: row.firm_id,
    loan_amount: row.loan_amount,
    lvr: row.lvr,
    loan_term: row.loan_term_years ?? row.loan_term,
    interest_only: row.interest_only,
    offset_required: row.offset_required ?? row.offset_account,
  };

  return { factFind, deal, property: row.property_details ?? {} };
}
