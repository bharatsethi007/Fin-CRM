import { formatCategoryLabel } from './bankTransactionCategoryUi'
import {
  BankTransactionRow,
  effectiveCategory,
  isNeedsReviewRow,
} from './bankTransactionViewerModel'

export type FilterTab = 'all' | 'income' | 'expenses' | 'review'

type Props = {
  transactions: BankTransactionRow[]
  filterTab: FilterTab
  onFilterTab: (tab: FilterTab) => void
  needsReviewCount: number
  onEditRow: (row: BankTransactionRow) => void
}

/** Filter chips and scrollable list of bank transaction rows. */
export function BankTransactionListBlock({
  transactions,
  filterTab,
  onFilterTab,
  needsReviewCount,
  onEditRow,
}: Props) {
  const filtered = transactions.filter((t) => {
    if (filterTab === 'income') return t.direction === 'credit'
    if (filterTab === 'expenses') return t.direction === 'debit'
    if (filterTab === 'review') return isNeedsReviewRow(t)
    return true
  })

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['income', 'Income'],
            ['expenses', 'Expenses'],
            ['review', `Needs Review (${needsReviewCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterTab(key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filterTab === key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
        {filtered.map((t) => {
          const flagged = t.is_flagged
          const review = t.needs_review && !flagged
          const borderClass = flagged
            ? 'border-l-4 border-l-red-500'
            : review
              ? 'border-l-4 border-l-amber-400'
              : 'border-l-4 border-l-transparent'
          const eff = effectiveCategory(t)
          const amt = Number(t.amount)
          const amtLabel = Number.isFinite(amt)
            ? amt.toLocaleString('en-NZ', { maximumFractionDigits: 2 })
            : '—'

          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onEditRow(t)}
                className={`flex w-full flex-col gap-1 rounded-md border border-slate-100 bg-slate-50/50 px-3 py-2 text-left hover:bg-white ${borderClass}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">
                      {t.transaction_date ?? '—'}
                    </div>
                    <div className="truncate text-sm font-medium text-slate-900">
                      {t.description}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      t.direction === 'credit' ? 'text-emerald-700' : 'text-slate-800'
                    }`}
                  >
                    {t.direction === 'credit' ? '+' : '−'}${amtLabel}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.needs_review ? (
                    <span className="text-xs italic text-slate-500">Uncategorised</span>
                  ) : eff ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
                      {formatCategoryLabel(eff)}
                    </span>
                  ) : (
                    <span className="text-xs italic text-slate-500">Uncategorised</span>
                  )}
                  {t.is_flagged && t.flag_reason && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      {t.flag_reason}
                    </span>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
