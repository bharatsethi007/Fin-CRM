import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';

interface AggregatorReview {
  id: string;
  status: 'pending' | 'in_review' | 'approved' | 'returned' | 'escalated';
  notes: string | null;
  reviewed_at: string | null;
  aggregators: { name: string } | null;
}

interface Props {
  applicationId: string;
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: 'Awaiting Aggregator Review',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    iconColor: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    dot: 'bg-amber-400',
    pulse: true,
  },
  in_review: {
    icon: ShieldCheck,
    label: 'Under Aggregator Review',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    iconColor: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    dot: 'bg-blue-400',
    pulse: true,
  },
  approved: {
    icon: CheckCircle2,
    label: 'Approved by Aggregator',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    iconColor: 'text-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    dot: 'bg-emerald-400',
    pulse: false,
  },
  returned: {
    icon: AlertTriangle,
    label: 'Returned — Action Required',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    iconColor: 'text-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    dot: 'bg-red-500',
    pulse: false,
  },
  escalated: {
    icon: ArrowUpRight,
    label: 'Escalated for Senior Review',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800',
    iconColor: 'text-purple-500',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    dot: 'bg-purple-400',
    pulse: false,
  },
};

export default function AggregatorReviewBanner({ applicationId }: Props) {
  const [review, setReview] = useState<AggregatorReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('application_aggregator_reviews')
        .select('id, status, notes, reviewed_at, aggregators(name)')
        .eq('application_id', applicationId)
        .maybeSingle();
      setReview(data as AggregatorReview | null);
      setLoading(false);
      if (data?.status === 'returned') setExpanded(true);
    }
    fetch();
  }, [applicationId]);

  if (loading || !review) return null;

  const cfg = STATUS_CONFIG[review.status];
  const Icon = cfg.icon;

  return (
    <div
      className={`
        rounded-xl border ${cfg.bg} ${cfg.border}
        transition-all duration-200 overflow-hidden mb-4
      `}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Animated dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {cfg.pulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-60`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`} />
        </span>

        <Icon className={`h-4 w-4 shrink-0 ${cfg.iconColor}`} />

        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {cfg.label}
          </span>
          {review.aggregators?.name && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              · {review.aggregators.name}
            </span>
          )}
        </div>

        <span
          className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}
        >
          {review.status.replace('_', ' ')}
        </span>

        {review.notes && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Notes panel */}
      {expanded && review.notes && (
        <div className="px-4 pb-3 pt-0">
          <div className="border-t border-current/10 pt-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              Reviewer Notes
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
              {review.notes}
            </p>
            {review.reviewed_at && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Reviewed {new Date(review.reviewed_at).toLocaleDateString('en-NZ', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
