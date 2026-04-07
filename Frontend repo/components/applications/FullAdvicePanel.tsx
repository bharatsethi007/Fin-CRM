import React, { useState } from 'react';
import { AIOrchestrator } from '../../services/AIOrchestrator';
import { supabase } from '../../services/supabaseClient';

interface Props {
  applicationId: string;
  firmId: string;
  advisorId?: string;
  onComplete?: () => void;
}

interface AdviceStep {
  key: string;
  label: string;
  feature: string;
  icon: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  result?: any;
  tokensUsed?: number;
  model?: string;
}

const STEPS: Omit<AdviceStep, 'status'>[] = [
  { key: 'serviceability_narrative', label: 'Serviceability Summary',    feature: 'serviceability_narrative', icon: '📊' },
  { key: 'needs_objectives_draft',   label: 'Needs & Objectives',        feature: 'needs_objectives_draft',   icon: '🎯' },
  { key: 'advice_summary',           label: 'Lender Recommendation',     feature: 'advice_summary',           icon: '🏦' },
  { key: 'compliance_narrative',     label: 'CCCFA Compliance Record',   feature: 'compliance_narrative',     icon: '✅' },
  { key: 'decline_risk',             label: 'Risk Assessment',           feature: 'decline_risk',             icon: '⚠️' },
];

export const FullAdvicePanel: React.FC<Props> = ({ applicationId, firmId, advisorId, onComplete }) => {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AdviceStep[]>(STEPS.map(s => ({ ...s, status: 'pending' })));
  const [totalTokens, setTotalTokens] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  function setStepStatus(key: string, status: AdviceStep['status'], result?: any, tokens?: number, model?: string) {
    setSteps(prev => prev.map(s => s.key === key ? { ...s, status, result, tokensUsed: tokens, model } : s));
  }

  async function runFullAdvice() {
    setRunning(true);
    setDone(false);
    setError(null);
    setTotalTokens(0);
    setSteps(STEPS.map(s => ({ ...s, status: 'pending' })));

    let total = 0;
    for (const step of STEPS) {
      setStepStatus(step.key, 'running');
      try {
        const result = await AIOrchestrator.run(
          step.feature as any, applicationId,
          { firmId, advisorId, forceRefresh: true }
        );
        if (result.success) {
          setStepStatus(step.key, 'done', result.data, result.tokensUsed, result.model);
          total += result.tokensUsed || 0;
          setTotalTokens(total);
          // Save to intelligence state
          if (!result.cached) {
            await supabase.rpc('save_intelligence_output', {
              p_application_id: applicationId,
              p_feature: step.feature,
              p_output: result.data,
              p_model: result.model || 'gpt-4o-mini',
              p_prompt_tokens: result.tokensUsed || 0,
              p_completion_tokens: 0,
            });
          }
        } else {
          setStepStatus(step.key, 'failed');
        }
      } catch (e: any) {
        setStepStatus(step.key, 'failed');
      }
    }

    // Mark full advice as generated
    await supabase.from('application_intelligence')
      .update({ full_advice_generated_at: new Date().toISOString() })
      .eq('application_id', applicationId);

    setRunning(false);
    setDone(true);
    onComplete?.();
  }

  const doneCount = steps.filter(s => s.status === 'done').length;
  const failedCount = steps.filter(s => s.status === 'failed').length;
  const allDone = doneCount + failedCount === STEPS.length;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', background: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'white', margin: 0 }}>Generate Full Advice Package</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
            Runs all {STEPS.length} AI features in sequence — saves to application intelligence
          </p>
        </div>
        {!running && !done && (
          <button onClick={runFullAdvice}
            style={{ fontSize: 12, fontWeight: 700, color: 'white', background: '#6366f1',
              border: 'none', borderRadius: 7, padding: '8px 18px', cursor: 'pointer' }}>
            ✨ Generate All
          </button>
        )}
        {done && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowResults(!showResults)}
              style={{ fontSize: 11, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe',
                borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
              {showResults ? 'Hide' : 'View'} Results
            </button>
            <button onClick={runFullAdvice}
              style={{ fontSize: 11, color: '#64748b', background: '#1e293b', border: '1px solid #334155',
                borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
              ↻ Regenerate
            </button>
          </div>
        )}
      </div>

      {/* Progress */}
      <div style={{ padding: '14px 18px', background: 'white' }}>
        {/* Progress bar */}
        {(running || done) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99, transition: 'width 0.4s ease',
                background: failedCount > 0 ? '#f59e0b' : '#6366f1',
                width: `${(doneCount + failedCount) / STEPS.length * 100}%`
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {doneCount}/{STEPS.length} complete
                {failedCount > 0 && ` · ${failedCount} failed`}
              </span>
              {totalTokens > 0 && (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{totalTokens.toLocaleString()} tokens used</span>
              )}
            </div>
          </div>
        )}

        {/* Steps list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map(step => (
            <div key={step.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: 8, background: step.status === 'done' ? '#f0fdf4' :
                step.status === 'running' ? '#eef2ff' :
                step.status === 'failed' ? '#fef2f2' : '#f8fafc',
              border: `1px solid ${step.status === 'done' ? '#a7f3d0' :
                step.status === 'running' ? '#c7d2fe' :
                step.status === 'failed' ? '#fecaca' : '#e2e8f0'}`
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>
                {step.status === 'done' ? '✅' :
                 step.status === 'failed' ? '❌' :
                 step.status === 'running' ? '⏳' : step.icon}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151', flex: 1 }}>{step.label}</span>
              {step.status === 'running' && (
                <div style={{ width: 14, height: 14, border: '2px solid #6366f1',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              )}
              {step.status === 'done' && step.model && (
                <span style={{ fontSize: 10, color: '#059669', background: '#f0fdf4',
                  padding: '1px 6px', borderRadius: 10 }}>
                  {step.model} · {step.tokensUsed} tokens
                  {step.result?.cached ? ' · cached' : ''}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Results preview */}
        {done && showResults && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.filter(s => s.status === 'done' && s.result).map(step => (
              <div key={step.key} style={{ padding: '10px 12px', background: '#f8fafc',
                borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 5px' }}>
                  {step.label}
                </p>
                <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.5 }}>
                  {step.key === 'advice_summary' && step.result?.why_this_lender}
                  {step.key === 'needs_objectives_draft' && step.result?.primary_objective}
                  {step.key === 'serviceability_narrative' && step.result?.narrative}
                  {step.key === 'compliance_narrative' && step.result?.affordability_summary}
                  {step.key === 'decline_risk' && step.result?.main_risks?.slice(0,2).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}

        {done && !running && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0fdf4',
            border: '1px solid #a7f3d0', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>✅</span>
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>
              All outputs saved to application intelligence. PDFs will now include full content.
            </span>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};
