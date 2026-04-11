import React from 'react';
import type { FlowBriefingMetric, FlowBriefingSuggestion } from './FlowBriefing';

export type { FlowBriefingMetric, FlowBriefingSuggestion };

const BTN_PRIMARY =
  'px-3 py-1.5 rounded-lg bg-slate-900 text-[13px] font-medium text-white transition-colors hover:bg-slate-800';
const BTN_SECONDARY =
  'px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50';
const METRIC_HIT =
  'text-[12px] font-medium text-slate-900 transition-colors hover:bg-slate-100 hover:text-slate-700 rounded px-2 py-1';

export interface FlowIntelligenceCardProps {
  loading: boolean;
  reviewedApplications: number;
  needAttentionCount: number;
  refixCount: number;
  /** Days until the nearest refix in the 90d window; null when none. */
  refixNextDays: number | null;
  briefingMetrics: FlowBriefingMetric[];
  suggestions: FlowBriefingSuggestion[];
  onOpenFlow: () => void;
  onOpenFlowWithMessage: (message: string) => void;
}

/** Flow Intelligence summary card above KPIs (human copy + inline metrics + Flow entry). */
export function FlowIntelligenceCard({
  loading,
  reviewedApplications,
  needAttentionCount,
  refixCount,
  refixNextDays,
  briefingMetrics,
  suggestions,
  onOpenFlow,
  onOpenFlowWithMessage,
}: FlowIntelligenceCardProps) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-6 font-sans shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#0064E0]">
          <span className="text-sm font-medium text-white">F</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Flow Intelligence
          </p>
          {loading ? (
            <div className="mt-2 h-14 w-full max-w-xl animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
          ) : (
            <p className="mt-1.5 text-[14px] leading-[20px] text-slate-900 dark:text-slate-100">
              I&apos;ve reviewed {reviewedApplications} application{reviewedApplications === 1 ? '' : 's'}.{' '}
              {needAttentionCount > 0 ? (
                <>
                  <span className="font-medium text-amber-700 dark:text-amber-500">
                    {needAttentionCount} need attention
                  </span>{' '}
                  — review open anomalies and document gaps.{' '}
                </>
              ) : (
                <span className="text-slate-600 dark:text-slate-400">Nothing flagged for attention. </span>
              )}
              {refixCount > 0 ? (
                <>
                  {refixCount} refix{refixCount === 1 ? '' : 'es'} in the next 90 days
                  {refixNextDays != null ? ` (next in ${refixNextDays} days).` : '.'}
                </>
              ) : (
                'No refix deadlines in the next 90 days.'
              )}
            </p>
          )}
          {!loading && briefingMetrics.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-600 dark:text-slate-400">
                {briefingMetrics.map((m, i) => (
                  <React.Fragment key={m.id}>
                    {i > 0 && <span aria-hidden>·</span>}
                    <button type="button" onClick={m.onDrill} className={METRIC_HIT}>
                      <strong
                        className={
                          m.id === 'bf-claw'
                            ? 'font-semibold text-amber-700 dark:text-amber-500'
                            : 'font-semibold text-slate-900 dark:text-slate-100'
                        }
                      >
                        {m.value}
                      </strong>{' '}
                      {m.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onOpenFlow} className={BTN_PRIMARY}>
              Open Flow
            </button>
            {!loading &&
              suggestions.map((s, idx) => (
                <button
                  key={`${s.label}-${idx}`}
                  type="button"
                  onClick={() => onOpenFlowWithMessage(s.message)}
                  className={BTN_SECONDARY}
                >
                  {s.label}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
