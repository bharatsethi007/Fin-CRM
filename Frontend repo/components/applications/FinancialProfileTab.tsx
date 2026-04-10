import { useState, useEffect, useCallback, type DragEvent, type ChangeEvent, type CSSProperties } from 'react'
import { supabase } from '../../src/lib/supabase'
import { invokeParseBankStatement } from '../../src/lib/api'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { BankStatementParser, parseAnomaliesFromExtracted } from './BankStatementParser'
import { BankTransactionViewer } from './BankTransactionViewer'
import { logger } from '../../utils/logger'

interface Props {
  applicationId: string
  firmId: string
}

/** Sum line items for display when total_monthly is null or stale (PostgREST may return numeric as string). */
function getMonthlyExpensesFromState(expenses: Record<string, unknown> | null): number {
  if (!expenses) return 0
  const raw = expenses.total_monthly
  if (raw != null && raw !== '') {
    const n = Number(raw)
    if (!Number.isNaN(n)) return n
  }
  const lineKeys = [
    'food_groceries', 'dining_takeaway', 'alcohol_tobacco', 'entertainment', 'clothing_personal',
    'phone_internet', 'streaming_subscriptions', 'health_insurance', 'medical_dental', 'gym_sports',
    'vehicle_running_costs', 'public_transport', 'utilities', 'rent_board', 'rates', 'home_insurance',
    'body_corporate', 'childcare', 'school_fees_public', 'life_insurance', 'income_protection',
    'other_discretionary',
  ]
  return lineKeys.reduce((s, k) => s + Number((expenses as any)[k] ?? 0), 0)
}

const summaryCardStyle: CSSProperties = {
  borderRadius: 12,
  padding: '14px 18px',
  minHeight: 108,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
}

/** Magic Drop chip → `documents.detected_type` (omit when user selects nothing; Edge Function auto-detects). */
const MAGIC_DROP_DOCUMENT_TAGS: { label: string; value: string }[] = [
  { label: 'Payslip', value: 'payslip' },
  { label: 'Bank Statement', value: 'bank_statement' },
  { label: 'Tax Return', value: 'tax_return' },
  { label: 'IR3', value: 'ir3' },
]

/** Expense line keys aligned with BankStatementParser ParsedExpenses */
type ParsedExpenseKey =
  | 'food_groceries'
  | 'dining_takeaway'
  | 'alcohol_tobacco'
  | 'entertainment'
  | 'streaming_subscriptions'
  | 'clothing_personal'
  | 'phone_internet'
  | 'utilities'
  | 'vehicle_running_costs'
  | 'public_transport'
  | 'health_insurance'
  | 'medical_dental'
  | 'gym_sports'
  | 'rent_board'
  | 'other_discretionary'

const PARSED_EXPENSE_KEYS: ParsedExpenseKey[] = [
  'food_groceries',
  'dining_takeaway',
  'alcohol_tobacco',
  'entertainment',
  'streaming_subscriptions',
  'clothing_personal',
  'phone_internet',
  'utilities',
  'vehicle_running_costs',
  'public_transport',
  'health_insurance',
  'medical_dental',
  'gym_sports',
  'rent_board',
  'other_discretionary',
]

function emptyExpenseBuckets(): Record<ParsedExpenseKey, number> {
  return {
    food_groceries: 0,
    dining_takeaway: 0,
    alcohol_tobacco: 0,
    entertainment: 0,
    streaming_subscriptions: 0,
    clothing_personal: 0,
    phone_internet: 0,
    utilities: 0,
    vehicle_running_costs: 0,
    public_transport: 0,
    health_insurance: 0,
    medical_dental: 0,
    gym_sports: 0,
    rent_board: 0,
    other_discretionary: 0,
  }
}

function num(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Match BankStatementParser monthlyFromDebitAmount */
function debitToMonthly(amount: number, frequency: string): number {
  const f = (frequency || 'monthly').toLowerCase()
  const a = Number(amount) || 0
  if (f.includes('fortnight')) return (a * 26) / 12
  if (f.includes('week')) return (a * 52) / 12
  if (f.includes('year') || f.includes('annual')) return a / 12
  return a
}

/** First match wins; order matches product spec for bank-statement debit lines. */
const EXPENSE_RULES: Array<{ key: ParsedExpenseKey; patterns: RegExp[] }> = [
  { key: 'rent_board', patterns: [/rent|mortgage|landlord|accommodation/i] },
  { key: 'utilities', patterns: [/power|electric|\bgas\b|water/i] },
  { key: 'phone_internet', patterns: [/vodafone|spark|2degrees|internet|broadband/i] },
  { key: 'food_groceries', patterns: [/countdown|pak\s*nsave|paknsave|new\s*world|supermarket|grocery/i] },
  { key: 'dining_takeaway', patterns: [/uber\s*eats|menulog|restaurant|mcdonald|kfc|cafe/i] },
  { key: 'streaming_subscriptions', patterns: [/netflix|spotify|disney|youtube|subscription/i] },
  { key: 'vehicle_running_costs', patterns: [/\bbp\b|z\s*energy|mobil|petrol|fuel|parking/i] },
  { key: 'health_insurance', patterns: [/southern\s*cross|\bnib\b|health\s*insurance/i] },
  { key: 'medical_dental', patterns: [/pharmacy|doctor|dental|medical/i] },
  { key: 'gym_sports', patterns: [/\bgym\b|les\s*mills|\bsports?\b/i] },
]

function categorizeDebitDescription(description: string): ParsedExpenseKey {
  const d = description.trim().toLowerCase()
  if (!d) return 'other_discretionary'
  for (const { key, patterns } of EXPENSE_RULES) {
    if (patterns.some((p) => p.test(d))) return key
  }
  return 'other_discretionary'
}

function rowDescription(row: Record<string, unknown>): string {
  const v =
    row.description ??
    row.Description ??
    row.memo ??
    row.narration ??
    row.merchant ??
    row.payee ??
    ''
  return String(v)
}

function rowFrequency(row: Record<string, unknown>): string {
  const v = row.frequency ?? row.Frequency ?? 'monthly'
  return String(v)
}

function rowAmount(row: Record<string, unknown>): number {
  return num(row.amount ?? row.Amount ?? row.value ?? row.debit)
}

function asRecordArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter((x) => x != null && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[]
}

/** Merge camelCase / alternate Edge Function keys */
function widenBankExtracted(raw: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = { ...raw }
  const pick = (snake: string, camel: string): void => {
    if (o[snake] == null && o[camel] != null) o[snake] = o[camel]
  }
  pick('regular_income_credits', 'regularIncomeCredits')
  pick('regular_expense_debits', 'regularExpenseDebits')
  pick('monthly_expenses_by_category', 'monthlyExpensesByCategory')
  pick('categorised_monthly_expenses', 'categorisedMonthlyExpenses')
  if (o.categorised_monthly_expenses == null && o.categorized_monthly_expenses != null) {
    o.categorised_monthly_expenses = o.categorized_monthly_expenses
  }
  pick('statement_period_start', 'statementPeriodStart')
  pick('statement_period_end', 'statementPeriodEnd')
  pick('account_holder_name', 'accountHolderName')
  pick('average_monthly_credits', 'averageMonthlyCredits')
  pick('total_credits', 'totalCredits')
  pick('total_debits', 'totalDebits')
  pick('opening_balance', 'openingBalance')
  pick('closing_balance', 'closingBalance')
  return o
}

/**
 * Maps parse-bank-statement `extracted_data` into the shape BankStatementParser expects
 * (arrays + expenses object + metadata) so the review modal shows non-zero drafts.
 */
function normalizeBankStatementExtractedData(rawIn: Record<string, unknown>): Record<string, unknown> {
  const raw = widenBankExtracted(rawIn)

  const incomeCredits = asRecordArray(raw.regular_income_credits)
  const incomeRows: Array<Record<string, unknown>> = incomeCredits.map((row) => ({
    description: rowDescription(row) || 'Income credit',
    amount: rowAmount(row),
    frequency: rowFrequency(row),
    income_type: 'salary_wages',
    confidence: 'medium',
  }))

  if (incomeRows.length === 0) {
    const avg = num(raw.average_monthly_credits)
    const totalCr = num(raw.total_credits)
    const fallbackAmt = avg > 0 ? avg : totalCr > 0 ? totalCr : 0
    if (fallbackAmt > 0) {
      incomeRows.push({
        description: avg > 0 ? 'Average monthly credits (statement)' : 'Total credits (statement period)',
        amount: fallbackAmt,
        frequency: 'monthly',
        income_type: 'salary_wages',
        confidence: 'medium',
      })
    }
  }

  const buckets = emptyExpenseBuckets()
  const catExpRaw = raw.categorised_monthly_expenses
  const hasCategorised =
    catExpRaw != null &&
    typeof catExpRaw === 'object' &&
    !Array.isArray(catExpRaw) &&
    Object.keys(catExpRaw as object).length > 0

  const mecRaw = raw.monthly_expenses_by_category
  const hasAiCategories =
    mecRaw != null &&
    typeof mecRaw === 'object' &&
    !Array.isArray(mecRaw) &&
    Object.keys(mecRaw as object).length > 0

  if (hasCategorised) {
    const mec = catExpRaw as Record<string, unknown>
    for (const k of PARSED_EXPENSE_KEYS) {
      buckets[k] = num(mec[k])
    }
  } else if (hasAiCategories) {
    const mec = mecRaw as Record<string, unknown>
    for (const k of PARSED_EXPENSE_KEYS) {
      buckets[k] = num(mec[k])
    }
  } else {
    const debitRows = asRecordArray(raw.regular_expense_debits)
    if (debitRows.length > 0) {
      for (const row of debitRows) {
        const desc = rowDescription(row)
        const m = debitToMonthly(rowAmount(row), rowFrequency(row))
        const key = categorizeDebitDescription(desc)
        buckets[key] += m
      }
    } else {
      const td = num(raw.total_debits)
      if (td > 0) buckets.other_discretionary += td
    }
  }

  const flagSrc = raw.flags ?? raw.red_flags
  const rawFlags = Array.isArray(flagSrc) ? (flagSrc as unknown[]).map((x) => String(x)) : []
  const anomaliesParsed = parseAnomaliesFromExtracted(raw)

  const periodStart = raw.statement_period_start
  const periodEnd = raw.statement_period_end
  let statement_period = ''
  if (raw.statement_period != null && String(raw.statement_period).trim()) {
    statement_period = String(raw.statement_period)
  } else if (periodStart != null || periodEnd != null) {
    statement_period = [periodStart, periodEnd]
      .filter((x) => x != null && String(x).trim())
      .join(' → ')
  } else {
    statement_period = '—'
  }

  const totalExpMonthly = Object.values(buckets).reduce((s, v) => s + v, 0)
  const totalIncMonthly = incomeRows.reduce((s, row) => {
    const amt = num(row.amount)
    const f = String(row.frequency ?? 'monthly').toLowerCase()
    const monthly =
      f.includes('fortnight') ? (amt * 26) / 12
      : f.includes('week') ? (amt * 52) / 12
      : f.includes('year') || f.includes('annual') ? amt / 12
      : amt
    return s + monthly
  }, 0)

  const bankName = String(raw.bank_name ?? raw.bankName ?? '')
  const accountHolder = String(raw.account_holder ?? raw.account_holder_name ?? raw.accountHolderName ?? '')

  return {
    ...raw,
    bank_name: bankName,
    account_holder: accountHolder,
    account_holder_name: accountHolder,
    statement_period,
    regular_income_credits: incomeRows,
    income: [],
    expenses: buckets,
    regular_expense_debits: [],
    flags: rawFlags,
    red_flags: [],
    anomalies: anomaliesParsed,
    total_income_monthly: totalIncMonthly,
    total_expenses_monthly: totalExpMonthly,
    total_debits: num(raw.total_debits),
    total_credits: num(raw.total_credits),
    average_monthly_credits: num(raw.average_monthly_credits),
    opening_balance: num(raw.opening_balance),
    closing_balance: num(raw.closing_balance),
  }
}

function pickExtractedFromParseResponse(parseData: Record<string, unknown>): Record<string, unknown> {
  const ed = parseData.extracted_data
  const ex = parseData.extracted
  if (ed && typeof ed === 'object' && !Array.isArray(ed)) return ed as Record<string, unknown>
  if (ex && typeof ex === 'object' && !Array.isArray(ex)) return ex as Record<string, unknown>
  return {}
}

type StatementApplicantRow = {
  id: string
  first_name: string | null
  /** DB column is `surname` (not last_name). */
  surname: string | null
  applicant_type: string | null
}

function formatStatementApplicantName(a: StatementApplicantRow): string {
  const fn = (a.first_name || '').trim()
  const ln = (a.surname || '').trim()
  const name = `${fn} ${ln}`.trim()
  return name || 'Applicant'
}

function applicantRoleLabel(t: string | null | undefined): string {
  const x = (t || 'primary').toLowerCase()
  if (x === 'primary') return 'Primary'
  if (x === 'joint') return 'Joint'
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : 'Primary'
}

function defaultSelectedApplicantIds(rows: StatementApplicantRow[]): string[] {
  if (rows.length === 0) return []
  if (rows.length === 1) return [rows[0].id]
  const primary = rows.find((r) => (r.applicant_type || '').toLowerCase() === 'primary')
  if (primary) return [primary.id]
  return [rows[0].id]
}

export default function FinancialProfileTab({ applicationId, firmId }: Props) {
  const [applicantIds, setApplicantIds] = useState<string[]>([])
  const [incomes, setIncomes] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [parseResult, setParseResult] = useState<string | null>(null)
  const [parseJobProgress, setParseJobProgress] = useState<{ pct: number; step: string } | null>(null)
  const [parsing, setParsing] = useState(false)
  /** Selected document type for the next Magic Drop upload; null = let Edge Function infer. */
  const [magicDropDetectedType, setMagicDropDetectedType] = useState<string | null>(null)
  const [bankStatementReview, setBankStatementReview] = useState<{
    document: {
      id: string
      name: string
      url: string
      file_type: string
      category: string
      application_id: string
      firm_id: string
    }
    parseResponse: Record<string, unknown>
  } | null>(null)
  const [statementReviewApplicants, setStatementReviewApplicants] = useState<StatementApplicantRow[]>([])
  const [statementReviewSelectedIds, setStatementReviewSelectedIds] = useState<string[]>([])
  const [statementApplicantsLoading, setStatementApplicantsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'income' | 'expenses'>('overview')

  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showExpensesModal, setShowExpensesModal] = useState(false)
  const [newIncome, setNewIncome] = useState({
    income_type: 'salary',
    gross_salary: 0,
    salary_frequency: 'monthly',
  })
  const [newExp, setNewExp] = useState({
    food_groceries: 0,
    rent_board: 0,
    vehicle_running_costs: 0,
    utilities: 0,
    health_insurance: 0,
    life_insurance: 0,
    childcare: 0,
    other_discretionary: 0,
  })
  /** Bumps when bank docs are parsed so `BankTransactionViewer` refetches coverage and lines. */
  const [bankViewerReloadNonce, setBankViewerReloadNonce] = useState(0)

  // ── Data loading ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const { data: applicants } = await supabase
        .from('applicants')
        .select('id')
        .eq('application_id', applicationId)

      const ids = (applicants || []).map((a: any) => a.id)
      setApplicantIds(ids)

      if (ids.length > 0) {
        const { data: incomeData } = await supabase
          .from('income')
          .select('*')
          .in('applicant_id', ids)
          .order('created_at', { ascending: false })
        setIncomes(incomeData || [])
      } else {
        setIncomes([])
      }

      const { data: expenseData, error: expenseErr } = await supabase
        .from('expenses')
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (expenseErr) logger.error('FinancialProfileTab expenses query:', expenseErr.message)
      setExpenses(expenseData ?? null)
    } catch (err: any) {
      logger.error('FinancialProfileTab loadAll error:', err.message)
    } finally {
      setLoading(false)
    }
  }, [applicationId])

  // useAutoRefresh(loadAll, 20)

  useEffect(() => {
    if (applicationId) void loadAll()
  }, [applicationId, loadAll])

  useEffect(() => {
    if (!bankStatementReview) {
      setStatementReviewApplicants([])
      setStatementReviewSelectedIds([])
      return
    }
    let cancelled = false
    setStatementApplicantsLoading(true)
    void (async () => {
      const { data, error } = await supabase
        .from('applicants')
        .select('id, first_name, surname, applicant_type')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) {
        logger.error('FinancialProfileTab statement review applicants:', error.message)
        setStatementReviewApplicants([])
        setStatementReviewSelectedIds([])
      } else {
        const rows = (data || []) as StatementApplicantRow[]
        setStatementReviewApplicants(rows)
        setStatementReviewSelectedIds(defaultSelectedApplicantIds(rows))
      }
      setStatementApplicantsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [bankStatementReview, applicationId])

  const totalAnnualIncome = incomes.reduce(
    (sum, i) => sum + (Number(i.annual_gross_total) || 0), 0
  )
  const monthlyIncome = totalAnnualIncome / 12
  const monthlyExpenses = getMonthlyExpensesFromState(expenses)
  const monthlySurplus = monthlyIncome - monthlyExpenses
  const hemBenchmark = 3200

  async function handleSaveIncome() {
    if (!applicantIds[0]) {
      window.alert('Add at least one applicant to this application before recording income.')
      return
    }
    const freq = newIncome.salary_frequency
    const gross = Number(newIncome.gross_salary) || 0
    const annual =
      freq === 'weekly' ? gross * 52
        : freq === 'fortnightly' ? gross * 26
          : freq === 'monthly' ? gross * 12
            : gross

    const { error } = await supabase.from('income').insert({
      applicant_id: applicantIds[0],
      income_type: newIncome.income_type,
      gross_salary: gross,
      salary_frequency: freq,
      annual_gross_total: annual,
      verified: false,
    })

    if (error) {
      logger.error(error)
      window.alert(error.message)
      return
    }
    setShowIncomeModal(false)
    setNewIncome({ income_type: 'salary', gross_salary: 0, salary_frequency: 'monthly' })
    await loadAll()
  }

  async function handleSaveExpenses() {
    const total = Object.values(newExp).reduce((s, v) => s + Number(v || 0), 0)

    // First check if a record already exists
    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .eq('application_id', applicationId)
      .maybeSingle()

    let error
    if (existing?.id) {
      // Update existing
      const result = await supabase
        .from('expenses')
        .update({
          food_groceries: Number(newExp.food_groceries || 0),
          rent_board: Number(newExp.rent_board || 0),
          vehicle_running_costs: Number(newExp.vehicle_running_costs || 0),
          utilities: Number(newExp.utilities || 0),
          health_insurance: Number(newExp.health_insurance || 0),
          life_insurance: Number(newExp.life_insurance || 0),
          childcare: Number(newExp.childcare || 0),
          other_discretionary: Number(newExp.other_discretionary || 0),
          total_monthly: total,
        })
        .eq('id', existing.id)
      error = result.error
    } else {
      // Insert new
      const result = await supabase
        .from('expenses')
        .insert({
          application_id: applicationId,
          food_groceries: Number(newExp.food_groceries || 0),
          rent_board: Number(newExp.rent_board || 0),
          vehicle_running_costs: Number(newExp.vehicle_running_costs || 0),
          utilities: Number(newExp.utilities || 0),
          health_insurance: Number(newExp.health_insurance || 0),
          life_insurance: Number(newExp.life_insurance || 0),
          childcare: Number(newExp.childcare || 0),
          other_discretionary: Number(newExp.other_discretionary || 0),
          total_monthly: total,
          expense_frequency: 'monthly',
        })
      error = result.error
    }

    if (!error) {
      setShowExpensesModal(false)
      await loadAll()  // reload to show updated figures
    } else {
      logger.error('Save expenses failed:', error.message)
      alert('Save failed: ' + error.message)
    }
  }

  function openExpensesModal() {
    if (expenses) {
      setNewExp({
        food_groceries: Number(expenses.food_groceries) || 0,
        rent_board: Number(expenses.rent_board) || 0,
        vehicle_running_costs: Number(expenses.vehicle_running_costs) || 0,
        utilities: Number(expenses.utilities) || 0,
        health_insurance: Number(expenses.health_insurance) || 0,
        life_insurance: Number(expenses.life_insurance) || 0,
        childcare: Number(expenses.childcare) || 0,
        other_discretionary: Number(expenses.other_discretionary) || 0,
      })
    } else {
      setNewExp({
        food_groceries: 0,
        rent_board: 0,
        vehicle_running_costs: 0,
        utilities: 0,
        health_insurance: 0,
        life_insurance: 0,
        childcare: 0,
        other_discretionary: 0,
      })
    }
    setShowExpensesModal(true)
  }

  async function processFiles(files: File[]) {
    if (!files.length) return
    setParsing(true)
    setParseResult('Uploading...')

    for (const file of files) {
      setParseJobProgress(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${firmId}/${applicationId}/financial/${Date.now()}_${safeName}`

        const { error: uploadErr } = await supabase.storage
          .from('documents').upload(path, file, { upsert: true })
        if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

        const { data: { publicUrl } } = supabase.storage
          .from('documents').getPublicUrl(path)

        const docPayload: Record<string, unknown> = {
          application_id: applicationId,
          firm_id: firmId,
          name: file.name,
          url: publicUrl,
          file_type: file.type,
          file_size_bytes: file.size,
          category: '02 Financial Evidence',
          kyc_section: 'BANK_STATEMENTS_3M',
          uploaded_by: user?.id,
          status: 'active',
        }
        if (magicDropDetectedType != null && magicDropDetectedType !== '') {
          docPayload.detected_type = magicDropDetectedType
        }

        const { data: doc, error: insertErr } = await supabase
          .from('documents')
          .insert(docPayload)
          .select('id, name, url, file_type, category, application_id, firm_id')
          .single()

        if (insertErr || !doc) throw new Error('Save failed: ' + insertErr?.message)

        const { data: firstApplicant } = await supabase
          .from('applicants')
          .select('id')
          .eq('application_id', applicationId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (!firstApplicant?.id) {
          setParseResult('Document uploaded. Add an applicant to this application to review and save parsed income/expenses.')
          continue
        }

        setParseResult('Parsing with AI…')

        const { data: parseData, error: parseFnError } = await invokeParseBankStatement(
          {
            document_id: doc.id,
            application_id: applicationId,
            firm_id: firmId,
            applicant_id: firstApplicant.id,
          },
          {
            onProgress: (row) => {
              const pct = Math.min(100, Math.max(0, Number(row.progress_pct) || 0))
              const step = row.current_step || row.status || 'Processing'
              setParseJobProgress({ pct, step })
            },
          },
        )

        setParseJobProgress(null)

        if (parseFnError) {
          setParseResult(`Upload saved — parse failed: ${parseFnError}`)
          logger.error('parse-bank-statement:', parseFnError)
          continue
        }

        if (parseData && 'success' in parseData && parseData.success) {
          const pd = parseData as Record<string, unknown>
          const rawExtracted = pickExtractedFromParseResponse(pd)
          const normalizedExtracted = normalizeBankStatementExtractedData(rawExtracted)
          setBankStatementReview({
            document: doc,
            parseResponse: {
              ...pd,
              success: true,
              extracted_data: normalizedExtracted,
            },
          })
          setParseResult('Review the draft below, then approve or discard.')
        } else {
          setParseResult(`Uploaded — ${String((parseData as { error?: string })?.error ?? 'parse issue, check console')}`)
          logger.error('Parse result:', parseData)
        }
      } catch (err: any) {
        setParseJobProgress(null)
        setParseResult('Error: ' + err.message)
      }
    }

    setParsing(false)
    await loadAll()
    setBankViewerReloadNonce((n) => n + 1)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
      processFiles(files)
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
      processFiles(files)
  }

  const modalBackdrop: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    fontSize: 14,
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6366f1' }}>
        Loading financial data...
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>

        <div style={{ ...summaryCardStyle, background: '#f0fdf4' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Total Annual Income
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>
            ${totalAnnualIncome.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            ${monthlyIncome.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth
          </div>
        </div>

        <div style={{ ...summaryCardStyle, background: '#fffbeb' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Monthly Expenses
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>
            ${monthlyExpenses.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {expenses
              ? (monthlyExpenses < hemBenchmark ? '⚠ Below HEM' : 'Above HEM benchmark')
              : '—'}
          </div>
        </div>

        <div style={{ ...summaryCardStyle, background: monthlySurplus >= 0 ? '#f0fdf4' : '#fef2f2' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: monthlySurplus >= 0 ? '#16a34a' : '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Est. Monthly Surplus
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: monthlySurplus >= 0 ? '#16a34a' : '#dc2626' }}>
            ${monthlySurplus.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {monthlySurplus < 0 ? 'Negative — review required' : 'Positive surplus'}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Add Financial Data
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

          <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🏦</div>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>Fetch Bank Data</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>One-click consent — pulls 90 days of verified transactions</div>
            <button type="button" style={{ width: '100%', padding: '10px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              🔗 Connect via Akahu
            </button>
          </div>

          <div
            style={{ background: 'white', borderRadius: 12, padding: 16, border: '2px dashed #c7d2fe', cursor: 'pointer' }}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault() }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>✨</div>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>Magic Drop</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Drop PDFs, CSVs, bank statements, tax returns — AI extracts income & expenses</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', width: '100%', marginBottom: 2 }}>Document type (optional)</span>
              {MAGIC_DROP_DOCUMENT_TAGS.map(({ label, value }) => {
                const selected = magicDropDetectedType === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMagicDropDetectedType((prev) => (prev === value ? null : value))
                    }}
                    style={{
                      fontSize: 11,
                      background: selected ? '#e0e7ff' : '#eef2ff',
                      color: '#6366f1',
                      borderRadius: 20,
                      padding: '2px 10px',
                      border: selected ? '2px solid #6366f1' : '2px solid transparent',
                      cursor: 'pointer',
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <label style={{ display: 'block', width: '100%', textAlign: 'center', cursor: 'pointer' }}>
              <input
                type="file"
                style={{ display: 'none' }}
                accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv"
                multiple
                onChange={handleFileInput}
              />
              <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>
                {parsing ? 'Processing...' : 'Click to browse or drag files here'}
              </span>
            </label>
            {parseJobProgress && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{parseJobProgress.step}</div>
                <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${parseJobProgress.pct}%`,
                      background: '#6366f1',
                      borderRadius: 3,
                      transition: 'width 0.25s ease',
                    }}
                  />
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{parseJobProgress.pct}%</div>
              </div>
            )}
            {parseResult && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#6366f1' }}>{parseResult}</div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>✏️</div>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>Manual Entry</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Add income sources and household expenses manually</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowIncomeModal(true)}
                style={{ padding: '8px 12px', background: '#f8f9fc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                + Income
              </button>
              <button
                type="button"
                onClick={() => setShowExpensesModal(true)}
                style={{ padding: '8px 12px', background: '#f8f9fc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                + Expenses
              </button>
            </div>
          </div>
        </div>
      </div>

      <BankTransactionViewer
        applicationId={applicationId}
        firmId={firmId}
        reloadNonce={bankViewerReloadNonce}
      />

      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        {(['overview', 'income', 'expenses'] as const).map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px', border: 'none', background: 'none',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === tab ? '#6366f1' : '#64748b',
            marginBottom: -2,
          }}>
            {tab === 'overview' ? 'Overview' : tab === 'income' ? `Income · ${incomes.length}` : `Expenses · $${monthlyExpenses.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth`}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Income</span>
              <button type="button" onClick={() => setShowIncomeModal(true)} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add</button>
            </div>
            {incomes.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No income added yet</div>
            ) : (
              incomes.map(income => (
                <div key={income.id} style={{ padding: '12px 16px', background: '#f8f9fc', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {income.income_type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    {!income.verified && <span style={{ marginLeft: 8, fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>UNVERIFIED</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    ${Number(income.gross_salary || 0).toLocaleString('en-NZ')} {income.salary_frequency}
                    {' '}· ${Number(income.annual_gross_total || 0).toLocaleString('en-NZ')} pa
                    {income.parsed_bank_name && ` · ${income.parsed_bank_name}`}
                  </div>
                </div>
              ))
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Expenses</span>
              <button type="button" onClick={openExpensesModal} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
            </div>
            {!expenses ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No expenses added yet</div>
            ) : (
              [
                ['Living & Food', expenses.food_groceries],
                ['Housing', expenses.rent_board],
                ['Transport', (expenses.vehicle_running_costs || 0) + (expenses.public_transport || 0)],
                ['Utilities', expenses.utilities],
                ['Insurance', (expenses.health_insurance || 0) + (expenses.life_insurance || 0)],
                ['Lifestyle', expenses.other_discretionary],
              ].filter(([, v]) => Number(v) > 0).map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <span style={{ color: '#475569' }}>{label as string}</span>
                  <span style={{ fontWeight: 600 }}>${Number(value || 0).toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth</span>
                </div>
              ))
            )}
            {expenses && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, fontSize: 14 }}>
                <span>Total monthly</span>
                <span>${monthlyExpenses.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth</span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'income' && (
        <div>
          {incomes.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No income records yet. Drop a payslip or bank statement above.</div>
          ) : incomes.map(income => (
            <div key={income.id} style={{ padding: '14px 18px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {income.income_type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                ${Number(income.gross_salary).toLocaleString('en-NZ')} {income.salary_frequency} = ${Number(income.annual_gross_total).toLocaleString('en-NZ')} per year
              </div>
              {income.parsed_bank_name && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Source: {income.parsed_bank_name}</div>}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'expenses' && (
        <div>
          {!expenses ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
              No expenses yet. Click &quot;+ Expenses&quot; to add.
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, maxWidth: 520 }}>
              {[
                ['Food & Groceries', expenses.food_groceries],
                ['Rent / Board', expenses.rent_board],
                ['Vehicle', expenses.vehicle_running_costs],
                ['Public Transport', expenses.public_transport],
                ['Health Insurance', expenses.health_insurance],
                ['Life Insurance', expenses.life_insurance],
                ['Utilities', expenses.utilities],
                ['Childcare', expenses.childcare],
                ['Other', expenses.other_discretionary],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <span>{label as string}</span>
                  <span style={{ fontWeight: 600 }}>${Number(value || 0).toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 800, fontSize: 14 }}>
                <span>Total</span>
                <span>${monthlyExpenses.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth</span>
              </div>
            </div>
          )}
        </div>
      )}

      {showIncomeModal && (
        <div style={modalBackdrop}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 18px', fontWeight: 700, fontSize: 18 }}>Add Income</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Income Type</label>
              <select
                value={newIncome.income_type}
                onChange={e => setNewIncome({ ...newIncome, income_type: e.target.value })}
                style={inputStyle}
              >
                <option value="salary">Salary / Wages</option>
                <option value="self_employed">Self Employed</option>
                <option value="rental">Rental Income</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Gross Amount</label>
              <input
                type="number"
                value={newIncome.gross_salary || ''}
                onChange={e => setNewIncome({ ...newIncome, gross_salary: Number(e.target.value) })}
                style={inputStyle}
                placeholder="e.g. 5000"
              />
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Frequency</label>
              <select
                value={newIncome.salary_frequency}
                onChange={e => setNewIncome({ ...newIncome, salary_frequency: e.target.value })}
                style={inputStyle}
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annually</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowIncomeModal(false)}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveIncome()}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Save Income
              </button>
            </div>
          </div>
        </div>
      )}

      {showExpensesModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'white', borderRadius:16, padding:32, width:520, maxWidth:'90vw', maxHeight:'85vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 20px', fontWeight:700, fontSize:18 }}>
              Add Monthly Expenses
            </h3>

            {[
              { key:'food_groceries', label:'Food & Groceries' },
              { key:'rent_board', label:'Rent / Board' },
              { key:'vehicle_running_costs', label:'Vehicle Costs' },
              { key:'utilities', label:'Utilities' },
              { key:'health_insurance', label:'Health Insurance' },
              { key:'life_insurance', label:'Life Insurance' },
              { key:'childcare', label:'Childcare' },
              { key:'other_discretionary', label:'Other / Discretionary' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>
                  {label} ($/mth)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newExp[key as keyof typeof newExp] || ''}
                  onChange={e => setNewExp({ ...newExp, [key]: Number(e.target.value) })}
                  placeholder="0"
                  style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:14, boxSizing:'border-box' }}
                />
              </div>
            ))}

            <div style={{ padding:'14px 0', borderTop:'2px solid #e2e8f0', marginTop:8, fontWeight:700, fontSize:15, display:'flex', justifyContent:'space-between' }}>
              <span>Total Monthly</span>
              <span style={{ color:'#6366f1' }}>
                ${Object.values(newExp).reduce((s,v) => s + Number(v), 0).toLocaleString('en-NZ', { maximumFractionDigits: 0 })}/mth
              </span>
            </div>

            <div style={{ display:'flex', gap:12, justifyContent:'flex-end', marginTop:20 }}>
              <button
                type="button"
                onClick={() => setShowExpensesModal(false)}
                style={{ padding:'10px 20px', borderRadius:8, border:'1px solid #e2e8f0', background:'white', cursor:'pointer', fontSize:14 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveExpenses()}
                style={{ padding:'10px 20px', borderRadius:8, border:'none', background:'#6366f1', color:'white', cursor:'pointer', fontWeight:600, fontSize:14 }}
              >
                Save Expenses
              </button>
            </div>
          </div>
        </div>
      )}

      {bankStatementReview && (
        <div
          style={{ ...modalBackdrop, zIndex: 1002 }}
          onClick={() => setBankStatementReview(null)}
          onKeyDown={(e) => e.key === 'Escape' && setBankStatementReview(null)}
          role="presentation"
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 14,
              width: '100%',
              maxWidth: 880,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>Review bank statement draft</p>
              <button
                type="button"
                onClick={() => setBankStatementReview(null)}
                style={{ fontSize: 18, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {statementApplicantsLoading && (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#6b7280' }}>Loading applicants…</div>
            )}
            {!statementApplicantsLoading && statementReviewApplicants.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#b45309' }}>
                No applicants found for this application. Add an applicant to save parsed income.
              </div>
            )}
            {!statementApplicantsLoading && statementReviewApplicants.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>Apply parsed income to</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>
                    Select one or more applicants if this statement covers a joint account. Each selected applicant receives the same income lines.
                  </p>
                  {statementReviewApplicants.length > 1 && (
                    <select
                      aria-label="Quick applicant selection"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === 'primary') {
                          setStatementReviewSelectedIds(defaultSelectedApplicantIds(statementReviewApplicants))
                        }
                        if (v === 'all') {
                          setStatementReviewSelectedIds(statementReviewApplicants.map((a) => a.id))
                        }
                        e.target.value = ''
                      }}
                      style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', marginBottom: 10, background: 'white', maxWidth: 280 }}
                    >
                      <option value="">Quick apply…</option>
                      <option value="primary">Primary applicant only</option>
                      <option value="all">All applicants</option>
                    </select>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {statementReviewApplicants.map((a) => {
                      const checked = statementReviewSelectedIds.includes(a.id)
                      return (
                        <label
                          key={a.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setStatementReviewSelectedIds((prev) => {
                                if (prev.includes(a.id)) {
                                  if (prev.length <= 1) return prev
                                  return prev.filter((x) => x !== a.id)
                                }
                                return [...prev, a.id]
                              })
                            }}
                          />
                          <span>
                            {formatStatementApplicantName(a)} ({applicantRoleLabel(a.applicant_type)})
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <BankStatementParser
                    applicantId={statementReviewApplicants[0].id}
                    applicantIds={statementReviewSelectedIds}
                    document={bankStatementReview.document}
                    initialParseResponse={bankStatementReview.parseResponse}
                    approveButtonLabel="Approve & Save"
                    discardButtonLabel="Discard"
                    onComplete={() => {
                      setBankStatementReview(null)
                      void loadAll()
                      setBankViewerReloadNonce((n) => n + 1)
                    }}
                    onClose={() => setBankStatementReview(null)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
