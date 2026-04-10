import { useMemo, useState } from 'react'
import {
  categoryDotClass,
  formatCategoryLabel,
} from '../applications/bankTransactionCategoryUi'

export type SpendPanelTransaction = {
  amount: number | string | null
  ai_category: string | null
  broker_category: string | null
  ignored: boolean
}

type Props = {
  transactions: SpendPanelTransaction[]
}

/** Aggregates non-ignored transactions by effective category for the spend summary. */
function aggregateSpendByCategory(
  transactions: SpendPanelTransaction[],
): { category: string; total: number }[] {
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.ignored) continue
    const raw = (t.broker_category ?? t.ai_category ?? 'uncategorised').trim()
    const cat = raw || 'uncategorised'
    const n = Number(t.amount)
    const amt = Number.isFinite(n) ? n : 0
    map.set(cat, (map.get(cat) ?? 0) + amt)
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

/** Collapsible spend breakdown by category, driven by in-memory transaction rows. */
export function SpendByCategoryPanel({ transactions }: Props) {
  const [open, setOpen] = useState(false)
  const rows = useMemo(() => aggregateSpendByCategory(transactions), [transactions])
  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + r.total, 0),
    [rows],
  )

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
      >
        <span>Spend by Category</span>
        <span className="text-slate-400">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-2">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">No categorised spend yet.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map(({ category, total }) => (
                <li
                  key={category}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-slate-700">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryDotClass(category)}`}
                      aria-hidden
                    />
                    <span className="truncate">{formatCategoryLabel(category)}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-slate-900">
                    $
                    {total.toLocaleString('en-NZ', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-bold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">
                  $
                  {grandTotal.toLocaleString('en-NZ', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
