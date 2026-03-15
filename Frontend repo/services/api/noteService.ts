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
   * Fetch notes for a single application (most recent first).
   */
  getApplicationNotes: async (applicationId: string): Promise<Note[]> => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((n: Record<string, unknown>) => ({
      id: n.id as string,
      firmId: n.firm_id as string,
      clientId: n.client_id as string,
      applicationId: (n.application_id as string) || undefined,
      content: n.content as string,
      authorId: (n.author_id as string) || '',
      authorName: (n.author_name as string) || 'Unknown',
      authorAvatarUrl: `https://i.pravatar.cc/150?u=${n.author_id}`,
      createdAt: n.created_at as string,
    }));
  },

  /**
   * New createNote API – writes to Supabase notes table.
   * Requires: firm_id, client_id, content, author_name. application_id optional.
   * author_id is set to null (logged-in user is in advisors, not users).
   */
  createNote: async (params: {
    content: string;
    clientId: string;
    applicationId?: string;
    firmId?: string;
    authorName?: string;
  }): Promise<Note> => {
    const currentFirm = authService.getCurrentFirm();
    const currentUser = authService.getCurrentUser();
    const firmId = params.firmId ?? currentFirm?.id ?? null;
    const authorNameRaw = params.authorName ?? currentUser?.name ?? 'Adviser';
    const authorName = (typeof authorNameRaw === 'string' && authorNameRaw.trim()) ? authorNameRaw.trim() : 'Adviser';
    if (!firmId) throw new Error('Not logged in or firm ID missing. Provide firmId or log in with a firm.');
    if (!params.clientId) throw new Error('clientId is required.');

    const insertPayload = {
      firm_id: firmId,
      client_id: params.clientId,
      application_id: params.applicationId ?? null,
      content: params.content,
      author_id: null,
      author_name: authorName,
      author_avatar_url: currentUser?.avatarUrl ?? null,
    };
    console.log('[noteService.createNote] Insert payload (notes table):', {
      firm_id: insertPayload.firm_id,
      client_id: insertPayload.client_id,
      application_id: insertPayload.application_id,
      author_id: insertPayload.author_id,
      author_name: insertPayload.author_name,
      content_preview: insertPayload.content?.slice(0, 80) + (insertPayload.content?.length > 80 ? '...' : ''),
    });

    const { data, error } = await supabase
      .from('notes')
      .insert([insertPayload])
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
