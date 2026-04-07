import { supabase } from '../lib/supabase';

export const IncomeService = {
  async create(payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('income')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async listByApplicants(applicantIds: string[]) {
    if (applicantIds.length === 0) return [];
    const { data, error } = await supabase
      .from('income')
      .select('*, applicants(first_name,last_name)')
      .in('applicant_id', applicantIds);
    if (error) throw new Error(error.message);
    return data || [];
  },
};
