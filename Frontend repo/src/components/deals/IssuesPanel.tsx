import { AlertTriangle, CheckCircle2, ChevronRight, Sparkles, X } from 'lucide-react';
import { useState } from 'react';

/** Row shape: readiness issues, `anomaly_flags`, or similar. */
export type IssuesPanelAnomaly = {
  id: string;
  severity: string;
  title?: string;
  check_name?: string;
  description?: string;
  details?: string;
  field?: string;
  impact_points?: number;
  fix?: () => void;
};

/** @deprecated Use IssuesPanelAnomaly — kept for call sites that still import `Issue`. */
export type Issue = IssuesPanelAnomaly & {
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
};

export interface IssuesPanelProps {
  score: number;
  grade?: string | null;
  anomalies: IssuesPanelAnomaly[];
  onFix?: (anomaly: IssuesPanelAnomaly) => void;
}

/** Compact health pill + slide-over listing anomalies (replaces stacked banners). */
export function IssuesPanel({ score, grade, anomalies, onFix }: IssuesPanelProps) {
  const [open, setOpen] = useState(false);
  const critical = anomalies.filter((a) => a.severity === 'critical').length;
  const high = anomalies.filter((a) => a.severity === 'high').length;
  const total = critical + high;

  const color = score >= 80 ? 'emerald' : score >= 60 ? 'amber' : 'red';
  const styles =
    color === 'emerald'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : color === 'amber'
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-red-50 border-red-200 text-red-700';
  const dot =
    color === 'emerald' ? 'bg-emerald-500' : color === 'amber' ? 'bg-amber-500' : 'bg-red-500';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] hover:shadow-sm ${styles}`}
      >
        <span className={`h-2 w-2 rounded-full ${dot} ${total > 0 ? 'animate-pulse' : ''}`} />
        <span className="font-semibold">{score}</span>
        <span className="opacity-60">/100</span>
        {grade != null && grade !== '' && <span className="opacity-70">· {grade}</span>}
        {total > 0 && <span className="opacity-70">· {total} to review</span>}
        <ChevronRight className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <button
            type="button"
            aria-label="Close issues panel"
            className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-slate-900">Application Health</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {anomalies.length} active · Grade {grade ?? '—'} · Updated just now
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="-mr-1.5 rounded-lg p-1.5 transition-colors hover:bg-slate-100"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {anomalies.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  </div>
                  <h4 className="text-base font-medium text-slate-900">All clear</h4>
                  <p className="mt-1 text-sm text-slate-500">Ready for submission</p>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {anomalies.map((a) => {
                    const title = a.title ?? a.check_name ?? 'Issue';
                    const body = a.description ?? a.details ?? '';
                    const sev = a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'high' : 'other';
                    return (
                      <div
                        key={a.id}
                        className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-sm"
                      >
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`mt-0.5 rounded-xl p-2 ${
                              sev === 'critical'
                                ? 'bg-red-50'
                                : sev === 'high'
                                  ? 'bg-amber-50'
                                  : 'bg-slate-50'
                            }`}
                          >
                            <AlertTriangle
                              className={`h-4 w-4 ${
                                sev === 'critical'
                                  ? 'text-red-600'
                                  : sev === 'high'
                                    ? 'text-amber-600'
                                    : 'text-slate-600'
                              }`}
                              strokeWidth={2}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-medium leading-snug text-slate-900">{title}</h4>
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                                  sev === 'critical'
                                    ? 'bg-red-100 text-red-700'
                                    : sev === 'high'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {a.severity}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
                            {a.field != null && a.field !== '' && (
                              <p className="mt-2 text-xs text-slate-500">Field: {a.field}</p>
                            )}
                            {a.impact_points != null && (
                              <p className="mt-2 text-xs text-slate-500">Impact: -{a.impact_points} points</p>
                            )}
                          </div>
                        </div>
                        {(onFix != null || a.fix != null) && (
                          <button
                            type="button"
                            onClick={() => {
                              onFix?.(a);
                              a.fix?.();
                            }}
                            className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Fix automatically
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
