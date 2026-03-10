import type { Note, AuditTrailEntry, CallTranscript } from '../../types';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { toSupabaseFirmId } from './clientService';
import { MOCK_NOTES, MOCK_AUDIT_TRAIL, MOCK_CALL_TRANSCRIPTS } from './mockData';

const mockApiCall = <T,>(data: T): Promise<T> => {
    return new Promise(resolve => setTimeout(() => resolve(data), 500));
}

export const noteService = {
  getNotes: async (clientId?: string, applicationId?: string): Promise<Note[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        let query = supabase
            .from('notes')
            .select('*')
            .eq('firm_id', supabaseFirmId);
        if (clientId) query = query.eq('client_id', clientId);
        if (applicationId) query = query.eq('application_id', applicationId);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        return (data || []).map(n => ({
            id: n.id,
            firmId: n.firm_id,
            clientId: n.client_id,
            applicationId: n.application_id || undefined,
            content: n.content,
            authorId: n.author_id || '',
            authorName: n.author_name || 'Unknown',
            authorAvatarUrl: `https://i.pravatar.cc/150?u=${n.author_id}`,
            createdAt: n.created_at,
        }));
    } catch (err) {
        console.error('Failed to load notes:', err);
        return [];
    }
  },

  addNote: async (content: string, clientId: string, applicationId?: string): Promise<Note> => {
    const currentFirm = authService.getCurrentFirm();
    const currentUser = authService.getCurrentUser();
    if (!currentFirm || !currentUser) throw new Error("Not logged in");
    
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const { data, error } = await supabase
        .from('notes')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: clientId,
            application_id: applicationId || null,
            content,
            author_id: currentUser.id,
            author_name: currentUser.name,
        }])
        .select()
        .single();
    if (error) throw error;
    
    return {
        id: data.id,
        firmId: data.firm_id,
        clientId: data.client_id,
        applicationId: data.application_id || undefined,
        content: data.content,
        authorId: data.author_id || '',
        authorName: data.author_name || 'Unknown',
        authorAvatarUrl: `https://i.pravatar.cc/150?u=${data.author_id}`,
        createdAt: data.created_at,
    };
  },

  getAuditTrail: (clientId?: string) => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return mockApiCall([]);
    let filtered = MOCK_AUDIT_TRAIL.filter(a => a.firmId === currentFirm!.id);
    if (clientId) filtered = filtered.filter(a => a.clientId === clientId);
    return mockApiCall(filtered);
  },

  logAuditEvent: (clientId: string, action: string, recommendationId?: string, recommendationSummary?: string) => {
    const currentFirm = authService.getCurrentFirm();
    const currentUser = authService.getCurrentUser();
    if (!currentFirm || !currentUser) return Promise.reject("Not logged in");
    const newEntry: AuditTrailEntry = {
        id: `at${Date.now()}`,
        firmId: currentFirm.id,
        clientId,
        userName: currentUser.name,
        userAvatarUrl: currentUser.avatarUrl,
        action,
        timestamp: new Date().toISOString(),
        recommendationId,
        recommendationSummary
    };
    MOCK_AUDIT_TRAIL.unshift(newEntry);
    return mockApiCall(newEntry);
  },

  getCallTranscripts: (clientId?: string) => {
      const currentFirm = authService.getCurrentFirm();
      if (!currentFirm) return mockApiCall([]);
      let filtered = MOCK_CALL_TRANSCRIPTS.filter(t => t.firmId === currentFirm!.id);
      if (clientId) filtered = filtered.filter(t => t.clientId === clientId);
      return mockApiCall(filtered);
  },
};
