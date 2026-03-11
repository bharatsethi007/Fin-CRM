import type { Note, AuditTrailEntry, CallTranscript } from '../../types';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { MOCK_NOTES, MOCK_AUDIT_TRAIL, MOCK_CALL_TRANSCRIPTS } from './mockData';

const mockApiCall = <T,>(data: T): Promise<T> => {
  return new Promise(resolve => setTimeout(() => resolve(data), 500));
};

export const noteService = {
  getNotes: async (clientId?: string, applicationId?: string): Promise<Note[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    try {
      let query = supabase
        .from('notes')
        .select('*')
        .eq('firm_id', currentFirm.id);
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

  /**
   * New createNote API – writes to Supabase notes table.
   */
  createNote: async (params: {
    content: string;
    clientId: string;
    applicationId?: string;
  }): Promise<Note> => {
    const currentFirm = authService.getCurrentFirm();
    const currentUser = authService.getCurrentUser();
    if (!currentFirm || !currentUser) throw new Error('Not logged in');

    const { data, error } = await supabase
      .from('notes')
      .insert([{
        firm_id: currentFirm.id,
        client_id: params.clientId,
        application_id: params.applicationId || null,
        content: params.content,
        author_id: null,
        author_name: currentUser.name,
        author_avatar_url: currentUser.avatarUrl,
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

  /**
   * Update an existing note's content.
   */
  updateNote: async (id: string, content: string): Promise<void> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) throw new Error('Not logged in');

    const { error } = await supabase
      .from('notes')
      .update({ content })
      .eq('id', id)
      .eq('firm_id', currentFirm.id);

    if (error) {
      console.error('Failed to update note:', error);
      throw new Error(error.message);
    }
  },

  /**
   * Backwards-compatible alias – delegates to createNote.
   */
  addNote: async (content: string, clientId: string, applicationId?: string): Promise<Note> => {
    return noteService.createNote({ content, clientId, applicationId });
  },

  /**
   * Delete a note by id for the current firm.
   */
  deleteNote: async (id: string): Promise<void> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) throw new Error('Not logged in');

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('firm_id', currentFirm.id);

    if (error) {
      console.error('Failed to delete note:', error);
      throw new Error(error.message);
    }
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
