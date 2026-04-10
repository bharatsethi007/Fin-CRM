import { AlertTriangle, ChevronRight, Sparkles, X } from 'lucide-react';
import { useState } from 'react';

export interface Issue {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  field?: string;
  fix?: () => void;
}

export interface IssuesPanelProps {
  score: number;
  issues: Issue[];
}

/** Slide-over panel listing application health issues and score; toggled from a compact chip. */
export function IssuesPanel({ score, issues }: IssuesPanelProps) {
  const [open, setOpen] = useState(false);
  const critical = issues.filter((i) => i.severity === 'critical').length;
  const high = issues.filter((i) => i.severity === 'high').length;
  const total = critical + high;

  const color = score >= 80 ? 'emerald' : score >= 60 ? 'amber' : 'red';
  const bg =
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
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] ${bg}`}
      >
        <span className={`h-2 w-2 rounded-full ${dot} ${total > 0 ? 'animate-pulse' : ''}`} />
        {score}/100
        {total > 0 && <span className="opacity-70">· {total} to review</span>}
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <button
            type="button"
            aria-label="Close issues panel"
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-[transform,opacity] duration-200 ease-out">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Application Health</h3>
                <p className="mt-0.5 text-xs text-slate-500">{issues.length} items need attention</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className="group rounded-xl border border-slate-200 bg-white p-3.5 transition-all hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 rounded-lg p-1.5 ${
                        issue.severity === 'critical'
                          ? 'bg-red-50'
                          : issue.severity === 'high'
                            ? 'bg-amber-50'
                            : 'bg-slate-50'
                      }`}
                    >
                      <AlertTriangle
                        className={`h-3.5 w-3.5 ${
                          issue.severity === 'critical'
                            ? 'text-red-600'
                            : issue.severity === 'high'
                              ? 'text-amber-600'
                              : 'text-slate-600'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-medium text-slate-900">{issue.title}</h4>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            issue.severity === 'critical'
                              ? 'bg-red-100 text-red-700'
                              : issue.severity === 'high'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-slate-600">{issue.description}</p>
                      {issue.field && (
                        <p className="mt-1.5 text-xs text-slate-500">Field: {issue.field}</p>
                      )}
                    </div>
                  </div>
                  {issue.fix && (
                    <button
                      type="button"
                      onClick={issue.fix}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Sparkles className="h-3 w-3" />
                      Fix automatically
                    </button>
                  )}
                </div>
              ))}
              {issues.length === 0 && (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                    <Sparkles className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">All clear</p>
                  <p className="mt-1 text-xs text-slate-500">No issues detected</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50 p-4">
              <button
                type="button"
                className="w-full rounded-lg bg-slate-900 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800"
              >
                Re-score application
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
