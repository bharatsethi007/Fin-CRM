import type { Application } from '../../types';
import { ApplicationStatus } from '../../types';
import { APPLICATION_STATUS_TO_WORKFLOW } from '../../constants';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { toSupabaseFirmId } from './clientService';
import { getMockApplicationRisk } from './mockData';

function generateReferenceNumber(): string {
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `AF-${ymd}-${rand}`;
}

export interface CreateApplicationInput {
    clientId: string;
    applicationType?: string;
    loanAmount?: number;
    depositAmount?: number;
    assignedTo?: string;
}

export interface UpdateApplicationInput {
    lender?: string;
    loanAmount?: number;
    estSettlementDate?: string;
    lenderReferenceNumber?: string;
    brokerId?: string;
    financeDueDate?: string;
    loanSecurityAddress?: string;
    applicationType?: string;
    depositAmount?: number;
    workflowStage?: string;
}

export const applicationService = {
  createApplication: async (input: CreateApplicationInput): Promise<{ id: string; referenceNumber: string }> => {
    const currentFirm = authService.getCurrentFirm();
    const currentAdvisor = authService.getAdvisor();
    if (!currentFirm) throw new Error('No firm found. Please log in again.');

    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const referenceNumber = generateReferenceNumber();
    const assignedTo = input.assignedTo || (currentAdvisor ? (await currentAdvisor).id : null);

    const { data, error } = await supabase
        .from('applications')
        .insert([{
            client_id: input.clientId,
            firm_id: supabaseFirmId,
            assigned_to: assignedTo,
            reference_number: referenceNumber,
            application_type: input.applicationType || 'Home Loan',
            loan_amount: input.loanAmount || 0,
            deposit_amount: input.depositAmount || 0,
            workflow_stage: 'draft',
            status: 'active',
        }])
        .select('id, reference_number')
        .single();

    if (error) throw error;
    return { id: data.id, referenceNumber: data.reference_number };
  },

  updateApplication: async (id: string, updates: UpdateApplicationInput): Promise<void> => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.lender !== undefined)              dbUpdates.lender_name = updates.lender;
    if (updates.loanAmount !== undefined)          dbUpdates.loan_amount = updates.loanAmount;
    if (updates.depositAmount !== undefined)       dbUpdates.deposit_amount = updates.depositAmount;
    if (updates.estSettlementDate !== undefined)   dbUpdates.settlement_date = updates.estSettlementDate || null;
    if (updates.lenderReferenceNumber !== undefined) dbUpdates.lender_product = updates.lenderReferenceNumber;
    if (updates.brokerId !== undefined)            dbUpdates.broker_id = updates.brokerId;
    if (updates.financeDueDate !== undefined)      dbUpdates.finance_due_date = updates.financeDueDate || null;
    if (updates.loanSecurityAddress !== undefined) dbUpdates.property_address = updates.loanSecurityAddress;
    if (updates.applicationType !== undefined)     dbUpdates.application_type = updates.applicationType;
    if (updates.workflowStage !== undefined)       dbUpdates.workflow_stage = updates.workflowStage;

    if (Object.keys(dbUpdates).length === 0) return;
    dbUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase.from('applications').update(dbUpdates).eq('id', id);
    if (error) throw error;
  },

  getApplications: async (): Promise<Application[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('applications')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const clientsData = await supabase.from('clients').select('id, first_name, last_name').in('id', (data || []).map(a => a.client_id));
        const clientsMap = new Map((clientsData.data || []).map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]));

        return (data || []).map(app => {
            const workflowToStatus: Record<string, ApplicationStatus> = {
                draft: ApplicationStatus.Draft,
                submitted: ApplicationStatus.ApplicationSubmitted,
                conditional: ApplicationStatus.ConditionalApproval,
                conditional_approval: ApplicationStatus.ConditionalApproval,
                unconditional: ApplicationStatus.UnconditionalApproval,
                unconditional_approval: ApplicationStatus.UnconditionalApproval,
                settled: ApplicationStatus.Settled,
                declined: ApplicationStatus.Declined,
            };
            const status = workflowToStatus[app.workflow_stage] || ApplicationStatus.Draft;
            const lenders = app.selected_lenders?.length ? app.selected_lenders : (app.lender_name ? [app.lender_name] : []);
            return {
                id: app.id,
                firmId: app.firm_id,
                referenceNumber: app.reference_number || '',
                clientName: clientsMap.get(app.client_id) || 'Unknown',
                clientId: app.client_id,
                advisorId: app.assigned_to || '',
                lender: lenders[0] || app.lender_name || 'N/A',
                loanAmount: Number(app.loan_amount) || 0,
                status,
                estSettlementDate: app.settlement_date ? new Date(app.settlement_date).toISOString().slice(0, 10) : '',
                status_detail: app.status === 'active' ? 'Active' : 'Needs Attention',
                lastUpdated: app.created_at || '',
                updatedByName: '', // Typically fetched from another table or context
                lenderReferenceNumber: app.lender_product || undefined,
                brokerId: undefined,
                financeDueDate: undefined,
                loanSecurityAddress: app.property_address || undefined,
                riskLevel: (app.risk_level as 'Low' | 'Medium' | 'High') || getMockApplicationRisk({
                    id: app.id,
                    status,
                    status_detail: 'Active',
                    lastUpdated: app.updated_at || app.created_at || '',
                } as Application) as 'Low' | 'Medium' | 'High',
            };
        });
    } catch (err) {
        console.error('Failed to load applications:', err);
        return [];
    }
  },
  
  updateApplicationWorkflowStage: async (applicationId: string, newStatus: ApplicationStatus): Promise<void> => {
    const workflowStage = APPLICATION_STATUS_TO_WORKFLOW[newStatus];
    if (!workflowStage) throw new Error(`Invalid status: ${newStatus}`);
    const { error } = await supabase
        .from('applications')
        .update({ workflow_stage: workflowStage })
        .eq('id', applicationId);
    if (error) throw error;
  },
};
