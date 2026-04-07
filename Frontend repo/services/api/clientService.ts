import type { Client, Lead, LeadActivityEntry, LeadNote } from '../../types';
import { logger } from '../../utils/logger';
import { ClientPortalStatus, LeadStatus } from '../../types';
import { supabase } from '../supabaseClient';
import { authService } from './authService';

function parseLeadStatusFromRow(raw: string | null | undefined): LeadStatus {
    const v = (raw || '').trim();
    const allowed = Object.values(LeadStatus) as string[];
    if (allowed.includes(v)) return v as LeadStatus;
    return LeadStatus.New;
}

function parseLeadNotes(raw: unknown): LeadNote[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((x) => {
            const o = x as Record<string, unknown>;
            const id = String(o.id || '');
            const text = String(o.text || '');
            const created_at = String(o.created_at || '');
            if (!id || !text || !created_at) return null;
            return {
                id,
                text,
                created_at,
                author_name: o.author_name != null ? String(o.author_name) : undefined,
            } as LeadNote;
        })
        .filter(Boolean) as LeadNote[];
}

function parseLeadActivity(raw: unknown): LeadActivityEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((x) => {
            const o = x as Record<string, unknown>;
            const at = String(o.at || '');
            const type = o.type as LeadActivityEntry['type'];
            const message = String(o.message || '');
            if (!at || !message) return null;
            if (type !== 'created' && type !== 'status_change' && type !== 'note') return null;
            return { at, type, message };
        })
        .filter(Boolean) as LeadActivityEntry[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toSupabaseFirmId(firmId: string | undefined): string {
    if (!firmId || !UUID_REGEX.test(firmId)) {
        throw new Error('Invalid or missing firm ID. Please log in again.');
    }
    return firmId;
}

function mapRowToClient(client: any): Client {
    const portalStatus = client.portal_status as string | undefined;
    const status = (
        portalStatus === 'Active' ||
        portalStatus === 'Pending Activation' ||
        portalStatus === 'Not Setup'
    )
        ? (portalStatus as ClientPortalStatus)
        : ClientPortalStatus.NotSetup;

    return {
        id: client.id,
        firmId: client.firm_id,
        name: `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Unnamed',
        email: client.email,
        phone: client.phone || '',
        address: client.residential_address || '',
        city: client.city || undefined,
        postalCode: client.postal_code || undefined,
        dateOfBirth: client.date_of_birth
            ? new Date(client.date_of_birth).toISOString().slice(0, 10)
            : undefined,
        leadSource: client.lead_source || undefined,
        employmentStatus: client.employment_status || undefined,
        employerName: client.employer_name || undefined,
        notes: client.notes || undefined,
        dateAdded: client.created_at
            ? new Date(client.created_at).toLocaleDateString('en-NZ')
            : '',
        createdAt: client.created_at || undefined,
        advisorId: client.assigned_to || '',
        avatarUrl: client.photo_url || `https://i.pravatar.cc/150?u=${client.id}`,
        financials: {
            income: Number(client.annual_income) || 0,
            expenses: Number(client.annual_expenses) || 0,
            assets: Number(client.total_assets) || 0,
            liabilities: Number(client.total_liabilities) || 0,
            otherBorrowings: Number(client.other_borrowings) || 0,
        },
        creditScore: {
            score: Number(client.credit_score) || 0,
            provider: client.credit_score_provider || '',
            lastUpdated: client.credit_score_last_updated
                ? new Date(client.credit_score_last_updated).toISOString().slice(0, 10)
                : '',
        },
        portal: {
            status,
            lastLogin: client.portal_last_login
                ? new Date(client.portal_last_login).toISOString()
                : undefined,
        },
    };
}

export const clientService = {

    // -------------------------------------------------------------------------
    // READ
    // -------------------------------------------------------------------------

    getClients: async (): Promise<Client[]> => {
        const currentFirm = authService.getCurrentFirm();
        if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) return [];

        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('firm_id', currentFirm.id)
                .order('created_at', { ascending: false });

            if (error) {
                logger.error('Error fetching clients:', error);
                return [];
            }
            return (data || []).map(mapRowToClient);
        } catch (err) {
            logger.error('Failed to load clients:', err);
            return [];
        }
    },

    getLeads: async (): Promise<Lead[]> => {
        const currentFirm = authService.getCurrentFirm();
        if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) return [];

        try {
            // Use * so older DBs without lead_notes / lead_activity / next_follow_up_date still work.
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('firm_id', currentFirm.id)
                .order('created_at', { ascending: false });

            if (error) {
                logger.error('Error fetching leads:', error);
                return [];
            }

            return (data || []).map((row) => ({
                id: row.id,
                firmId: row.firm_id,
                name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed',
                email: row.email,
                phone: row.phone || '',
                source: row.lead_source || 'Unknown',
                status: parseLeadStatusFromRow(row.lead_status),
                estimatedLoanAmount: Number(row.estimated_loan_amount) || 0,
                dateAdded: row.created_at
                    ? new Date(row.created_at).toLocaleDateString('en-NZ')
                    : '',
                createdAtIso: row.created_at
                    ? new Date(row.created_at).toISOString()
                    : undefined,
                avatarUrl: row.photo_url || `https://i.pravatar.cc/150?u=${row.id}`,
                lostReason: row.lead_lost_reason || undefined,
                assignedAdvisorId: row.assigned_to || undefined,
                leadNotes: parseLeadNotes(row.lead_notes),
                leadActivity: parseLeadActivity(row.lead_activity),
                nextFollowUpDate: row.next_follow_up_date
                    ? String(row.next_follow_up_date).slice(0, 10)
                    : undefined,
            }));
        } catch (err) {
            logger.error('Failed to load leads:', err);
            return [];
        }
    },

    getClientById: async (id: string): Promise<Client | null> => {
        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !data) return null;
            return mapRowToClient(data);
        } catch (err) {
            logger.error('Failed to load client:', err);
            return null;
        }
    },

    // -------------------------------------------------------------------------
    // CREATE
    // -------------------------------------------------------------------------

    createClient: async (input: {
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        leadSource?: string;
        notes?: string;
        assignedTo?: string;
        residentialAddress?: string;
        city?: string;
        postalCode?: string;
        dateOfBirth?: string;
        employmentStatus?: string;
        employerName?: string;
        annualIncome?: number;
        annualExpenses?: number;
        totalAssets?: number;
        totalLiabilities?: number;
        otherBorrowings?: number;
    }): Promise<Client> => {
        const currentFirm = authService.getCurrentFirm();
        const currentUser = authService.getCurrentUser();

        if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
            throw new Error('No valid firm session. Please log in again.');
        }

        const { data, error } = await supabase
            .from('clients')
            .insert({
                firm_id: currentFirm.id,
                first_name: input.firstName,
                last_name: input.lastName,
                email: input.email,
                phone: input.phone || null,
                lead_source: input.leadSource || null,
                notes: input.notes || null,
                assigned_to: input.assignedTo || currentUser?.id || null,
                portal_status: 'Not Setup',
                residential_address: input.residentialAddress ?? null,
                city: input.city ?? null,
                postal_code: input.postalCode ?? null,
                date_of_birth: input.dateOfBirth ?? null,
                employment_status: input.employmentStatus ?? null,
                employer_name: input.employerName ?? null,
                annual_income: input.annualIncome ?? 0,
                annual_expenses: input.annualExpenses ?? 0,
                total_assets: input.totalAssets ?? 0,
                total_liabilities: input.totalLiabilities ?? 0,
                other_borrowings: input.otherBorrowings ?? 0,
                credit_score: 0,
                credit_score_provider: '',
            })
            .select()
            .single();

        if (error) {
            logger.error('Error creating client:', error);
            throw new Error(error.message);
        }

        return mapRowToClient(data);
    },

    createLead: async (input: {
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        leadSource?: string;
        estimatedLoanAmount?: number;
    }): Promise<Lead> => {
        const currentFirm = authService.getCurrentFirm();
        const currentUser = authService.getCurrentUser();

        if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) {
            throw new Error('No valid firm session. Please log in again.');
        }

        const createdAt = new Date().toISOString();
        const initialActivity: LeadActivityEntry[] = [
            { at: createdAt, type: 'created', message: 'Lead created' },
        ];

        // Omit lead_notes / lead_activity until migration 20260401_clients_lead_notes_activity.sql is applied.
        const { data, error } = await supabase
            .from('clients')
            .insert({
                firm_id: currentFirm.id,
                first_name: input.firstName,
                last_name: input.lastName,
                email: input.email,
                phone: input.phone || null,
                lead_source: input.leadSource || null,
                assigned_to: currentUser?.id || null,
                portal_status: 'Not Setup',
                lead_status: LeadStatus.New,
                estimated_loan_amount: input.estimatedLoanAmount ?? 0,
            })
            .select()
            .single();

        if (error) {
            logger.error('Error creating lead:', error);
            throw new Error(error.message);
        }

        const parsedNotes = parseLeadNotes(data.lead_notes);
        const parsedActivity = parseLeadActivity(data.lead_activity);

        return {
            id: data.id,
            firmId: data.firm_id,
            name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
            email: data.email,
            phone: data.phone || '',
            source: data.lead_source || 'Unknown',
            status: parseLeadStatusFromRow(data.lead_status),
            estimatedLoanAmount: Number(data.estimated_loan_amount) || 0,
            dateAdded: new Date(data.created_at).toLocaleDateString('en-NZ'),
            createdAtIso: new Date(data.created_at).toISOString(),
            avatarUrl: data.photo_url || `https://i.pravatar.cc/150?u=${data.id}`,
            assignedAdvisorId: data.assigned_to || undefined,
            leadNotes: parsedNotes,
            leadActivity: parsedActivity.length > 0 ? parsedActivity : initialActivity,
            nextFollowUpDate: data.next_follow_up_date
                ? String(data.next_follow_up_date).slice(0, 10)
                : undefined,
        };
    },

    // -------------------------------------------------------------------------
    // UPDATE
    // -------------------------------------------------------------------------

    updateClient: async (id: string, updates: Partial<{
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        leadSource: string;
        notes: string;
        assignedTo: string | null;
        employmentStatus: string;
        employerName: string;
        annualIncome: number;
        annualExpenses: number;
        totalAssets: number;
        totalLiabilities: number;
        residentialAddress: string;
        city: string;
        postalCode: string;
        dateOfBirth: string;
        leadStatus: LeadStatus;
        leadLostReason: string | null;
        estimatedLoanAmount: number;
        leadNotes: LeadNote[];
        leadActivity: LeadActivityEntry[];
        nextFollowUpDate: string | null;
    }>): Promise<Client> => {
        const dbUpdates: Record<string, any> = {};
        if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName;
        if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName;
        if (updates.email !== undefined) dbUpdates.email = updates.email;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
        if (updates.leadSource !== undefined) dbUpdates.lead_source = updates.leadSource;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
        if (updates.assignedTo !== undefined) {
            dbUpdates.assigned_to = updates.assignedTo === '' ? null : updates.assignedTo;
        }
        if (updates.employmentStatus !== undefined) dbUpdates.employment_status = updates.employmentStatus;
        if (updates.employerName !== undefined) dbUpdates.employer_name = updates.employerName;
        if (updates.annualIncome !== undefined) dbUpdates.annual_income = updates.annualIncome;
        if (updates.annualExpenses !== undefined) dbUpdates.annual_expenses = updates.annualExpenses;
        if (updates.totalAssets !== undefined) dbUpdates.total_assets = updates.totalAssets;
        if (updates.totalLiabilities !== undefined) dbUpdates.total_liabilities = updates.totalLiabilities;
        if (updates.residentialAddress !== undefined) dbUpdates.residential_address = updates.residentialAddress;
        if (updates.city !== undefined) dbUpdates.city = updates.city;
        if (updates.postalCode !== undefined) dbUpdates.postal_code = updates.postalCode;
        if (updates.dateOfBirth !== undefined) dbUpdates.date_of_birth = updates.dateOfBirth;
        if (updates.leadStatus !== undefined) {
            dbUpdates.lead_status = updates.leadStatus;
            if (updates.leadStatus !== LeadStatus.ClosedLost) {
                dbUpdates.lead_lost_reason = null;
            }
        }
        if (updates.leadLostReason !== undefined) {
            dbUpdates.lead_lost_reason = updates.leadLostReason || null;
        }
        if (updates.estimatedLoanAmount !== undefined) {
            dbUpdates.estimated_loan_amount = updates.estimatedLoanAmount;
        }
        if (updates.leadNotes !== undefined) {
            dbUpdates.lead_notes = updates.leadNotes;
        }
        if (updates.leadActivity !== undefined) {
            dbUpdates.lead_activity = updates.leadActivity;
        }
        if (updates.nextFollowUpDate !== undefined) {
            dbUpdates.next_follow_up_date = updates.nextFollowUpDate || null;
        }

        const { data, error } = await supabase
            .from('clients')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Error updating client:', error);
            throw new Error(error.message);
        }

        return mapRowToClient(data);
    },

    // -------------------------------------------------------------------------
    // DELETE
    // -------------------------------------------------------------------------

    deleteClient: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error('Error deleting client:', error);
            throw new Error(error.message);
        }
    },
};
