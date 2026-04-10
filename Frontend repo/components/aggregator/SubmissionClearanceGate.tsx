import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { ShieldCheck, Clock, XCircle, AlertTriangle, Lock, Send, CheckCircle2 } from 'lucide-react';

interface ClearanceState {
  cleared: boolean;
  loading: boolean;
  status: 'no_aggregator' | 'approved' | 'pending' | 'in_review' | 'returned' | 'escalated' | 'not_submitted' | null;
  aggregatorName: string | null;
  notes: string | null;
  reviewId: string | null;
}

export function useSubmissionClearance(applicationId: string): ClearanceState & { refresh: () => void } {
  const [state, setState] = useState<ClearanceState>({
    cleared: false, loading: true, status: null,
    aggregatorName: null, notes: null, reviewId: null,
  });

  const check = useCallback(async () => {
    if (!applicationId) return;

    const { data: app } = await supabase
      .from('applications')
      .select('firm_id')
      .eq('id', applicationId)
      .maybeSingle();

    if (!app?.firm_id) {
      setState({ cleared: true, loading: false, status: 'no_aggregator', aggregatorName: null, notes: null, reviewId: null });
      return;
    }

    const { data: firm } = await supabase
      .from('firms')
      .select('aggregator_id')
      .eq('id', app.firm_id)
      .maybeSingle();

    if (!firm?.aggregator_id) {
      setState({ cleared: true, loading: false, status: 'no_aggregator', aggregatorName: null, notes: null, reviewId: null });
      return;
    }

    const { data: aggregator } = await supabase
      .from('aggregators')
      .select('name')
      .eq('id', firm.aggregator_id)
      .maybeSingle();

    const { data: review } = await supabase
      .from('application_aggregator_reviews')
      .select('id, status, notes')
      .eq('application_id', applicationId)
      .eq('aggregator_id', firm.aggregator_id)
      .maybeSingle();

    const status = (review?.status ?? 'not_submitted') as ClearanceState['status'];

    setState({
      cleared: status === 'approved',
      loading: false,
      status,
      aggregatorName: aggregator?.name ?? null,
      notes: review?.notes ?? null,
      reviewId: review?.id ?? null,
    });
  }, [applicationId]);

  useEffect(() => { check(); }, [check]);

  return { ...state, refresh: check };
}

// ── Submit for Review Button ──────────────────────────────────────────────────

export function SubmitForReviewButton({ applicationId }: { applicationId: string }) {
  const { status, aggregatorName, loading, refresh } = useSubmissionClearance(applicationId);
  const [submitting, setSubmitting] = useState(false);

  if (loading || status === 'no_aggregator' || status === 'approved') return null;
  if (status !== 'not_submitted' && status !== 'returned') return null;

  async function handleSubmit() {
    setSubmitting(true);
    await supabase.rpc('submit_application_for_review', { p_application_id: applicationId });
    await refresh();
    setSubmitting(false);
  }

  return (
    <button
      onClick={handleSubmit}
      disabled={submitting}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-all shadow-sm"
    >
      <Send className="h-3.5 w-3.5" />
      {submitting ? 'Submitting…' : `Submit to ${aggregatorName ?? 'Aggregator'} for Review`}
    </button>
  );
}

// ── Gate Banner ───────────────────────────────────────────────────────────────

export default function SubmissionClearanceGate({ applicationId }: { applicationId: string }) {
  const { cleared, loading, status, aggregatorName, notes } = useSubmissionClearance(applicationId);

  if (loading || cleared || status === 'no_aggregator' || status === 'not_submitted') return null;

  const configs = {
    pending: {
      icon: Clock,
      title: 'Awaiting Aggregator Review',
      body: `Submitted to ${aggregatorName ?? 'your aggregator'} for compliance review. Lender submission unlocks once approved.`,
      bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400',
      titleColor: 'text-amber-800 dark:text-amber-200',
    },
    in_review: {
      icon: ShieldCheck,
      title: 'Under Active Review',
      body: `${aggregatorName ?? 'Your aggregator'} is reviewing this application. You will be notified when a decision is made.`,
      bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400',
      titleColor: 'text-blue-800 dark:text-blue-200',
    },
    approved: {
      icon: CheckCircle2,
      title: 'Approved — Ready for Lender Submission',
      body: `${aggregatorName ?? 'Your aggregator'} has approved this application. You can now submit to lenders.`,
      bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconColor: 'text-emerald-600 dark:text-emerald-400',
      titleColor: 'text-emerald-800 dark:text-emerald-200',
    },
    returned: {
      icon: AlertTriangle,
      title: 'Returned — Action Required',
      body: `${aggregatorName ?? 'Your aggregator'} has returned this application. Address the notes below and resubmit.`,
      bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800',
      iconBg: 'bg-red-100 dark:bg-red-900/40', iconColor: 'text-red-600 dark:text-red-400',
      titleColor: 'text-red-800 dark:text-red-200',
    },
    escalated: {
      icon: XCircle,
      title: 'Escalated for Senior Review',
      body: `Escalated by ${aggregatorName ?? 'your aggregator'} and pending senior approval.`,
      bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800',
      iconBg: 'bg-purple-100 dark:bg-purple-900/40', iconColor: 'text-purple-600 dark:text-purple-400',
      titleColor: 'text-purple-800 dark:text-purple-200',
    },
  };

  const cfg = configs[status as keyof typeof configs] ?? configs.pending;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border ${cfg.bg} ${cfg.border} p-4 mb-4`}>
      <div className="flex gap-3">
        <div className={`mt-0.5 p-2 rounded-lg ${cfg.iconBg} shrink-0`}>
          <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-semibold ${cfg.titleColor}`}>{cfg.title}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">{cfg.body}</p>
          {notes && (
            <div className="mt-3 p-3 bg-white/60 dark:bg-gray-900/40 rounded-lg border border-current/10">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Aggregator Notes
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{notes}</p>
            </div>
          )}
          {status === 'returned' && (
            <div className="mt-3">
              <SubmitForReviewButton applicationId={applicationId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Lock Guard ────────────────────────────────────────────────────────────────

export function SubmitLockGuard({ applicationId, children }: { applicationId: string; children: React.ReactNode }) {
  const { cleared, loading, status } = useSubmissionClearance(applicationId);
  const blocked = !loading && !cleared && status !== 'no_aggregator';

  if (!blocked) return <>{children}</>;

  return (
    <div className="relative group inline-block">
      <div className="opacity-40 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-medium px-2.5 py-1 rounded-full shadow-sm">
          <Lock className="h-3 w-3" />
          Aggregator approval required
        </div>
      </div>
    </div>
  );
}
