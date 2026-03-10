import type { Application } from '../../types';
import { ApplicationStatus } from '../../types';
import { APPLICATION_STATUS_TO_WORKFLOW } from '../../constants';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { toSupabaseFirmId } from './clientService';
import { getMockApplicationRisk } from './mockData';

export const applicationService = {
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
