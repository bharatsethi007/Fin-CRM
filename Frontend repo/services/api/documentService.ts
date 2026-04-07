import type { Document, DocumentFolder, KYCDocument, KYCSection, Notification } from '../../types';
import { logger } from '../../utils/logger';
import { supabase } from '../supabaseClient';
import { authService } from './authService';
import { toSupabaseFirmId } from './clientService';

export const documentService = {
  getDocuments: async (clientId?: string): Promise<Document[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        let query = supabase
            .from('documents')
            .select('*')
            .eq('firm_id', supabaseFirmId);
        if (clientId) query = query.eq('client_id', clientId);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const documentsWithStatus = (data || []).map(doc => {
            let status: Document['status'] | undefined;
            if ((doc.category === 'ID' || doc.category?.includes('Compliance')) && doc.expiry_date) {
                const expiryDate = new Date(doc.expiry_date);
                const diffTime = expiryDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays < 0) status = 'Expired';
                else if (diffDays <= 30) status = 'Expiring Soon';
                else status = 'Valid';
            }
            return {
                id: doc.id,
                firmId: doc.firm_id,
                clientId: doc.client_id,
                applicationId: doc.application_id || undefined,
                name: doc.name,
                category: doc.category as Document['category'],
                folderId: doc.folder_id || undefined,
                uploadDate: doc.upload_date ? new Date(doc.upload_date).toLocaleDateString('en-NZ') : '',
                createdAt: doc.created_at,
                url: doc.url,
                expiryDate: doc.expiry_date ? new Date(doc.expiry_date).toISOString().slice(0, 10) : undefined,
                status,
                parseStatus: doc.parse_status || undefined,
                detectedType: doc.detected_type || undefined,
            };
        });
        return documentsWithStatus;
    } catch (err) {
        logger.error('Failed to load documents:', err);
        return [];
    }
  },

  addDocument: async (clientId: string, file: File, category: string, folderId?: string | null): Promise<Document> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return Promise.reject("No firm context");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const fileName = `${clientId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(fileName, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(uploadData.path);
    const publicUrl = urlData.publicUrl;

    const { data: docData, error: insertError } = await supabase
        .from('documents')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: clientId,
            name: file.name,
            category,
            url: publicUrl,
            file_type: file.type,
            file_size_bytes: file.size,
            upload_date: new Date().toISOString().slice(0, 10),
            folder_id: folderId || null,
        }])
        .select()
        .single();
    if (insertError) throw insertError;

    return {
        id: docData.id,
        firmId: docData.firm_id,
        clientId: docData.client_id,
        name: docData.name,
        category: docData.category as Document['category'],
        folderId: docData.folder_id || undefined,
        uploadDate: docData.upload_date ? new Date(docData.upload_date).toLocaleDateString('en-NZ') : '',
        createdAt: docData.created_at,
        url: docData.url,
    };
  },

  updateDocument: async (documentId: string, updates: { name?: string; category?: string; expiryDate?: string | null; reminderDaysBefore?: number | null }): Promise<void> => {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.expiryDate !== undefined) payload.expiry_date = updates.expiryDate;
    if (updates.reminderDaysBefore !== undefined) payload.reminder_days_before = updates.reminderDaysBefore;
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase.from('documents').update(payload).eq('id', documentId);
    if (error) throw error;
  },

  deleteDocument: async (documentId: string): Promise<void> => {
    const { error } = await supabase.from('documents').delete().eq('id', documentId);
    if (error) throw error;
  },

  renameFolder: async (folderId: string, name: string): Promise<void> => {
    const { error } = await supabase.from('document_folders').update({ name }).eq('id', folderId);
    if (error) throw error;
  },

  deleteFolder: async (folderId: string): Promise<void> => {
    const { error } = await supabase.from('documents').update({ folder_id: null }).eq('folder_id', folderId);
    if (error) throw error;
    const { error: delError } = await supabase.from('document_folders').delete().eq('id', folderId);
    if (delError) throw delError;
  },

  getFolders: async (clientId: string): Promise<DocumentFolder[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('document_folders')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .eq('client_id', clientId)
            .order('name');
        if (error) throw error;
        return (data || []).map(f => ({
            id: f.id,
            firmId: f.firm_id,
            clientId: f.client_id,
            name: f.name,
        }));
    } catch (err) {
        logger.error('Failed to load folders:', err);
        return [];
    }
  },

  createFolder: async (clientId: string, name: string): Promise<DocumentFolder> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return Promise.reject("No firm context");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const { data, error } = await supabase
        .from('document_folders')
        .insert([{ firm_id: supabaseFirmId, client_id: clientId, name }])
        .select()
        .single();
    if (error) throw error;
    return { id: data.id, firmId: data.firm_id, clientId: data.client_id, name: data.name };
  },

  moveDocumentsToFolder: async (documentIds: string[], folderId: string | null): Promise<void> => {
    if (documentIds.length === 0) return;
    const { error } = await supabase
        .from('documents')
        .update({ folder_id: folderId })
        .in('id', documentIds);
    if (error) throw error;
  },

  getKycDocuments: async (clientId: string): Promise<KYCDocument[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .eq('client_id', clientId)
            .not('kyc_section', 'is', null)
            .order('created_at', { ascending: false });
        if (error) throw error;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return (data || []).map(doc => {
            let status: KYCDocument['status'];
            if (doc.expiry_date) {
                const expiryDate = new Date(doc.expiry_date);
                const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) status = 'Expired';
                else if (diffDays <= 30) status = 'Expiring Soon';
                else status = 'Valid';
            } else status = undefined;
            return {
                id: doc.id,
                firmId: doc.firm_id,
                clientId: doc.client_id,
                name: doc.name,
                url: doc.url,
                kycSection: doc.kyc_section as KYCSection,
                expiryDate: doc.expiry_date ? new Date(doc.expiry_date).toISOString().slice(0, 10) : undefined,
                status,
                reminderDaysBefore: doc.reminder_days_before ?? undefined,
                createdAt: doc.created_at,
            };
        });
    } catch (err) {
        logger.error('Failed to load KYC documents:', err);
        return [];
    }
  },

  addKycDocument: async (clientId: string, file: File, kycSection: KYCSection, expiryDate?: string | null, reminderDaysBefore?: number | null): Promise<KYCDocument> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return Promise.reject("No firm context");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const fileName = `${clientId}/kyc/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(fileName, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(uploadData.path);
    const publicUrl = urlData.publicUrl;

    const { data: docData, error: insertError } = await supabase
        .from('documents')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: clientId,
            name: file.name,
            category: 'ID',
            url: publicUrl,
            file_type: file.type,
            file_size_bytes: file.size,
            upload_date: new Date().toISOString().slice(0, 10),
            kyc_section: kycSection,
            expiry_date: expiryDate || null,
            reminder_days_before: reminderDaysBefore ?? null,
        }])
        .select()
        .single();
    if (insertError) throw insertError;

    if (reminderDaysBefore && expiryDate) {
        const expiry = new Date(expiryDate);
        expiry.setDate(expiry.getDate() - reminderDaysBefore);
        const reminderDate = expiry.toISOString().slice(0, 10);
        await supabase.from('notifications').insert([{
            firm_id: supabaseFirmId,
            document_id: docData.id,
            client_id: clientId,
            type: 'kyc_expiry_reminder',
            title: 'KYC document expiring soon',
            message: `${file.name} expires on ${expiryDate}. Reminder set for ${reminderDate}.`,
            due_date: expiryDate,
            reminder_date: reminderDate,
        }]);
    }

    return {
        id: docData.id,
        firmId: docData.firm_id,
        clientId: docData.client_id,
        name: docData.name,
        url: docData.url,
        kycSection: docData.kyc_section as KYCSection,
        expiryDate: docData.expiry_date ? new Date(docData.expiry_date).toISOString().slice(0, 10) : undefined,
        reminderDaysBefore: docData.reminder_days_before ?? undefined,
        createdAt: docData.created_at,
    };
  },

  updateKycDocument: async (documentId: string, updates: { expiryDate?: string | null; reminderDaysBefore?: number | null }): Promise<void> => {
    const payload: Record<string, unknown> = {};
    if (updates.expiryDate !== undefined) payload.expiry_date = updates.expiryDate;
    if (updates.reminderDaysBefore !== undefined) payload.reminder_days_before = updates.reminderDaysBefore;
    if (Object.keys(payload).length === 0) return;
    const { data: doc, error } = await supabase.from('documents').update(payload).eq('id', documentId).select('client_id, name').single();
    if (error) throw error;

    if (updates.reminderDaysBefore !== undefined && updates.reminderDaysBefore > 0 && updates.expiryDate) {
        await supabase.from('notifications').delete().eq('document_id', documentId).eq('type', 'kyc_expiry_reminder');
        const currentFirm = authService.getCurrentFirm();
        const supabaseFirmId = toSupabaseFirmId(currentFirm?.id);
        const expiry = new Date(updates.expiryDate);
        expiry.setDate(expiry.getDate() - updates.reminderDaysBefore);
        const reminderDate = expiry.toISOString().slice(0, 10);
        await supabase.from('notifications').insert([{
            firm_id: supabaseFirmId,
            document_id: documentId,
            client_id: doc?.client_id,
            type: 'kyc_expiry_reminder',
            title: 'KYC document expiring soon',
            message: `${doc?.name || 'Document'} expires on ${updates.expiryDate}.`,
            due_date: updates.expiryDate,
            reminder_date: reminderDate,
        }]);
    }
  },

  getNotifications: async (): Promise<Notification[]> => {
    const currentFirm = authService.getCurrentFirm();
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .not('reminder_date', 'is', null)
            .lte('reminder_date', today)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return (data || []).map(n => ({
            id: n.id,
            firmId: n.firm_id,
            userId: n.user_id,
            clientId: n.client_id,
            documentId: n.document_id,
            type: n.type,
            title: n.title,
            message: n.message,
            dueDate: n.due_date,
            reminderDate: n.reminder_date,
            readAt: n.read_at,
            createdAt: n.created_at,
        }));
    } catch (err) {
        logger.error('Failed to load notifications:', err);
        return [];
    }
  },

  markNotificationRead: async (notificationId: string): Promise<void> => {
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
    if (error) throw error;
  },
};
