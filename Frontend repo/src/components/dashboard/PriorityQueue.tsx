import React, { useCallback } from 'react';

/** Pre-merged application row from the dashboard flat queries (parent sorts). */
export interface ApplicationRow {
  id: string;
  reference_number: string;
  loan_amount: number;
  status: string;
  /** Used with `status` for status chips when present (Supabase workflow_stage). */
  workflow_stage?: string | null;
  settlement_date: string | null;
  assigned_to: string | null;
  client: { first_name: string; last_name: string } | null;
  readiness: { total_score: number; score_grade: string; is_ready_to_submit: boolean } | null;
  /** Optional display name for Owner when parent resolves `assigned_to`. */
  assigned_adviser_name?: string | null;
}

export type PriorityStatusKey =
  | 'in_progress'
  | 'pre_approval'
  | 'submitted'
  | 'approved'
  | 'on_hold';

export interface PriorityQueueProps {
  applications: ApplicationRow[];
  firmView: boolean;
  loading?: boolean;
  emptyLabel?: string;
  /** SPA navigation (Vite app has no Next router). */
  onApplicationOpen?: (applicationId: string) => void;
}

const GRID_COLS = 'grid grid-cols-[2fr_1fr_80px_120px_1fr_100px]';

const STATUS_CHIP: Record<PriorityStatusKey, string> = {
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  pre_approval: 'border-violet-200 bg-violet-50 text-violet-700',
  submitted: 'border-orange-200 bg-orange-50 text-orange-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  on_hold: 'border-slate-200 bg-slate-100 text-slate-600',
};

/** Maps flat `applications.status` / `workflow_stage` to priority-queue status chips. */
export function priorityStatusFromSupabaseApplication(row: {
  status?: string | null;
  workflow_stage?: string | null;
}): { statusKey: PriorityStatusKey; statusLabel: string } {
  const ws = (row.workflow_stage || '').toLowerCase();
  const st = (row.status || '').toLowerCase();
  if (st === 'on_hold' || ws === 'on_hold') {
    return { statusKey: 'on_hold', statusLabel: 'On Hold' };
  }
  if (ws === 'unconditional') {
    return { statusKey: 'approved', statusLabel: 'Approved' };
  }
  if (st === 'pre_approval' || ws === 'conditional' || ws === 'pre_approval') {
    return { statusKey: 'pre_approval', statusLabel: 'Pre-Approval' };
  }
  if (st === 'submitted' || ws === 'submitted') {
    return { statusKey: 'submitted', statusLabel: 'Submitted' };
  }
  return { statusKey: 'in_progress', statusLabel: 'In Progress' };
}

/** Formats loan amount for the queue (compact). */
function formatLoanAmount(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

/** Calendar-day offset from today for a date-only ISO string. */
function dayDeltaFromToday(iso: string): number | null {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** Due column: "Today", short "Nd", or "14 Apr" for dates outside ±13 days. */
function formatSettlementDue(settlementDate: string | null): string {
  if (!settlementDate) return '—';
  const delta = dayDeltaFromToday(settlementDate);
  if (delta === null) return '—';
  if (delta === 0) return 'Today';
  if (Math.abs(delta) <= 13) return `${delta}d`;
  const d = new Date(`${settlementDate.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

/** Ring + fill classes for readiness score (X/100). */
function scoreRingClass(score: number): string {
  if (score >= 80) return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  if (score >= 60) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return 'bg-red-50 text-red-700 ring-1 ring-red-200';
}

function ScoreCell({ score }: { score: number | null }) {
  return (
    <div className="px-4 py-3">
      {score != null && !Number.isNaN(score) ? (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${scoreRingClass(score)}`}
        >
          {Math.round(score)}/100
        </span>
      ) : (
        <span className="text-[12px] text-slate-400 dark:text-slate-500">—</span>
      )}
    </div>
  );
}

function StatusChip({ statusKey, label }: { statusKey: PriorityStatusKey; label: string }) {
  return (
    <span
      className={`inline-block max-w-full truncate rounded border px-1.5 py-0.5 text-xs font-medium ${STATUS_CHIP[statusKey]}`}
    >
      {label}
    </span>
  );
}

/** First three rows after parent sort (lowest readiness first). */
function isTopThree(index: number): boolean {
  return index < 3;
}

/** Firm / my priority queue; rows pre-sorted and pre-merged by parent. */
export function PriorityQueue({
  applications,
  firmView,
  loading,
  emptyLabel = 'No applications in queue',
  onApplicationOpen,
}: PriorityQueueProps) {
  const count = applications.length;

  /** Opens application detail via parent (preferred) or URL sync (`/deals/[id]`). */
  const handleRowClick = useCallback(
    (id: string) => {
      if (onApplicationOpen) {
        onApplicationOpen(id);
        return;
      }
      window.history.pushState(null, '', `/deals/${id}`);
      window.dispatchEvent(new Event('advflow:navigate'));
    },
    [onApplicationOpen],
  );

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Priority Queue
          </span>
          <p className="text-[13px] text-slate-400 dark:text-slate-500">{firmView ? 'Firm pipeline' : 'Your queue'}</p>
        </div>
        <span className="text-[13px] text-slate-400 dark:text-slate-500">{count} applications</span>
      </div>

      <div
        className={`${GRID_COLS} h-9 items-center border-b border-slate-200 px-4 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400`}
      >
        <span>Client</span>
        <span>Loan</span>
        <span>Score</span>
        <span>Status</span>
        <span>Owner</span>
        <span>Due</span>
      </div>

      <div className="max-h-[min(480px,55vh)] overflow-y-auto">
        {loading ? (
          <p className="px-4 py-8 text-center text-[14px] leading-[20px] text-slate-700 dark:text-slate-300">Loading…</p>
        ) : count === 0 ? (
          <p className="px-4 py-8 text-center text-[14px] leading-[20px] text-slate-700 dark:text-slate-300">{emptyLabel}</p>
        ) : (
          applications.map((app, index) => {
            const highlight = isTopThree(index);
            const { statusKey, statusLabel } = priorityStatusFromSupabaseApplication({
              status: app.status,
              workflow_stage: app.workflow_stage,
            });
            const readinessScore =
              app.readiness == null || Number.isNaN(Number(app.readiness.total_score))
                ? null
                : Math.round(Number(app.readiness.total_score));
            const clientLine = app.client
              ? [app.client.first_name, app.client.last_name].filter(Boolean).join(' ').trim() || '—'
              : '—';
            const owner = (app.assigned_adviser_name || '').trim() || '—';
            return (
              <a
                key={app.id}
                href={`/deals/${app.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleRowClick(app.id);
                }}
                className={`${GRID_COLS} h-[52px] w-full cursor-pointer items-center border-b border-slate-200 px-4 text-left text-slate-900 no-underline transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/60 ${
                  highlight ? 'border-l-2 border-l-amber-400' : ''
                }`}
              >
                <div className="min-w-0 pr-2">
                  <span className="block truncate text-[14px] font-semibold leading-[20px] text-slate-900 dark:text-slate-100">
                    {clientLine}
                  </span>
                  <span className="block truncate text-[13px] text-slate-400 dark:text-slate-500">
                    {app.reference_number || '—'}
                  </span>
                </div>
                <span className="truncate text-[14px] leading-[20px] text-slate-700 dark:text-slate-300">
                  {formatLoanAmount(Number(app.loan_amount) || 0)}
                </span>
                <ScoreCell score={readinessScore} />
                <div className="min-w-0 pr-1">
                  <StatusChip statusKey={statusKey} label={statusLabel} />
                </div>
                <span className="truncate text-[14px] leading-[20px] text-slate-700 dark:text-slate-300">{owner}</span>
                <span className="truncate text-[14px] leading-[20px] text-slate-700 dark:text-slate-300">
                  {formatSettlementDue(app.settlement_date)}
                </span>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
