import React, { useEffect, useMemo, useState } from 'react';
import { logger } from '../../utils/logger';
import { crmService } from '../../services/api';
import type { Advisor, Lead, LeadActivityEntry, LeadNote } from '../../types';
import { LeadStatus } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';

function relShort(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-NZ');
}

function timelineSummary(entries: LeadActivityEntry[]): string {
  const sorted = [...entries].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return sorted.map((e) => `${relShort(e.at)}: ${e.message}`).join(' → ');
}

type LeadDetailDrawerProps = {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  advisors: Advisor[];
  currentAdvisor: Advisor | null;
  onLeadSaved: (updated: Lead) => void;
  onRequestDisqualify: (lead: Lead) => void;
  onOpenAffordability: (lead: Lead) => void;
  navigateToClient: (clientId: string) => void;
  onConvertSuccess: () => void;
};

export const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  lead,
  open,
  onClose,
  advisors,
  currentAdvisor,
  onLeadSaved,
  onRequestDisqualify,
  onOpenAffordability,
  navigateToClient,
  onConvertSuccess,
}) => {
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [converting, setConverting] = useState(false);

  const [emailEdit, setEmailEdit] = useState('');
  const [phoneEdit, setPhoneEdit] = useState('');
  const [loanEdit, setLoanEdit] = useState('');
  const [sourceEdit, setSourceEdit] = useState('');
  const [followUpEdit, setFollowUpEdit] = useState('');
  const [editingContact, setEditingContact] = useState(false);

  useEffect(() => {
    if (!lead || !open) return;
    setEmailEdit(lead.email || '');
    setPhoneEdit(lead.phone || '');
    setLoanEdit(String(lead.estimatedLoanAmount ?? ''));
    setSourceEdit(lead.source || '');
    setFollowUpEdit(lead.nextFollowUpDate || '');
    setNoteDraft('');
    setEditingContact(false);
  }, [lead?.id, open]);

  const firmAdvisors = useMemo(
    () => (lead ? advisors.filter((a) => a.firmId === lead.firmId) : []),
    [advisors, lead?.firmId],
  );

  const telHref = lead?.phone?.replace(/\s/g, '') ? `tel:${lead.phone.replace(/\s/g, '')}` : '';
  const mailHref = lead?.email ? `mailto:${encodeURIComponent(lead.email)}` : '';

  const persistFields = async (patch: {
    email?: string;
    phone?: string;
    leadSource?: string;
    estimatedLoanAmount?: number;
    nextFollowUpDate?: string | null;
    assignedTo?: string | null;
  }) => {
    if (!lead) return;
    setSaving(true);
    try {
      await crmService.updateClient(lead.id, patch);
      const next: Lead = {
        ...lead,
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.leadSource !== undefined ? { source: patch.leadSource } : {}),
        ...(patch.estimatedLoanAmount !== undefined
          ? { estimatedLoanAmount: patch.estimatedLoanAmount }
          : {}),
        ...(patch.nextFollowUpDate !== undefined
          ? { nextFollowUpDate: patch.nextFollowUpDate || undefined }
          : {}),
        ...(patch.assignedTo !== undefined
          ? { assignedAdvisorId: patch.assignedTo ? patch.assignedTo : undefined }
          : {}),
      };
      onLeadSaved(next);
    } catch (e) {
      logger.error('Lead detail save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const saveNotesAndActivity = async (notes: LeadNote[], activity: LeadActivityEntry[]) => {
    if (!lead) return;
    setSaving(true);
    try {
      await crmService.updateClient(lead.id, { leadNotes: notes, leadActivity: activity });
      onLeadSaved({ ...lead, leadNotes: notes, leadActivity: activity });
    } catch (e) {
      logger.error('Lead notes save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!lead || !noteDraft.trim()) return;
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `n_${Date.now()}`;
    const created_at = new Date().toISOString();
    const text = noteDraft.trim();
    const note: LeadNote = {
      id,
      text,
      created_at,
      author_name: currentAdvisor?.name,
    };
    const snippet = text.length > 100 ? `${text.slice(0, 97)}…` : text;
    const act: LeadActivityEntry = {
      at: created_at,
      type: 'note',
      message: `Note: "${snippet}"`,
    };
    const nextNotes = [...(lead.leadNotes || []), note];
    const nextAct = [...(lead.leadActivity || []), act];
    setNoteDraft('');
    await saveNotesAndActivity(nextNotes, nextAct);
  };

  const handleConvert = async () => {
    if (!lead) return;
    setConverting(true);
    try {
      await crmService.updateClient(lead.id, { leadStatus: LeadStatus.ClosedWon });
      onConvertSuccess();
      navigateToClient(lead.id);
      onClose();
    } catch (e) {
      logger.error('Convert lead failed:', e);
    } finally {
      setConverting(false);
    }
  };

  if (!open || !lead) return null;

  const statusBadgeClass =
    lead.status === LeadStatus.ClosedLost
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
      : 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-100';

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 border-0 cursor-default"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className="relative flex flex-col h-full w-full max-w-md shadow-2xl border-l overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        <div
          className="flex items-start justify-between gap-3 p-4 border-b shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="min-w-0 flex-1">
            <h2
              className="text-xl font-bold leading-tight m-0 truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {lead.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadgeClass}`}>
                {lead.status}
              </span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
              >
                {lead.source}
              </span>
            </div>
            <label className="block mt-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Assigned broker
            </label>
            <select
              className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
              style={{
                borderColor: 'var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
              value={lead.assignedAdvisorId ?? ''}
              disabled={saving}
              onChange={(e) => {
                const v = e.target.value;
                void persistFields({ assignedTo: v || null });
              }}
            >
              <option value="">Unassigned</option>
              {firmAdvisors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="p-2 rounded-lg hover:opacity-80 shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="X" className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 border-b space-y-2 shrink-0" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-xs font-semibold m-0" style={{ color: 'var(--text-muted)' }}>
            Quick actions
          </p>
          <div className="flex flex-wrap gap-2">
            {telHref ? (
              <a
                href={telHref}
                className="inline-flex items-center justify-center gap-1.5 border rounded-md font-semibold px-3 py-1.5 text-xs border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Icon name="Phone" className="h-4 w-4" />
                Call
              </a>
            ) : (
              <Button type="button" size="sm" variant="secondary" leftIcon="Phone" disabled>
                Call
              </Button>
            )}
            {mailHref ? (
              <a
                href={mailHref}
                className="inline-flex items-center justify-center gap-1.5 border rounded-md font-semibold px-3 py-1.5 text-xs border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Icon name="Mail" className="h-4 w-4" />
                Email
              </a>
            ) : (
              <Button type="button" size="sm" variant="secondary" leftIcon="Mail" disabled>
                Email
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon="Percent"
              onClick={() => onOpenAffordability(lead)}
            >
              Affordability
            </Button>
            <Button
              type="button"
              size="sm"
              leftIcon="UserPlus"
              isLoading={converting}
              onClick={() => void handleConvert()}
            >
              Convert to Client
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon="Trash2"
              onClick={() => {
                onRequestDisqualify(lead);
                onClose();
              }}
            >
              Disqualify
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <section>
            <h3 className="text-sm font-semibold m-0 mb-2" style={{ color: 'var(--text-primary)' }}>
              Details
            </h3>
            {!editingContact ? (
              <div className="text-sm space-y-1">
                <p className="m-0">
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => setEditingContact(true)}
                  >
                    {lead.email || 'Add email'}
                  </button>
                </p>
                <p className="m-0">
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => setEditingContact(true)}
                  >
                    {lead.phone || 'Add phone'}
                  </button>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="email"
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  style={{
                    borderColor: 'var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                  value={emailEdit}
                  onChange={(e) => setEmailEdit(e.target.value)}
                  placeholder="Email"
                />
                <input
                  type="tel"
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  style={{
                    borderColor: 'var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                  value={phoneEdit}
                  onChange={(e) => setPhoneEdit(e.target.value)}
                  placeholder="Phone"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void persistFields({ email: emailEdit.trim(), phone: phoneEdit.trim() });
                      setEditingContact(false);
                    }}
                  >
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingContact(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-3 grid gap-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Estimated loan (NZD)
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="rounded-md border px-2 py-1.5 text-sm"
                style={{
                  borderColor: 'var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
                value={loanEdit}
                disabled={saving}
                onChange={(e) => setLoanEdit(e.target.value)}
                onBlur={() => {
                  const n = Number(loanEdit.replace(/,/g, ''));
                  if (Number.isFinite(n) && n >= 0) {
                    void persistFields({ estimatedLoanAmount: n });
                  }
                }}
              />
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Lead source
              </label>
              <input
                type="text"
                className="rounded-md border px-2 py-1.5 text-sm"
                style={{
                  borderColor: 'var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
                value={sourceEdit}
                disabled={saving}
                onChange={(e) => setSourceEdit(e.target.value)}
                onBlur={() => {
                  if (sourceEdit.trim() !== lead.source) {
                    void persistFields({ leadSource: sourceEdit.trim() });
                  }
                }}
              />
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Next follow-up
              </label>
              <input
                type="date"
                className="rounded-md border px-2 py-1.5 text-sm"
                style={{
                  borderColor: 'var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
                value={followUpEdit}
                disabled={saving}
                onChange={(e) => setFollowUpEdit(e.target.value)}
                onBlur={() => {
                  const v = followUpEdit.trim();
                  void persistFields({
                    nextFollowUpDate: v ? v : null,
                  });
                }}
              />
              <p className="text-xs m-0 mt-1" style={{ color: 'var(--text-muted)' }}>
                Date added (read-only): {lead.dateAdded}
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold m-0 mb-2" style={{ color: 'var(--text-primary)' }}>
              Notes
            </h3>
            <ul className="space-y-2 list-none m-0 p-0 max-h-48 overflow-y-auto">
              {[...(lead.leadNotes || [])]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((n) => (
                  <li
                    key={n.id}
                    className="text-sm rounded-md border p-2"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(n.created_at).toLocaleString('en-NZ')}
                      {n.author_name ? ` · ${n.author_name}` : ''}
                    </span>
                    <p className="m-0 mt-1 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                      {n.text}
                    </p>
                  </li>
                ))}
            </ul>
            <textarea
              className="w-full mt-2 rounded-md border px-2 py-2 text-sm min-h-[72px] resize-y"
              style={{
                borderColor: 'var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
              placeholder="Add a note…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              className="mt-2"
              disabled={!noteDraft.trim() || saving}
              onClick={() => void handleAddNote()}
            >
              Add note
            </Button>
          </section>

          <section>
            <h3 className="text-sm font-semibold m-0 mb-2" style={{ color: 'var(--text-primary)' }}>
              Activity
            </h3>
            <p className="text-sm leading-relaxed m-0" style={{ color: 'var(--text-secondary)' }}>
              {timelineSummary(lead.leadActivity || []) || 'No activity yet.'}
            </p>
          </section>
        </div>

      </aside>
    </div>
  );
};
