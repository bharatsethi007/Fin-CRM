import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { DocumentsService } from '../../src/services/documents.service';
interface MarketRate {
  lender_name: string;
  rate_type: string;
  rate_percent: number;
  cashback_amount: number;
}

interface LenderScore {
  name: string;
  score: number;
  eligible: boolean;
  reasons: string[];
  warnings: string[];
  best_rate: number | null;
  best_rate_type: string | null;
  cashback: number;
}

interface ServiceabilityResult {
  passes_serviceability: boolean;
  dti_ratio: number;
  lvr_percent: number;
  umi_monthly: number;
  passes_anz: boolean;
  passes_asb: boolean;
  passes_bnz: boolean;
  passes_westpac: boolean;
  passes_kiwibank: boolean;
  gross_annual_income: number;
  new_loan_amount: number;
  net_monthly_income: number;
  expenses_used_monthly: number;
  total_debt_commitments_monthly: number;
  stress_test_rate: number;
}

interface AppData {
  id: string;
  reference_number: string;
  loan_amount: number;
  loan_purpose: string;
  application_type: string;
  property_address: string;
  property_value: number;
  loan_term_years: number;
  workflow_stage: string;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
}

interface Props {
  applicationId: string;
}

const RATE_LABELS: Record<string, string> = {
  fixed_6m: '6 Month', fixed_1yr: '1 Year', fixed_2yr: '2 Year',
  fixed_3yr: '3 Year', fixed_5yr: '5 Year', floating: 'Floating',
};

function fmt(n: number | null | undefined): string {
  if (!n) return '—';
  return '$' + Math.round(n).toLocaleString('en-NZ');
}

function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

export const LenderMatchTab: React.FC<Props> = ({ applicationId }) => {
  const toast = useToast();
  const [scores, setScores] = useState<LenderScore[]>([]);
  const [allRates, setAllRates] = useState<MarketRate[]>([]);
  const [serviceability, setServiceability] = useState<ServiceabilityResult | null>(null);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedDetail, setSelectedDetail] = useState<LenderScore | null>(null);
  const [rateFilter, setRateFilter] = useState<string>('fixed_2yr');
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [docCount, setDocCount] = useState(0);
  const [readinessGrade, setReadinessGrade] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, [applicationId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [svcRes, ratesRes, appRes, docs, readRes] = await Promise.all([
        supabase.from('serviceability_assessments')
          .select('*').eq('application_id', applicationId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('market_rates')
          .select('lender_name, rate_type, rate_percent, cashback_amount')
          .eq('is_current', true).eq('owner_occupied', true),
        supabase.from('applications')
          .select('id, reference_number, loan_amount, loan_purpose, application_type, property_address, property_value, loan_term_years, workflow_stage, clients(first_name, last_name, email, phone)')
          .eq('id', applicationId).single(),
        DocumentsService.list(applicationId),
        supabase.from('application_readiness_scores').select('score_grade')
          .eq('application_id', applicationId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      const svc = svcRes.data as ServiceabilityResult | null;
      const rates = ratesRes.data || [];
      setServiceability(svc);
      setAllRates(rates);
      setAppData(appRes.data as AppData | null);
      setDocCount(docs.length || 0);
      setReadinessGrade(readRes.data?.score_grade || null);
      if (svc) buildScores(svc, rates, rateFilter);
    } catch (e: any) {
      logger.error(e);
      toast.error(e?.message || 'Failed to load lender data');
    } finally {
      setLoading(false);
    }
  }

  function buildScores(svc: ServiceabilityResult, rates: MarketRate[], rType: string) {
    const lenders = [
      { name: 'ANZ',      passes: svc.passes_anz,      dtiLimit: 6.0 },
      { name: 'ASB',      passes: svc.passes_asb,      dtiLimit: 6.0 },
      { name: 'BNZ',      passes: svc.passes_bnz,      dtiLimit: 5.5 },
      { name: 'Westpac',  passes: svc.passes_westpac,  dtiLimit: 6.0 },
      { name: 'Kiwibank', passes: svc.passes_kiwibank, dtiLimit: 6.0 },
    ];
    const built: LenderScore[] = lenders.map(l => {
      const reasons: string[] = [];
      const warnings: string[] = [];
      let score = 0;
      if (l.passes) { score += 40; reasons.push('Passes serviceability at ' + svc.stress_test_rate + '% stress rate'); }
      else { warnings.push('Fails serviceability at stress test rate'); }
      if (svc.dti_ratio <= l.dtiLimit) { score += 20; reasons.push('DTI ' + svc.dti_ratio.toFixed(1) + 'x within ' + l.dtiLimit + 'x limit'); }
      else { warnings.push('DTI ' + svc.dti_ratio.toFixed(1) + 'x exceeds ' + l.dtiLimit + 'x limit'); }
      if (svc.lvr_percent <= 80) { score += 20; reasons.push('LVR ' + svc.lvr_percent.toFixed(0) + '% — standard equity'); }
      else if (svc.lvr_percent <= 90) { score += 10; warnings.push('LVR ' + svc.lvr_percent.toFixed(0) + '% — low equity margin may apply'); }
      else { warnings.push('LVR ' + svc.lvr_percent.toFixed(0) + '% — high LVR restrictions apply'); }
      if (svc.umi_monthly >= 1000) { score += 15; reasons.push('Strong UMI ' + fmt(svc.umi_monthly) + '/mth'); }
      else if (svc.umi_monthly >= 0) { score += 5; warnings.push('Thin UMI ' + fmt(svc.umi_monthly) + '/mth'); }
      const lRates = rates.filter(r => r.lender_name === l.name);
      const targetRate = lRates.find(r => r.rate_type === rType);
      const bestRate = lRates.length > 0 ? lRates.reduce((a, b) => a.rate_percent < b.rate_percent ? a : b) : null;
      if (lRates.length > 0) { score += 5; reasons.push('Rates available on panel'); }
      const cashback = targetRate?.cashback_amount || bestRate?.cashback_amount || 0;
      if (cashback > 0) { score += 5; reasons.push(fmt(cashback) + ' cashback available'); }
      return {
        name: l.name, score: Math.min(100, score),
        eligible: l.passes && svc.dti_ratio <= l.dtiLimit,
        reasons, warnings,
        best_rate: targetRate?.rate_percent || bestRate?.rate_percent || null,
        best_rate_type: targetRate?.rate_type || bestRate?.rate_type || null,
        cashback,
      };
    });
    built.sort((a, b) => b.score - a.score);
    setScores(built);
    if (!selectedDetail) setSelectedDetail(built[0] || null);
  }

  function toggleSelect(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else if (next.size < 3) next.add(name);
      return next;
    });
  }

  async function runServiceability() {
    setRunning(true);
    try {
      const { error } = await supabase.rpc('calculate_serviceability', { p_application_id: applicationId });
      if (error) throw error;
      await loadAll();
      toast.success('Serviceability assessment complete');
    } catch (e: any) {
      logger.error(e);
      toast.error(e?.message || 'Failed to run serviceability');
    } finally {
      setRunning(false);
    }
  }

  async function submitToLenders() {
    if (selected.size === 0 || !appData) return;
    setSubmitting(true);
    try {
      const selectedScores = scores.filter(s => selected.has(s.name));
      const isPrimary = (name: string) => name === selectedScores[0].name;

      for (const lender of selectedScores) {
        const { error } = await supabase.from('lender_submissions').insert({
          application_id: applicationId,
          lender_name: lender.name,
          status: 'submitted',
          submitted_at: new Date().toISOString().split('T')[0],
          is_primary: isPrimary(lender.name),
          submission_notes: 'Submitted via AdvisorFlow on ' + new Date().toLocaleDateString('en-NZ'),
        });
        if (error) throw error;
      }

      const { error: updateErr } = await supabase.from('applications')
        .update({ workflow_stage: 'submitted' })
        .eq('id', applicationId);
      if (updateErr) throw updateErr;

      await loadAll();
      toast.success('Lender submission saved');
      setSubmitted(true);
    } catch (e: any) {
      logger.error(e);
      toast.error(e?.message || 'Failed to submit to lenders');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedScores = scores.filter(s => selected.has(s.name));

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 13, color: '#6b7280' }}>Loading lender analysis...</span>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!serviceability) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>No Serviceability Data Yet</h3>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>Run serviceability to see lender match scores</p>
      <button onClick={runServiceability} disabled={running}
        style={{ padding: '10px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        {running ? 'Running...' : 'Run Serviceability Assessment'}
      </button>
    </div>
  );

  return (
    <div style={{ paddingBottom: 32 }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Select up to 3 lenders to submit</p>
          {selected.size > 0 && (
            <span style={{ fontSize: 11, background: '#6366f1', color: 'white', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
              {selected.size} selected
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={rateFilter} onChange={e => { setRateFilter(e.target.value); if (serviceability) buildScores(serviceability, allRates, e.target.value); }}
            style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: 'white' }}>
            {Object.entries(RATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={runServiceability} disabled={running}
            style={{ fontSize: 11, color: '#6b7280', background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>
            {running ? '...' : '↻'}
          </button>
          {selected.size > 0 && (
            <button onClick={() => setShowPreview(true)}
              style={{ fontSize: 12, padding: '7px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>
              Preview & Submit →
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Lender list with checkboxes */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Lender Ranking — click to select
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scores.map((lender, idx) => {
              const isSel = selected.has(lender.name);
              const isDetail = selectedDetail?.name === lender.name;
              const rankColor = idx === 0 ? '#16a34a' : idx === 1 ? '#2563eb' : '#6b7280';
              return (
                <div key={lender.name} style={{
                  padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                  border: isSel ? '2px solid #6366f1' : '1px solid ' + (lender.eligible ? '#e5e7eb' : '#fca5a5'),
                  background: isSel ? '#eff6ff' : lender.eligible ? 'white' : '#fef2f2',
                  boxShadow: isSel ? '0 0 0 3px #e0e7ff' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={isSel}
                      onChange={() => toggleSelect(lender.name)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#6366f1' }}
                      onClick={e => e.stopPropagation()}
                    />
                    <span style={{ fontSize: 12, fontWeight: 800, color: rankColor, minWidth: 20 }}>#{idx + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', flex: 1 }}
                      onClick={() => setSelectedDetail(lender)}>
                      {lender.name}
                    </span>
                    {lender.best_rate && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{lender.best_rate.toFixed(2)}%</span>
                    )}
                    {lender.cashback > 0 && (
                      <span style={{ fontSize: 10, color: '#6366f1', background: '#eff6ff', padding: '2px 6px', borderRadius: 10 }}>
                        ${(lender.cashback / 1000).toFixed(0)}k cb
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <div style={{ height: 5, background: '#e5e7eb', borderRadius: 99, flex: 1, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: lender.score + '%', background: scoreColor(lender.score), borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(lender.score), minWidth: 30, textAlign: 'right' }}>
                      {lender.score}%
                    </span>
                  </div>
                  {!lender.eligible && (
                    <p style={{ fontSize: 11, color: '#dc2626', margin: '4px 0 0' }}>Not eligible — fails serviceability</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div>
          {selectedDetail ? (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                {selectedDetail.name} — Analysis
              </p>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: 24 }}>{selectedDetail.eligible ? '✅' : '❌'}</span>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>{selectedDetail.name}</p>
                    <p style={{ fontSize: 12, color: selectedDetail.eligible ? '#16a34a' : '#dc2626', margin: '2px 0 0', fontWeight: 600 }}>
                      {selectedDetail.eligible ? 'Eligible — recommended' : 'Not eligible'}
                    </p>
                  </div>
                </div>
                {selectedDetail.best_rate && (
                  <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px', fontWeight: 700, textTransform: 'uppercase' }}>{RATE_LABELS[rateFilter]}</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: '#6366f1', margin: 0 }}>{selectedDetail.best_rate.toFixed(2)}%</p>
                    </div>
                    {selectedDetail.cashback > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px', fontWeight: 700, textTransform: 'uppercase' }}>Cashback</p>
                        <p style={{ fontSize: 16, fontWeight: 700, color: '#6366f1', margin: 0 }}>{fmt(selectedDetail.cashback)}</p>
                      </div>
                    )}
                  </div>
                )}
                {selectedDetail.reasons.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', margin: '0 0 5px' }}>Positive Factors</p>
                    {selectedDetail.reasons.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: '#16a34a' }}>✓</span>
                        <span style={{ fontSize: 12, color: '#374151' }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedDetail.warnings.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', margin: '0 0 5px' }}>Risk Factors</p>
                    {selectedDetail.warnings.map((w, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: '#dc2626' }}>✗</span>
                        <span style={{ fontSize: 12, color: '#374151' }}>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, border: '2px dashed #e5e7eb', borderRadius: 10 }}>
              <p style={{ fontSize: 13, color: '#9ca3af' }}>Click a lender to see analysis</p>
            </div>
          )}
        </div>
      </div>

      {/* PREVIEW MODAL */}
      {showPreview && appData && (
        <div onClick={() => !submitting && setShowPreview(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>

            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: 0 }}>Application Submission Preview</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>
                  Submitting to {selected.size} lender{selected.size > 1 ? 's' : ''}:
                  {' '}{Array.from(selected).join(', ')}
                </p>
              </div>
              {!submitted && (
                <button onClick={() => setShowPreview(false)}
                  style={{ fontSize: 18, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              )}
            </div>

            {submitted ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 48 }}>
                <span style={{ fontSize: 56 }}>🚀</span>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>Application Submitted!</h2>
                <p style={{ fontSize: 14, color: '#6b7280', margin: 0, textAlign: 'center' }}>
                  Submitted to {Array.from(selected).join(', ')}.<br />
                  Email drafts are ready — they will send automatically once Gmail/Outlook OAuth is connected.<br />
                  The Submission tab has been updated.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => { setShowPreview(false); setSubmitted(false); setSelected(new Set()); }}
                    style={{ padding: '10px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Done — View Submission Tab
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Client & Loan */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px', letterSpacing: '0.06em' }}>Client & Loan Details</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <PreviewRow label="Client" value={(appData.clients?.first_name || '') + ' ' + (appData.clients?.last_name || '')} />
                    <PreviewRow label="Email" value={appData.clients?.email || '—'} />
                    <PreviewRow label="Phone" value={appData.clients?.phone || '—'} />
                    <PreviewRow label="Loan Amount" value={fmt(appData.loan_amount)} highlight />
                    <PreviewRow label="Purpose" value={appData.loan_purpose || '—'} />
                    <PreviewRow label="Type" value={appData.application_type || '—'} />
                    <PreviewRow label="Property" value={appData.property_address || '—'} />
                    <PreviewRow label="Property Value" value={fmt(appData.property_value)} />
                    <PreviewRow label="Loan Term" value={(appData.loan_term_years || 30) + ' years'} />
                  </div>
                </div>

                {/* Serviceability */}
                {serviceability && (
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px', letterSpacing: '0.06em' }}>Serviceability</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <PreviewRow label="Gross Income" value={fmt(serviceability.gross_annual_income) + '/yr'} />
                      <PreviewRow label="Net Monthly" value={fmt(serviceability.net_monthly_income) + '/mth'} />
                      <PreviewRow label="Expenses (HEM)" value={fmt(serviceability.expenses_used_monthly) + '/mth'} />
                      <PreviewRow label="UMI" value={fmt(serviceability.umi_monthly) + '/mth'} highlight={serviceability.umi_monthly > 0} warn={serviceability.umi_monthly <= 0} />
                      <PreviewRow label="DTI Ratio" value={serviceability.dti_ratio.toFixed(1) + 'x'} highlight={serviceability.dti_ratio <= 6} warn={serviceability.dti_ratio > 6} />
                      <PreviewRow label="LVR" value={serviceability.lvr_percent.toFixed(0) + '%'} highlight={serviceability.lvr_percent <= 80} warn={serviceability.lvr_percent > 80} />
                    </div>
                  </div>
                )}

                {/* Application readiness */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px', letterSpacing: '0.06em' }}>Application Status</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <PreviewRow label="Readiness Grade" value={readinessGrade || '—'} highlight={readinessGrade === 'A' || readinessGrade === 'B'} warn={readinessGrade === 'D' || readinessGrade === 'F'} />
                    <PreviewRow label="Documents" value={docCount + ' uploaded'} highlight={docCount >= 5} warn={docCount < 3} />
                  </div>
                </div>

                {/* Selected lenders */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px', letterSpacing: '0.06em' }}>Selected Lenders</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedScores.map((l, idx) => (
                      <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: idx === 0 ? '#16a34a' : '#6b7280', minWidth: 20 }}>#{idx + 1}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', flex: 1 }}>{l.name}</span>
                        {idx === 0 && <span style={{ fontSize: 10, background: '#6366f1', color: 'white', padding: '2px 8px', borderRadius: 10 }}>Primary</span>}
                        {l.best_rate && <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{l.best_rate.toFixed(2)}%</span>}
                        {l.cashback > 0 && <span style={{ fontSize: 11, color: '#16a34a' }}>{fmt(l.cashback)} cb</span>}
                        <span style={{ fontSize: 11, color: l.eligible ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {l.eligible ? 'Eligible' : 'Risk'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Email preview */}
                <div style={{ padding: '16px 20px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px', letterSpacing: '0.06em' }}>Email Drafts</p>
                  {selectedScores.map(l => (
                    <div key={l.name} style={{ marginBottom: 10, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>To: {l.name} BDM</p>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 4px' }}>Subject: New Application — {(appData.clients?.first_name || '') + ' ' + (appData.clients?.last_name || '')} — {fmt(appData.loan_amount)}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, fontStyle: 'italic' }}>
                        Please find attached a new application for your assessment. Client: {(appData.clients?.first_name || '') + ' ' + (appData.clients?.last_name || '')}, Loan: {fmt(appData.loan_amount)}, LVR: {serviceability ? serviceability.lvr_percent.toFixed(0) + '%' : '—'}, DTI: {serviceability ? serviceability.dti_ratio.toFixed(1) + 'x' : '—'}. Documents attached.
                      </p>
                    </div>
                  ))}
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '8px 0 0' }}>
                    ⚡ Emails will send automatically once Gmail/Outlook OAuth is connected
                  </p>
                </div>
              </div>
            )}

            {/* Footer */}
            {!submitted && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#f9fafb' }}>
                <div>
                  {selectedScores.some(l => !l.eligible) && (
                    <p style={{ fontSize: 12, color: '#d97706', margin: 0, fontWeight: 500 }}>
                      ⚠ {selectedScores.filter(l => !l.eligible).map(l => l.name).join(', ')} may not be eligible — proceed with caution
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowPreview(false)}
                    style={{ fontSize: 12, padding: '8px 16px', background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer' }}>
                    Back to Edit
                  </button>
                  <button onClick={submitToLenders} disabled={submitting}
                    style={{ fontSize: 13, padding: '9px 22px', background: submitting ? '#e5e7eb' : '#6366f1', color: submitting ? '#9ca3af' : 'white', border: 'none', borderRadius: 7, cursor: submitting ? 'default' : 'pointer', fontWeight: 700 }}>
                    {submitting ? 'Submitting...' : 'Submit to ' + selected.size + ' Lender' + (selected.size > 1 ? 's' : '') + ' 🚀'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function PreviewRow({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  const color = warn ? '#dc2626' : highlight ? '#16a34a' : '#374151';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f9fafb' }}>
      <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: highlight || warn ? 700 : 400, color }}>{value}</span>
    </div>
  );
}
