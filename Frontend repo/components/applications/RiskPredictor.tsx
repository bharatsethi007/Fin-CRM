import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { logger } from '../../utils/logger';

interface Props {
  applicationId: string;
  /** Reserved for firm-scoped analytics / future use */
  firmId?: string;
}

interface LenderRate {
  lender: string;
  total: number;
  approved: number;
  declined: number;
  approval_rate: number;
  avg_days_to_outcome: number;
  avg_conditions: number;
  common_decline_reason: string;
}

interface RiskData {
  dti_band: string;
  lvr_band: string;
  similar_applications: number;
  data_confidence: string;
  lender_historical_rates: LenderRate[];
  current_risk_scores: {
    anz_risk: number;
    asb_risk: number;
    bnz_risk: number;
    westpac_risk: number;
    kiwibank_risk: number;
    recommended_lender: string;
    approval_probability: number;
    risk_factors: Array<{ factor: string; impact: string; description: string }>;
  };
}

const LENDER_RISK_KEYS: Record<string, string> = {
  ANZ: 'anz_risk', ASB: 'asb_risk', BNZ: 'bnz_risk',
  Westpac: 'westpac_risk', Kiwibank: 'kiwibank_risk'
};

function riskColor(score: number): string {
  if (score <= 30) return '#059669';
  if (score <= 55) return '#d97706';
  return '#dc2626';
}

function riskLabel(score: number): string {
  if (score <= 30) return 'Low risk';
  if (score <= 55) return 'Medium risk';
  return 'High risk';
}

export const RiskPredictor: React.FC<Props> = ({ applicationId }) => {
  const [data, setData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setData(null);
    try {
      const { data: result, error: err } = await supabase.rpc('get_risk_prediction', {
        p_application_id: applicationId,
      });
      if (err) {
        logger.error('RiskPredictor: get_risk_prediction', err.message);
        return;
      }
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        logger.error('RiskPredictor: get_risk_prediction', String(result.error));
        return;
      }
      setData(result as RiskData);
    } catch (e) {
      logger.error('RiskPredictor: get_risk_prediction', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [applicationId]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #6366f1', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize: 13, color: '#64748b' }}>Analysing risk profile...</span>
    </div>
  );

  if (!data) return null;

  const scores = data.current_risk_scores;
  const confidence = data.data_confidence;
  const confColor = confidence === 'high' ? '#059669' : confidence === 'medium' ? '#d97706' :
    confidence === 'low' ? '#f59e0b' : '#94a3b8';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Context banner */}
      <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>DTI Band</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '2px 0 0' }}>{data.dti_band}</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>LVR Band</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '2px 0 0' }}>{data.lvr_band}</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>Similar Applications</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '2px 0 0' }}>{data.similar_applications}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>Data Confidence</p>
          <p style={{ fontSize: 12, fontWeight: 700, color: confColor, margin: '2px 0 0', textTransform: 'capitalize' }}>
            {confidence === 'insufficient_data' ? 'No historical data yet' : confidence}
          </p>
        </div>
      </div>

      {/* Recommended lender */}
      {scores.recommended_lender && (
        <div style={{ padding: '12px 16px', background: '#eef2ff', border: '1px solid #c7d2fe',
          borderRadius: 10, borderLeft: '4px solid #6366f1' }}>
          <p style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 3px' }}>
            AI Recommendation
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            {scores.recommended_lender}
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
            Estimated approval probability: {' '}
            <strong style={{ color: '#6366f1' }}>
              {Math.round((1 - (scores[`${scores.recommended_lender.toLowerCase()}_risk` as keyof typeof scores] as number || 50) / 100) * 100)}%
            </strong>
            {data.similar_applications > 0 && ` · Based on ${data.similar_applications} similar applications`}
          </p>
        </div>
      )}

      {/* Lender risk scores */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
          letterSpacing: '0.05em', margin: '0 0 8px' }}>Decline Risk per Lender</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(LENDER_RISK_KEYS).map(([lender, key]) => {
            const score = scores[key as keyof typeof scores] as number || 0;
            const historical = data.lender_historical_rates?.find(r => r.lender === lender);
            return (
              <div key={lender} style={{ padding: '10px 12px', background: 'white',
                border: '1px solid #e2e8f0', borderRadius: 8,
                borderLeft: lender === scores.recommended_lender ? '3px solid #6366f1' : '3px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', width: 70 }}>{lender}</span>
                  <div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${score}%`, borderRadius: 99,
                      background: riskColor(score), transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: riskColor(score), width: 55, textAlign: 'right' }}>
                    {score}% risk
                  </span>
                  <span style={{ fontSize: 10, color: riskColor(score), width: 65, textAlign: 'right' }}>
                    {riskLabel(score)}
                  </span>
                </div>
                {historical && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 10, color: '#059669' }}>
                      {historical.approval_rate}% historical approval
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>
                      avg {historical.avg_days_to_outcome}d to outcome
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>
                      {historical.avg_conditions} avg conditions
                    </span>
                    {historical.common_decline_reason && (
                      <span style={{ fontSize: 10, color: '#dc2626' }}>
                        common decline: {historical.common_decline_reason}
                      </span>
                    )}
                  </div>
                )}
                {!historical && data.similar_applications === 0 && (
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>No historical data yet — rule-based estimate only</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Risk factors */}
      {scores.risk_factors?.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
            letterSpacing: '0.05em', margin: '0 0 8px' }}>Key Risk Factors</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {scores.risk_factors.map((rf: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 12px',
                background: rf.impact === 'critical' ? '#fef2f2' : rf.impact === 'high' ? '#fffbeb' : '#f8fafc',
                borderRadius: 7, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>
                  {rf.impact === 'critical' ? '🔴' : rf.impact === 'high' ? '🟡' : '⚪'}
                </span>
                <span style={{ fontSize: 12, color: '#374151' }}>{rf.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={load}
        style={{ fontSize: 11, color: '#64748b', background: 'none', border: '1px solid #e2e8f0',
          borderRadius: 6, padding: '5px 12px', cursor: 'pointer', alignSelf: 'flex-start' }}>
        ↻ Recalculate
      </button>
    </div>
  );
};
