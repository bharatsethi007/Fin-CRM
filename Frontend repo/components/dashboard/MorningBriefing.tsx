import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import type { FlowInsightRow } from '../../services/flowIntelligenceDashboard';

const PRIORITY_CFG: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  high:     { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  medium:   { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  low:      { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
};

const TYPE_ICONS: Record<string, string> = {
  rate_opportunity: '💰',
  stale_application: '⏰',
  refix_opportunity: '🔄',
  compliance_gap: '⚠️',
  review_due: '📋',
  decline_risk: '🚨',
  coaching_tip: '💡',
};

export interface MorningBriefingProps {
  /** Parent-driven insights (e.g. Flow Intelligence page). Omit when using `firmId`. */
  insights?: FlowInsightRow[];
  loading?: boolean;
  onRefresh?: () => void | Promise<void>;
  /** When set and there are no insights, show this instead of the default “All clear” message */
  emptyMessage?: string | null;
  /** When set, loads insights for this firm (e.g. Dashboard). `advisorId` reserved for future scoping. */
  firmId?: string;
  advisorId?: string;
}

export const MorningBriefing: React.FC<MorningBriefingProps> = ({
  insights: insightsProp,
  loading: loadingProp = false,
  onRefresh: onRefreshProp,
  emptyMessage = null,
  firmId,
}) => {
  const toast = useToast();
  const standalone = Boolean(firmId);
  const [internalInsights, setInternalInsights] = useState<FlowInsightRow[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);

  const loadInsights = useCallback(async () => {
    if (!firmId) return;
    setInternalLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('firm_id', firmId)
        .eq('is_actioned', false)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setInternalInsights((data ?? []) as FlowInsightRow[]);
    } catch (e) {
      logger.error('MorningBriefing load:', e);
      setInternalInsights([]);
    } finally {
      setInternalLoading(false);
    }
  }, [firmId]);

  useEffect(() => {
    if (standalone) void loadInsights();
  }, [standalone, loadInsights]);

  const insights = standalone ? internalInsights : (insightsProp ?? []);
  const loading = standalone ? internalLoading : loadingProp;
  const onRefresh = standalone ? loadInsights : onRefreshProp;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  async function dismiss(id: string) {
    await supabase.from('ai_insights').update({ is_dismissed: true, dismissed_at: new Date().toISOString() }).eq('id', id);
    toast.info('Insight dismissed');
    if (standalone) await loadInsights();
    await onRefresh?.();
  }

  async function action(insight: FlowInsightRow) {
    setActioning(insight.id);
    // Mark as actioned
    await supabase.from('ai_insights').update({
      is_actioned: true, actioned_at: new Date().toISOString()
    }).eq('id', insight.id);
    // If it has an email draft, open mail client
    const actionData = insight.action_data as { client_email?: string } | null | undefined;
    const draft = insight.draft_content as { greeting?: string; body?: string; sign_off?: string } | null | undefined;
    if (draft && actionData?.client_email) {
      const body = encodeURIComponent(
        `${draft.greeting || 'Hi,'}

${draft.body}

${draft.sign_off || 'Kind regards'}`
      );
      const subject = encodeURIComponent(insight.draft_subject || insight.title);
      window.open(`mailto:${actionData.client_email}?subject=${subject}&body=${body}`);
    }
    toast.success('Action taken');
    if (standalone) await loadInsights();
    await onRefresh?.();
    setActioning(null);
  }

  const critical = insights.filter(i => i.priority === 'critical');
  const high = insights.filter(i => i.priority === 'high');
  const medium = insights.filter(i => i.priority === 'medium');

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 24 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #6366f1', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize: 13, color: '#64748b' }}>Loading your briefing...</span>
    </div>
  );

  if (insights.length === 0) {
    if (emptyMessage) {
      return (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{emptyMessage}</p>
        </div>
      );
    }
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 32, margin: '0 0 10px' }}>🎉</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>All clear</p>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>No pending actions. Check back tomorrow morning.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        {critical.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2',
            border: '1px solid #fecaca', padding: '3px 10px', borderRadius: 20 }}>
            {critical.length} critical
          </span>
        )}
        {high.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: '#fffbeb',
            border: '1px solid #fde68a', padding: '3px 10px', borderRadius: 20 }}>
            {high.length} high
          </span>
        )}
        {medium.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff',
            border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: 20 }}>
            {medium.length} medium
          </span>
        )}
        <button
          type="button"
          onClick={() => void onRefresh?.()}
          style={{ fontSize: 11, color: '#94a3b8', background: 'none',
          border: 'none', cursor: 'pointer', marginLeft: 'auto' }}
        >
          ↻ Refresh
        </button>
      </div>

      {insights.map(insight => {
        const cfg = PRIORITY_CFG[insight.priority] || PRIORITY_CFG.medium;
        const isExpanded = expanded === insight.id;
        const draftPreview = insight.draft_content as { greeting?: string; body?: string; sign_off?: string } | null | undefined;
        const actionPreview = insight.action_data as { client_email?: string } | null | undefined;
        const hasDraft = !!draftPreview;

        return (
          <div key={insight.id} style={{ border: `1px solid ${cfg.border}`,
            borderLeft: `3px solid ${cfg.color}`, borderRadius: 10,
            background: 'white', overflow: 'hidden' }}>
            {/* Main row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px' }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                {TYPE_ICONS[insight.insight_type] || '📌'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', margin: '0 0 2px' }}>
                  {insight.title}
                </p>
                <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                  {insight.body}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {hasDraft && (
                  <button onClick={() => setExpanded(isExpanded ? null : insight.id)}
                    style={{ fontSize: 11, color: cfg.color, background: cfg.bg,
                      border: `1px solid ${cfg.border}`, borderRadius: 6,
                      padding: '4px 10px', cursor: 'pointer' }}>
                    {isExpanded ? 'Hide draft' : 'View draft'}
                  </button>
                )}
                {insight.action_label && (
                  <button onClick={() => action(insight)} disabled={actioning === insight.id}
                    style={{ fontSize: 11, fontWeight: 600, color: 'white', background: cfg.color,
                      border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                    {actioning === insight.id ? '...' : insight.action_label}
                  </button>
                )}
                <button onClick={() => dismiss(insight.id)}
                  style={{ fontSize: 11, color: '#94a3b8', background: 'none',
                    border: 'none', cursor: 'pointer', padding: '4px 6px' }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Email draft preview */}
            {isExpanded && draftPreview && (
              <div style={{ padding: '10px 12px', background: '#f8fafc',
                borderTop: `1px solid ${cfg.border}` }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', margin: '0 0 6px' }}>Email Draft</p>
                {insight.draft_subject && (
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>
                    Subject: {insight.draft_subject}
                  </p>
                )}
                <p style={{ fontSize: 12, color: '#374151', margin: '0 0 2px' }}>
                  {draftPreview.greeting}
                </p>
                <p style={{ fontSize: 12, color: '#374151', margin: '0 0 2px', lineHeight: 1.5 }}>
                  {draftPreview.body}
                </p>
                <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>
                  {draftPreview.sign_off}
                </p>
                {actionPreview?.client_email && (
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: '6px 0 0' }}>
                    To: {actionPreview.client_email}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
