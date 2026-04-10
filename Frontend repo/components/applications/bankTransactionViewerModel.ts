/** RPC payload shape for the 3-month statement coverage banner. */
export type StatementCoverageData = {
  is_complete: boolean
  months_uploaded: number
  missing_month_labels: string[]
  required_months: number
}

export type BankTransactionRow = {
  id: string
  transaction_date: string | null
  description: string
  amount: number
  direction: string
  ai_category: string | null
  broker_category: string | null
  needs_review: boolean
  review_reason: string | null
  is_flagged: boolean
  flag_reason: string | null
  ignored: boolean
}

/** Coerces RPC/JSONB array fields to string arrays for the banner. */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((x): x is string => typeof x === 'string')
}

/** Parses `get_statement_coverage` jsonb into a typed object. */
export function parseCoveragePayload(raw: unknown): StatementCoverageData | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    is_complete: o.is_complete === true,
    months_uploaded: Number(o.months_uploaded) || 0,
    missing_month_labels: asStringArray(o.missing_month_labels),
    required_months: Number(o.required_months) || 3,
  }
}

/** Whether the row belongs in the Needs Review tab. */
export function isNeedsReviewRow(t: BankTransactionRow): boolean {
  return t.needs_review || t.is_flagged || t.ai_category == null
}

/** Effective category after broker override. */
export function effectiveCategory(t: BankTransactionRow): string | null {
  return t.broker_category ?? t.ai_category
}
