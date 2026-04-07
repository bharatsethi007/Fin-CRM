import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '../../utils/logger';
import { crmService } from '../../services/api';
import type { Advisor, Lead, LeadActivityEntry } from '../../types';
import { LeadStatus } from '../../types';
import { LEAD_STATUS_COLUMNS } from '../../constants';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';
import {
  AffordabilityCalculatorStandaloneModal,
  leadToAffordabilityDefaults,
  useAffordabilityCalculator,
} from '../common/AffordabilityCalculator';
import { useToast } from '../../hooks/useToast';
import { LeadDetailDrawer } from './LeadDetailDrawer';

function followUpOverdue(isoDate: string | undefined): boolean {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const d = new Date(isoDate + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

const LeadCard: React.FC<{
  lead: Lead;
  advisors: Advisor[];
  onOpenDetail: (lead: Lead) => void;
  onDragHandleStart: (e: React.DragEvent, lead: Lead) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
}> = ({ lead, advisors, onOpenDetail, onDragHandleStart, onDragEnd, isDragging }) => {
  const broker = advisors.find((a) => a.id === lead.assignedAdvisorId);
  const fuOver = followUpOverdue(lead.nextFollowUpDate);

  return (
    <div
      className={`flex gap-1.5 p-2 mb-3 rounded-md shadow-sm transition-colors border ${
        isDragging ? 'opacity-50' : ''
      } bg-gray-100 dark:bg-gray-700 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600`}
      style={{ borderColor: isDragging ? 'var(--accent)' : undefined }}
    >
      <button
        type="button"
        draggable
        onDragStart={(e) => onDragHandleStart(e, lead)}
        onDragEnd={onDragEnd}
        className="shrink-0 w-7 flex items-start justify-center pt-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing border-0 bg-transparent p-0"
        aria-label="Drag to move lead"
        onClick={(e) => e.stopPropagation()}
      >
        <Icon name="GripVertical" className="h-4 w-4" />
      </button>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(lead)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenDetail(lead);
          }
        }}
        className="flex-1 min-w-0 cursor-pointer text-left"
      >
        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 m-0">{lead.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all m-0">{lead.email}</p>
        {lead.phone ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 m-0">{lead.phone}</p>
        ) : null}
        <span
          className="inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
        >
          {lead.source}
        </span>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-2 m-0">
          Est. loan: ${lead.estimatedLoanAmount.toLocaleString('en-NZ')}
        </p>
        {lead.nextFollowUpDate ? (
          <p
            className={`text-xs mt-1 m-0 font-medium ${fuOver ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Follow-up: {lead.nextFollowUpDate}
            {fuOver ? ' (overdue)' : ''}
          </p>
        ) : null}
        {broker ? (
          <div className="flex items-center gap-1.5 mt-2">
            <img
              src={broker.avatarUrl}
              alt=""
              className="w-6 h-6 rounded-full object-cover shrink-0"
            />
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{broker.name}</span>
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 m-0">Unassigned</p>
        )}
        {lead.status === LeadStatus.ClosedLost && lead.lostReason ? (
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 m-0">
            {lead.lostReason}
          </p>
        ) : null}
      </div>
    </div>
  );
};

type LeadPipelineProps = {
  navigateToApplication: (applicationId: string) => void;
  navigateToClient: (clientId: string) => void;
};

const LostReasonDialog: React.FC<{
  lead: Lead;
  reason: string;
  setReason: (v: string) => void;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ lead, reason, setReason, saving, onConfirm, onCancel }) => (
  <div
    className="fixed inset-0 z-[110] flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.5)' }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="lost-reason-title"
    onClick={(e) => e.target === e.currentTarget && !saving && onCancel()}
  >
    <div
      className="w-full max-w-md rounded-xl shadow-xl p-5 border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 id="lost-reason-title" className="text-lg font-bold m-0" style={{ color: 'var(--text-primary)' }}>
        Mark as lost
      </h3>
      <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
        Why is <strong>{lead.name}</strong> closed lost? This is saved on the record.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full mt-3 px-3 py-2 rounded-md border text-sm min-h-[88px] resize-y"
        style={{
          borderColor: 'var(--border-color)',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
        }}
        placeholder="e.g. Chose another broker, not ready to buy, duplicate enquiry…"
        autoFocus
      />
      <div className="flex justify-end gap-2 mt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm} isLoading={saving} disabled={!reason.trim()}>
          Save &amp; move
        </Button>
      </div>
    </div>
  </div>
);

const LeadPipeline: React.FC<LeadPipelineProps> = ({ navigateToApplication, navigateToClient }) => {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [qaFirst, setQaFirst] = useState('');
  const [qaLast, setQaLast] = useState('');
  const [qaEmail, setQaEmail] = useState('');
  const [qaPhone, setQaPhone] = useState('');
  const [qaLoan, setQaLoan] = useState('');
  const [qaSubmitting, setQaSubmitting] = useState(false);

  const [pendingLost, setPendingLost] = useState<Lead | null>(null);
  const [lostReasonDraft, setLostReasonDraft] = useState('');
  const [lostSaving, setLostSaving] = useState(false);

  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const drawerLead = useMemo(
    () => (drawerLeadId ? leads.find((l) => l.id === drawerLeadId) ?? null : null),
    [drawerLeadId, leads],
  );

  const { open: openGlobalAffordability } = useAffordabilityCalculator();
  const [affordLead, setAffordLead] = useState<Lead | null>(null);

  const currentAdvisor = crmService.getCurrentUser();

  const loadLeads = useCallback(() => {
    return crmService.getLeads().then((data) => {
      setLeads(data);
      return data;
    });
  }, []);

  useEffect(() => {
    loadLeads().finally(() => setIsLoading(false));
  }, [loadLeads]);

  useEffect(() => {
    crmService
      .getAdvisors()
      .then(setAdvisors)
      .catch((e) => logger.error('Failed to load advisors for leads:', e));
  }, []);

  const boardLeads = useMemo(
    () => leads.filter((lead) => lead.status !== LeadStatus.ClosedWon),
    [leads],
  );

  const getLeadsByStatus = (status: LeadStatus) => boardLeads.filter((lead) => lead.status === status);

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggingId(lead.id);
    e.dataTransfer.setData('leadId', lead.id);
    e.dataTransfer.setData('leadStatus', lead.status);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleDragOver = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  };

  const handleDragLeave = () => {
    setDragOverStatus(null);
  };

  const appendActivity = (existing: LeadActivityEntry[], message: string): LeadActivityEntry[] => [
    ...existing,
    { at: new Date().toISOString(), type: 'status_change', message },
  ];

  const applyStatusMove = async (leadId: string, targetStatus: LeadStatus, leadBefore: Lead) => {
    setIsUpdating(true);
    const nextActivity = appendActivity(leadBefore.leadActivity || [], `Moved to ${targetStatus}`);
    try {
      await crmService.updateClient(leadId, {
        leadStatus: targetStatus,
        leadActivity: nextActivity,
      });
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                status: targetStatus,
                leadActivity: nextActivity,
                lostReason: targetStatus === LeadStatus.ClosedLost ? l.lostReason : undefined,
              }
            : l,
        ),
      );
    } catch (err) {
      logger.error('Failed to update lead status:', err);
      toast.error(err instanceof Error ? err.message : 'Could not update lead status.');
      await loadLeads();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: LeadStatus) => {
    e.preventDefault();
    setDragOverStatus(null);
    const leadId = e.dataTransfer.getData('leadId');
    const sourceStatus = e.dataTransfer.getData('leadStatus') as LeadStatus;
    if (!leadId || sourceStatus === targetStatus) {
      setDraggingId(null);
      return;
    }
    setDraggingId(null);

    const leadBefore = leads.find((l) => l.id === leadId);
    if (!leadBefore) return;

    if (targetStatus === LeadStatus.ClosedLost) {
      setPendingLost(leadBefore);
      setLostReasonDraft('');
      return;
    }

    await applyStatusMove(leadId, targetStatus, leadBefore);
  };

  const confirmLost = async () => {
    if (!pendingLost || !lostReasonDraft.trim()) return;
    setLostSaving(true);
    const reason = lostReasonDraft.trim();
    const nextActivity = appendActivity(
      pendingLost.leadActivity || [],
      `Closed — Lost: ${reason}`,
    );
    try {
      await crmService.updateClient(pendingLost.id, {
        leadStatus: LeadStatus.ClosedLost,
        leadLostReason: reason,
        leadActivity: nextActivity,
      });
      setLeads((prev) =>
        prev.map((l) =>
          l.id === pendingLost.id
            ? {
                ...l,
                status: LeadStatus.ClosedLost,
                lostReason: reason,
                leadActivity: nextActivity,
              }
            : l,
        ),
      );
      setPendingLost(null);
      setLostReasonDraft('');
      toast.success('Lead marked as lost');
    } catch (err) {
      logger.error('Failed to save lost reason:', err);
      toast.error(err instanceof Error ? err.message : 'Could not update lead.');
      await loadLeads();
    } finally {
      setLostSaving(false);
    }
  };

  const cancelLost = () => {
    setPendingLost(null);
    setLostReasonDraft('');
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaFirst.trim() || !qaLast.trim() || !qaEmail.trim()) {
      toast.error('First name, last name, and email are required.');
      return;
    }
    const loanNum = qaLoan.trim() === '' ? 0 : Number(qaLoan.replace(/,/g, ''));
    if (qaLoan.trim() !== '' && !Number.isFinite(loanNum)) {
      toast.error('Enter a valid loan amount.');
      return;
    }
    setQaSubmitting(true);
    try {
      const newLead = await crmService.createLead({
        firstName: qaFirst.trim(),
        lastName: qaLast.trim(),
        email: qaEmail.trim(),
        phone: qaPhone.trim() || undefined,
        leadSource: 'Quick Add',
        estimatedLoanAmount: loanNum,
      });
      setLeads((prev) => [newLead, ...prev]);
      setQaFirst('');
      setQaLast('');
      setQaEmail('');
      setQaPhone('');
      setQaLoan('');
      toast.success('Lead added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add lead.');
    } finally {
      setQaSubmitting(false);
    }
  };

  const handleLeadSaved = (updated: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleConvertSuccess = () => {
    if (drawerLeadId) {
      setLeads((prev) => prev.filter((l) => l.id !== drawerLeadId));
    }
    setDrawerLeadId(null);
    toast.success('Lead converted to client. All notes and data preserved.');
  };

  const inputCls =
    'px-2.5 py-1.5 rounded-md border text-sm min-w-0 flex-1 sm:flex-none sm:w-36';
  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="pb-8">
      <div className="mb-4">
        <h2 className="text-2xl font-bold m-0">Lead Pipeline</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 mb-0">
          Drag cards between stages to track your lead progression.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button
          type="button"
          variant="secondary"
          leftIcon="Percent"
          onClick={() => openGlobalAffordability()}
        >
          Affordability
        </Button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold border transition-colors"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
          onClick={() => setQuickAddOpen((o) => !o)}
          aria-expanded={quickAddOpen}
          aria-controls="lead-quick-add-panel"
        >
          <span className="text-lg leading-none">+</span>
          Quick Add
        </button>
      </div>

      {quickAddOpen && (
        <div
          id="lead-quick-add-panel"
          className="mb-6 rounded-xl border p-3 shadow-sm"
          style={{
            borderColor: 'var(--border-color)',
            background: 'var(--bg-card)',
          }}
        >
          <form onSubmit={handleQuickAdd} className="flex flex-wrap items-end gap-2">
            <input
              type="text"
              value={qaFirst}
              onChange={(e) => setQaFirst(e.target.value)}
              className={inputCls}
              style={{ ...inputStyle, width: '7rem' }}
              placeholder="First name"
              autoComplete="given-name"
              autoFocus
            />
            <input
              type="text"
              value={qaLast}
              onChange={(e) => setQaLast(e.target.value)}
              className={inputCls}
              style={{ ...inputStyle, width: '7rem' }}
              placeholder="Last name"
              autoComplete="family-name"
            />
            <input
              type="email"
              value={qaEmail}
              onChange={(e) => setQaEmail(e.target.value)}
              className={inputCls}
              style={{ ...inputStyle, flex: '1 1 12rem', minWidth: '10rem' }}
              placeholder="Email"
              autoComplete="email"
            />
            <input
              type="tel"
              value={qaPhone}
              onChange={(e) => setQaPhone(e.target.value)}
              className={inputCls}
              style={{ ...inputStyle, width: '8rem' }}
              placeholder="Phone"
              autoComplete="tel"
            />
            <input
              type="text"
              inputMode="decimal"
              value={qaLoan}
              onChange={(e) => setQaLoan(e.target.value)}
              className={inputCls}
              style={{ ...inputStyle, width: '7rem' }}
              placeholder="Loan $"
            />
            <Button type="submit" size="sm" isLoading={qaSubmitting} className="shrink-0">
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setQuickAddOpen(false)}
            >
              Close
            </Button>
          </form>
          <p className="text-xs mt-2 mb-0" style={{ color: 'var(--text-muted)' }}>
            Creates a lead in <strong>New Lead</strong>. Press Enter in any field to submit.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-96">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarGutter: 'stable' }}>
          {LEAD_STATUS_COLUMNS.map((status) => (
            <div
              key={status}
              className={`flex-shrink-0 w-72 rounded-lg p-3 min-h-[200px] transition-all ${
                isUpdating ? 'opacity-50 pointer-events-none' : ''
              } ${dragOverStatus === status ? 'ring-2 ring-primary-500 ring-inset' : ''}`}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              <h3
                className="font-semibold mb-3 text-center text-sm leading-tight px-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {status} ({getLeadsByStatus(status).length})
              </h3>
              <div className="max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
                {getLeadsByStatus(status).map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    advisors={advisors}
                    onOpenDetail={(l) => setDrawerLeadId(l.id)}
                    onDragHandleStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isDragging={draggingId === lead.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingLost && (
        <LostReasonDialog
          lead={pendingLost}
          reason={lostReasonDraft}
          setReason={setLostReasonDraft}
          saving={lostSaving}
          onConfirm={confirmLost}
          onCancel={cancelLost}
        />
      )}

      <LeadDetailDrawer
        lead={drawerLead}
        open={drawerLead != null}
        onClose={() => setDrawerLeadId(null)}
        advisors={advisors}
        currentAdvisor={currentAdvisor}
        onLeadSaved={handleLeadSaved}
        onRequestDisqualify={(l) => {
          setPendingLost(l);
          setLostReasonDraft('');
        }}
        onOpenAffordability={(l) => setAffordLead(l)}
        navigateToClient={navigateToClient}
        onConvertSuccess={handleConvertSuccess}
      />

      <AffordabilityCalculatorStandaloneModal
        key={affordLead?.id ?? 'closed'}
        open={affordLead != null}
        onClose={() => setAffordLead(null)}
        initialValues={affordLead ? leadToAffordabilityDefaults(affordLead) : undefined}
        convertLead={
          affordLead
            ? {
                leadId: affordLead.id,
                name: affordLead.name,
                email: affordLead.email,
                phone: affordLead.phone || undefined,
              }
            : undefined
        }
        navigateToApplication={navigateToApplication}
      />
    </div>
  );
};

export default LeadPipeline;
