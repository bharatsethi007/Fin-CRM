import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../src/lib/supabase'
import { logger } from '../../utils/logger'
import { BankTransactionCategoryModal } from '../common/BankTransactionCategoryModal'
import { SpendByCategoryPanel } from '../common/SpendByCategoryPanel'
import {
  BROKER_CATEGORY_VALUES,
  type BrokerCategoryValue,
} from './bankTransactionCategoryUi'
import { BankTransactionCoverageBanner } from './BankTransactionCoverageBanner'
import { BankTransactionListBlock, type FilterTab } from './BankTransactionListBlock'
import {
  type BankTransactionRow,
  type StatementCoverageData,
  isNeedsReviewRow,
  parseCoveragePayload,
} from './bankTransactionViewerModel'

export type { BankTransactionRow } from './bankTransactionViewerModel'

type Props = {
  applicationId: string
  firmId: string
  /** Increment after uploads so coverage and lines refetch. */
  reloadNonce?: number
}

/** Lists parsed bank lines with coverage banner, filters, categorisation, and spend summary. */
export function BankTransactionViewer({
  applicationId,
  firmId: _firmId,
  reloadNonce = 0,
}: Props) {
  void _firmId
  const [transactions, setTransactions] = useState<BankTransactionRow[]>([])
  const [coverage, setCoverage] = useState<StatementCoverageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [editing, setEditing] = useState<BankTransactionRow | null>(null)
  const [pickCategory, setPickCategory] = useState<BrokerCategoryValue>('other_expense')
  const [saving, setSaving] = useState(false)

  const loadCoverage = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_statement_coverage', {
      p_application_id: applicationId,
    })
    if (error) {
      logger.error('get_statement_coverage:', error)
      setCoverage(null)
      return
    }
    setCoverage(parseCoveragePayload(data))
  }, [applicationId])

  const loadTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select(
        'id, transaction_date, description, amount, direction, ai_category, broker_category, needs_review, review_reason, is_flagged, flag_reason, ignored',
      )
      .eq('application_id', applicationId)
      .order('transaction_date', { ascending: false })

    if (error) {
      logger.error('bank_transactions load:', error)
      setTransactions([])
      return
    }
    setTransactions((data ?? []) as BankTransactionRow[])
  }, [applicationId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await Promise.all([loadCoverage(), loadTransactions()])
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [applicationId, reloadNonce, loadCoverage, loadTransactions])

  const needsReviewCount = useMemo(
    () => transactions.filter(isNeedsReviewRow).length,
    [transactions],
  )

  /** Persists broker category and clears needs_review after user confirmation. */
  async function saveCategory() {
    if (!editing) return
    setSaving(true)
    const { error } = await supabase
      .from('bank_transactions')
      .update({
        broker_category: pickCategory,
        broker_overridden: true,
        needs_review: false,
      })
      .eq('id', editing.id)

    if (error) {
      logger.error('bank_transactions update:', error)
    } else {
      setTransactions((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? {
                ...r,
                broker_category: pickCategory,
                needs_review: false,
              }
            : r,
        ),
      )
      setEditing(null)
    }
    setSaving(false)
  }

  /** Opens the category modal with the row’s current or default category selected. */
  function openEditor(row: BankTransactionRow) {
    const current = (row.broker_category ?? row.ai_category ?? 'other_expense') as string
    const valid = BROKER_CATEGORY_VALUES.find((c) => c === current)
    setPickCategory(valid ?? 'other_expense')
    setEditing(row)
  }

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
        Bank transactions
      </h3>

      {loading ? (
        <p className="text-sm text-slate-500">Loading transactions…</p>
      ) : (
        <>
          {coverage && <BankTransactionCoverageBanner coverage={coverage} />}

          {transactions.length === 0 ? (
            <p className="text-sm text-slate-500">
              No parsed line items yet. Upload a bank statement via Magic Drop.
            </p>
          ) : (
            <>
              <BankTransactionListBlock
                transactions={transactions}
                filterTab={filterTab}
                onFilterTab={setFilterTab}
                needsReviewCount={needsReviewCount}
                onEditRow={openEditor}
              />
              <SpendByCategoryPanel transactions={transactions} />
            </>
          )}
        </>
      )}

      {editing && (
        <BankTransactionCategoryModal
          description={editing.description}
          pickCategory={pickCategory}
          onPickCategory={setPickCategory}
          saving={saving}
          onDismiss={() => !saving && setEditing(null)}
          onSave={saveCategory}
        />
      )}
    </div>
  )
}
