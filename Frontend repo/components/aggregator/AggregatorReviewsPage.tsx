import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Clock,
  Search,
  SlidersHorizontal,
  ChevronDown,
  User,
  Building2,
  CalendarDays,
  AlertCircle,
  CheckCheck,
  RotateCcw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'returned' | 'escalated';

interface ReviewRow {
  id: string;
  status: ReviewStatus;
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  applications: {
    id: string;
    reference_number: string | null;
    loan_purpose: string | null;
    loan_amount: number | null;
    firms: { name: string } | null;
  } | null;
  reviewer: { first_name: string; last_name: string } | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_META: Record<ReviewStatus, { label: string; color: string; badge: string; icon: React.ElementType }> = {
  pending:    { label: 'Pending',    color: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',   icon: Clock },
  in_review:  { label: 'In Review',  color: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',       icon: ShieldCheck },
  approved:   { label: 'Approved',   color: 'text-emerald-600',badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: CheckCircle2 },
  returned:   { label: 'Returned',   color: 'text-red-600',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',           icon: XCircle },
  escalated:  { label: 'Escalated',  color: 'text-purple-600', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: ArrowUpRight },
};

const FILTER_TABS: { key: ReviewStatus | 'all'; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'pending',   label: 'Pending' },
  { key: 'in_review', label: 'In Review' },
  { key: 'returned',  label: 'Returned' },
  { key: 'approved',  label: 'Approved' },
];

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  review,
  onClose,
  onSubmit,
}: {
  review: ReviewRow;
  onClose: () => void;
  onSubmit: (id: string, status: ReviewStatus, notes: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<ReviewStatus>(review.status === 'pending' ? 'in_review' : review.status);
  const [notes, setNotes] = useState(review.notes ?? '');
  const [saving, setSaving] = useState(false);

  const app = review.applications;
  const ref = app?.reference_number ?? app?.id?.slice(0, 8).toUpperCase() ?? '—';

  async function handleSubmit() {
    setSaving(true);
    await onSubmit(review.id, status, notes);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">Application Review</p>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{ref}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {app?.firms?.name ?? '—'} · {app?.loan_purpose ?? 'Home Loan'}
                {app?.loan_amount ? ` · $${(app.loan_amount / 1000).toFixed(0)}k` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors mt-0.5"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Status selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Decision
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['in_review', 'approved', 'returned', 'escalated'] as ReviewStatus[]).map((s) => {
                const meta = STATUS_META[s];
                const Icon = meta.icon;
                const active = status === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`
                      flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                      ${active
                        ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                      }
                    `}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Notes {status === 'returned' && <span className="text-red-500 normal-case font-normal">(required for returns)</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder={
                status === 'returned'
                  ? 'Explain what needs to be corrected before resubmission...'
                  : 'Optional notes for the broker...'
              }
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white/30 resize-none transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || (status === 'returned' && !notes.trim())}
            className="px-5 py-2 text-sm font-semibold rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {saving ? 'Saving…' : 'Submit Decision'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ reviews }: { reviews: ReviewRow[] }) {
  const counts = reviews.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  const stats = [
    { label: 'Pending',  value: counts.pending ?? 0,   icon: Clock,        color: 'text-amber-500' },
    { label: 'In Review',value: counts.in_review ?? 0, icon: ShieldCheck,  color: 'text-blue-500' },
    { label: 'Approved', value: counts.approved ?? 0,  icon: CheckCheck,   color: 'text-emerald-500' },
    { label: 'Returned', value: counts.returned ?? 0,  icon: RotateCcw,    color: 'text-red-500' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3.5 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AggregatorReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReviewRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('application_aggregator_reviews')
      .select(`
        id, status, notes, submitted_at, reviewed_at,
        applications(id, reference_number, loan_purpose, loan_amount, firms(name)),
        reviewer:reviewer_id(first_name, last_name)
      `)
      .order('submitted_at', { ascending: false });
    setReviews((data as ReviewRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(id: string, status: ReviewStatus, notes: string) {
    await supabase
      .from('application_aggregator_reviews')
      .update({ status, notes, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    await load();
  }

  const filtered = reviews.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const ref = r.applications?.reference_number ?? r.applications?.id ?? '';
      const firm = r.applications?.firms?.name ?? '';
      if (!ref.toLowerCase().includes(q) && !firm.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = reviews.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <ShieldCheck className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Broker Reviews</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Review and approve applications from member broker firms before lender submission.
          </p>
        </div>

        {/* Stats */}
        {!loading && <StatsBar reviews={reviews} />}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-1 flex-wrap">
            {FILTER_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${filter === key
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }
                `}
              >
                {label}
                {key !== 'all' && counts[key] ? (
                  <span className={`ml-1.5 text-xs ${filter === key ? 'opacity-70' : 'opacity-50'}`}>
                    {counts[key]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference or firm…"
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white/20 transition"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-white animate-spin" />
                <p className="text-sm text-gray-400">Loading reviews…</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800">
                <AlertCircle className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No reviews found</p>
              <p className="text-xs text-gray-400">Try changing the filter or search term</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Application', 'Firm', 'Loan', 'Submitted', 'Status', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status];
                  const StatusIcon = meta.icon;
                  const app = r.applications;
                  const ref = app?.reference_number ?? app?.id?.slice(0, 8).toUpperCase() ?? '—';

                  return (
                    <tr
                      key={r.id}
                      className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                      onClick={() => setSelected(r)}
                    >
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white font-mono">
                          {ref}
                        </span>
                        {app?.loan_purpose && (
                          <p className="text-xs text-gray-400 mt-0.5">{app.loan_purpose}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <Building2 className="h-3.5 w-3.5 text-gray-400" />
                          </div>
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {app?.firms?.name ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {app?.loan_amount
                            ? `$${(app.loan_amount / 1000).toFixed(0)}k`
                            : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-gray-400">
                          {new Date(r.submitted_at).toLocaleDateString('en-NZ', {
                            day: 'numeric', month: 'short',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.badge}`}>
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-1.5 rounded-lg"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Row count */}
        {!loading && filtered.length > 0 && (
          <p className="text-xs text-gray-400 mt-3 text-right">
            {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
          </p>
        )}
      </div>

      {/* Review modal */}
      {selected && (
        <ReviewModal
          review={selected}
          onClose={() => setSelected(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
