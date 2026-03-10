import type { Client, Lead } from '../../types';
import { ClientPortalStatus } from '../../types';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { MOCK_LEADS, getMockLeadConversionProbability } from './mockData';

// Supabase firm_id is UUID; mock firms use 'firm_1' etc. Use this when calling Supabase.
const SUPABASE_FIRM_ID_FALLBACK = '6c03c55d-d9fa-43df-a0e1-a4c63df7ee5b';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toSupabaseFirmId(firmId: string | undefined): string {
    if (!firmId) return SUPABASE_FIRM_ID_FALLBACK;
    return UUID_REGEX.test(firmId) ? firmId : SUPABASE_FIRM_ID_FALLBACK;
}

const mockApiCall = <T,>(data: T): Promise<T> => {
    return new Promise(resolve => setTimeout(() => resolve(data), 500));
}

export const clientService = {
  getClients: async (): Promise<Client[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('firm_id', supabaseFirmId);
        
        if (error) {
            console.error('Error fetching clients from Supabase:', error);
            return [];
        }
        
        // Map Supabase data to your Client type
        const mappedClients: Client[] = (data || []).map(client => {
            const portalStatus = client.portal_status as string | undefined;
            const status = (portalStatus === 'Active' || portalStatus === 'Pending Activation' || portalStatus === 'Not Setup')
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
                dateOfBirth: client.date_of_birth ? new Date(client.date_of_birth).toISOString().slice(0, 10) : undefined,
                leadSource: client.lead_source || undefined,
                employmentStatus: client.employment_status || undefined,
                employerName: client.employer_name || undefined,
                notes: client.notes || undefined,
                dateAdded: client.created_at ? new Date(client.created_at).toLocaleDateString('en-NZ') : '',
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
                    lastUpdated: client.credit_score_last_updated ? new Date(client.credit_score_last_updated).toISOString().slice(0, 10) : '',
                },
                portal: {
                    status,
                    lastLogin: client.portal_last_login ? new Date(client.portal_last_login).toISOString() : undefined,
                },
            };
        });
        
        return mappedClients;
    } catch (err) {
        console.error('Failed to load clients:', err);
        return [];
    }
  },
  
  getLeads: () => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return mockApiCall([]);
    const leadsWithProbs = MOCK_LEADS
        .filter(l => l.firmId === currentFirm!.id)
        .map(lead => ({
            ...lead,
            conversionProbability: getMockLeadConversionProbability(lead)
        }));
    return mockApiCall(leadsWithProbs);
  },
};
