import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

interface ReadinessScore {
  id: string;
  total_score: number;
  score_grade: string;
  is_ready_to_submit: boolean;
  score_identity_kyc: number;
  score_income_verification: number;
  score_expense_verification: number;
  score_assets_liabilities: number;
  score_property_details: number;
  score_compliance: number;
  score_documents: number;
  issues_critical: Array<{ code: string; message: string; section: string }>;
  issues_high: Array<{ code: string; message: string; section: string }>;
  issues_medium: Array<{ code: string; message: string; section: string }>;
  critical_count: number;
  high_count: number;
  medium_count: number;
  scored_at: string;
}

interface Props {
  applicationId: string;
}

const GRADE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: '#16a34a', bg: '#f0fdf4', label: 'Ready to submit' },
  B: { color: '#2563eb', bg: '#eff6ff', label: 'Almost ready' },
  C: { color: '#d97706', bg: '#fffbeb', label: 'Needs attention' },
  D: { color: '#ea580c', bg: '#fff7ed', label: 'Significant gaps' },
  F: { color: '#dc2626', bg: '#fef2f2', label: 'Not ready' },
};

const SECTION_LABELS: Record<string, string> = {
  score_identity_kyc: 'Identity & KYC',
  score_income_verification: 'Income',
  score_expense_verification: 'Expenses',
  score_assets_liabilities: 'Assets & Liabilities',
  score_property_details: 'Property',
  score_compliance: 'Compliance',
  score_documents: 'Documents',
};

export const ReadinessScoreWidget: React.FC<Props> = ({ applicationId }) => {
  const toast = useToast();
  const [score, setScore] = useState<ReadinessScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadScore();
  }, [applicationId]);

  const loadScore = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('application_readiness_scores')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    setScore(data || null);
    setLoading(false);
  };

  const runScore = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc('calculate_readiness_score', {
        p_application_id: applicationId,
      });
      if (error) {
        logger.error('RPC error:', error);
        toast.error('Score error: ' + error.message);
        return;
      }
      toast.success('Readiness score calculated');
      await loadScore();
    } catch (e: any) {
      logger.error('Readiness score error:', e);
      toast.error('Failed to calculate readiness score');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 13, color: '#6b7280' }}>Loading readiness score...</span>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!score) {
    return (
      <div style={{ padding: '16px', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: 0 }}>Application Readiness</p>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Not yet scored — run to check submission readiness</p>
        </div>
        <button
          onClick={runScore}
          disabled={running}
          style={{ padding: '7px 14px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {running ? 'Running...' : 'Run Score'}
        </button>
      </div>
    );
  }

  const grade = score.score_grade || 'F';
  const cfg = GRADE_CONFIG[grade] || GRADE_CONFIG['F'];
  const hasIssues = score.critical_count > 0 || score.high_count > 0 || score.medium_count > 0;

  return (
    <div style={{ background: cfg.bg, borderRadius: 12, border: `1px solid ${cfg.color}30`, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Grade circle */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: cfg.color, color: 'white',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{grade}</span>
        </div>

        {/* Score info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
              {score.total_score}/100 — {cfg.label}
            </span>
            {score.is_ready_to_submit && (
              <span style={{ fontSize: 11, background: '#16a34a', color: 'white', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                ✓ Ready to submit
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${score.total_score}%`, background: cfg.color, borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {score.critical_count > 0 && (
              <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>🔴 {score.critical_count} critical</span>
            )}
            {score.high_count > 0 && (
              <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>🟡 {score.high_count} high</span>
            )}
            {score.medium_count > 0 && (
              <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>⚪ {score.medium_count} medium</span>
            )}
            {!hasIssues && (
              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✅ No issues found</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {hasIssues && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ padding: '6px 12px', background: 'white', color: cfg.color, border: `1px solid ${cfg.color}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {expanded ? 'Hide' : 'View Issues'}
            </button>
          )}
          <button
            onClick={runScore}
            disabled={running}
            style={{ padding: '6px 12px', background: running ? '#e5e7eb' : '#6366f1', color: running ? '#9ca3af' : 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: running ? 'default' : 'pointer' }}
          >
            {running ? '...' : '↻ Rescore'}
          </button>
        </div>
      </div>

      {/* Expanded issues */}
      {expanded && hasIssues && (
        <div style={{ borderTop: `1px solid ${cfg.color}20`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {(score.issues_critical || []).map((issue, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>
              <span style={{ fontSize: 13 }}>🔴</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', margin: 0 }}>{issue.section}</p>
                <p style={{ fontSize: 12, color: '#374151', margin: '2px 0 0' }}>{issue.message}</p>
              </div>
            </div>
          ))}

          {(score.issues_high || []).map((issue, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', background: '#fffbeb', borderRadius: 8, borderLeft: '3px solid #d97706' }}>
              <span style={{ fontSize: 13 }}>🟡</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#d97706', margin: 0 }}>{issue.section}</p>
                <p style={{ fontSize: 12, color: '#374151', margin: '2px 0 0' }}>{issue.message}</p>
              </div>
            </div>
          ))}

          {(score.issues_medium || []).map((issue, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, borderLeft: '3px solid #9ca3af' }}>
              <span style={{ fontSize: 13 }}>⚪</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', margin: 0 }}>{issue.section}</p>
                <p style={{ fontSize: 12, color: '#374151', margin: '2px 0 0' }}>{issue.message}</p>
              </div>
            </div>
          ))}

          {/* Section breakdown */}
          <div style={{ marginTop: 4, paddingTop: 10, borderTop: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Section Scores</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {Object.entries(SECTION_LABELS).map(([key, label]) => {
                const val = (score as any)[key] as number;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: val >= 80 ? '#16a34a' : val >= 50 ? '#d97706' : '#dc2626' }}>{val}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0', textAlign: 'right' }}>
            Last scored: {new Date(score.scored_at).toLocaleString('en-NZ')}
          </p>
        </div>
      )}
    </div>
  );
};

