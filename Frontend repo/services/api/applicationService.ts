import type { Application } from '../../types';
import { logger } from '../../utils/logger';
import { ApplicationStatus } from '../../types';
import { APPLICATION_STATUS_TO_WORKFLOW } from '../../constants';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { getMockApplicationRisk } from './mockData';
import { sha256HexFromFile } from '../../utils/fileHash';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateReferenceNumber(): string {
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `AF-${ymd}-${rand}`;
}

const WORKFLOW_TO_STATUS: Record<string, ApplicationStatus> = {
  draft: ApplicationStatus.Draft,
  submitted: ApplicationStatus.ApplicationSubmitted,
  conditional: ApplicationStatus.ConditionalApproval,
  conditional_approval: ApplicationStatus.ConditionalApproval,
  unconditional: ApplicationStatus.UnconditionalApproval,
  unconditional_approval: ApplicationStatus.UnconditionalApproval,
  settled: ApplicationStatus.Settled,
  declined: ApplicationStatus.Declined,
};

function mapRowToApplication(app: any, clientName: string): Application {
  const status = WORKFLOW_TO_STATUS[app.workflow_stage] || ApplicationStatus.Draft;
  return {
    id: app.id,
    firmId: app.firm_id,
    referenceNumber: app.reference_number || '',
    clientName: clientName || 'Unknown',
    clientId: app.client_id,
    advisorId: app.assigned_to || '',
    lender: app.lender_name || 'N/A',
    loanAmount: Number(app.loan_amount) || 0,
    status,
    estSettlementDate: app.settlement_date ? new Date(app.settlement_date).toISOString().slice(0, 10) : '',
    status_detail: (app.status === 'active' ? 'Active' : 'Needs Attention') as 'Active' | 'Needs Attention' | 'On Hold',
    lastUpdated: app.updated_at || app.created_at || '',
    updatedByName: '',
    lenderReferenceNumber: undefined,
    brokerId: undefined,
    financeDueDate: undefined,
    loanSecurityAddress: app.property_address || undefined,
    riskLevel:
      (app.risk_level as 'Low' | 'Medium' | 'High') ??
      (getMockApplicationRisk({
        id: app.id,
        status,
        status_detail: 'Active',
        lastUpdated: app.updated_at || app.created_at || '',
      } as Application) as 'Low' | 'Medium' | 'High'),
  };
}

export interface CreateApplicationInput {
  clientId: string;
  applicationType?: string;
  loanAmount?: number;
  depositAmount?: number;
  loanTermYears?: number;
  assignedTo?: string;
  propertyAddress?: string;
  propertyValue?: number;
  lenderName?: string;
}

/** Insert shape used by ApplicationsPage / DealTracker (explicit firm + client). */
export interface CreateApplicationFirmPayload {
  firm_id: string;
  client_id: string;
  assigned_to?: string;
  application_type?: string;
  loan_amount?: number;
  loan_purpose?: string;
}

export interface UpdateApplicationInput {
  lender?: string;
  loanAmount?: number;
  depositAmount?: number;
  loanTermYears?: number;
  estSettlementDate?: string;
  lenderReferenceNumber?: string;
  brokerId?: string;
  financeDueDate?: string;
  loanSecurityAddress?: string;
  propertyAddress?: string;
  propertyValue?: number;
  applicationType?: string;
  workflowStage?: string;
  status?: string;
}

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

async function getApplicationsMapped(): Promise<Application[]> {
  const currentFirm = authService.getCurrentFirm();
  if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) return [];

  try {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('firm_id', currentFirm.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching applications:', error);
      return [];
    }

    const rows = data || [];
    if (rows.length === 0) return [];

    const clientIds = [...new Set(rows.map((a: any) => a.client_id))];
    const { data: clientsData } = await supabase.from('clients').select('id, first_name, last_name').in('id', clientIds);
    const clientsMap = new Map(
      (clientsData || []).map((c: any) => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown']),
    );

    return rows.map((app: any) => mapRowToApplication(app, clientsMap.get(app.client_id) || 'Unknown'));
  } catch (err) {
    logger.error('Failed to load applications:', err);
    return [];
  }
}

export const applicationService = {
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------

  /** Mapped CRM list for current firm, or raw rows (+ client join) when `firmId` is passed. */
  getApplications: async (firmId?: string): Promise<Application[] | unknown[]> => {
    if (firmId !== undefined) {
      const { data, error } = await supabase
        .from('applications')
        .select('*, clients(first_name, last_name, email)')
        .eq('firm_id', firmId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return getApplicationsMapped();
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

  // -------------------------------------------------------------------------
  // CREATE
  // -------------------------------------------------------------------------

  createApplication: async (
    input: CreateApplicationInput | CreateApplicationFirmPayload,
  ): Promise<{ id: string; referenceNumber: string } | Record<string, unknown>> => {
    if ('firm_id' in input && input.firm_id) {
      const { data, error } = await supabase
        .from('applications')
        .insert([{ workflow_stage: 'draft', status: 'active', ...input }])
        .select()
        .single();
      if (error) throw error;
      return data as Record<string, unknown>;
    }

    const typed = input as CreateApplicationInput;
    const currentFirm = authService.getCurrentFirm();
    const currentUser = authService.getCurrentUser();
    if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
      throw new Error('No valid firm session. Please log in again.');
    }

    const referenceNumber = generateReferenceNumber();
    const assignedTo = typed.assignedTo || currentUser?.id || null;

    const { data, error } = await supabase
      .from('applications')
      .insert({
        firm_id: currentFirm.id,
        client_id: typed.clientId,
        assigned_to: assignedTo,
        reference_number: referenceNumber,
        application_type: typed.applicationType || 'purchase',
        loan_amount: typed.loanAmount ?? 0,
        deposit_amount: typed.depositAmount ?? 0,
        loan_term_years: typed.loanTermYears ?? null,
        workflow_stage: 'draft',
        status: 'active',
        property_address: typed.propertyAddress ?? null,
        property_value: typed.propertyValue ?? null,
        lender_name: typed.lenderName ?? null,
      })
      .select('id, reference_number')
      .single();

    if (error) {
      logger.error('Error creating application:', error);
      throw new Error(error.message);
    }
    return { id: data.id, referenceNumber: data.reference_number };
  },

  // -------------------------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------------------------

  /** Typed CRM updates (camelCase) or raw column updates (snake_case) as used by OverviewTab. */
  updateApplication: async (
    id: string,
    updates: UpdateApplicationInput | Record<string, unknown>,
  ): Promise<void | unknown> => {
    const keys = Object.keys(updates as Record<string, unknown>);
    const hasSnakeCaseColumn = keys.some((k) => k.includes('_'));

    if (hasSnakeCaseColumn) {
      const { data, error } = await supabase
        .from('applications')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
      throw new Error('No valid firm session. Please log in again.');
    }

    const typed = updates as UpdateApplicationInput;
    const dbUpdates: Record<string, unknown> = {};
    if (typed.lender !== undefined) dbUpdates.lender_name = typed.lender;
    if (typed.loanAmount !== undefined) dbUpdates.loan_amount = typed.loanAmount;
    if (typed.depositAmount !== undefined) dbUpdates.deposit_amount = typed.depositAmount;
    if (typed.loanTermYears !== undefined) dbUpdates.loan_term_years = typed.loanTermYears;
    if (typed.loanSecurityAddress !== undefined) dbUpdates.property_address = typed.loanSecurityAddress;
    if (typed.propertyAddress !== undefined) dbUpdates.property_address = typed.propertyAddress;
    if (typed.propertyValue !== undefined) dbUpdates.property_value = typed.propertyValue;
    if (typed.applicationType !== undefined) dbUpdates.application_type = typed.applicationType;
    if (typed.workflowStage !== undefined) dbUpdates.workflow_stage = typed.workflowStage;
    if (typed.status !== undefined) dbUpdates.status = typed.status;

    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase.from('applications').update(dbUpdates).eq('id', id).eq('firm_id', currentFirm.id);

    if (error) {
      logger.error('Error updating application:', error);
      throw new Error(error.message);
    }
  },

  updateWorkflowStage: async (
    id: string,
    stage: 'draft' | 'submitted' | 'conditional' | 'unconditional' | 'settled' | 'declined',
  ) => {
    const { data, error } = await supabase
      .from('applications')
      .update({ workflow_stage: stage, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateApplicationWorkflowStage: async (applicationId: string, newStatus: ApplicationStatus): Promise<void> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
      throw new Error('No valid firm session. Please log in again.');
    }

    const workflowStage = APPLICATION_STATUS_TO_WORKFLOW[newStatus];
    if (!workflowStage) throw new Error(`Invalid status: ${newStatus}`);

    const { error } = await supabase
      .from('applications')
      .update({ workflow_stage: workflowStage })
      .eq('id', applicationId)
      .eq('firm_id', currentFirm.id);

    if (error) {
      logger.error('Error updating application workflow:', error);
      throw new Error(error.message);
    }
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
      const { error } = await supabase
        .from('asset_ownership')
        .insert(ownerships.map((o) => ({ asset_id: assetId, applicant_id: o.applicant_id, ownership_percent: o.ownership_percent })));
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

  getDocuments: async (applicationId: string) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  uploadDocument: async (applicationId: string, clientId: string, firmId: string, file: File, category: string) => {
    const fileHash = await sha256HexFromFile(file);

    const fileExt = file.name.split('.').pop();
    const fileName = `${firmId}/${clientId}/${applicationId}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, file);
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);
    const { data, error } = await supabase
      .from('documents')
      .insert([
        {
          application_id: applicationId,
          client_id: clientId,
          firm_id: firmId,
          name: file.name,
          category,
          url: urlData.publicUrl,
          file_type: file.type,
          file_size_bytes: file.size,
          upload_date: new Date().toISOString().split('T')[0],
          status: 'Valid',
          file_hash: fileHash,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  deleteDocument: async (id: string, url: string) => {
    const split = url.split('/documents/');
    if (split.length > 1) {
      const path = split[1];
      await supabase.storage.from('documents').remove([path]);
    }
    const { error } = await supabase.from('documents').delete().eq('id', id);
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
