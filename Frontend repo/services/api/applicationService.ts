import type { Application } from '../../types';
import { ApplicationStatus } from '../../types';
import { APPLICATION_STATUS_TO_WORKFLOW } from '../../constants';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { getMockApplicationRisk } from './mockData';

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
        estSettlementDate: '',
        status_detail: (app.status === 'active' ? 'Active' : 'Needs Attention') as 'Active' | 'Needs Attention' | 'On Hold',
        lastUpdated: app.updated_at || app.created_at || '',
        updatedByName: '',
        lenderReferenceNumber: undefined,
        brokerId: undefined,
        financeDueDate: undefined,
        loanSecurityAddress: app.property_address || undefined,
        riskLevel: (app.risk_level as 'Low' | 'Medium' | 'High') ?? getMockApplicationRisk({
            id: app.id,
            status,
            status_detail: 'Active',
            lastUpdated: app.updated_at || app.created_at || '',
        } as Application) as 'Low' | 'Medium' | 'High',
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

export const applicationService = {

    // -------------------------------------------------------------------------
    // READ
    // -------------------------------------------------------------------------

    getApplications: async (): Promise<Application[]> => {
        const currentFirm = authService.getCurrentFirm();
        if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) return [];

        try {
            const { data, error } = await supabase
                .from('applications')
                .select('*')
                .eq('firm_id', currentFirm.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching applications:', error);
                return [];
            }

            const rows = data || [];
            if (rows.length === 0) return [];

            const clientIds = [...new Set(rows.map((a: any) => a.client_id))];
            const { data: clientsData } = await supabase
                .from('clients')
                .select('id, first_name, last_name')
                .in('id', clientIds);
            const clientsMap = new Map(
                (clientsData || []).map((c: any) => [
                    c.id,
                    `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
                ])
            );

            return rows.map((app: any) =>
                mapRowToApplication(app, clientsMap.get(app.client_id) || 'Unknown')
            );
        } catch (err) {
            console.error('Failed to load applications:', err);
            return [];
        }
    },

    // -------------------------------------------------------------------------
    // CREATE
    // -------------------------------------------------------------------------

    createApplication: async (input: CreateApplicationInput): Promise<{ id: string; referenceNumber: string }> => {
        const currentFirm = authService.getCurrentFirm();
        const currentUser = authService.getCurrentUser();
        if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
            throw new Error('No valid firm session. Please log in again.');
        }

        const referenceNumber = generateReferenceNumber();
        const assignedTo = input.assignedTo || currentUser?.id || null;

        const { data, error } = await supabase
            .from('applications')
            .insert({
                firm_id: currentFirm.id,
                client_id: input.clientId,
                assigned_to: assignedTo,
                reference_number: referenceNumber,
                application_type: input.applicationType || 'purchase',
                loan_amount: input.loanAmount ?? 0,
                deposit_amount: input.depositAmount ?? 0,
                loan_term_years: input.loanTermYears ?? null,
                workflow_stage: 'draft',
                status: 'active',
                property_address: input.propertyAddress ?? null,
                property_value: input.propertyValue ?? null,
                lender_name: input.lenderName ?? null,
            })
            .select('id, reference_number')
            .single();

        if (error) {
            console.error('Error creating application:', error);
            throw new Error(error.message);
        }
        return { id: data.id, referenceNumber: data.reference_number };
    },

    // -------------------------------------------------------------------------
    // UPDATE
    // -------------------------------------------------------------------------

    updateApplication: async (id: string, updates: UpdateApplicationInput): Promise<void> => {
        const currentFirm = authService.getCurrentFirm();
        if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
            throw new Error('No valid firm session. Please log in again.');
        }

        const dbUpdates: Record<string, unknown> = {};
        if (updates.lender !== undefined) dbUpdates.lender_name = updates.lender;
        if (updates.loanAmount !== undefined) dbUpdates.loan_amount = updates.loanAmount;
        if (updates.depositAmount !== undefined) dbUpdates.deposit_amount = updates.depositAmount;
        if (updates.loanTermYears !== undefined) dbUpdates.loan_term_years = updates.loanTermYears;
        if (updates.loanSecurityAddress !== undefined) dbUpdates.property_address = updates.loanSecurityAddress;
        if (updates.propertyAddress !== undefined) dbUpdates.property_address = updates.propertyAddress;
        if (updates.propertyValue !== undefined) dbUpdates.property_value = updates.propertyValue;
        if (updates.applicationType !== undefined) dbUpdates.application_type = updates.applicationType;
        if (updates.workflowStage !== undefined) dbUpdates.workflow_stage = updates.workflowStage;
        if (updates.status !== undefined) dbUpdates.status = updates.status;

        if (Object.keys(dbUpdates).length === 0) return;

        const { error } = await supabase
            .from('applications')
            .update(dbUpdates)
            .eq('id', id)
            .eq('firm_id', currentFirm.id);

        if (error) {
            console.error('Error updating application:', error);
            throw new Error(error.message);
        }
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
            console.error('Error updating application workflow:', error);
            throw new Error(error.message);
        }
    },
};
