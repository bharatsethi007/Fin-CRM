import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '../../utils/logger';
import { crmService } from '../../services/api';
import { authService } from '../../services/api/authService';
import { toSupabaseFirmId } from '../../services/api/clientService';
import { supabase } from '../../services/supabaseClient';
import { invokeParseBankStatement } from '../../src/lib/api';
import type { Client, Lead } from '../../types';
import { LeadStatus } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import AddClientForm from './AddClientForm';
import { documentService } from '../../services/api';
import { useToast } from '../../hooks/useToast';

type HubView = 'hub' | 'scan_review' | 'convert' | 'manual';

type IdExtracted = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  idNotes: string;
};

function pickExtracted(data: Record<string, unknown> | null): Record<string, unknown> {
  if (!data) return {};
  const inner = (data.extracted_data ?? data.extracted) as unknown;
  return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : {};
}

function splitFullName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return { first: '', last: '' };
  if (p.length === 1) return { first: p[0], last: '' };
  return { first: p[0], last: p.slice(1).join(' ') };
}

function extractedToForm(ex: Record<string, unknown>): IdExtracted {
  let first = String(ex.first_name ?? '').trim();
  let last = String(ex.last_name ?? '').trim();
  const full = String(ex.full_name ?? '').trim();
  if ((!first || !last) && full) {
    const sp = splitFullName(full);
    if (!first) first = sp.first;
    if (!last) last = sp.last;
  }
  const idType = String(ex.id_type ?? '').replace(/_/g, ' ');
  const idNum = String(ex.id_number ?? '');
  const exp = String(ex.expiry_date ?? '');
  const country = String(ex.issuing_country ?? '');
  const gender = String(ex.gender ?? '');
  const lines = [
    idType && `ID type: ${idType}`,
    idNum && `ID number: ${idNum}`,
    exp && `Expiry: ${exp}`,
    country && `Issuing country: ${country}`,
    gender && `Gender: ${gender}`,
  ].filter(Boolean);
  return {
    firstName: first,
    lastName: last,
    email: '',
    phone: '',
    dateOfBirth: String(ex.date_of_birth ?? '').slice(0, 10),
    address: String(ex.address ?? '').trim(),
    idNotes: lines.join('\n'),
  };
}

const cardBase =
  'rounded-xl border p-4 flex flex-col transition-shadow hover:shadow-md';
const cardStyle: React.CSSProperties = {
  borderColor: 'var(--border-color)',
  background: 'var(--bg-card)',
};

interface Props {
  onBack: () => void;
  onSuccess: (client: Client) => void;
}

const ACCEPT_ID = 'image/jpeg,image/png,image/jpg,.pdf,application/pdf';

const AddClientSmart: React.FC<Props> = ({ onBack, onSuccess }) => {
  const toast = useToast();
  const [hubView, setHubView] = useState<HubView>('hub');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [convertProgress, setConvertProgress] = useState<{ done: number; total: number } | null>(null);
  const [converting, setConverting] = useState(false);

  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanParseProgress, setScanParseProgress] = useState<string | null>(null);
  const [idSession, setIdSession] = useState<{
    clientId: string;
    documentId: string;
    extracted: IdExtracted;
    expiryFromDoc?: string;
  } | null>(null);
  const [reviewForm, setReviewForm] = useState<IdExtracted | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const loadLeads = useCallback(() => {
    crmService.getLeads().then(setLeads).catch((e) => logger.error(e));
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const activeLeads = useMemo(
    () =>
      leads.filter(
        (l) => l.status !== LeadStatus.ClosedWon && l.status !== LeadStatus.ClosedLost,
      ),
    [leads],
  );

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return activeLeads;
    return activeLeads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.phone && l.phone.toLowerCase().includes(q)),
    );
  }, [activeLeads, leadSearch]);

  const cleanupIdPlaceholder = async (clientId: string) => {
    try {
      await crmService.deleteClient(clientId);
    } catch (e) {
      logger.warn('Cleanup placeholder client failed:', e);
    }
  };

  const processIdFile = async (file: File) => {
    const firm = authService.getCurrentFirm();
    if (!firm?.id) {
      toast.error('No firm context');
      return;
    }
    let firmId: string;
    try {
      firmId = toSupabaseFirmId(firm.id);
    } catch {
      toast.error('Invalid firm session');
      return;
    }

    const okType =
      file.type === 'image/jpeg' ||
      file.type === 'image/png' ||
      file.type === 'application/pdf' ||
      /\.(jpe?g|png|pdf)$/i.test(file.name);
    if (!okType) {
      toast.error('Use JPG, PNG, or PDF');
      return;
    }

    setScanBusy(true);
    setScanError(null);
    setScanParseProgress(null);

    const uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    let placeholderId: string | null = null;

    try {
      const placeholder = await crmService.createClient({
        firstName: 'New',
        lastName: 'Client',
        email: `id-pending-${uuid.slice(0, 12)}@placeholder.advisorflow`,
        notes: 'ID scan in progress — complete review to finalise this profile.',
      });
      placeholderId = placeholder.id;

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${placeholder.id}/id-scan/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('client-documents')
        .upload(path, file, { upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { data: docRow, error: insErr } = await supabase
        .from('documents')
        .insert({
          firm_id: firmId,
          client_id: placeholder.id,
          name: file.name,
          category: 'ID',
          url: publicUrl,
          file_type: file.type || null,
          file_size_bytes: file.size,
          upload_date: new Date().toISOString().slice(0, 10),
          detected_type: 'id_document',
        })
        .select('id')
        .single();

      if (insErr || !docRow) throw new Error(insErr?.message || 'Could not save document');

      const idScanFriendly =
        'ID scanning is being set up. Please use Manual Entry for now.';

      const { data: parseOut, error: fnErr } = await invokeParseBankStatement(
        {
          document_id: docRow.id,
          firm_id: firmId,
        },
        {
          onProgress: (row) => {
            const pct = Number(row.progress_pct) || 0;
            setScanParseProgress(`${row.current_step || row.status || 'Processing'} · ${pct}%`);
          },
        },
      );

      setScanParseProgress(null);

      if (fnErr) {
        setScanError(idScanFriendly);
        toast.error(idScanFriendly);
        if (placeholderId) await cleanupIdPlaceholder(placeholderId);
        return;
      }

      const success = parseOut && (parseOut.success === true || parseOut.ok === true);
      if (!success) {
        setScanError(idScanFriendly);
        toast.error(idScanFriendly);
        if (placeholderId) await cleanupIdPlaceholder(placeholderId);
        return;
      }

      const extracted = pickExtracted(parseOut!);
      const form = extractedToForm(extracted);
      const expiryRaw = String(extracted.expiry_date ?? '').trim().slice(0, 10);
      setIdSession({
        clientId: placeholder.id,
        documentId: docRow.id,
        extracted: form,
        expiryFromDoc: /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? expiryRaw : undefined,
      });
      setReviewForm(form);
      setHubView('scan_review');
      toast.success('ID details extracted — review below');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setScanError(msg);
      toast.error(msg);
      if (placeholderId) await cleanupIdPlaceholder(placeholderId);
    } finally {
      setScanParseProgress(null);
      setScanBusy(false);
    }
  };

  const onDropId = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) void processIdFile(f);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void processIdFile(f);
  };

  const cancelScanReview = async () => {
    if (idSession) await cleanupIdPlaceholder(idSession.clientId);
    setIdSession(null);
    setReviewForm(null);
    setHubView('hub');
    setScanError(null);
  };

  const saveIdProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idSession || !reviewForm) return;
    if (!reviewForm.firstName.trim() || !reviewForm.lastName.trim() || !reviewForm.email.trim()) {
      toast.error('First name, last name, and email are required.');
      return;
    }
    setSavingProfile(true);
    try {
      const notesParts = [reviewForm.idNotes.trim()].filter(Boolean);
      const mergedNotes = notesParts.join('\n\n') || undefined;

      await crmService.updateClient(idSession.clientId, {
        firstName: reviewForm.firstName.trim(),
        lastName: reviewForm.lastName.trim(),
        email: reviewForm.email.trim(),
        phone: reviewForm.phone.trim() || undefined,
        residentialAddress: reviewForm.address.trim() || undefined,
        dateOfBirth: reviewForm.dateOfBirth || undefined,
        notes: mergedNotes,
      });

      const expMatch = reviewForm.idNotes.match(/Expiry:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      const expiryFromNotes = expMatch ? expMatch[1] : undefined;
      const expiryDate = idSession.expiryFromDoc || expiryFromNotes;
      if (expiryDate) {
        await documentService.updateDocument(idSession.documentId, { expiryDate });
      }

      const client = await crmService.getClientById(idSession.clientId);
      if (!client) throw new Error('Could not load saved client');
      setIdSession(null);
      setReviewForm(null);
      setHubView('hub');
      onSuccess(client);
      toast.success('Client created from ID');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save client');
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runConvert = async () => {
    const ids = [...selectedLeadIds];
    if (ids.length === 0) {
      toast.error('Select at least one lead');
      return;
    }
    setConverting(true);
    setConvertProgress({ done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i++) {
        await crmService.updateClient(ids[i], { leadStatus: LeadStatus.ClosedWon });
        setConvertProgress({ done: i + 1, total: ids.length });
      }
      toast.success(
        ids.length === 1 ? 'Lead converted' : `${ids.length} leads converted to clients`,
      );
      setSelectedLeadIds(new Set());
      loadLeads();
      setHubView('hub');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Convert failed');
    } finally {
      setConverting(false);
      setConvertProgress(null);
    }
  };

  if (hubView === 'manual') {
    return (
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" className="mb-4" leftIcon="ArrowLeft" onClick={() => setHubView('hub')}>
          Back to options
        </Button>
        <AddClientForm
          embedded
          onBack={() => setHubView('hub')}
          onSuccess={onSuccess}
          submitLabel="Create client"
        />
      </div>
    );
  }

  if (hubView === 'scan_review' && reviewForm && idSession) {
    return (
      <div className="max-w-xl mx-auto">
        <Button variant="ghost" className="mb-4" leftIcon="ArrowLeft" onClick={() => void cancelScanReview()}>
          Cancel
        </Button>
        <div className="rounded-xl border p-5" style={cardStyle}>
          <h2 className="text-lg font-bold m-0 mb-1" style={{ color: 'var(--text-primary)' }}>
            Review extracted details
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Confirm before saving. The ID file is already stored under this profile as category <strong>ID</strong>.
          </p>
          <form onSubmit={saveIdProfile} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
            <input
              required
              className="px-3 py-2 rounded-md border text-sm dark:bg-gray-800 dark:border-gray-600"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
              placeholder="First name"
                value={reviewForm.firstName}
                onChange={(e) => setReviewForm({ ...reviewForm, firstName: e.target.value })}
              />
              <input
                required
                className="px-3 py-2 rounded-md border text-sm dark:bg-gray-800 dark:border-gray-600"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
                placeholder="Last name"
                value={reviewForm.lastName}
                onChange={(e) => setReviewForm({ ...reviewForm, lastName: e.target.value })}
              />
            </div>
            <input
              required
              type="email"
              className="w-full px-3 py-2 rounded-md border text-sm dark:bg-gray-800 dark:border-gray-600"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
              placeholder="Email"
              value={reviewForm.email}
              onChange={(e) => setReviewForm({ ...reviewForm, email: e.target.value })}
            />
            <input
              type="tel"
              className="w-full px-3 py-2 rounded-md border text-sm dark:bg-gray-800 dark:border-gray-600"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
              placeholder="Phone"
              value={reviewForm.phone}
              onChange={(e) => setReviewForm({ ...reviewForm, phone: e.target.value })}
            />
            <input
              type="date"
              className="w-full px-3 py-2 rounded-md border text-sm dark:bg-gray-800 dark:border-gray-600"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
              value={reviewForm.dateOfBirth}
              onChange={(e) => setReviewForm({ ...reviewForm, dateOfBirth: e.target.value })}
            />
            <input
              className="w-full px-3 py-2 rounded-md border text-sm"
              style={cardStyle}
              placeholder="Address"
              value={reviewForm.address}
              onChange={(e) => setReviewForm({ ...reviewForm, address: e.target.value })}
            />
            <textarea
              className="w-full px-3 py-2 rounded-md border text-sm min-h-[72px] dark:bg-gray-800 dark:border-gray-600"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
              placeholder="ID reference (type, number, expiry — editable)"
              value={reviewForm.idNotes}
              onChange={(e) => setReviewForm({ ...reviewForm, idNotes: e.target.value })}
            />
            <div className="flex gap-2 pt-2">
              <Button type="submit" isLoading={savingProfile}>
                Create client
              </Button>
              <Button type="button" variant="secondary" onClick={() => void cancelScanReview()}>
                Discard
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (hubView === 'convert') {
    return (
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" className="mb-4" leftIcon="ArrowLeft" onClick={() => setHubView('hub')}>
          Back to options
        </Button>
        <div className="rounded-xl border p-5" style={cardStyle}>
          <h2 className="text-lg font-bold m-0 mb-2" style={{ color: 'var(--text-primary)' }}>
            Convert from lead
          </h2>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Selected leads move to <strong>Closed — Won</strong> and stay in your client list with their current
            details.
          </p>
          <div className="relative mb-3">
            <Icon
              name="Search"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="search"
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm dark:bg-gray-800 dark:border-gray-600"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
              placeholder="Search leads…"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
            />
          </div>
          <div
            className="max-h-64 overflow-y-auto rounded-lg border divide-y"
            style={{ borderColor: 'var(--border-color)' }}
          >
            {filteredLeads.length === 0 ? (
              <p className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                No active leads to convert.
              </p>
            ) : (
              filteredLeads.map((lead) => (
                <label
                  key={lead.id}
                  className="flex items-start gap-3 p-3 cursor-pointer hover:opacity-90"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.has(lead.id)}
                    onChange={() => toggleLead(lead.id)}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="font-semibold block">{lead.name}</span>
                    <span className="text-xs opacity-80">{lead.email}</span>
                    {lead.phone ? <span className="text-xs block opacity-80">{lead.phone}</span> : null}
                  </span>
                </label>
              ))
            )}
          </div>
          {convertProgress && (
            <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>
              Converting {convertProgress.done} / {convertProgress.total}…
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => void runConvert()} isLoading={converting} disabled={selectedLeadIds.size === 0}>
              Convert{selectedLeadIds.size > 1 ? ` (${selectedLeadIds.size})` : ''}
            </Button>
            <Button variant="secondary" onClick={() => setHubView('hub')} disabled={converting}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Button variant="ghost" leftIcon="ArrowLeft" onClick={onBack}>
            Back
          </Button>
          <h2 className="text-2xl font-bold mt-2 m-0" style={{ color: 'var(--text-primary)' }}>
            Add client
          </h2>
          <p className="text-sm m-0 mt-1" style={{ color: 'var(--text-secondary)' }}>
            Choose how you want to add this client.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Option 1 — Scan ID (primary) */}
        <div
          className={`lg:col-span-6 ${cardBase} border-2 border-dashed lg:min-h-[320px]`}
          style={{
            ...cardStyle,
            borderColor: 'var(--accent)',
            boxShadow: 'var(--shadow-card)',
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropId}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className="p-2 rounded-lg"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Icon name="ScanLine" className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold m-0" style={{ color: 'var(--text-primary)' }}>
                Scan ID
              </h3>
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Recommended
              </span>
            </div>
          </div>
          <p className="text-sm flex-1 mb-4" style={{ color: 'var(--text-secondary)' }}>
            Drop a passport, driver licence, or bank statement — AI extracts the details.
          </p>
          <div
            className="flex-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 px-4 text-center min-h-[160px]"
            style={{
              borderColor: 'var(--border-color)',
              background: 'var(--bg-primary)',
            }}
          >
            {scanBusy ? (
              <>
                <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 mb-2" />
                <p className="text-sm m-0" style={{ color: 'var(--text-secondary)' }}>
                  {scanParseProgress ?? 'Uploading and parsing…'}
                </p>
              </>
            ) : (
              <>
                <Icon name="Upload" className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm font-medium m-0 mb-2" style={{ color: 'var(--text-primary)' }}>
                  Drag & drop ID image or PDF
                </p>
                <p className="text-xs m-0 mb-3" style={{ color: 'var(--text-muted)' }}>
                  JPG, PNG, or PDF (text-based PDFs only; photos work best)
                </p>
                <label>
                  <input type="file" accept={ACCEPT_ID} className="hidden" onChange={onFileInput} />
                  <span className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer bg-primary-600 text-white hover:bg-primary-700">
                    Browse files
                  </span>
                </label>
              </>
            )}
          </div>
          {scanError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2 m-0">{scanError}</p>
          )}
        </div>

        {/* Option 2 — Convert */}
        <div className={`lg:col-span-3 ${cardBase}`} style={cardStyle}>
          <div className="flex items-center gap-2 mb-2">
            <Icon name="ArrowRightLeft" className="h-6 w-6" style={{ color: 'var(--accent)' }} />
            <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>
              Convert from lead
            </h3>
          </div>
          <p className="text-sm flex-1 mb-4" style={{ color: 'var(--text-secondary)' }}>
            Promote pipeline leads to won clients — keeps all existing info.
          </p>
          <Button className="w-full mt-auto" variant="secondary" onClick={() => setHubView('convert')}>
            Select leads
          </Button>
        </div>

        {/* Option 3 — Manual */}
        <div className={`lg:col-span-3 ${cardBase}`} style={cardStyle}>
          <div className="flex items-center gap-2 mb-2">
            <Icon name="Pencil" className="h-6 w-6" style={{ color: 'var(--text-secondary)' }} />
            <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>
              Manual entry
            </h3>
          </div>
          <p className="text-sm flex-1 mb-4" style={{ color: 'var(--text-secondary)' }}>
            Enter client details yourself — full fact find form.
          </p>
          <Button className="w-full mt-auto" variant="secondary" onClick={() => setHubView('manual')}>
            Open form
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AddClientSmart;
