import { supabase } from './supabaseClient';

export interface Applicant {
  id: string;
  application_id: string;
  client_id?: string;
  applicant_type: string;
  title?: string;
  first_name: string;
  middle_name?: string;
  surname: string;
  preferred_name?: string;
  date_of_birth?: string;
  mobile_phone?: string;
  email_primary?: string;
  current_city?: string;
  current_region?: string;
  residency_status?: string;
  [key: string]: unknown;
}

export interface Employment {
  id: string;
  applicant_id: string;
  employment_type?: string;
  employer_name?: string;
  occupation?: string;
  start_date?: string;
  end_date?: string;
  [key: string]: unknown;
}

export interface Income {
  id: string;
  applicant_id: string;
  employment_id?: string;
  income_type: string;
  gross_salary?: number;
  annual_gross_total?: number;
  [key: string]: unknown;
}

export interface Expense {
  id: string;
  application_id: string;
  household_name?: string;
  total_monthly?: number;
  [key: string]: unknown;
}

export interface Asset {
  id: string;
  application_id: string;
  asset_type: string;
  property_value?: number;
  vehicle_value?: number;
  account_balance?: number;
  kiwisaver_balance?: number;
  estimated_value?: number;
  [key: string]: unknown;
}

export interface AssetOwnership {
  id: string;
  asset_id: string;
  applicant_id: string;
  ownership_percent: number;
}

export interface Liability {
  id: string;
  application_id: string;
  liability_type: string;
  current_balance?: number;
  lender?: string;
  [key: string]: unknown;
}

export interface Company {
  id: string;
  application_id: string;
  entity_name: string;
  entity_type?: string;
  [key: string]: unknown;
}

export const applicationService = {
  getApplications: async (firmId: string) => {
    const { data, error } = await supabase
      .from('applications')
      .select('*, clients(first_name, last_name, email)')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getApplicationById: async (id: string) => {
    const { data, error } = await supabase
      .from('applications')
      .select('*, clients(first_name, last_name, email, phone)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  createApplication: async (payload: {
    firm_id: string;
    client_id: string;
    assigned_to?: string;
    application_type?: string;
    loan_amount?: number;
    loan_purpose?: string;
  }) => {
    const { data, error } = await supabase
      .from('applications')
      .insert([{ workflow_stage: 'draft', status: 'active', ...payload }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateApplication: async (id: string, payload: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from('applications')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateWorkflowStage: async (id: string, stage: 'draft' | 'submitted' | 'conditional' | 'unconditional' | 'settled' | 'declined') => {
    const { data, error } = await supabase
      .from('applications')
      .update({ workflow_stage: stage, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  getApplicants: async (applicationId: string) => {
    const { data, error } = await supabase.from('applicants').select('*').eq('application_id', applicationId).order('created_at');
    if (error) throw error;
    return data || [];
  },
  createApplicant: async (applicationId: string, payload: Partial<Applicant>) => {
    const { data, error } = await supabase.from('applicants').insert([{ application_id: applicationId, ...payload }]).select().single();
    if (error) throw error;
    return data;
  },
  updateApplicant: async (id: string, payload: Partial<Applicant>) => {
    const { data, error } = await supabase.from('applicants').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  deleteApplicant: async (id: string) => {
    const { error } = await supabase.from('applicants').delete().eq('id', id);
    if (error) throw error;
  },

  getEmployment: async (applicantId: string) => {
    const { data, error } = await supabase.from('employment').select('*').eq('applicant_id', applicantId).order('start_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  createEmployment: async (applicantId: string, payload: Partial<Employment>) => {
    const { data, error } = await supabase.from('employment').insert([{ applicant_id: applicantId, ...payload }]).select().single();
    if (error) throw error;
    return data;
  },
  updateEmployment: async (id: string, payload: Partial<Employment>) => {
    const { data, error } = await supabase.from('employment').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  deleteEmployment: async (id: string) => {
    const { error } = await supabase.from('employment').delete().eq('id', id);
    if (error) throw error;
  },

  getIncome: async (applicantId: string) => {
    const { data, error } = await supabase.from('income').select('*').eq('applicant_id', applicantId);
    if (error) throw error;
    return data || [];
  },
  createIncome: async (applicantId: string, payload: Partial<Income>) => {
    const { data, error } = await supabase.from('income').insert([{ applicant_id: applicantId, ...payload }]).select().single();
    if (error) throw error;
    return data;
  },
  updateIncome: async (id: string, payload: Partial<Income>) => {
    const { data, error } = await supabase.from('income').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  deleteIncome: async (id: string) => {
    const { error } = await supabase.from('income').delete().eq('id', id);
    if (error) throw error;
  },

  getExpenses: async (applicationId: string) => {
    const { data, error } = await supabase.from('expenses').select('*').eq('application_id', applicationId);
    if (error) throw error;
    return data || [];
  },
  createExpense: async (applicationId: string, payload: Partial<Expense>) => {
    const { data, error } = await supabase.from('expenses').insert([{ application_id: applicationId, ...payload }]).select().single();
    if (error) throw error;
    return data;
  },
  updateExpense: async (id: string, payload: Partial<Expense>) => {
    const { data, error } = await supabase.from('expenses').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  deleteExpense: async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
  },

  getAssets: async (applicationId: string) => {
    const { data, error } = await supabase.from('assets').select('*').eq('application_id', applicationId);
    if (error) throw error;
    return data || [];
  },
  createAsset: async (applicationId: string, payload: Partial<Asset>) => {
    const { data, error } = await supabase.from('assets').insert([{ application_id: applicationId, ...payload }]).select().single();
    if (error) throw error;
    return data;
  },
  updateAsset: async (id: string, payload: Partial<Asset>) => {
    const { data, error } = await supabase.from('assets').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  deleteAsset: async (id: string) => {
    const { error } = await supabase.from('assets').delete().eq('id', id);
    if (error) throw error;
  },

  getAssetOwnership: async (assetId: string) => {
    const { data, error } = await supabase.from('asset_ownership').select('*').eq('asset_id', assetId);
    if (error) throw error;
    return data || [];
  },
  setAssetOwnership: async (assetId: string, ownerships: { applicant_id: string; ownership_percent: number }[]) => {
    await supabase.from('asset_ownership').delete().eq('asset_id', assetId);
    if (ownerships.length > 0) {
      const { error } = await supabase.from('asset_ownership').insert(ownerships.map(o => ({ asset_id: assetId, applicant_id: o.applicant_id, ownership_percent: o.ownership_percent })));
      if (error) throw error;
    }
  },

  getLiabilities: async (applicationId: string) => {
    const { data, error } = await supabase.from('liabilities').select('*').eq('application_id', applicationId);
    if (error) throw error;
    return data || [];
  },
  createLiability: async (applicationId: string, payload: Partial<Liability>) => {
    const { data, error } = await supabase.from('liabilities').insert([{ application_id: applicationId, ...payload }]).select().single();
    if (error) throw error;
    return data;
  },
  updateLiability: async (id: string, payload: Partial<Liability>) => {
    const { data, error } = await supabase.from('liabilities').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  deleteLiability: async (id: string) => {
    const { error } = await supabase.from('liabilities').delete().eq('id', id);
    if (error) throw error;
  },

  getCompanies: async (applicationId: string) => {
    const { data, error } = await supabase.from('companies').select('*').eq('application_id', applicationId);
    if (error) throw error;
    return data || [];
  },
  createCompany: async (applicationId: string, payload: Partial<Company>) => {
    const { data, error } = await supabase.from('companies').insert([{ application_id: applicationId, ...payload }]).select().single();
    if (error) throw error;
    return data;
  },
  updateCompany: async (id: string, payload: Partial<Company>) => {
    const { data, error } = await supabase.from('companies').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  deleteCompany: async (id: string) => {
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) throw error;
  },
};
