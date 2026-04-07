import React, { useState, useEffect } from 'react';
import { AIAgents, AgentName } from '../../services/AIAgents';
import { supabase } from '../../services/supabaseClient';

interface AgentRun {
  id: string;
  agent_name: string;
  status: string;
  summary: string;
  steps_completed: number;
  steps_failed: number;
  requires_broker_review: boolean;
  broker_reviewed: boolean;
  total_tokens_used: number;
  started_at: string;
  completed_at: string;
}

interface Props {
  applicationId: string;
  firmId: string;
  advisorId?: string;
}

const AGENTS: Array<{
  name: AgentName;
  label: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
}> = [
  {
    name: 'application_processor',
    label: 'Process Application',
    description: 'Runs serviceability, anomaly detection, readiness score, checklist, and generates advice summary in one click.',
    icon: '⚡',
    color: '#6366f1',
    bg: '#eff6ff',
  },
  {
    name: 'compliance_agent',
    label: 'Compliance Check',
    description: 'Verifies all CCCFA, FMC Act, and FAA requirements. Flags gaps with specific regulatory references.',
    icon: '✅',
    color: '#16a34a',
    bg: '#f0fdf4',
  },
];

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  running:        { color: '#2563eb', bg: '#eff6ff', label: 'Running...' },
  completed:      { color: '#16a34a', bg: '#f0fdf4', label: 'Completed' },
  pending_review: { color: '#d97706', bg: '#fffbeb', label: 'Needs Review' },
  failed:         { color: '#dc2626', bg: '#fef2f2', label: 'Failed' },
  cancelled:      { color: '#9ca3af', bg: '#f9fafb', label: 'Cancelled' },
};

export const AgentPanel: React.FC<Props> = ({ applicationId, firmId, advisorId }) => {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [running, setRunning] = useState<AgentName | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => { loadRuns(); }, [applicationId]);

  async function loadRuns() {
    const data = await AIAgents.getRuns(applicationId);
    setRuns(data);
  }

  async function runAgent(agentName: AgentName) {
    setRunning(agentName);
    setLastResult(null);
    try {
      const result = await AIAgents.run(agentName, applicationId, firmId, { advisorId, force: true });
      setLastResult(result);
      await loadRuns();
    } catch (e: any) {
      setLastResult({ success: false, error: e.message });
    } finally {
      setRunning(null);
    }
  }

  async function approveRun(runId: string) {
    await AIAgents.approve(runId);
    await loadRuns();
  }

  async function rejectRun(runId: string) {
    await AIAgents.reject(runId, 'Rejected by adviser');
    await loadRuns();
  }

  const pendingReviews = runs.filter(r => r.status === 'pending_review' && !r.broker_reviewed);

  return (
    <div style={{ paddingBottom: 24 }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.spin{animation:spin 0.8s linear infinite}`}</style>

      {/* Pending review banner */}
      {pendingReviews.length > 0 && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 13, color: '#d97706', fontWeight: 600 }}>
            {pendingReviews.length} agent run{pendingReviews.length > 1 ? 's' : ''} need your review
          </span>
        </div>
      )}

      {/* Agent cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {AGENTS.map(agent => {
          const isRunning = running === agent.name;
          const lastRun = runs.find(r => r.agent_name === agent.name);
          return (
            <div key={agent.name} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: agent.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {isRunning ? <div className="spin" style={{ width: 16, height: 16, border: '2px solid ' + agent.color, borderTopColor: 'transparent', borderRadius: '50%' }} /> : agent.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{agent.label}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>{agent.description}</p>
                </div>
              </div>
              {lastRun && (
                <div style={{ marginBottom: 8, padding: '6px 10px', background: STATUS_CFG[lastRun.status]?.bg || '#f9fafb', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_CFG[lastRun.status]?.color || '#374151' }}>
                      {STATUS_CFG[lastRun.status]?.label}
                    </span>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>
                      {new Date(lastRun.started_at).toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: '#374151', margin: '3px 0 0' }}>{lastRun.summary}</p>
                </div>
              )}
              <button
                onClick={() => runAgent(agent.name)}
                disabled={isRunning || !!running}
                style={{
                  width: '100%', padding: '8px', fontSize: 12, fontWeight: 700,
                  background: isRunning || running ? '#e5e7eb' : agent.color,
                  color: isRunning || running ? '#9ca3af' : 'white',
                  border: 'none', borderRadius: 7, cursor: isRunning || running ? 'default' : 'pointer',
                }}
              >
                {isRunning ? 'Running agent...' : 'Run ' + agent.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Last result detail */}
      {lastResult && (
        <div style={{ padding: '12px 16px', border: '1px solid ' + (lastResult.success ? '#bbf7d0' : '#fca5a5'), borderRadius: 10, background: lastResult.success ? '#f0fdf4' : '#fef2f2', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{lastResult.success ? '✅' : '❌'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: lastResult.success ? '#16a34a' : '#dc2626' }}>
              {lastResult.success ? 'Agent completed' : 'Agent failed'}
            </span>
            {lastResult.totalTokens > 0 && (
              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>{lastResult.totalTokens} tokens used</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#374151', margin: '0 0 8px' }}>{lastResult.summary}</p>
          {lastResult.reviewItems?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', margin: '0 0 5px' }}>
                {lastResult.reviewItems.length} item{lastResult.reviewItems.length > 1 ? 's' : ''} need your attention:
              </p>
              {lastResult.reviewItems.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: item.type === 'critical' || item.type === 'anomalies' ? '#dc2626' : '#d97706' }}>
                    {item.type === 'critical' ? '🔴' : item.type === 'compliance' ? '⚠️' : '💡'}
                  </span>
                  <span style={{ fontSize: 12, color: '#374151' }}>{item.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Run history */}
      {runs.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Agent History
          </p>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            {runs.slice(0, 10).map((run, idx) => {
              const cfg = STATUS_CFG[run.status] || STATUS_CFG.completed;
              const isExpanded = expandedRun === run.id;
              return (
                <div key={run.id} style={{ borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: run.status === 'pending_review' && !run.broker_reviewed ? '#fffbeb' : 'white' }}
                    onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 }}>
                      {run.agent_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                      {run.steps_completed}/{run.steps_completed + run.steps_failed} steps
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                      {new Date(run.started_at).toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 14px 12px', borderTop: '1px solid #f9fafb' }}>
                      <p style={{ fontSize: 12, color: '#374151', margin: '8px 0' }}>{run.summary}</p>
                      {run.status === 'pending_review' && !run.broker_reviewed && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => approveRun(run.id)}
                            style={{ fontSize: 12, padding: '6px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                            ✓ Approve Agent Actions
                          </button>
                          <button onClick={() => rejectRun(run.id)}
                            style={{ fontSize: 12, padding: '6px 14px', background: 'white', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>
                            ✗ Reject & Reverse
                          </button>
                        </div>
                      )}
                      {run.broker_reviewed && (
                        <p style={{ fontSize: 11, color: run.broker_approved ? '#16a34a' : '#dc2626', margin: '6px 0 0', fontWeight: 600 }}>
                          {run.broker_approved ? '✓ Approved by adviser' : '✗ Rejected by adviser'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
