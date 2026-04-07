import { supabase } from '../lib/supabase';
import { invokeFunction } from '../lib/api';

export const ALLOWED_DOCUMENT_CATEGORIES = [
  '02 Financial Evidence',
  '03 Property Documents',
  '04 Lender Documents',
  '05 Compliance',
  '06 Other',
  'ID',
  '01 Fact Find',
  '07 Settlement',
  '08 Ongoing Reviews',
] as const;

type UploadParams = {
  applicationId: string;
  firmId?: string;
  userId?: string;
  clientId?: string;
  category?: string;
  status?: string;
  uploadDate?: string;
  fileHash?: string;
  storagePrefix?: string;
  upsert?: boolean;
};

export const DocumentsService = {
  async upload(file: File, params: UploadParams) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pathBase = params.storagePrefix || [params.firmId, params.applicationId].filter(Boolean).join('/');
    const path = `${pathBase}/${Date.now()}_${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: params.upsert ?? true });
    if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message);

    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(path);

    const insertPayload: Record<string, unknown> = {
      application_id: params.applicationId,
      name: file.name,
      url: publicUrl,
      file_type: file.type,
      file_size_bytes: file.size,
      category: params.category || '02 Financial Evidence',
      status: params.status ?? 'active',
      ...(params.firmId ? { firm_id: params.firmId } : {}),
      ...(params.userId ? { uploaded_by: params.userId } : {}),
      ...(params.clientId ? { client_id: params.clientId } : {}),
      ...(params.uploadDate ? { upload_date: params.uploadDate } : {}),
      ...(params.fileHash ? { file_hash: params.fileHash } : {}),
    };

    const { data, error } = await supabase
      .from('documents')
      .insert(insertPayload)
      .select('id, name, url, file_type, category, firm_id, application_id, file_size_bytes, parse_status, created_at, upload_date, validation_status, validation_warnings, file_hash')
      .single();

    if (error) throw new Error('Save failed: ' + error.message);
    return data;
  },

  async parse(documentId: string, applicationId: string, firmId: string) {
    return invokeFunction('parse-bank-statement', {
      document_id: documentId,
      application_id: applicationId,
      firm_id: firmId,
    });
  },

  async list(applicationId: string) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, name, category, url, application_id, firm_id, validation_status, validation_warnings, upload_date, file_type, file_size_bytes, parse_status, status, parsed_bank_name, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async listByClient(clientId: string) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, name, category, url, application_id, firm_id, validation_status, validation_warnings, upload_date, file_type, file_size_bytes, parse_status, status, parsed_bank_name, created_at')
      .eq('client_id', clientId)
      .order('upload_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('documents')
      .insert(payload)
      .select('id, name, category, url, application_id, firm_id, validation_status, validation_warnings, upload_date, file_type, file_size_bytes, parse_status, status, parsed_bank_name, created_at')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(documentId: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('documents')
      .update(payload)
      .eq('id', documentId)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async delete(documentId: string) {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);
    if (error) throw new Error(error.message);
  },
};
