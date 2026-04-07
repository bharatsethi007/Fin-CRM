import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

interface Submission {
  id: string;
  lender_name: string;
  lender_product: string;
  bdm_name: string;
  bdm_email: string;
  bdm_phone: string;
  submitted_at: string;
  status: string;
  outcome: string;
  conditional_approval_date: string;
  conditional_approval_expiry: string;
  conditional_approval_amount: number;
  conditional_interest_rate: number;
  unconditional_date: string;
  settlement_date: string;
  letter_of_offer_received: boolean;
  letter_of_offer_signed: boolean;
  decline_reason: string;
  is_primary: boolean;
  submission_reference: string;
  submission_notes: string;
}

interface Condition {
  id: string;
  condition_number: number;
  condition_text: string;
  condition_category: string;
  status: string;
  due_date: string;
  priority: string;
  completion_notes: string;
}

interface SalePurchase {
  id: string;
  purchase_price: number;
  deposit_amount: number;
  finance_condition_date: string;
  finance_condition_met: boolean;
  finance_condition_failed: boolean;
  finance_condition_extended: boolean;
  finance_condition_extension_date: string;
  building_inspection_required: boolean;
  building_inspection_result: string;
  building_inspection_company: string;
  lim_required: boolean;
  lim_received_date: string;
  lim_issues_found: boolean;
  title_search_completed: boolean;
  title_issues_found: boolean;
  solicitor_name: string;
  solicitor_firm: string;
  solicitor_email: string;
  settlement_date: string;
  settlement_confirmed: boolean;
  status: string;
}

interface Props {
  applicationId: string;
}

interface ApplicationRow {
  firm_id: string;
  workflow_stage: string | null;
  loan_amount: number | null;
}

interface LenderCommissionRateRow {
  id?: string;
  firm_id?: string;
  lender_name?: string;
  upfront_rate?: number | null;
  /** When set, gross = loan_amount * (upfront_rate_percent / 100). */
  upfront_rate_percent?: number | null;
  aggregator_fee?: number | null;
}

interface CommissionRow {
  id: string;
  gross_amount?: number | null;
  gst?: number | null;
  aggregator_fee?: number | null;
  net_amount?: number | null;
  status?: string | null;
  received_date?: string | null;
  commission_type?: string | null;
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft:          { color: '#9ca3af', bg: '#f9fafb' },
  pending:        { color: '#6b7280', bg: '#f3f4f6' },
  submitted:      { color: '#2563eb', bg: '#eff6ff' },
  conditional:    { color: '#d97706', bg: '#fffbeb' },
  unconditional:  { color: '#7c3aed', bg: '#f5f3ff' },
  approved:       { color: '#16a34a', bg: '#f0fdf4' },
  settled:        { color: '#16a34a', bg: '#f0fdf4' },
  declined:       { color: '#dc2626', bg: '#fef2f2' },
  withdrawn:      { color: '#9ca3af', bg: '#f3f4f6' },
};

const CONDITION_STATUS: Record<string, { color: string; label: string }> = {
  outstanding: { color: '#dc2626', label: 'Outstanding' },
  in_progress: { color: '#d97706', label: 'In Progress' },
  satisfied:   { color: '#16a34a', label: 'Satisfied' },
  waived:      { color: '#9ca3af', label: 'Waived' },
};

function fmt(n: number | null): string {
  if (!n) return '—';
  return '$' + Math.round(n).toLocaleString('en-NZ');
}

function fmtCommission(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return (
    '$' +
    Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function addMonthsIso(dateStr: string | null | undefined, months: number): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const x = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  return x.toISOString().slice(0, 10);
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - Date.now()) / 86400000);
}

function DateChip({ date, label, urgentDays = 7 }: { date: string | null; label: string; urgentDays?: number }) {
  if (!date) return <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>;
  const days = daysUntil(date);
  const isUrgent = days != null && days <= urgentDays && days >= 0;
  const isOverdue = days != null && days < 0;
  const color = isOverdue ? '#dc2626' : isUrgent ? '#d97706' : '#374151';
  return (
    <span style={{ fontSize: 12, color, fontWeight: isUrgent || isOverdue ? 700 : 400 }}>
      {new Date(date).toLocaleDateString('en-NZ')}
      {isOverdue && ' (overdue)'}
      {isUrgent && !isOverdue && ' (' + days + 'd)'}
    </span>
  );
}

export const SubmissionTab: React.FC<Props> = ({ applicationId }) => {
  const toast = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [sp, setSp] = useState<SalePurchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubmission, setActiveSubmission] = useState<string | null>(null);
  const [showAddSubmission, setShowAddSubmission] = useState(false);
  const [newLender, setNewLender] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [saving, setSaving] = useState(false);
  const [appRow, setAppRow] = useState<ApplicationRow | null>(null);
  const [lenderRates, setLenderRates] = useState<LenderCommissionRateRow | null>(null);
  const [commissionRow, setCommissionRow] = useState<CommissionRow | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [markingReceived, setMarkingReceived] = useState(false);

  useEffect(() => { loadAll(); }, [applicationId]);

  async function loadAll() {
    setLoading(true);
    const [subRes, condRes, spRes, appRes] = await Promise.all([
      supabase.from('lender_submissions').select('*').eq('application_id', applicationId).order('created_at'),
      supabase.from('application_conditions').select('*').eq('application_id', applicationId).order('condition_number'),
      supabase.from('sale_and_purchase').select('*').eq('application_id', applicationId).maybeSingle(),
      supabase.from('applications').select('firm_id, workflow_stage, loan_amount').eq('id', applicationId).maybeSingle(),
    ]);
    const subs = subRes.data || [];
    setSubmissions(subs);
    setConditions(condRes.data || []);
    setSp(spRes.data || null);
    setAppRow(appRes.data as ApplicationRow | null);
    if (subs.length > 0 && !activeSubmission) {
      const primary = subs.find(s => s.is_primary) || subs[0];
      setActiveSubmission(primary.id);
    }
    setLoading(false);
  }

  const activeSub = submissions.find(s => s.id === activeSubmission);

  const showCommissionPreview =
    !!appRow &&
    (appRow.workflow_stage || '').toLowerCase() === 'settled' &&
    !!activeSub &&
    (activeSub.status === 'approved' || activeSub.status === 'settled');

  useEffect(() => {
    let cancelled = false;
    async function loadCommissionData() {
      if (!showCommissionPreview || !appRow?.firm_id || !activeSub) {
        setLenderRates(null);
        setCommissionRow(null);
        setCommissionLoading(false);
        return;
      }
      setCommissionLoading(true);
      const firmId = appRow.firm_id;
      const selectedLender = activeSub.lender_name;
      const [ratesRes, commRes] = await Promise.all([
        supabase
          .from('lender_commission_rates')
          .select('*')
          .eq('firm_id', firmId)
          .eq('lender_name', selectedLender)
          .maybeSingle(),
        supabase
          .from('commissions')
          .select('*')
          .eq('application_id', applicationId)
          .eq('commission_type', 'upfront')
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setLenderRates((ratesRes.data as LenderCommissionRateRow) || null);
      setCommissionRow((commRes.data as CommissionRow) || null);
      setCommissionLoading(false);
    }
    loadCommissionData();
    return () => {
      cancelled = true;
    };
  }, [showCommissionPreview, appRow?.firm_id, activeSub?.id, activeSub?.lender_name, applicationId]);

  async function addSubmission() {
    if (!newLender.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('lender_submissions').insert({
        application_id: applicationId,
        lender_name: newLender.trim(),
        lender_product: newProduct.trim(),
        status: 'pending',
        is_primary: submissions.length === 0,
      });
      if (error) throw error;
      setNewLender('');
      setNewProduct('');
      setShowAddSubmission(false);
      await loadAll();
      toast.success('Lender submission added');
    } catch (e: any) {
      logger.error(e);
      toast.error(e?.message || 'Failed to add submission');
    } finally {
      setSaving(false);
    }
  }

  async function updateSubmissionStatus(id: string, status: string) {
    try {
      const { error } = await supabase.from('lender_submissions').update({ status }).eq('id', id);
      if (error) throw error;
      await loadAll();
      toast.success('Submission status updated');
    } catch (e: any) {
      logger.error(e);
      toast.error(e?.message || 'Failed to update status');
    }
  }

  async function updateConditionStatus(id: string, status: string) {
    try {
      const { error } = await supabase.from('application_conditions').update({
        status,
        completed_at: status === 'satisfied' ? new Date().toISOString() : null,
      }).eq('id', id);
      if (error) throw error;
      await loadAll();
      toast.success('Condition updated');
    } catch (e: any) {
      logger.error(e);
      toast.error(e?.message || 'Failed to update condition');
    }
  }

  async function markCommissionReceived() {
    if (!commissionRow?.id) return;
    setMarkingReceived(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from('commissions')
        .update({ status: 'received', received_date: today })
        .eq('id', commissionRow.id);
      if (error) throw error;
      setCommissionRow({ ...commissionRow, status: 'received', received_date: today });
      await loadAll();
      toast.success('Commission marked as received');
    } catch (e: any) {
      logger.error(e);
      toast.error(e?.message || 'Failed to mark commission received');
    } finally {
      setMarkingReceived(false);
    }
  }

  const subConditions = conditions.filter(c => c.submission_id === activeSubmission || !c.submission_id);
  const finDays = daysUntil(sp?.finance_condition_date || null);

  const loanAmount = Number(appRow?.loan_amount) || 0;
  const upfrontPct =
    lenderRates?.upfront_rate_percent != null ? Number(lenderRates.upfront_rate_percent) : null;
  const upfrontLegacy =
    lenderRates?.upfront_rate != null ? Number(lenderRates.upfront_rate) : null;
  const grossPreview =
    upfrontPct != null && !Number.isNaN(upfrontPct)
      ? loanAmount * (upfrontPct / 100)
      : upfrontLegacy != null && !Number.isNaN(upfrontLegacy)
        ? loanAmount * upfrontLegacy
        : null;
  const aggregatorConfigured =
    lenderRates?.aggregator_fee != null ? Number(lenderRates.aggregator_fee) : 0;
  const gstPreview = grossPreview != null ? grossPreview * 0.15 : null;
  const netPreview =
    grossPreview != null && gstPreview != null
      ? grossPreview + gstPreview - aggregatorConfigured
      : null;

  const grossShown =
    commissionRow?.gross_amount != null ? Number(commissionRow.gross_amount) : grossPreview;
  const gstShown = commissionRow?.gst != null ? Number(commissionRow.gst) : gstPreview;
  const aggregatorShown =
    commissionRow?.aggregator_fee != null
      ? Number(commissionRow.aggregator_fee)
      : aggregatorConfigured;
  const netShown =
    commissionRow?.net_amount != null
      ? Number(commissionRow.net_amount)
      : netPreview;

  const settlementForClawback = activeSub?.settlement_date || sp?.settlement_date;
  const clawbackRiskUntil = addMonthsIso(settlementForClawback, 27);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 13, color: '#6b7280' }}>Loading...</span>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ paddingBottom: 32 }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Finance condition alert */}
      {sp?.finance_condition_date && !sp.finance_condition_met && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, marginBottom: 16,
          background: finDays != null && finDays < 0 ? '#fef2f2' : finDays != null && finDays <= 3 ? '#fef2f2' : '#fffbeb',
          border: finDays != null && finDays <= 3 ? '1px solid #fca5a5' : '1px solid #fcd34d',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{finDays != null && finDays < 0 ? 'OVERDUE' : finDays != null && finDays <= 3 ? 'URGENT' : 'Finance Condition'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: finDays != null && finDays <= 3 ? '#dc2626' : '#d97706' }}>
              Finance condition: {new Date(sp.finance_condition_date).toLocaleDateString('en-NZ')}
              {finDays != null && finDays >= 0 && ' — ' + finDays + ' days remaining'}
              {finDays != null && finDays < 0 && ' — OVERDUE'}
            </span>
          </div>
        </div>
      )}

      {/* Lender submissions */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 }}>Lender Submissions</h3>
          <button onClick={() => setShowAddSubmission(true)}
            style={{ fontSize: 11, padding: '5px 12px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            + Add Lender
          </button>
        </div>

        {showAddSubmission && (
          <div style={{ padding: '12px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newLender} onChange={e => setNewLender(e.target.value)} placeholder="Lender name (e.g. ANZ)"
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, width: 150 }} />
            <input value={newProduct} onChange={e => setNewProduct(e.target.value)} placeholder="Product (optional)"
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, width: 180 }} />
            <button onClick={addSubmission} disabled={saving}
              style={{ fontSize: 11, padding: '6px 14px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              {saving ? 'Saving...' : 'Add'}
            </button>
            <button onClick={() => setShowAddSubmission(false)}
              style={{ fontSize: 11, padding: '6px 10px', background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}

        {submissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', border: '2px dashed #e5e7eb', borderRadius: 10 }}>
            <p style={{ fontSize: 14, color: '#9ca3af', margin: '0 0 4px' }}>No lender submissions yet</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Add a lender above to start tracking submissions</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {submissions.map(sub => {
              const cfg = STATUS_COLORS[sub.status] || STATUS_COLORS.pending;
              const isActive = activeSubmission === sub.id;
              return (
                <div key={sub.id} onClick={() => setActiveSubmission(sub.id)}
                  style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid ' + (isActive ? '#6366f1' : '#e5e7eb'), background: isActive ? '#eff6ff' : 'white', cursor: 'pointer', minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{sub.lender_name}</span>
                    {sub.is_primary && <span style={{ fontSize: 9, background: '#6366f1', color: 'white', padding: '1px 5px', borderRadius: 10 }}>Primary</span>}
                  </div>
                  <span style={{ fontSize: 11, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'capitalize' }}>
                    {sub.status}
                  </span>
                  {sub.submitted_at && (
                    <p style={{ fontSize: 10, color: '#9ca3af', margin: '4px 0 0' }}>
                      Submitted {new Date(sub.submitted_at).toLocaleDateString('en-NZ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active submission details */}
      {activeSub && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              {activeSub.lender_name} — Details
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Row label="Status">
                <select value={activeSub.status} onChange={e => updateSubmissionStatus(activeSub.id, e.target.value)}
                  style={{ fontSize: 12, padding: '3px 6px', border: '1px solid #e5e7eb', borderRadius: 5, background: 'white' }}>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="conditional">Conditional</option>
                  <option value="unconditional">Unconditional</option>
                  <option value="approved">Approved</option>
                  <option value="settled">Settled</option>
                  <option value="declined">Declined</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </Row>
              <Row label="Reference"><span style={{ fontSize: 12, color: '#374151' }}>{activeSub.submission_reference || '—'}</span></Row>
              <Row label="Submitted"><DateChip date={activeSub.submitted_at} label="Submitted" /></Row>
              <Row label="Conditional Approval"><DateChip date={activeSub.conditional_approval_date} label="Conditional" /></Row>
              <Row label="Approved Amount"><span style={{ fontSize: 12, color: '#374151' }}>{fmt(activeSub.conditional_approval_amount)}</span></Row>
              <Row label="Interest Rate"><span style={{ fontSize: 12, color: '#374151' }}>{activeSub.conditional_interest_rate ? activeSub.conditional_interest_rate + '%' : '—'}</span></Row>
              <Row label="Unconditional"><DateChip date={activeSub.unconditional_date} label="Unconditional" urgentDays={3} /></Row>
              <Row label="Settlement"><DateChip date={activeSub.settlement_date} label="Settlement" urgentDays={7} /></Row>
              <Row label="Letter of Offer">
                <span style={{ fontSize: 12, color: activeSub.letter_of_offer_received ? '#16a34a' : '#9ca3af' }}>
                  {activeSub.letter_of_offer_received ? (activeSub.letter_of_offer_signed ? 'Received & Signed' : 'Received — not signed') : 'Pending'}
                </span>
              </Row>
              {activeSub.bdm_name && (
                <Row label="BDM">
                  <span style={{ fontSize: 12, color: '#374151' }}>
                    {activeSub.bdm_name}
                    {activeSub.bdm_phone && ' · ' + activeSub.bdm_phone}
                  </span>
                </Row>
              )}
            </div>
          </div>

          {/* S&P details */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              Sale and Purchase
            </h4>
            {!sp ? (
              <p style={{ fontSize: 12, color: '#9ca3af' }}>No S&P data entered yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Row label="Purchase Price"><span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{fmt(sp.purchase_price)}</span></Row>
                <Row label="Deposit"><span style={{ fontSize: 12, color: '#374151' }}>{fmt(sp.deposit_amount)}</span></Row>
                <Row label="Finance Condition">
                  <span style={{ fontSize: 12, fontWeight: 600, color: finDays != null && finDays <= 3 ? '#dc2626' : '#374151' }}>
                    <DateChip date={sp.finance_condition_date} label="Finance" urgentDays={5} />
                    {sp.finance_condition_met && <span style={{ color: '#16a34a', marginLeft: 4 }}>Met</span>}
                    {sp.finance_condition_failed && <span style={{ color: '#dc2626', marginLeft: 4 }}>Failed</span>}
                  </span>
                </Row>
                <Row label="Building Inspection">
                  <span style={{ fontSize: 12, color: '#374151' }}>
                    {!sp.building_inspection_required ? 'Not required' : sp.building_inspection_result || 'Pending'}
                  </span>
                </Row>
                <Row label="LIM">
                  <span style={{ fontSize: 12, color: sp.lim_issues_found ? '#dc2626' : '#374151' }}>
                    {!sp.lim_required ? 'Not required' : sp.lim_received_date ? (sp.lim_issues_found ? 'Issues found' : 'Received — clear') : 'Pending'}
                  </span>
                </Row>
                <Row label="Title Search">
                  <span style={{ fontSize: 12, color: sp.title_issues_found ? '#dc2626' : '#374151' }}>
                    {!sp.title_search_completed ? 'Pending' : sp.title_issues_found ? 'Issues found' : 'Clear'}
                  </span>
                </Row>
                {sp.solicitor_name && (
                  <Row label="Solicitor">
                    <span style={{ fontSize: 12, color: '#374151' }}>{sp.solicitor_name} — {sp.solicitor_firm}</span>
                  </Row>
                )}
                <Row label="Settlement">
                  <span style={{ fontSize: 12, color: '#374151' }}>
                    <DateChip date={sp.settlement_date} label="Settlement" urgentDays={7} />
                    {sp.settlement_confirmed && <span style={{ color: '#16a34a', marginLeft: 4 }}>Confirmed</span>}
                  </span>
                </Row>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Commission preview — settled application + approved/settled lender */}
      {showCommissionPreview && (
        <div
          style={{
            marginBottom: 20,
            border: '1px solid #c7d2fe',
            borderRadius: 10,
            padding: '16px 18px',
            background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)',
          }}
        >
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#3730a3', margin: '0 0 4px' }}>
            Commission preview
          </h3>
          <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 14px' }}>
            Upfront estimate for <strong>{activeSub?.lender_name}</strong>
            {commissionRow?.id ? (
              <span style={{ color: '#16a34a', marginLeft: 8 }}>· Linked to commission record</span>
            ) : (
              <span style={{ color: '#d97706', marginLeft: 8 }}>
                · No DB row yet (created when settlement is recorded)
              </span>
            )}
          </p>

          {commissionLoading ? (
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading commission data…</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>
                  Expected upfront
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{fmtCommission(grossShown)}</div>
              </div>
              <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>
                  GST (15%)
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{fmtCommission(gstShown)}</div>
              </div>
              <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>
                  Aggregator fee
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                  {lenderRates?.aggregator_fee != null || commissionRow?.aggregator_fee != null
                    ? fmtCommission(aggregatorShown)
                    : '—'}
                </div>
              </div>
              <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>
                  Net to broker
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{fmtCommission(netShown)}</div>
              </div>
              <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #e5e7eb', gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>
                  Clawback risk period ends
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
                  {clawbackRiskUntil
                    ? new Date(clawbackRiskUntil).toLocaleDateString('en-NZ')
                    : '—'}
                  <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
                    (settlement + 27 months)
                  </span>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={markCommissionReceived}
              disabled={!commissionRow?.id || commissionRow?.status === 'received' || markingReceived}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                cursor:
                  !commissionRow?.id || commissionRow?.status === 'received' ? 'not-allowed' : 'pointer',
                background:
                  !commissionRow?.id || commissionRow?.status === 'received' ? '#d1d5db' : '#6366f1',
                color: 'white',
                opacity: !commissionRow?.id || commissionRow?.status === 'received' ? 0.7 : 1,
              }}
            >
              {markingReceived ? 'Saving…' : commissionRow?.status === 'received' ? 'Received' : 'Mark as received'}
            </button>
            {!lenderRates && !commissionLoading && (
              <span style={{ fontSize: 11, color: '#b45309' }}>
                No row in lender_commission_rates for this lender — add rates under firm settings to see a full preview.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Conditions list */}
      {subConditions.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 10px' }}>
            Conditions ({subConditions.filter(c => c.status === 'outstanding').length} outstanding)
          </h3>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            {subConditions.map((cond, idx) => {
              const cfg = CONDITION_STATUS[cond.status] || CONDITION_STATUS.outstanding;
              return (
                <div key={cond.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none', background: cond.status === 'satisfied' ? '#f9fafb' : 'white' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', flexShrink: 0, marginTop: 2, minWidth: 20 }}>{cond.condition_number}.</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, color: cond.status === 'satisfied' ? '#9ca3af' : '#374151', margin: '0 0 2px', textDecoration: cond.status === 'satisfied' ? 'line-through' : 'none' }}>
                      {cond.condition_text}
                    </p>
                    {cond.due_date && <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Due: {new Date(cond.due_date).toLocaleDateString('en-NZ')}</p>}
                  </div>
                  <select value={cond.status} onChange={e => updateConditionStatus(cond.id, e.target.value)}
                    style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #e5e7eb', borderRadius: 5, color: cfg.color, background: 'white', cursor: 'pointer', flexShrink: 0 }}>
                    {Object.entries(CONDITION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid #f9fafb' }}>
      <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}
