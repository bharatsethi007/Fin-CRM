import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../../services/supabaseClient';
import { logger } from '../../../utils/logger';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

/** Suggestion chip driving a pre-filled Flow session. */
export interface FlowBriefingSuggestion {
  label: string;
  message: string;
}

/** Inline briefing statistic with drill-through. */
export interface FlowBriefingMetric {
  id: string;
  label: string;
  value: string;
  onDrill: () => void;
}

interface AnomalyFlag {
  id: string;
  application_id: string;
  title: string | null;
  description: string | null;
  severity: string | null;
  flag_category: string | null;
}

export interface FlowBriefingProps {
  firmId: string;
  /** When set, anomalies are limited to applications assigned to this adviser. */
  scopeAdviserId?: string | null;
  /** Optional: sync firm-wide open anomaly count (e.g. briefing strip). */
  onOpenIssueCountChange?: (count: number) => void;
}

/** Ordinal rank for anomaly severity (critical first). */
function anomalySeverityRank(s: string | null | undefined): number {
  const v = (s || '').toLowerCase();
  if (v === 'critical') return 0;
  if (v === 'high') return 1;
  if (v === 'medium') return 2;
  if (v === 'low') return 3;
  return 4;
}

/** Card body line from anomaly title + description. */
function formatAnomalyDescription(title: string | null | undefined, description: string | null | undefined): string {
  const t = (title || '').trim();
  const d = (description || '').trim();
  if (t && d && t !== d) return `${t}: ${d}`;
  return t || d || 'Open anomaly';
}

const BRIEFING_FALLBACK_SUMMARIES = [
  'LVR 87.2% — LEM applies. Valuation required.',
  'Income $125K declared, no documents uploaded.',
  'Expenses $1,072 below HEM $2,200.',
] as const;

/** Single-line briefing copy for an anomaly row (trimmed from API or short fallback). */
function briefingIssueSummary(flag: AnomalyFlag, index: number): string {
  const line = formatAnomalyDescription(flag.title, flag.description).replace(/\s+/g, ' ').trim();
  if (!line || line === 'Open anomaly') return BRIEFING_FALLBACK_SUMMARIES[index % BRIEFING_FALLBACK_SUMMARIES.length];
  if (line.length > 120) return `${line.slice(0, 117)}…`;
  return line;
}

const FIX_BTN =
  'shrink-0 rounded px-2 py-1 text-[12px] font-medium text-slate-900 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

/** Self-loaded Flow Briefing card: open anomalies, Fix = resolve (no detect RPC), 30s poll when tab visible. */
export function FlowBriefing({ firmId, scopeAdviserId, onOpenIssueCountChange }: FlowBriefingProps) {
  const [anomalies, setAnomalies] = useState<AnomalyFlag[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fixingFlagId, setFixingFlagId] = useState<string | null>(null);

  const fetchAnomalies = useCallback(async () => {
    if (!firmId) {
      setAnomalies([]);
      setIssueCount(0);
      setLoading(false);
      return;
    }
    let appIdFilter: string[] | null = null;
    if (scopeAdviserId) {
      const { data: myApps, error: appErr } = await supabase
        .from('applications')
        .select('id')
        .eq('firm_id', firmId)
        .eq('assigned_to', scopeAdviserId);
      if (appErr) {
        logger.log('Flow briefing: scope applications query failed', appErr.message);
      }
      const ids = (myApps ?? []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) {
        setAnomalies([]);
        setIssueCount(0);
        onOpenIssueCountChange?.(0);
        setLoading(false);
        return;
      }
      appIdFilter = ids;
    }
    const listBase = () =>
      supabase
        .from('anomaly_flags')
        .select('id, application_id, title, description, severity, flag_category')
        .eq('status', 'open')
        .eq('firm_id', firmId);
    const countBase = () =>
      supabase.from('anomaly_flags').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('firm_id', firmId);
    const listQ = appIdFilter ? listBase().in('application_id', appIdFilter) : listBase();
    const countQ = appIdFilter ? countBase().in('application_id', appIdFilter) : countBase();
    const [listRes, countRes] = await Promise.all([
      listQ.order('severity', { ascending: false }).limit(3),
      countQ,
    ]);
    if (listRes.error) logger.log('Flow briefing: list query failed', listRes.error.message);
    const raw = (listRes.data ?? []) as AnomalyFlag[];
    const sorted = [...raw].sort((a, b) => anomalySeverityRank(a.severity) - anomalySeverityRank(b.severity));
    setAnomalies(sorted.slice(0, 3));
    const nextCount = countRes.error ? 0 : countRes.count ?? 0;
    setIssueCount(nextCount);
    onOpenIssueCountChange?.(nextCount);
    setLoading(false);
  }, [firmId, scopeAdviserId, onOpenIssueCountChange]);

  useEffect(() => {
    setLoading(true);
    void fetchAnomalies();
  }, [fetchAnomalies]);

  useAutoRefresh(() => {
    void fetchAnomalies();
  }, 30);

  const handleFix = async (flagId: string) => {
    setFixingFlagId(flagId);
    try {
      const { error } = await supabase.from('anomaly_flags').update({ status: 'resolved_genuine' }).eq('id', flagId);
      if (error) logger.log('Flow briefing: resolve anomaly failed', error.message);
      await fetchAnomalies();
    } finally {
      setFixingFlagId(null);
    }
  };

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-violet-600 to-blue-600" aria-hidden />
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-sm">
            <span className="text-sm font-bold text-white">F</span>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-[20px] text-slate-900 dark:text-slate-100">Flow Briefing</p>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active anomalies
            </p>
          </div>
        </div>
        <span className="shrink-0 text-[13px] text-slate-400 dark:text-slate-500">{issueCount} issues</span>
      </div>

      {loading ? (
        <div className="space-y-2 px-4 py-6">
          <div className="h-10 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : anomalies.length === 0 ? (
        <div className="px-4 py-4 text-[14px] leading-[20px] text-slate-500 dark:text-slate-400">No active anomalies.</div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          {anomalies.map((a, i) => (
            <div key={a.id} className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              <p className="flex-1 text-[13px] leading-[18px] text-slate-700 dark:text-slate-300">{briefingIssueSummary(a, i)}</p>
              <button
                type="button"
                disabled={fixingFlagId === a.id}
                onClick={() => void handleFix(a.id)}
                className={FIX_BTN}
              >
                {fixingFlagId === a.id ? '…' : 'Fix'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
