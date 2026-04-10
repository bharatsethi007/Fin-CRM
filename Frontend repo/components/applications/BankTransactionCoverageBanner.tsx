import type { StatementCoverageData } from './bankTransactionViewerModel'

type Props = {
  coverage: StatementCoverageData
}

/** Green or amber banner for 3-month bank statement coverage from `get_statement_coverage`. */
export function BankTransactionCoverageBanner({ coverage }: Props) {
  const required = coverage.required_months
  const uploaded = coverage.months_uploaded
  const missingJoined =
    coverage.missing_month_labels.length > 0
      ? coverage.missing_month_labels.join(', ')
      : ''

  if (coverage.is_complete) {
    return (
      <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        ✓ 3 months of statements uploaded
      </div>
    )
  }

  return (
    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      ⚠️ 3 months of statements required — {uploaded} of {required} months uploaded.
      {missingJoined ? ` Missing: ${missingJoined}` : ''}
    </div>
  )
}
