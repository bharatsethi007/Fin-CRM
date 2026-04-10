import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { fireDocumentParseIfQueued } from '../../services/documentParsePipeline';
import { useDuplicateDetection, checkDocumentDuplicates } from '../../hooks/useDuplicateDetection';
import { DuplicateWarningModal } from '../common/DuplicateWarningModal';
import { BankStatementParser } from '../applications/BankStatementParser';
import { sha256HexFromFile } from '../../utils/fileHash';
import { useToast } from '../../hooks/useToast';
import { invokeParseBankStatement } from '../../src/lib/api';
import { DocumentsService } from '../../src/services/documents.service';

interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  category: string;
  required: boolean;
  reason: string;
  status: 'pending' | 'uploaded' | 'requested' | 'waived';
}

interface Checklist {
  id: string;
  checklist_items: ChecklistItem[];
  total_items: number;
  required_items: number;
  profile_snapshot: Record<string, any>;
  generated_at: string;
}

interface UploadedDoc {
  id: string;
  name: string;
  category: string;
  url: string;
  application_id: string;
  firm_id: string;
  validation_status: string;
  validation_warnings: Array<{ code: string; severity: string; message: string }>;
  upload_date: string;
  file_type: string;
  file_size_bytes: number;
  parse_status?: string;
  kyc_section?: string | null;
  parsed_bank_name?: string | null;
}

/** Heuristic match for legacy documents uploaded before `kyc_section` was set. */
function isLikelyMatchForItem(doc: UploadedDoc, item: ChecklistItem): boolean {
  const name = (doc.name || (doc as { file_name?: string }).file_name || '').toLowerCase();
  if (item.id === 'BANK_STATEMENTS_3M' || item.id === 'SE_BANK_STATEMENTS') {
    return (
      name.includes('bank') ||
      name.includes('statement') ||
      doc.parsed_bank_name != null
    );
  }
  if (item.id === 'INC_PAYSLIPS') {
    return name.includes('payslip') || name.includes('pay slip');
  }
  if (item.id === 'KIWISAVER_STATEMENT') {
    return name.includes('kiwisaver') || name.includes('kiwi saver');
  }
  if (item.id === 'ID_PHOTO_PRIMARY' || item.id === 'ID_PROOF_ADDRESS') {
    return (
      name.includes('licence') ||
      name.includes('license') ||
      name.includes('passport') ||
      name.includes('id') ||
      name.includes('proof')
    );
  }
  return true;
}

/** Maps a document row to the checklist item it belongs under. */
function documentMatchesChecklistItem(doc: UploadedDoc, item: ChecklistItem): boolean {
  if (doc.kyc_section === item.id) return true;
  if (doc.kyc_section == null || doc.kyc_section === '') {
    return doc.category === item.category && isLikelyMatchForItem(doc, item);
  }
  return false;
}

type ParseQueueRecord = {
  id: string;
  document_id: string;
  status: string;
  extracted_data: Record<string, unknown> | null;
  fields_populated: string[] | null;
  error_message: string | null;
  detected_type?: string | null;
};

interface Props {
  applicationId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  'ID': 'Identity',
  '01 Fact Find': 'Fact Find',
  '02 Financial Evidence': 'Financial Evidence',
  '03 Property Documents': 'Property',
  '04 Lender Documents': 'Lender',
  '05 Compliance': 'Compliance',
  '06 Other': 'Other',
};

const STATUS_CFG = {
  uploaded:  { color: '#16a34a', bg: '#f0fdf4', icon: 'uploaded' },
  requested: { color: '#2563eb', bg: '#eff6ff', icon: 'requested' },
  pending:   { color: '#9ca3af', bg: '#ffffff', icon: 'pending' },
  waived:    { color: '#d97706', bg: '#fffbeb', icon: 'waived' },
};

function fmtBytes(b: number): string {
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  return Math.round(b / 1024) + ' KB';
}

function getIcon(status: string): string {
  if (status === 'uploaded') return '✅';
  if (status === 'requested') return '📨';
  if (status === 'waived') return '➖';
  return '⬜';
}

function getFileEmoji(fileType: string, name: string): string {
  if (fileType && fileType.includes('pdf')) return '📄';
  if (name && name.endsWith('.pdf')) return '📄';
  if (fileType && fileType.includes('image')) return '🖼';
  if (name && (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls'))) return '📊';
  return '📎';
}

export const DocumentChecklistTab: React.FC<Props> = ({ applicationId }) => {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [showOptional, setShowOptional] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ url: string; name: string; type: string } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [profileDocs, setProfileDocs] = useState<UploadedDoc[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [importingDocId, setImportingDocId] = useState<string | null>(null);
  const [requestItems, setRequestItems] = useState<ChecklistItem[]>([]);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [requestEmail, setRequestEmail] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [parserDoc, setParserDoc] = useState<{
    id: string;
    name: string;
    url: string;
    file_type: string;
    category: string;
    application_id: string;
    firm_id: string;
  } | null>(null);
  const [parserApplicantId, setParserApplicantId] = useState<string | null>(null);
  const [parseQueueByDocId, setParseQueueByDocId] = useState<Record<string, ParseQueueRecord>>({});
  const [firmId, setFirmId] = useState<string | null>(null);
  const [reparseBusyId, setReparseBusyId] = useState<string | null>(null);
  const [reparseProgressLabel, setReparseProgressLabel] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  const toast = useToast();

  const {
    checkResult,
    setCheckResult,
    showModal: showDuplicateModal,
    setShowModal: setShowDuplicateModal,
    pendingAction: pendingParseAction,
    setPendingAction: setPendingParseAction,
  } = useDuplicateDetection();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<ChecklistItem | null>(null);
  const addItemRef = useRef<{ category: string; name: string; checklistItemId?: string } | null>(null);

  const fetchParseQueueRows = useCallback(async () => {
    try {
      const { data: appRow } = await supabase
        .from('applications')
        .select('firm_id')
        .eq('id', applicationId)
        .maybeSingle();
      setFirmId(appRow?.firm_id ?? null);

      const { data, error } = await supabase
        .from('document_parse_queue')
        .select(
          'id, document_id, status, extracted_data, fields_populated, error_message, detected_type',
        )
        .eq('application_id', applicationId);

      if (error) {
        logger.error('document_parse_queue:', error);
        return;
      }
      const map: Record<string, ParseQueueRecord> = {};
      (data || []).forEach((row: Record<string, unknown>) => {
        const did = row.document_id as string | undefined;
        if (did) {
          map[did] = {
            id: String(row.id),
            document_id: did,
            status: String(row.status ?? ''),
            extracted_data: (row.extracted_data as Record<string, unknown>) ?? null,
            fields_populated: (row.fields_populated as string[]) ?? null,
            error_message: (row.error_message as string) ?? null,
            detected_type: (row.detected_type as string) ?? null,
          };
        }
      });
      setParseQueueByDocId(map);
    } catch (e) {
      logger.error('fetchParseQueueRows:', e);
    }
  }, [applicationId]);

  useEffect(() => { void loadAll(); }, [applicationId]);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: cl } = await supabase
        .from('document_checklists')
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const docs = await DocumentsService.list(applicationId);

      setUploadedDocs(docs || []);

      if (cl) {
        setChecklist(cl);
        const docRows = (docs || []) as UploadedDoc[];
        const merged = (cl.checklist_items || []).map((item: ChecklistItem) => {
          const hasDoc = docRows.some((d) => documentMatchesChecklistItem(d, item));
          if (item.status === 'waived' || item.status === 'requested') {
            return { ...item };
          }
          if (hasDoc) {
            return { ...item, status: 'uploaded' as const };
          }
          if (item.status === 'uploaded' && !hasDoc) {
            return { ...item, status: 'pending' as const };
          }
          return { ...item };
        });
        setItems(merged);
      }

      await fetchParseQueueRows();
    } catch (e) {
      logger.error('loadAll error:', e);
    } finally {
      setLoading(false);
    }
  }

  const hasActiveParseJob = useMemo(
    () =>
      Object.values(parseQueueByDocId).some(
        (q) => q.status === 'pending' || q.status === 'processing',
      ),
    [parseQueueByDocId],
  );

  useEffect(() => {
    if (!hasActiveParseJob) return;
    const timer = setInterval(() => {
      void fetchParseQueueRows();
    }, 5000);
    return () => clearInterval(timer);
  }, [hasActiveParseJob, fetchParseQueueRows]);

  const queueParseAfterDuplicateCheck = useCallback(
    async (newDocumentId: string, firmIdHint?: string | null) => {
      const dup = await checkDocumentDuplicates(newDocumentId);
      setCheckResult(dup);
      if (dup.requires_confirmation) {
        setPendingParseAction(
          () => () => {
            fireDocumentParseIfQueued(
              supabase,
              newDocumentId,
              applicationId,
              firmIdHint ?? undefined,
            );
          },
        );
        setShowDuplicateModal(true);
        return;
      }
      fireDocumentParseIfQueued(supabase, newDocumentId, applicationId, firmIdHint ?? undefined);
    },
    [applicationId, setCheckResult, setPendingParseAction, setShowDuplicateModal],
  );

  async function regenerate() {
    setRegenerating(true);
    try {
      const { error } = await supabase.rpc('generate_document_checklist', { p_application_id: applicationId });
      if (error) throw error;
      await loadAll();
      toast.success('Document checklist generated');
    } catch (err: any) {
      toast.error('Failed to generate checklist: ' + (err?.message || String(err)));
    } finally {
      setRegenerating(false);
    }
  }

  async function loadFirstApplicantId(): Promise<string | null> {
    const { data } = await supabase
      .from('applicants')
      .select('id')
      .eq('application_id', applicationId)
      .limit(1)
      .maybeSingle();
    return data?.id || null;
  }

  async function loadProfileDocs() {
    setLoadingProfile(true);
    try {
      const { data: appData } = await supabase
        .from('applications')
        .select('client_id')
        .eq('id', applicationId)
        .single();
      if (!appData?.client_id) return;
      const data = await DocumentsService.listByClient(appData.client_id);
      const existing = new Set(uploadedDocs.map((d: any) => d.id));
      setProfileDocs((data || []).filter((d: any) => !existing.has(d.id)));
    } catch (e) {
      logger.error(e);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function importFromProfile(doc: UploadedDoc) {
    setImportingDocId(doc.id);
    try {
      const { data: appRow } = await supabase
        .from('applications')
        .select('firm_id, client_id')
        .eq('id', applicationId)
        .single();
      const inserted = await DocumentsService.create({
          application_id: applicationId,
          firm_id: appRow?.firm_id,
          client_id: appRow?.client_id,
          name: doc.name,
          category: doc.category,
          url: doc.url,
          status: 'Valid',
          upload_date: doc.upload_date,
          file_type: doc.file_type,
          file_size_bytes: doc.file_size_bytes,
        });
      if (inserted?.id) {
        await queueParseAfterDuplicateCheck(inserted.id, appRow?.firm_id);
      }
      await loadAll();
      setProfileDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success('Document uploaded');
    } catch (e: any) {
      logger.error(e);
      toast.error('Failed to import document: ' + (e?.message || String(e)));
    } finally {
      setImportingDocId(null);
    }
  }

  async function openRequestModal() {
    try {
      const { data: appData } = await supabase
        .from('applications')
        .select('client_id, clients(email, first_name, last_name)')
        .eq('id', applicationId)
        .single();
      const missing = items.filter(i => i.required && i.status !== 'uploaded' && i.status !== 'waived');
      setRequestItems(items.filter(i => i.required));
      setSelectedRequests(new Set(missing.map(i => i.id)));
      const clientEmail = (appData?.clients as any)?.email || '';
      const firstName = (appData?.clients as any)?.first_name || '';
      const lastName = (appData?.clients as any)?.last_name || '';
      const clientName = (firstName + ' ' + lastName).trim();
      setRequestEmail(clientEmail);
      setRequestMessage(
        'Hi ' + (clientName || 'there') + ',\n\nCould you please provide the following documents:\n\n{DOCUMENT_LIST}\n\nKind regards'
      );
      setEmailSent(false);
      setShowRequestModal(true);
    } catch (e) {
      logger.error(e);
    }
  }

  function clearItemError(id: string) {
    setItemErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleUploadClick(item: ChecklistItem) {
    activeItemRef.current = item;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  async function doUpload(file: File, category: string, checklistItemId?: string) {
    const fileHash = await sha256HexFromFile(file);
    const ins = await DocumentsService.upload(file, {
      applicationId,
      category,
      ...(checklistItemId ? { kycSection: checklistItemId } : {}),
      status: 'Valid',
      uploadDate: new Date().toISOString().split('T')[0],
      fileHash,
      storagePrefix: applicationId,
      upsert: false,
    });
    if (ins?.id) {
      const { error: valErr } = await supabase.rpc('validate_document', { p_document_id: ins.id });
      if (!valErr) toast.success('Document validated');
      await queueParseAfterDuplicateCheck(ins.id);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const item = activeItemRef.current;
    if (!file || !item) return;
    setUploadingId(item.id);
    try {
      await doUpload(file, item.category, item.id);
      await loadAll();
      toast.success('Document uploaded');
    } catch (err: any) {
      setItemErrors(prev => ({ ...prev, [item.id]: err.message }));
      toast.error('Failed to upload document: ' + (err?.message || String(err)));
    } finally {
      setUploadingId(null);
      activeItemRef.current = null;
    }
  }

  async function handleAddMoreChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const meta = addItemRef.current;
    if (!file || !meta) return;
    const key = 'add_' + meta.category;
    setUploadingId(key);
    try {
      await doUpload(file, meta.category, meta.checklistItemId);
      await loadAll();
      toast.success('Document uploaded');
    } catch (err: any) {
      setItemErrors(prev => ({ ...prev, [key]: err.message }));
      toast.error('Failed to upload document: ' + (err?.message || String(err)));
    } finally {
      setUploadingId(null);
      addItemRef.current = null;
      if (addFileInputRef.current) addFileInputRef.current.value = '';
    }
  }

  async function handleDelete(doc: UploadedDoc) {
    if (!confirm('Delete "' + doc.name + '"? This cannot be undone.')) return;
    setDeletingId(doc.id);
    try {
      const parts = doc.url.split('/documents/');
      if (parts[1]) await supabase.storage.from('documents').remove([decodeURIComponent(parts[1])]);
      await DocumentsService.delete(doc.id);
      await loadAll();
      toast.success('Document deleted');
    } catch (e: any) {
      logger.error(e);
      toast.error('Failed to delete document: ' + (e?.message || String(e)));
    } finally {
      setDeletingId(null);
    }
  }

  async function markRequested(itemId: string) {
    setMarkingId(itemId);
    try {
      const updated = items.map(i => i.id === itemId ? { ...i, status: 'requested' as const } : i);
      setItems(updated);
      if (checklist) {
        const { error } = await supabase.from('document_checklists').update({ checklist_items: updated }).eq('id', checklist.id);
        if (error) throw error;
      }
      await loadAll();
    } catch (err: any) {
      toast.error('Failed to mark as requested: ' + (err?.message || String(err)));
    } finally {
      setMarkingId(null);
    }
  }

  async function markWaived(itemId: string) {
    setMarkingId(itemId);
    try {
      const updated = items.map(i => i.id === itemId ? { ...i, status: 'waived' as const } : i);
      setItems(updated);
      if (checklist) {
        const { error } = await supabase.from('document_checklists').update({ checklist_items: updated }).eq('id', checklist.id);
        if (error) throw error;
      }
      await loadAll();
    } catch (err: any) {
      toast.error('Failed to waive document: ' + (err?.message || String(err)));
    } finally {
      setMarkingId(null);
    }
  }

  async function sendRequest() {
    setSendingRequest(true);
    try {
      const updated = items.map(i =>
        selectedRequests.has(i.id) && i.status !== 'uploaded' ? { ...i, status: 'requested' as const } : i
      );
      setItems(updated);
      if (checklist) {
        const { error } = await supabase.from('document_checklists').update({ checklist_items: updated }).eq('id', checklist.id);
        if (error) throw error;
      }
      await loadAll();
      setEmailSent(true);
      toast.success('Document request sent');
    } catch (err: any) {
      toast.error('Failed to send request: ' + (err?.message || String(err)));
    } finally {
      setSendingRequest(false);
    }
  }

  function toggleRequest(itemId: string) {
    setSelectedRequests(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function fmtMoneyNZ(n: number | null | undefined): string {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      maximumFractionDigits: 0,
    }).format(Number(n));
  }

  function monthsBetweenExtracted(start: unknown, end: unknown): number {
    if (typeof start !== 'string' || typeof end !== 'string') return 1;
    const d1 = new Date(start);
    const d2 = new Date(end);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;
    const m =
      (d2.getFullYear() - d1.getFullYear()) * 12 +
      (d2.getMonth() - d1.getMonth()) +
      1;
    return Math.max(1, m);
  }

  async function handleReparse(queue: ParseQueueRecord, docId: string) {
    if (!firmId) {
      toast.error('Firm context not loaded. Try again in a moment.');
      return;
    }
    setReparseBusyId(queue.id);
    setReparseProgressLabel('Queued…');
    try {
      const { data, error } = await invokeParseBankStatement(
        {
          parse_queue_id: queue.id,
          document_id: docId,
          application_id: applicationId,
          firm_id: firmId,
        },
        {
          onProgress: (row) => {
            const pct = Number(row.progress_pct) || 0;
            setReparseProgressLabel(`${row.current_step || row.status} · ${pct}%`);
          },
        },
      );
      setReparseProgressLabel(null);
      if (error) throw new Error(error);
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      await fetchParseQueueRows();
      await loadAll();
      toast.success('Document re-parsed');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Failed to re-parse document: ' + msg);
    } finally {
      setReparseBusyId(null);
      setReparseProgressLabel(null);
    }
  }

  function renderDoc(doc: UploadedDoc) {
    const hasFail = doc.validation_warnings?.some(w => w.severity === 'fail');
    const hasWarn = doc.validation_warnings?.some(w => w.severity === 'warning');
    const vc = hasFail ? '#dc2626' : hasWarn ? '#d97706' : '#16a34a';
    const vLabel = hasFail ? 'Issues' : hasWarn ? 'Review' : 'OK';
    const pq = parseQueueByDocId[doc.id];
    const dt = (pq?.detected_type || '').toLowerCase();
    const ex = pq?.extracted_data;

    function renderParseBadge() {
      if (!pq) return null;
      const st = pq.status;
      if (st === 'pending') {
        return (
          <span
            title="Queued for AI parsing"
            style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}
          >
            ⏳ Queued
          </span>
        );
      }
      if (st === 'processing') {
        return (
          <span
            title="Parsing in progress"
            className="parse-badge-pulse"
            style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}
          >
            🔄 Parsing...
          </span>
        );
      }
      if (st === 'completed') {
        const tip =
          pq.fields_populated && pq.fields_populated.length > 0
            ? pq.fields_populated.join(', ')
            : 'Completed';
        return (
          <span
            title={tip}
            style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', cursor: 'help' }}
          >
            ✓ Extracted
          </span>
        );
      }
      if (st === 'failed') {
        return (
          <span
            title={pq.error_message || 'Parse failed'}
            style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', cursor: 'help' }}
          >
            ✗ Failed
          </span>
        );
      }
      return null;
    }

    function renderExtractionCard() {
      if (!pq || pq.status !== 'completed' || !ex || typeof ex !== 'object') return null;
      if (dt === 'payslip') {
        const gross = ex.gross_salary;
        const freq = String(ex.pay_frequency ?? ex.salary_frequency ?? '');
        return (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              background: '#f5f3ff',
              border: '1px solid #ddd6fe',
              borderRadius: 8,
              fontSize: 11,
              color: '#5b21b6',
            }}
          >
            AI extracted: {fmtMoneyNZ(Number(gross))} gross salary, {freq || '—'} frequency → Income tab updated
          </div>
        );
      }
      if (dt === 'bank_statement') {
        const avgIn = ex.average_monthly_credits;
        const months = monthsBetweenExtracted(ex.statement_period_start, ex.statement_period_end);
        const totalDebits = ex.total_debits != null ? Number(ex.total_debits) : null;
        const avgExp =
          totalDebits != null && !Number.isNaN(totalDebits) && months > 0
            ? totalDebits / months
            : null;
        const flags = Array.isArray(ex.flags) ? ex.flags : [];
        const flagHits: string[] = [];
        if (flags.some((f) => String(f).toLowerCase().includes('gambling'))) flagHits.push('gambling');
        if (flags.some((f) => String(f).toLowerCase().includes('bnpl'))) flagHits.push('BNPL');
        if (flags.some((f) => String(f).toLowerCase().includes('dishonour'))) flagHits.push('dishonour fees');
        return (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                padding: '8px 10px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                fontSize: 11,
                color: '#1e40af',
              }}
            >
              AI extracted: {fmtMoneyNZ(Number(avgIn))} avg monthly income,{' '}
              {avgExp != null && !Number.isNaN(avgExp) ? fmtMoneyNZ(avgExp) : '—'} avg expenses → Analysis ready
            </div>
            {flagHits.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                ⚠ Flags: {flagHits.join(' / ')} detected
              </div>
            )}
          </div>
        );
      }
      return null;
    }

    const showReparse = pq && (pq.status === 'failed' || pq.status === 'completed');

    return (
      <div className="doc-card">
        <div className="doc-card-row">
          <span className="doc-icon">{getFileEmoji(doc.file_type, doc.name)}</span>
          <div className="doc-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p className="doc-name" style={{ margin: 0 }}>{doc.name}</p>
              {renderParseBadge()}
            </div>
            <p className="doc-meta">{doc.upload_date}{doc.file_size_bytes ? ' · ' + fmtBytes(doc.file_size_bytes) : ''}</p>
          </div>
          <div className="doc-actions">
            <span style={{ fontSize: 11, fontWeight: 600, color: vc }}>{hasFail ? '⚠' : hasWarn ? '⚠' : '✓'} {vLabel}</span>
            {(doc.file_type?.includes('pdf') || doc.name?.endsWith('.pdf')) &&
              doc.category === '02 Financial Evidence' &&
              doc.parse_status !== 'parsed' && (
                <button
                  onClick={async () => {
                    const aid = await loadFirstApplicantId();
                    setParserApplicantId(aid);
                    setParserDoc({
                      id: doc.id,
                      name: doc.name,
                      url: doc.url,
                      file_type: doc.file_type,
                      category: doc.category,
                      application_id: doc.application_id,
                      firm_id: doc.firm_id,
                    });
                  }}
                  style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, padding: '3px 7px', border: '1px solid #e9d5ff', borderRadius: 5, background: '#faf5ff', cursor: 'pointer' }}
                >
                  AI Parse
                </button>
              )}
            {doc.parse_status === 'parsed' && (
              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Parsed</span>
            )}
            {showReparse && pq && (
              <button
                type="button"
                title={reparseBusyId === pq.id ? (reparseProgressLabel ?? undefined) : undefined}
                onClick={() => void handleReparse(pq, doc.id)}
                disabled={reparseBusyId === pq.id}
                style={{
                  fontSize: 11,
                  color: '#0f766e',
                  fontWeight: 600,
                  padding: '3px 7px',
                  border: '1px solid #99f6e4',
                  borderRadius: 5,
                  background: '#f0fdfa',
                  cursor: reparseBusyId === pq.id ? 'wait' : 'pointer',
                  opacity: reparseBusyId === pq.id ? 0.6 : 1,
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {reparseBusyId === pq.id ? (reparseProgressLabel ?? '…') : 'Re-parse'}
              </button>
            )}
            <button className="btn-view" onClick={() => setViewerDoc({ url: doc.url, name: doc.name, type: doc.file_type || '' })}>View</button>
            <button className="btn-delete" onClick={() => handleDelete(doc)} disabled={deletingId === doc.id} style={{ opacity: deletingId === doc.id ? 0.6 : 1, cursor: deletingId === doc.id ? 'not-allowed' : 'pointer' }}>
              {deletingId === doc.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
        {renderExtractionCard()}
        {doc.validation_warnings && doc.validation_warnings.length > 0 && (
          <div className="doc-warnings">
            {doc.validation_warnings.map((w, i) => (
              <div key={i} className={w.severity === 'fail' ? 'warn-fail' : 'warn-warn'}>
                <span>{w.severity === 'fail' ? '❌' : '⚠️'}</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) return (
    <div style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="spinner" />
      <span style={{ fontSize: 13, color: '#6b7280' }}>Loading...</span>
    </div>
  );

  if (!checklist) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>No Document Checklist Yet</h3>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>Generate a smart checklist based on this client profile</p>
      <button className="btn-primary" onClick={regenerate} disabled={regenerating} style={{ opacity: regenerating ? 0.6 : 1, cursor: regenerating ? 'not-allowed' : 'pointer' }}>
        {regenerating ? 'Generating...' : 'Generate Smart Checklist'}
      </button>
    </div>
  );

  const requiredItems = items.filter(i => i.required);
  const optionalItems = items.filter(i => !i.required);
  const requiredUploaded = requiredItems.filter(i => i.status === 'uploaded').length;
  const pct = requiredItems.length > 0 ? Math.round((requiredUploaded / requiredItems.length) * 100) : 0;
  const grouped = requiredItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const otherDocs = uploadedDocs.filter(d => {
    const knownCats = ['ID', '01 Fact Find', '02 Financial Evidence', '03 Property Documents', '04 Lender Documents', '05 Compliance'];
    return !knownCats.includes(d.category) || d.category === '06 Other';
  });

  const docListText = Array.from(selectedRequests)
    .map(id => { const it = requestItems.find(i => i.id === id); return it ? '- ' + it.name : ''; })
    .filter(Boolean)
    .join('\n');

  return (
    <div className="checklist-root">
      <style>{`
        .checklist-root { padding-bottom: 32px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes parsePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .parse-badge-pulse { animation: parsePulse 1.2s ease-in-out infinite; }
        .spinner { width:16px; height:16px; border:2px solid #6366f1; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite; }
        .btn-primary { padding:10px 24px; background:#6366f1; color:white; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
        .btn-secondary { font-size:11px; color:#6b7280; background:white; border:1px solid #e5e7eb; border-radius:6px; padding:6px 10px; cursor:pointer; white-space:nowrap; }
        .btn-accent { font-size:11px; color:#6366f1; background:#eff6ff; border:1px solid #e0e7ff; border-radius:6px; padding:6px 10px; cursor:pointer; white-space:nowrap; font-weight:600; }
        .btn-upload { font-size:11px; padding:5px 10px; background:#6366f1; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; }
        .btn-request { font-size:11px; padding:5px 9px; background:white; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; cursor:pointer; }
        .btn-waive { font-size:11px; padding:5px 9px; background:white; color:#9ca3af; border:1px solid #e5e7eb; border-radius:6px; cursor:pointer; }
        .btn-view { font-size:11px; color:#6366f1; font-weight:600; padding:3px 7px; border:1px solid #e0e7ff; border-radius:5px; background:white; cursor:pointer; }
        .btn-delete { font-size:11px; color:#dc2626; background:none; border:1px solid #fca5a5; border-radius:5px; padding:3px 7px; cursor:pointer; }
        .btn-add-more { font-size:11px; color:#6366f1; background:none; border:1px dashed #c7d2fe; border-radius:6px; padding:4px 10px; cursor:pointer; }
        .btn-import { font-size:11px; padding:5px 12px; background:#6366f1; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; }
        .btn-close { font-size:18px; color:#9ca3af; background:none; border:none; cursor:pointer; }
        .progress-bar-wrap { height:7px; background:#e5e7eb; border-radius:99px; overflow:hidden; }
        .progress-bar-fill { height:100%; border-radius:99px; transition:width 0.4s ease; }
        .section-header { font-size:11px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:0.07em; margin:0 0 7px; }
        .category-block { border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; margin-bottom:18px; }
        .item-row { border-left:3px solid #ccc; }
        .item-main { display:flex; align-items:flex-start; gap:10px; padding:11px 14px; }
        .item-body { flex:1; min-width:0; }
        .item-title { font-size:13px; font-weight:600; color:#111827; margin:0 0 1px; }
        .item-desc { font-size:11px; color:#6b7280; margin:0 0 1px; }
        .item-reason { font-size:11px; color:#9ca3af; margin:0; }
        .item-btns { display:flex; gap:5px; flex-shrink:0; }
        .item-err { margin:0 14px 8px 38px; padding:6px 10px; background:#fef2f2; border-radius:6px; display:flex; justify-content:space-between; align-items:center; }
        .item-err span { font-size:11px; color:#dc2626; }
        .item-err button { font-size:11px; color:#9ca3af; background:none; border:none; cursor:pointer; }
        .item-docs { padding:0 14px 8px 38px; display:flex; flex-direction:column; gap:6px; }
        .item-add { padding:0 14px 8px 38px; }
        .doc-card { background:white; border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px; }
        .doc-card-row { display:flex; align-items:center; gap:8px; }
        .doc-icon { font-size:14px; }
        .doc-info { flex:1; min-width:0; }
        .doc-name { font-size:12px; font-weight:600; color:#374151; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .doc-meta { font-size:11px; color:#9ca3af; margin:0; }
        .doc-actions { display:flex; gap:5px; align-items:center; flex-shrink:0; }
        .doc-warnings { margin-top:5px; display:flex; flex-direction:column; gap:3px; }
        .warn-fail { display:flex; gap:5px; padding:4px 8px; background:#fef2f2; border-radius:5px; font-size:11px; color:#dc2626; }
        .warn-warn { display:flex; gap:5px; padding:4px 8px; background:#fffbeb; border-radius:5px; font-size:11px; color:#d97706; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px; }
        .modal-box { background:white; border-radius:12px; width:100%; display:flex; flex-direction:column; overflow:hidden; }
        .modal-header { padding:14px 18px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
        .modal-title { font-size:14px; font-weight:700; color:#111827; margin:0; }
        .modal-sub { font-size:12px; color:#9ca3af; margin:2px 0 0; }
        .modal-body { flex:1; overflow-y:auto; padding:16px; }
        .modal-footer { padding:12px 18px; border-top:1px solid #f3f4f6; display:flex; justify-content:flex-end; gap:8px; }
        .profile-doc-row { display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid #e5e7eb; border-radius:8px; }
        .profile-doc-name { font-size:12px; font-weight:600; color:#374151; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .profile-doc-meta { font-size:11px; color:#9ca3af; margin:1px 0 0; }
        .req-label { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; }
        .req-label-name { font-size:12px; color:#374151; flex:1; }
        .req-label-cat { font-size:11px; color:#9ca3af; }
        .input-field { width:100%; padding:7px 10px; border:1px solid #e5e7eb; border-radius:6px; font-size:12px; box-sizing:border-box; }
        .textarea-field { width:100%; padding:8px 10px; border:1px solid #e5e7eb; border-radius:6px; font-size:12px; resize:vertical; outline:none; box-sizing:border-box; font-family:inherit; }
        .input-label { font-size:11px; color:#6b7280; display:block; margin-bottom:3px; }
        .other-docs-wrap { margin-top:24px; margin-bottom:8px; }
        .other-docs-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; }
        .other-docs-empty { border:2px dashed #e5e7eb; border-radius:10px; padding:20px; text-align:center; }
        .other-docs-list { border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
        .other-doc-item { padding:8px 14px; }
        .success-box { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:40px; }
        .viewer-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1001; display:flex; align-items:center; justify-content:center; padding:24px; }
        .viewer-box { background:white; border-radius:12px; width:100%; max-width:900px; height:90vh; display:flex; flex-direction:column; overflow:hidden; }
        .viewer-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #e5e7eb; flex-shrink:0; }
        .viewer-body { flex:1; overflow:hidden; background:#f3f4f6; }
        .viewer-img-wrap { height:100%; display:flex; align-items:center; justify-content:center; padding:16px; }
        .viewer-other { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; }
      `}</style>

      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange}
        accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.csv,.xls,.xlsx" />
      <input ref={addFileInputRef} type="file" style={{ display: 'none' }} onChange={handleAddMoreChange}
        accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.csv,.xls,.xlsx" />

      {/* Progress header */}
      <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{requiredUploaded} of {requiredItems.length} required documents uploaded</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? '#16a34a' : '#6366f1' }}>{pct}%</span>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: pct + '%', background: pct === 100 ? '#16a34a' : '#6366f1' }} />
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>
            {checklist.profile_snapshot?.has_self_employed ? 'Self-employed · ' : 'Employed · '}
            {checklist.profile_snapshot?.is_refinance ? 'Refinance · ' : ''}
            {checklist.profile_snapshot?.has_kiwisaver ? 'KiwiSaver · ' : ''}
            {checklist.total_items} items total
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn-secondary" onClick={() => { loadProfileDocs(); setShowProfileModal(true); }}>
            📁 From Profile
          </button>
          <button className="btn-accent" onClick={openRequestModal}>
            📨 Request
          </button>
          <button className="btn-secondary" onClick={regenerate} disabled={regenerating} style={{ opacity: regenerating ? 0.6 : 1, cursor: regenerating ? 'not-allowed' : 'pointer' }}>
            {regenerating ? 'Generating...' : '↻ Regenerate'}
          </button>
        </div>
      </div>

      {/* Checklist by category */}
      {Object.entries(grouped).map(([category, catItems]) => {
        const catLabel = CATEGORY_LABELS[category] || category;
        return (
          <div key={category}>
            <p className="section-header">{catLabel}</p>
            <div className="category-block">
              {catItems.map((item, idx) => {
                const cfg = STATUS_CFG[item.status] || STATUS_CFG.pending;
                const isUploading = uploadingId === item.id;
                const matchedDocs = uploadedDocs.filter((d) => documentMatchesChecklistItem(d, item));
                const hasFail = matchedDocs.some(d => d.validation_warnings?.some(w => w.severity === 'fail'));
                const hasWarn = matchedDocs.some(d => d.validation_warnings?.some(w => w.severity === 'warning'));
                const borderColor = item.status === 'uploaded'
                  ? (hasFail ? '#dc2626' : hasWarn ? '#d97706' : '#16a34a')
                  : cfg.color;
                return (
                  <div key={item.id} className="item-row" style={{
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopStyle: 'solid',
                    borderTopColor: '#f3f4f6',
                    borderLeftColor: borderColor,
                    background: cfg.bg,
                  }}>
                    <div className="item-main">
                      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{getIcon(item.status)}</span>
                      <div className="item-body">
                        <p className="item-title">{item.name}</p>
                        <p className="item-desc">{item.description}</p>
                        <p className="item-reason">{item.reason}</p>
                      </div>
                      <div className="item-btns">
                        {item.status !== 'waived' && (
                          <button className="btn-upload" onClick={() => handleUploadClick(item)} disabled={isUploading} style={{ opacity: isUploading ? 0.6 : 1, cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                            {isUploading ? 'Uploading...' : item.status === 'uploaded' ? 'Replace' : 'Upload'}
                          </button>
                        )}
                        {item.status === 'pending' && (
                          <button className="btn-request" onClick={() => markRequested(item.id)} disabled={markingId === item.id} style={{ opacity: markingId === item.id ? 0.6 : 1, cursor: markingId === item.id ? 'not-allowed' : 'pointer' }}>
                            {markingId === item.id ? 'Requesting...' : 'Request'}
                          </button>
                        )}
                        {item.status === 'pending' && (
                          <button className="btn-waive" onClick={() => markWaived(item.id)} disabled={markingId === item.id} style={{ opacity: markingId === item.id ? 0.6 : 1, cursor: markingId === item.id ? 'not-allowed' : 'pointer' }}>
                            {markingId === item.id ? 'Waiving...' : 'Waive'}
                          </button>
                        )}
                      </div>
                    </div>

                    {itemErrors[item.id] && (
                      <div className="item-err">
                        <span>{itemErrors[item.id]}</span>
                        <button onClick={() => clearItemError(item.id)}>x</button>
                      </div>
                    )}

                    {matchedDocs.length > 0 && (
                      <div className="item-docs">
                        {matchedDocs.map(doc => (
                          <Fragment key={doc.id}>{renderDoc(doc)}</Fragment>
                        ))}
                      </div>
                    )}

                    <div className="item-add">
                      <button className="btn-add-more" onClick={() => {
                        addItemRef.current = { category: item.category, name: item.name, checklistItemId: item.id };
                        if (addFileInputRef.current) addFileInputRef.current.click();
                      }} disabled={uploadingId === 'add_' + item.category} style={{ opacity: uploadingId === 'add_' + item.category ? 0.6 : 1, cursor: uploadingId === 'add_' + item.category ? 'not-allowed' : 'pointer' }}>
                        {uploadingId === 'add_' + item.category ? 'Uploading...' : '+ Add another document'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Other Documents */}
      <div className="other-docs-wrap">
        <div className="other-docs-header">
          <p className="section-header" style={{ margin: 0 }}>Other Documents</p>
          <button className="btn-accent" onClick={() => {
            addItemRef.current = { category: '06 Other', name: 'Other Document' };
            if (addFileInputRef.current) addFileInputRef.current.click();
          }} disabled={uploadingId === 'add_06 Other'} style={{ opacity: uploadingId === 'add_06 Other' ? 0.6 : 1, cursor: uploadingId === 'add_06 Other' ? 'not-allowed' : 'pointer' }}>
            {uploadingId === 'add_06 Other' ? 'Uploading...' : '+ Upload Document'}
          </button>
        </div>
        {otherDocs.length === 0 ? (
          <div className="other-docs-empty">
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No other documents yet</p>
          </div>
        ) : (
          <div className="other-docs-list">
            {otherDocs.map((doc, idx) => (
              <div key={doc.id} className="other-doc-item" style={{ borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none' }}>
                {renderDoc(doc)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optional items */}
      {optionalItems.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button className="btn-secondary" style={{ background: 'none', border: 'none' }} onClick={() => setShowOptional(!showOptional)}>
            {showOptional ? '▼' : '▶'} {optionalItems.length} optional documents
          </button>
          {showOptional && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
              {optionalItems.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fafafa', borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <span>⬜</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: '#374151', margin: 0 }}>{item.name}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{item.reason}</p>
                  </div>
                  <button className="btn-upload" onClick={() => handleUploadClick(item)} disabled={uploadingId === item.id} style={{ opacity: uploadingId === item.id ? 0.6 : 1, cursor: uploadingId === item.id ? 'not-allowed' : 'pointer' }}>
                    {uploadingId === item.id ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-box" style={{ maxWidth: 600, maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-title">Load from Client Profile</p>
                <p className="modal-sub">Import documents already on file for this client</p>
              </div>
              <button className="btn-close" onClick={() => setShowProfileModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {loadingProfile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 20 }}>
                  <div className="spinner" />
                  <span style={{ fontSize: 13, color: '#6b7280' }}>Loading...</span>
                </div>
              ) : profileDocs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>No additional profile documents found</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {profileDocs.map(doc => (
                    <div key={doc.id} className="profile-doc-row">
                      <span style={{ fontSize: 20 }}>{getFileEmoji(doc.file_type, doc.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="profile-doc-name">{doc.name}</p>
                        <p className="profile-doc-meta">{CATEGORY_LABELS[doc.category] || doc.category} · {doc.upload_date}</p>
                      </div>
                      <button className="btn-import" onClick={() => importFromProfile(doc)} disabled={importingDocId === doc.id} style={{ opacity: importingDocId === doc.id ? 0.6 : 1, cursor: importingDocId === doc.id ? 'not-allowed' : 'pointer' }}>
                        {importingDocId === doc.id ? 'Importing...' : '+ Import'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REQUEST MODAL */}
      {showRequestModal && (
        <div className="modal-overlay" onClick={() => { setShowRequestModal(false); setEmailSent(false); }}>
          <div className="modal-box" style={{ maxWidth: 680, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-title">Request Documents from Client</p>
                <p className="modal-sub">{selectedRequests.size} document(s) selected</p>
              </div>
              <button className="btn-close" onClick={() => { setShowRequestModal(false); setEmailSent(false); }}>✕</button>
            </div>
            {emailSent ? (
              <div className="success-box">
                <span style={{ fontSize: 48 }}>✅</span>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#16a34a', margin: 0 }}>Request drafted and ready</p>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0, textAlign: 'center' }}>Will send via Gmail/Outlook once OAuth is connected. Items marked as Requested.</p>
                <button className="btn-primary" onClick={() => { setShowRequestModal(false); setEmailSent(false); }}>Done</button>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6' }}>
                  <p className="section-header">Select Documents to Request</p>
                  {requestItems.map(item => {
                    const isSel = selectedRequests.has(item.id);
                    const isDone = item.status === 'uploaded';
                    return (
                      <label key={item.id} className="req-label" style={{ opacity: isDone ? 0.5 : 1, background: isSel && !isDone ? '#eff6ff' : 'transparent' }}>
                        <input type="checkbox" checked={isSel && !isDone} disabled={isDone} onChange={() => { if (!isDone) toggleRequest(item.id); }} />
                        <span className="req-label-name">{item.name}</span>
                        <span className="req-label-cat">{isDone ? 'Uploaded' : CATEGORY_LABELS[item.category] || item.category}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ padding: '12px 18px', flex: 1 }}>
                  <p className="section-header">Email Draft</p>
                  <div style={{ marginBottom: 8 }}>
                    <label className="input-label">To</label>
                    <input className="input-field" value={requestEmail} onChange={e => setRequestEmail(e.target.value)} placeholder="client@email.com" />
                  </div>
                  <label className="input-label">Message</label>
                  <textarea className="textarea-field" rows={8}
                    value={requestMessage.replace('{DOCUMENT_LIST}', docListText)}
                    onChange={e => setRequestMessage(e.target.value)}
                  />
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Will send via Gmail/Outlook once OAuth is connected</p>
                </div>
                <div className="modal-footer">
                  <button className="btn-secondary" onClick={() => setShowRequestModal(false)}>Cancel</button>
                  <button className="btn-accent" style={{ fontWeight: 600, padding: '7px 18px', opacity: sendingRequest || selectedRequests.size === 0 ? 0.6 : 1, cursor: sendingRequest || selectedRequests.size === 0 ? 'not-allowed' : 'pointer' }} disabled={selectedRequests.size === 0 || sendingRequest} onClick={sendRequest}>
                    {sendingRequest ? 'Sending...' : 'Send Request'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEWER MODAL */}
      {viewerDoc && (
        <div className="viewer-overlay" onClick={() => setViewerDoc(null)}>
          <div className="viewer-box" onClick={e => e.stopPropagation()}>
            <div className="viewer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{getFileEmoji(viewerDoc.type, viewerDoc.name)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{viewerDoc.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={viewerDoc.url} download={viewerDoc.name} style={{ fontSize: 11, color: '#6366f1', padding: '5px 10px', border: '1px solid #e0e7ff', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>Download</a>
                <button className="btn-close" onClick={() => setViewerDoc(null)}>✕</button>
              </div>
            </div>
            <div className="viewer-body">
              {viewerDoc.name.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i) || viewerDoc.type.includes('image') ? (
                <div className="viewer-img-wrap">
                  <img src={viewerDoc.url} alt={viewerDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
                </div>
              ) : viewerDoc.name.match(/\.pdf$/i) || viewerDoc.type.includes('pdf') ? (
                <iframe src={viewerDoc.url} style={{ width: '100%', height: '100%', border: 'none' }} title={viewerDoc.name} />
              ) : (
                <div className="viewer-other">
                  <span style={{ fontSize: 48 }}>📎</span>
                  <p style={{ fontSize: 14, color: '#374151', fontWeight: 500, margin: 0 }}>{viewerDoc.name}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>This file type cannot be previewed</p>
                  <a href={viewerDoc.url} download={viewerDoc.name} style={{ fontSize: 13, color: 'white', background: '#6366f1', padding: '8px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>Download to view</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {parserDoc && parserApplicantId && (
        <div
          onClick={() => setParserDoc(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 800, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>AI Bank Statement Parser</p>
              <button onClick={() => setParserDoc(null)} style={{ fontSize: 18, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>x</button>
            </div>
            <BankStatementParser
              applicantId={parserApplicantId}
              document={parserDoc}
              onComplete={() => { setParserDoc(null); loadAll(); }}
              onClose={() => setParserDoc(null)}
            />
          </div>
        </div>
      )}

      {showDuplicateModal && checkResult && (
        <DuplicateWarningModal
          result={checkResult}
          actionLabel="Parse Document"
          onProceed={() => {
            setShowDuplicateModal(false);
            pendingParseAction?.();
            setPendingParseAction(null);
            setCheckResult(null);
            void fetchParseQueueRows();
            void loadAll();
          }}
          onCancel={() => {
            setShowDuplicateModal(false);
            setPendingParseAction(null);
            setCheckResult(null);
          }}
        />
      )}
    </div>
  );
};

