import type { Client, Lead } from '../../types';
import { ClientPortalStatus, LeadStatus } from '../../types';
import { supabase } from '../supabaseClient';
import { authService } from './authService';

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
                console.error('Error fetching clients:', error);
                return [];
            }
            return (data || []).map(mapRowToClient);
        } catch (err) {
            console.error('Failed to load clients:', err);
            return [];
        }
    },

    getLeads: async (): Promise<Lead[]> => {
        const currentFirm = authService.getCurrentFirm();
        if (!currentFirm || !UUID_REGEX.test(currentFirm.id)) return [];

        try {
            const { data, error } = await supabase
                .from('clients')
                .select('id, firm_id, first_name, last_name, email, phone, lead_source, created_at, photo_url')
                .eq('firm_id', currentFirm.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching leads:', error);
                return [];
            }

            return (data || []).map((row) => ({
                id: row.id,
                firmId: row.firm_id,
                name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed',
                email: row.email,
                phone: row.phone || '',
                source: row.lead_source || 'Unknown',
                status: LeadStatus.New,
                estimatedLoanAmount: 0,
                dateAdded: row.created_at
                    ? new Date(row.created_at).toLocaleDateString('en-NZ')
                    : '',
                avatarUrl: row.photo_url || `https://i.pravatar.cc/150?u=${row.id}`,
            }));
        } catch (err) {
            console.error('Failed to load leads:', err);
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
            console.error('Failed to load client:', err);
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
            console.error('Error creating client:', error);
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
            })
            .select('id, firm_id, first_name, last_name, email, phone, lead_source, created_at, photo_url')
            .single();

        if (error) {
            console.error('Error creating lead:', error);
            throw new Error(error.message);
        }

        return {
            id: data.id,
            firmId: data.firm_id,
            name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
            email: data.email,
            phone: data.phone || '',
            source: data.lead_source || 'Unknown',
            status: LeadStatus.New,
            estimatedLoanAmount: input.estimatedLoanAmount || 0,
            dateAdded: new Date(data.created_at).toLocaleDateString('en-NZ'),
            avatarUrl: data.photo_url || `https://i.pravatar.cc/150?u=${data.id}`,
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
        assignedTo: string;
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
    }>): Promise<Client> => {
        const dbUpdates: Record<string, any> = {};
        if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName;
        if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName;
        if (updates.email !== undefined) dbUpdates.email = updates.email;
        if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
        if (updates.leadSource !== undefined) dbUpdates.lead_source = updates.leadSource;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
        if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
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

        const { data, error } = await supabase
            .from('clients')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating client:', error);
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
            console.error('Error deleting client:', error);
            throw new Error(error.message);
        }
    },
};
