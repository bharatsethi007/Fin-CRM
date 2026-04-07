import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

interface AnomalyFlag {
  id: string;
  flag_code: string;
  flag_category: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  detected_at: string;
}

interface Props {
  applicationId: string;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  critical: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '🔴' },
  high:     { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', icon: '🟡' },
  medium:   { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', icon: '⚪' },
  low:      { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: '🔵' },
};

export const AnomalyFlagBanner: React.FC<Props> = ({ applicationId }) => {
  const toast = useToast();
  const [flags, setFlags] = useState<AnomalyFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [minimised, setMinimised] = useState(false);

  useEffect(() => { loadFlags(); }, [applicationId]);

  const loadFlags = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('anomaly_flags')
      .select('*')
      .eq('application_id', applicationId)
      .eq('status', 'open')
      .order('detected_at', { ascending: false });
    setFlags(data || []);
    setLoading(false);
  };

  const runDetection = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.rpc('detect_anomalies', {
        p_application_id: applicationId,
      });
      if (error) {
        logger.error('Anomaly detection error:', error);
        toast.error('Anomaly detection failed');
      } else {
        toast.success('Anomaly detection complete');
      }
      await loadFlags();
    } catch (e) {
      logger.error(e);
      toast.error('Anomaly detection failed');
    } finally {
      setRunning(false);
    }
  };

  const resolveFlag = async (flagId: string) => {
    setResolving(flagId);
    await supabase
      .from('anomaly_flags')
      .update({ status: 'resolved_genuine' })
      .eq('id', flagId);
    toast.success('Anomaly resolved');
    setFlags(prev => prev.filter(f => f.id !== flagId));
    setResolving(null);
  };

  const dismissFlag = (flagId: string) => {
    setDismissed(prev => new Set([...prev, flagId]));
  };

  const visibleFlags = flags.filter(f => !dismissed.has(f.id));
  const criticalCount = visibleFlags.filter(f => f.severity === 'critical').length;
  const highCount = visibleFlags.filter(f => f.severity === 'high').length;

  if (loading) return null;
  if (visibleFlags.length === 0 && !loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>✅</span>
          <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>No anomalies detected</span>
        </div>
        <button
          onClick={runDetection}
          disabled={running}
          style={{ fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
        >
          {running ? 'Scanning...' : '↻ Re-scan'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Banner header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: criticalCount > 0 ? '#fef2f2' : '#fffbeb',
        border: `1px solid ${criticalCount > 0 ? '#fca5a5' : '#fcd34d'}`,
        borderRadius: visibleFlags.length > 0 ? '10px 10px 0 0' : 10,
        borderBottom: visibleFlags.length > 0 ? 'none' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>{criticalCount > 0 ? '🚨' : '⚠️'}</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: criticalCount > 0 ? '#dc2626' : '#d97706' }}>
              {visibleFlags.length} Anomaly {visibleFlags.length === 1 ? 'Flag' : 'Flags'} Detected
            </span>
            <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
              {criticalCount > 0 && `${criticalCount} critical`}
              {criticalCount > 0 && highCount > 0 && ' · '}
              {highCount > 0 && `${highCount} high`}
              {' — review before submitting'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setMinimised(!minimised)}
          style={{
            fontSize: 11, fontWeight: 600,
            color: '#6b7280', background: 'none',
            border: 'none', cursor: 'pointer',
            padding: '2px 8px', marginRight: 8,
          }}
        >
          {minimised ? '▼ Show' : '▲ Hide'}
        </button>
        <button
          onClick={runDetection}
          disabled={running}
          style={{ fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 500 }}
        >
          {running ? 'Scanning...' : '↻ Re-scan'}
        </button>
      </div>

      {/* Flag items */}
      {!minimised && (
        <div style={{ border: `1px solid ${criticalCount > 0 ? '#fca5a5' : '#fcd34d'}`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
          {visibleFlags.map((flag, idx) => {
            const cfg = SEVERITY_CONFIG[flag.severity] || SEVERITY_CONFIG.medium;
            return (
              <div
                key={flag.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 16px',
                  background: cfg.bg,
                  borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none',
                  borderLeft: `3px solid ${cfg.color}`,
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: cfg.color, margin: '0 0 2px' }}>{flag.title}</p>
                  <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.5 }}>{flag.description}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => dismissFlag(flag.id)}
                    style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => resolveFlag(flag.id)}
                    disabled={resolving === flag.id}
                    style={{ fontSize: 11, color: resolving === flag.id ? '#9ca3af' : '#6366f1', background: 'none', border: '1px solid #e5e7eb', borderRadius: 5, cursor: resolving === flag.id ? 'default' : 'pointer', padding: '2px 8px', fontWeight: 500 }}
                  >
                    {resolving === flag.id ? '...' : 'Mark Reviewed'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

