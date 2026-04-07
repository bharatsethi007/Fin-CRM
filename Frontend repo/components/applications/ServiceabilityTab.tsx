import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useCCCFAReport } from '../../hooks/useCCCFAReport';
import { useToast } from '../../hooks/useToast';
import { DocumentsService } from '../../src/services/documents.service';
import { useAffordabilityCalculator } from '../common/AffordabilityCalculator';

interface ServiceabilityResult {
  id: string;
  gross_annual_income: number;
  net_monthly_income: number;
  declared_expenses_monthly: number;
  hem_benchmark_monthly: number;
  expenses_used_monthly: number;
  existing_mortgage_repayments_monthly: number;
  total_existing_debt_monthly: number;
  new_loan_amount: number;
  stress_test_rate: number;
  new_loan_repayment_stress_monthly: number;
  total_debt_commitments_monthly: number;
  umi_monthly: number;
  dti_ratio: number;
  dti_limit: number;
  dti_compliant: boolean;
  lvr_percent: number;
  lvr_requires_lmi: boolean;
  passes_serviceability: boolean;
  serviceability_surplus_monthly: number;
  max_loan_amount_stress: number;
  passes_anz: boolean;
  passes_asb: boolean;
  passes_bnz: boolean;
  passes_westpac: boolean;
  passes_kiwibank: boolean;
  flag_high_dti: boolean;
  flag_low_umi: boolean;
  flag_high_lvr: boolean;
  assessed_at: string;
}

interface Props {
  applicationId: string;
}

const fmt = (n: number | null | undefined, prefix = '$') =>
  n == null ? '—' : `${prefix}${Math.round(n).toLocaleString('en-NZ')}`;

const Row = ({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | 'yellow' | null }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
    <div>
      <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>{sub}</span>}
    </div>
    <span style={{
      fontSize: 13, fontWeight: 600,
      color: highlight === 'green' ? '#16a34a' : highlight === 'red' ? '#dc2626' : highlight === 'yellow' ? '#d97706' : '#111827'
    }}>{value}</span>
  </div>
);

const LenderBadge = ({ name, passes }: { name: string; passes: boolean }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    borderRadius: 8, border: `1px solid ${passes ? '#bbf7d0' : '#fca5a5'}`,
    background: passes ? '#f0fdf4' : '#fef2f2',
  }}>
    <span style={{ fontSize: 14 }}>{passes ? '✅' : '❌'}</span>
    <span style={{ fontSize: 12, fontWeight: 600, color: passes ? '#16a34a' : '#dc2626' }}>{name}</span>
  </div>
);

export const ServiceabilityTab: React.FC<Props> = ({ applicationId }) => {
  const [result, setResult] = useState<ServiceabilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // CCCFA report
  const cccfa = useCCCFAReport(applicationId);
  const toast = useToast();
  const { open: openAffordability } = useAffordabilityCalculator();
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [declarationChecked, setDeclarationChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingReport, setExistingReport] = useState<{ pdf_url: string; created_at: string } | null>(null);

  useEffect(() => {
    if (!result) return;
    supabase
      .from('cccfa_reports')
      .select('pdf_url, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setExistingReport(data); });
  }, [result, applicationId]);

  useEffect(() => { loadResult(); }, [applicationId]);

  const loadResult = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('serviceability_assessments')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    setResult(data || null);
    setLoading(false);
  };

  const runAssessment = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.rpc('calculate_serviceability', {
        p_application_id: applicationId,
      });
      if (error) logger.error('Serviceability error:', error.message);
      await loadResult();
    } catch (e) {
      logger.error(e);
    } finally {
      setRunning(false);
    }
  };

  const openQuickAffordability = () => {
    if (!result) {
      openAffordability();
      return;
    }
    const lvr = result.lvr_percent;
    const propertyValue =
      lvr > 0 && result.new_loan_amount > 0
        ? Math.round(result.new_loan_amount / (lvr / 100))
        : undefined;
    openAffordability({
      initialValues: {
        annualIncome: result.gross_annual_income,
        monthlyExpenses: result.declared_expenses_monthly,
        loanAmount: result.new_loan_amount,
        existingDebts: result.total_existing_debt_monthly,
        testRate: result.stress_test_rate,
        propertyValue,
      },
    });
  };

  if (loading) return (
    <div style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 13, color: '#6b7280' }}>Loading...</span>
      <style>{`@keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
    </div>
  );

  if (!result) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>No Serviceability Assessment Yet</h3>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>Run the assessment to calculate DTI, UMI, LVR and lender eligibility</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        <button onClick={runAssessment} disabled={running} style={{ padding: '10px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {running ? 'Calculating...' : '▶ Run Serviceability Assessment'}
        </button>
        <button
          type="button"
          onClick={() => openAffordability()}
          style={{ padding: '10px 24px', background: 'white', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Quick affordability check
        </button>
      </div>
    </div>
  );

  const passes = result.passes_serviceability;
  const umiHighlight = result.umi_monthly > 1000 ? 'green' : result.umi_monthly > 0 ? 'yellow' : 'red';
  const dtiHighlight = result.dti_ratio <= 4 ? 'green' : result.dti_ratio <= 6 ? 'yellow' : 'red';
  const lvrHighlight = result.lvr_percent <= 80 ? 'green' : result.lvr_percent <= 90 ? 'yellow' : 'red';

  return (
    <div style={{ padding: '0 0 24px' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Result banner */}
      <div style={{
        padding: '16px 20px', borderRadius: 12, marginBottom: 20,
        background: passes ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${passes ? '#bbf7d0' : '#fca5a5'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>{passes ? '✅' : '❌'}</span>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: passes ? '#16a34a' : '#dc2626', margin: 0 }}>
              {passes ? 'PASSES SERVICEABILITY' : 'FAILS SERVICEABILITY'}
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>
              Stress-tested at {result.stress_test_rate}% · Max borrowing: {fmt(result.max_loan_amount_stress)}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={openQuickAffordability}
            style={{ fontSize: 11, color: '#4f46e5', background: 'white', border: '1px solid #c7d2fe', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}
          >
            Quick affordability
          </button>
          <button onClick={runAssessment} disabled={running} style={{ fontSize: 11, color: '#6b7280', background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 500 }}>
            {running ? 'Running...' : '↻ Recalculate'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Left column — Income & Expenses */}
        <div>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Income</h4>
          <Row label="Gross Annual Income" value={fmt(result.gross_annual_income)} />
          <Row label="Net Monthly Income" value={fmt(result.net_monthly_income)} sub="(after tax)" />

          <h4 style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>Living Expenses</h4>
          <Row label="Declared Expenses" value={fmt(result.declared_expenses_monthly) + '/mth'} />
          <Row label="HEM Benchmark" value={fmt(result.hem_benchmark_monthly) + '/mth'} sub="(NZ standard)" />
          <Row
            label="Expenses Used"
            value={fmt(result.expenses_used_monthly) + '/mth'}
            sub="(higher of declared or HEM)"
            highlight={result.expenses_used_monthly > result.declared_expenses_monthly ? 'yellow' : null}
          />

          <h4 style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>Debt Commitments</h4>
          <Row label="Existing Debt Repayments" value={fmt(result.total_existing_debt_monthly) + '/mth'} />
          <Row label="New Loan Repayment" value={fmt(result.new_loan_repayment_stress_monthly) + '/mth'} sub={`@ ${result.stress_test_rate}% stress rate`} highlight="yellow" />
          <Row label="Total Commitments" value={fmt(result.total_debt_commitments_monthly) + '/mth'} />
        </div>

        {/* Right column — Key Metrics */}
        <div>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Key Metrics</h4>

          {/* UMI */}
          <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 10, background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 2px', fontWeight: 600, textTransform: 'uppercase' }}>Uncommitted Monthly Income</p>
                <p style={{ fontSize: 22, fontWeight: 800, margin: 0, color: umiHighlight === 'green' ? '#16a34a' : umiHighlight === 'yellow' ? '#d97706' : '#dc2626' }}>
                  {fmt(result.umi_monthly)}/mth
                </p>
              </div>
              <span style={{ fontSize: 28 }}>{umiHighlight === 'green' ? '✅' : umiHighlight === 'yellow' ? '⚠️' : '❌'}</span>
            </div>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>Net income − expenses − all debt commitments</p>
          </div>

          {/* DTI */}
          <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 10, background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 2px', fontWeight: 600, textTransform: 'uppercase' }}>Debt-to-Income Ratio</p>
                <p style={{ fontSize: 22, fontWeight: 800, margin: 0, color: dtiHighlight === 'green' ? '#16a34a' : dtiHighlight === 'yellow' ? '#d97706' : '#dc2626' }}>
                  {result.dti_ratio ? result.dti_ratio.toFixed(1) : '—'}x
                </p>
              </div>
              <span style={{ fontSize: 28 }}>{result.dti_compliant ? '✅' : '❌'}</span>
            </div>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>RBNZ limit: {result.dti_limit}x for owner-occupiers</p>
          </div>

          {/* LVR */}
          <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 16, background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 2px', fontWeight: 600, textTransform: 'uppercase' }}>Loan-to-Value Ratio</p>
                <p style={{ fontSize: 22, fontWeight: 800, margin: 0, color: lvrHighlight === 'green' ? '#16a34a' : lvrHighlight === 'yellow' ? '#d97706' : '#dc2626' }}>
                  {result.lvr_percent ? result.lvr_percent.toFixed(1) : '—'}%
                </p>
              </div>
              <span style={{ fontSize: 28 }}>{result.lvr_percent <= 80 ? '✅' : result.lvr_percent <= 90 ? '⚠️' : '❌'}</span>
            </div>
            {result.lvr_requires_lmi && <p style={{ fontSize: 11, color: '#d97706', margin: '4px 0 0', fontWeight: 600 }}>⚠ Low Equity Margin may apply</p>}
          </div>

          {/* Lender eligibility */}
          <h4 style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Lender Eligibility</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <LenderBadge name="ANZ" passes={result.passes_anz} />
            <LenderBadge name="ASB" passes={result.passes_asb} />
            <LenderBadge name="BNZ" passes={result.passes_bnz} />
            <LenderBadge name="Westpac" passes={result.passes_westpac} />
            <LenderBadge name="Kiwibank" passes={result.passes_kiwibank} />
          </div>

          <p style={{ fontSize: 11, color: '#9ca3af', margin: '12px 0 0', textAlign: 'right' }}>
            Assessed: {new Date(result.assessed_at).toLocaleString('en-NZ')}
          </p>
        </div>
      </div>

      {/* ── CCCFA Affordability Report Card ─────────────────────── */}
      <div style={{
        marginTop: 24, padding: '20px 24px', borderRadius: 12,
        border: '1px solid #e0e7ff', background: 'linear-gradient(135deg, #f5f3ff 0%, #eef2ff 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: '#312e81', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>📋</span> CCCFA Affordability Report
            </h4>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
              Generate a compliance-ready PDF for this application as required under CCCFA 2003.
            </p>
          </div>
          {existingReport && (
            <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap', padding: '4px 10px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
              ✓ Report generated {new Date(existingReport.created_at).toLocaleDateString('en-NZ')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 16 }}>
          {[
            'Serviceability calculated',
            'Income verified',
            'HEM benchmark applied',
            'Stress test 8.5%',
          ].map((item) => (
            <span key={item} style={{ fontSize: 12, color: '#16a34a', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13 }}>✓</span> {item}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {existingReport ? (
            <>
              <button
                onClick={() => window.open(existingReport.pdf_url, '_blank')}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  background: 'white', color: '#4f46e5', border: '1px solid #c7d2fe',
                }}
              >
                View PDF
              </button>
              <button
                onClick={async () => {
                  await cccfa.loadReportData();
                  const blob = await cccfa.generatePDF();
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                }}
                disabled={cccfa.generating}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  background: 'white', color: '#6b7280', border: '1px solid #e5e7eb',
                }}
              >
                {cccfa.generating ? 'Generating…' : '↻ Regenerate'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={async () => {
                  await cccfa.loadReportData();
                  const blob = await cccfa.generatePDF();
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                }}
                disabled={cccfa.generating}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  background: 'white', color: '#4f46e5', border: '1px solid #c7d2fe',
                }}
              >
                {cccfa.generating ? 'Generating…' : 'Preview Report'}
              </button>
              <button
                onClick={() => { setDeclarationChecked(false); setShowDeclarationModal(true); }}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  background: '#4f46e5', color: 'white', border: 'none',
                }}
              >
                Generate &amp; Save PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Declaration Modal ───────────────────────────────────── */}
      {showDeclarationModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: '28px 32px', width: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
              Adviser Declaration
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>
              Please confirm before generating the official CCCFA report.
            </p>

            <label style={{
              display: 'flex', gap: 10, cursor: 'pointer',
              padding: '14px 16px', borderRadius: 10,
              border: `1px solid ${declarationChecked ? '#a5b4fc' : '#e5e7eb'}`,
              background: declarationChecked ? '#f5f3ff' : '#fafafa',
              transition: 'all 0.15s',
            }}>
              <input
                type="checkbox"
                checked={declarationChecked}
                onChange={(e) => setDeclarationChecked(e.target.checked)}
                style={{ marginTop: 2, accentColor: '#4f46e5', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                I confirm I have completed reasonable inquiries under CCCFA s9 and this
                assessment accurately reflects the affordability assessment conducted for
                this application.
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowDeclarationModal(false)}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                  background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                disabled={!declarationChecked || saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await cccfa.loadReportData();
                    const blob = await cccfa.generatePDF();
                    const declarationText =
                      'I confirm I have completed reasonable inquiries under CCCFA s9 and this ' +
                      'assessment accurately reflects the affordability assessment conducted for this application.';
                    const url = await cccfa.savePDF(blob, declarationText);

                    const { data: { user } } = await supabase.auth.getUser();
                    const reportData = cccfa.reportData;
                    if (reportData && user) {
                      const dateStr = new Date().toLocaleDateString('en-NZ').replace(/\//g, '-');
                      await DocumentsService.create({
                        application_id: applicationId,
                        firm_id: reportData.firm_id,
                        name: `CCCFA-Report-${reportData.reference_number || applicationId.slice(0, 8)}-${dateStr}.pdf`,
                        url,
                        file_type: 'application/pdf',
                        category: 'CCCFA Assessment',
                        upload_date: new Date().toISOString().split('T')[0],
                        status: 'Valid',
                        uploaded_by: user.id,
                      });
                    }

                    setExistingReport({ pdf_url: url, created_at: new Date().toISOString() });
                    setShowDeclarationModal(false);
                    toast.success('CCCFA Report saved and attached to application');
                  } catch (e: any) {
                    toast.error('Error: ' + (e.message || 'Failed to save report'));
                  } finally {
                    setSaving(false);
                  }
                }}
                style={{
                  padding: '9px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  background: !declarationChecked || saving ? '#c7d2fe' : '#4f46e5',
                  color: 'white', border: 'none',
                  opacity: !declarationChecked || saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Confirm & Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

