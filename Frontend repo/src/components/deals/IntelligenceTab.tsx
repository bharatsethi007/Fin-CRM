import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileText,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { useIntelligence } from '@/hooks/useIntelligence';

const READINESS_SECTIONS: { key: string; label: string }[] = [
  { key: 'score_identity_kyc', label: 'KYC' },
  { key: 'score_income_verification', label: 'Income' },
  { key: 'score_expense_verification', label: 'Expenses' },
  { key: 'score_assets_liabilities', label: 'A&L' },
  { key: 'score_property_details', label: 'Property' },
  { key: 'score_compliance', label: 'Compliance' },
  { key: 'score_documents', label: 'Documents' },
];

type AnomalyRow = {
  id: string;
  severity?: string | null;
  title?: string | null;
  description?: string | null;
  blocks_submission?: boolean | null;
};

type ServiceabilityRow = Record<string, unknown> & {
  umi_monthly?: number | null;
  dti_ratio?: number | null;
  passes_anz?: boolean | null;
  passes_asb?: boolean | null;
  passes_bnz?: boolean | null;
  passes_westpac?: boolean | null;
  passes_kiwibank?: boolean | null;
};

const LENDER_PASSES: { col: keyof ServiceabilityRow; label: string }[] = [
  { col: 'passes_anz', label: 'ANZ' },
  { col: 'passes_asb', label: 'ASB' },
  { col: 'passes_bnz', label: 'BNZ' },
  { col: 'passes_westpac', label: 'Westpac' },
];

function sectionBarColor(val: number): string {
  if (val >= 80) return 'bg-emerald-500';
  if (val >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Hero readiness + anomalies + serviceability layout for the deal workspace. */
export function IntelligenceTab({ applicationId }: { applicationId: string }) {
  const { data, isLoading } = useIntelligence(applicationId);
  const readiness = data?.readiness as Record<string, unknown> | null | undefined;
  const anomalies = (data?.anomalies ?? []) as AnomalyRow[];
  const serviceability = data?.serviceability as ServiceabilityRow | null | undefined;

  if (isLoading) {
    return <div className="h-96 animate-pulse rounded-2xl bg-slate-50 dark:bg-slate-900/40" />;
  }

  const score = Number(readiness?.total_score) || 0;
  const grade = (readiness?.score_grade as string | undefined) ?? 'F';
  const breakdown = READINESS_SECTIONS.map(({ key, label }) => ({
    key,
    label,
    val: Math.min(100, Math.max(0, Number(readiness?.[key]) || 0)),
  })).slice(0, 4);

  const blocking = anomalies.filter(
    (a) => a.blocks_submission === true || a.severity === 'critical',
  );
  const risks = anomalies.filter(
    (a) =>
      a.severity !== 'critical' &&
      a.blocks_submission !== true &&
      a.severity !== 'low' &&
      a.severity != null,
  );

  const passedTemplates = [
    'Income verified',
    'Property identified',
    'No duplicate expenses',
    'Credit check current',
  ];
  const passed = passedTemplates.slice(0, Math.max(0, 4 - blocking.length));

  const nextAction = blocking[0] ?? risks[0];

  const scoredAt = readiness?.scored_at as string | undefined;
  const updatedLabel =
    scoredAt != null && !Number.isNaN(Date.parse(scoredAt))
      ? new Date(scoredAt).toLocaleTimeString()
      : '—';

  const openFlow = (prompt: string) => {
    window.dispatchEvent(
      new CustomEvent('flow:open', { detail: { prompt, context: { applicationId, score, grade } } }),
    );
  };

  const circumference = 2 * Math.PI * 48;
  const strokeDash = `${(score / 100) * circumference} ${circumference}`;
  const ringColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="max-w-7xl space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/80" />
        <div className="relative p-8">
          <div className="flex flex-col items-start gap-8 md:flex-row">
            <div className="relative shrink-0">
              <svg className="h-28 w-28 -rotate-90" aria-hidden>
                <circle cx="56" cy="56" r="48" stroke="#e2e8f0" strokeWidth="8" fill="none" />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  stroke={ringColor}
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={strokeDash}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {score}
                </span>
                <span className="-mt-1 text-[10px] font-medium uppercase text-slate-500 dark:text-slate-400">
                  Grade {grade}
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Application Health
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {READINESS_SECTIONS.length} sections weighted · Updated {updatedLabel}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {breakdown.map(({ key, label, val }) => (
                  <div key={key} className="group">
                    <div className="mb-1.5 flex items-center justify-between gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {label}
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{val}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${sectionBarColor(val)}`}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {nextAction != null && (
        <div className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 dark:border-blue-800 dark:from-blue-950/40 dark:to-indigo-950/40">
          <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-blue-600 p-2.5 shadow-lg shadow-blue-600/20">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Next best action
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                  {nextAction.title ?? 'Resolve issue'}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {(nextAction.description ?? '').length > 80
                    ? `${(nextAction.description ?? '').slice(0, 80)}…`
                    : (nextAction.description ?? '')}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Fix now <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
            <span className="h-4 w-1 rounded-full bg-red-500" />
            Blocking submission
          </h3>
          {blocking.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-700 dark:text-slate-300" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</h4>
                  <p className="mt-1 text-sm leading-snug text-slate-600 dark:text-slate-400">
                    {item.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openFlow(`Explain why ${item.title ?? 'this item'} blocks CCCFA submission for this application`)
                  }
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Ask Flow
                </button>
              </div>
            </div>
          ))}
          {blocking.length === 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
              <Check className="mx-auto h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <p className="mt-2 text-sm font-medium text-emerald-900 dark:text-emerald-200">No blockers</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <span className="h-4 w-1 rounded-full bg-amber-500" />
            Risks to approval
          </h3>
          {risks.slice(0, 2).map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</h4>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.description}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Fix
                </button>
                <button
                  type="button"
                  onClick={() => openFlow(`Draft email to client explaining ${item.title ?? 'this risk'}`)}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Explain to client
                </button>
              </div>
            </div>
          ))}

          {serviceability != null && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-slate-700 dark:text-slate-300" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Serviceability</h4>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    UMI ${Math.round(Number(serviceability.umi_monthly) || 0).toLocaleString()}/mo · DTI{' '}
                    {Number(serviceability.dti_ratio ?? 0).toFixed(1)}x
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {LENDER_PASSES.map(({ col, label }) => {
                      const pass = Boolean(serviceability[col]);
                      return (
                        <span
                          key={label}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                            pass
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <span className="h-4 w-1 rounded-full bg-emerald-500" />
            Ready
          </h3>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
            {passed.map((item) => (
              <div
                key={item}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/80"
              >
                <div className="flex items-center gap-2.5">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{item}</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/30">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-900 dark:text-violet-200">
              Flow Intelligence
            </h4>
            <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">
              ANZ likely at 80% LVR. Westpac requires updated expenses. CCCFA buffer 18%.
            </p>
            <button
              type="button"
              onClick={() => openFlow('Compare lender policies for this deal')}
              className="mt-2 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
            >
              View details →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
