import { supabase } from '../lib/supabase';

export const ExpensesService = {
  async get(applicationId: string) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async save(applicationId: string, expenses: Record<string, number>) {
    const { data, error } = await supabase
      .from('expenses')
      .upsert(
        { application_id: applicationId, ...expenses },
        { onConflict: 'application_id' },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};
