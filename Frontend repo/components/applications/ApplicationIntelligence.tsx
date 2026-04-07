import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { DocumentsService } from '../../src/services/documents.service';
import { ExpensesService } from '../../src/services/expenses.service';

interface IntelligenceItem {
  id: string;
  category: string;
  status: 'critical' | 'warning' | 'ok' | 'info';
  title: string;
  detail: string;
  action_label?: string;
  action_tab?: string;
  blocking_submission: boolean;
  resolved_at?: string;
}

interface Props {
  applicationId: string;
  firmId: string;
  onNavigateToTab: (tab: string) => void;
}

const STATUS = {
  critical: { dot: '#ef4444', text: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Critical' },
  warning:  { dot: '#f59e0b', text: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Warning'  },
  ok:       { dot: '#10b981', text: '#059669', bg: '#f0fdf4', border: '#a7f3d0', label: 'Done'     },
  info:     { dot: '#6366f1', text: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe', label: 'Tip'      },
};

export const ApplicationIntelligence: React.FC<Props> = ({ applicationId, firmId, onNavigateToTab }) => {
  const [items, setItems] = useState<IntelligenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [grade, setGrade] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const analyse = useCallback(async () => {
    setRefreshing(true);
    try {
      const applicantsRes = await supabase.from('applicants').select('id').eq('application_id', applicationId);
      const applicantIds = (applicantsRes.data || []).map((a: { id: string }) => a.id);

      const [
        appRes, incomeRes, expenseRes, docRes,
        compRes, svcRes, anomalyRes, readRes,
        creditRes, checklistRes
      ] = await Promise.all([
        supabase.from('applications').select('loan_amount,property_value,workflow_stage').eq('id', applicationId).single(),
        applicantIds.length > 0
          ? supabase.from('income').select('id,annual_gross_total').in('applicant_id', applicantIds)
          : Promise.resolve({ data: [], error: null }),
        ExpensesService.get(applicationId),
        DocumentsService.list(applicationId),
        supabase.from('compliance_checklists').select('*').eq('application_id', applicationId).maybeSingle(),
        supabase.from('serviceability_assessments').select('passes_serviceability,umi_monthly,dti_ratio,lvr_percent').eq('application_id', applicationId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
        supabase.from('anomaly_flags').select('id,severity,title').eq('application_id', applicationId).eq('status','open'),
        supabase.from('application_readiness_scores').select('total_score,score_grade,critical_count').eq('application_id', applicationId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
        supabase.from('credit_checks').select('checked_at').eq('application_id', applicationId).order('checked_at',{ascending:false}).limit(1).maybeSingle(),
        supabase.from('document_checklists').select('checklist_items').eq('application_id', applicationId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      ]);

      const app = appRes.data;
      const income = (incomeRes as { data: any[] | null }).data || [];
      const expenses = expenseRes ? [expenseRes] : [];
      const docs = docRes || [];
      const comp = compRes.data;
      const svc = svcRes.data;
      const anomalies = anomalyRes.data || [];
      const read = readRes.data;
      const credit = creditRes.data;
      const clItems = checklistRes.data?.checklist_items || [];

      if (read) { setGrade(read.score_grade); setScore(read.total_score); }

      const built: IntelligenceItem[] = [];
      let idx = 0;
      const add = (item: Omit<IntelligenceItem, 'id'>) => built.push({ ...item, id: String(++idx) });

      // Loan amount
      if (!app?.loan_amount) {
        add({ category: 'Overview', status: 'critical', title: 'Loan amount not set', detail: 'Required for all calculations — LVR, DTI, serviceability.', action_label: 'Set loan amount', action_tab: 'Overview', blocking_submission: true });
      }

      // Income
      if (income.length === 0) {
        add({ category: 'Income', status: 'critical', title: 'No income data', detail: 'Income must be entered before serviceability can be assessed.', action_label: 'Add income', action_tab: 'financial', blocking_submission: true });
      } else {
        const hasDocs = docs.some(d => d.category === '02 Financial Evidence');
        if (!hasDocs) {
          add({ category: 'Income', status: 'warning', title: 'Income unverified — no documents', detail: 'Upload payslips or bank statements to verify declared income.', action_label: 'Upload documents', action_tab: 'Documents', blocking_submission: false });
        } else {
          const unparsed = docs.filter(d => d.category === '02 Financial Evidence' && d.parse_status !== 'parsed').length;
          if (unparsed > 0) {
            add({ category: 'Income', status: 'info', title: unparsed + ' document' + (unparsed > 1 ? 's' : '') + ' not yet AI parsed', detail: 'Use the AI Parse button to auto-verify income against bank statements.', action_label: 'Go to Documents', action_tab: 'Documents', blocking_submission: false });
          } else {
            add({ category: 'Income', status: 'ok', title: 'Income verified', detail: 'Declared and parsed from bank statement.', action_tab: 'financial', blocking_submission: false });
          }
        }
      }

      // Expenses
      const totalExp = expenses.reduce((s, e) => s + (e.total_monthly || 0), 0);
      if (!totalExp) {
        add({ category: 'Expenses', status: 'critical', title: 'No expenses recorded', detail: 'CCCFA requires documented expense verification before credit can be assessed.', action_label: 'Add expenses', action_tab: 'financial', blocking_submission: true });
      } else if (expenses.length > 1) {
        add({ category: 'Expenses', status: 'warning', title: 'Multiple expense records', detail: expenses.length + ' records totalling $' + Math.round(totalExp).toLocaleString('en-NZ') + '/mth. Check for duplicates.', action_label: 'Review', action_tab: 'financial', blocking_submission: false });
      } else {
        add({ category: 'Expenses', status: 'ok', title: '$' + Math.round(totalExp).toLocaleString('en-NZ') + '/mth expenses recorded', detail: 'CCCFA expense documentation complete.', action_tab: 'financial', blocking_submission: false });
      }

      // Serviceability
      if (!svc) {
        add({ category: 'Serviceability', status: 'warning', title: 'Not yet assessed', detail: 'Run serviceability to calculate DTI, UMI, LVR and lender eligibility.', action_label: 'Run assessment', action_tab: 'Serviceability', blocking_submission: false });
      } else if (!svc.passes_serviceability) {
        add({ category: 'Serviceability', status: 'critical', title: 'Fails at 8.5% stress rate', detail: 'UMI: $' + Math.round(svc.umi_monthly||0).toLocaleString('en-NZ') + '/mth · DTI: ' + (svc.dti_ratio?.toFixed(1)||'—') + 'x · LVR: ' + (svc.lvr_percent?.toFixed(0)||'—') + '%', action_label: 'View details', action_tab: 'Serviceability', blocking_submission: true });
      } else {
        const thin = (svc.umi_monthly||0) < 500;
        add({ category: 'Serviceability', status: thin ? 'warning' : 'ok', title: thin ? 'Passes — thin UMI buffer' : 'Passes serviceability', detail: 'UMI $' + Math.round(svc.umi_monthly||0).toLocaleString('en-NZ') + '/mth · DTI ' + (svc.dti_ratio?.toFixed(1)||'—') + 'x · LVR ' + (svc.lvr_percent?.toFixed(0)||'—') + '%', action_tab: 'Serviceability', blocking_submission: false });
      }

      // Anomalies
      const critical = anomalies.filter(a => a.severity === 'critical');
      if (critical.length > 0) {
        add({ category: 'Anomalies', status: 'critical', title: critical.length + ' critical flag' + (critical.length>1?'s':''), detail: critical.slice(0,2).map(a=>a.title).join(' · '), action_label: 'Resolve', action_tab: 'Overview', blocking_submission: true });
      } else if (anomalies.length > 0) {
        add({ category: 'Anomalies', status: 'warning', title: anomalies.length + ' flag' + (anomalies.length>1?'s':'')+' detected', detail: anomalies.slice(0,2).map(a=>a.title).join(' · '), action_label: 'Review', action_tab: 'Overview', blocking_submission: false });
      } else {
        add({ category: 'Anomalies', status: 'ok', title: 'No anomalies detected', detail: 'All ratios within expected ranges.', blocking_submission: false });
      }

      // Documents
      const required = clItems.filter((i:any) => i.required);
      const missing = required.filter((i:any) => i.status !== 'uploaded' && i.status !== 'waived');
      if (missing.length > 0) {
        const isCritical = missing.some((i:any) => ['ID','02 Financial Evidence'].includes(i.category));
        add({ category: 'Documents', status: isCritical ? 'critical' : 'warning', title: missing.length + ' required document' + (missing.length>1?'s':'')+' missing', detail: missing.slice(0,3).map((i:any)=>i.name).join(', ') + (missing.length > 3 ? ' +' + (missing.length-3) + ' more' : ''), action_label: 'Upload', action_tab: 'Documents', blocking_submission: isCritical });
      } else {
        add({ category: 'Documents', status: 'ok', title: docs.length + ' documents uploaded', detail: 'All required documents present.', action_tab: 'Documents', blocking_submission: false });
      }

      // Compliance
      const compGaps: string[] = [];
      if (!comp?.disclosure_statement_provided) compGaps.push('Disclosure statement');
      if (!comp?.needs_objectives_completed) compGaps.push('Needs & Objectives');
      if (!comp?.kyc_identity_verified) compGaps.push('KYC identity');
      if (!comp?.cccfa_affordability_assessed) compGaps.push('CCCFA affordability');
      if (compGaps.length > 0) {
        add({ category: 'Compliance', status: compGaps.length >= 2 ? 'critical' : 'warning', title: compGaps.length + ' compliance gap' + (compGaps.length>1?'s':''), detail: compGaps.join(' · '), action_label: 'Complete', action_tab: 'Compliance', blocking_submission: true });
      } else {
        add({ category: 'Compliance', status: 'ok', title: 'Compliance complete', detail: 'Disclosure, Needs & Objectives, KYC and CCCFA documented.', action_tab: 'Compliance', blocking_submission: false });
      }

      // Credit check
      if (!credit) {
        add({ category: 'Compliance', status: 'warning', title: 'No credit check recorded', detail: 'CCCFA affordability assessment requires a credit check.', action_label: 'Add credit check', action_tab: 'Compliance', blocking_submission: false });
      } else {
        const age = Math.round((Date.now() - new Date(credit.checked_at).getTime()) / 86400000);
        if (age > 90) add({ category: 'Compliance', status: 'warning', title: 'Credit check ' + age + ' days old', detail: 'Lenders typically require a check within 90 days of submission.', action_label: 'Update', action_tab: 'Compliance', blocking_submission: false });
      }

      setItems(built);

      // Persist to central intelligence state
      const blocking = built.filter(i => i.blocking_submission).length;
      const warnings = built.filter(i => i.status === 'warning' && !i.blocking_submission).length;
      const passed = built.filter(i => i.status === 'ok').length;
      await supabase.rpc('update_intelligence_state', {
        p_application_id: applicationId,
        p_items: built,
        p_blocking: blocking,
        p_warning: warnings,
        p_passed: passed,
      });
      setLastRun(new Date().toLocaleTimeString('en-NZ', { timeStyle: 'short' }));
    } catch (e) {
      logger.error('Intelligence error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applicationId]);

  useEffect(() => {
    // Try loading from central state first
    supabase.from('application_intelligence').select('intelligence_items,blocking_count,warning_count,passed_count,intelligence_last_run')
      .eq('application_id', applicationId).single()
      .then(({ data }) => {
        if (data?.intelligence_items?.length > 0) {
          setItems(data.intelligence_items);
          setLastRun(data.intelligence_last_run ? new Date(data.intelligence_last_run).toLocaleTimeString('en-NZ', { timeStyle: 'short' }) : null);
          setLoading(false);
        } else {
          analyse();
        }
      });
  }, [applicationId]);

  const blocking = items.filter(i => i.blocking_submission);
  const warnings = items.filter(i => i.status === 'warning' && !i.blocking_submission);
  const ok = items.filter(i => i.status === 'ok');
  const ready = blocking.length === 0 && items.length > 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', justifyContent: 'center' }}>
      <div style={{ width: 18, height: 18, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span style={{ fontSize: 13, color: '#64748b' }}>Analysing application...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: ready ? '#f0fdf4' : blocking.length >= 2 ? '#fef2f2' : '#fffbeb', borderRadius: 10, border: '1px solid ' + (ready ? '#a7f3d0' : blocking.length >= 2 ? '#fecaca' : '#fde68a'), marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: ready ? '#10b981' : blocking.length >= 2 ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
              {ready ? 'Ready to submit' : blocking.length + ' issue' + (blocking.length > 1 ? 's' : '') + ' blocking submission'}
            </span>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 12 }}>
              {ok.length} done · {warnings.length} warnings · {blocking.length} blocking
              {grade && ' · Grade ' + grade}
              {lastRun && ' · Updated ' + lastRun}
            </span>
          </div>
        </div>
        <button onClick={analyse} disabled={refreshing}
          style={{ fontSize: 11, fontWeight: 500, color: '#475569', background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
          {refreshing ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* Blocking */}
      {blocking.length > 0 && (
        <Section label="Blocking Submission" color="#dc2626">
          {blocking.map(item => <IntelCard key={item.id} item={item} onNav={onNavigateToTab} />)}
        </Section>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Section label="Warnings" color="#d97706">
          {warnings.map(item => <IntelCard key={item.id} item={item} onNav={onNavigateToTab} />)}
        </Section>
      )}

      {/* Passed */}
      {ok.length > 0 && (
        <Section label="Complete" color="#059669">
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            {ok.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#64748b', flex: 1 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{item.category}:</span> {item.title}
                </span>
                {item.action_tab && (
                  <button onClick={() => onNavigateToTab(item.action_tab!)}
                    style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                    View →
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

function Section({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', width: 16, height: 1, background: color, opacity: 0.4 }} />
        {label}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function IntelCard({ item, onNav }: { item: IntelligenceItem; onNav: (tab: string) => void }) {
  const s = STATUS[item.status];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'white', border: '1px solid #e2e8f0', borderLeft: '3px solid ' + s.dot, borderRadius: 10 }}>
      <div style={{ marginTop: 3 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: s.text, background: s.bg, padding: '1px 7px', borderRadius: 20, border: '1px solid ' + s.border }}>
            {item.category}
          </span>
          {item.blocking_submission && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '1px 7px', borderRadius: 20, border: '1px solid #fecaca' }}>
              Blocks submission
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 2px' }}>{item.title}</p>
        <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{item.detail}</p>
      </div>
      {item.action_label && item.action_tab && (
        <button onClick={() => onNav(item.action_tab!)}
          style={{ fontSize: 11, fontWeight: 600, color: s.text, background: s.bg, border: '1px solid ' + s.border, borderRadius: 7, padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {item.action_label} →
        </button>
      )}
    </div>
  );
}
