import React, { useState } from 'react';
import { useToast } from '../../hooks/useToast';
import { invokeParseBankStatement } from '../../src/lib/api';
import { ExpensesService } from '../../src/services/expenses.service';
import { IncomeService } from '../../src/services/income.service';
import { DocumentsService } from '../../src/services/documents.service';

interface ParsedIncome {
  description: string;
  amount: number;
  frequency: string;
  income_type: string;
  confidence: 'high' | 'medium' | 'low';
}

interface ParsedExpenses {
  food_groceries: number;
  dining_takeaway: number;
  alcohol_tobacco: number;
  entertainment: number;
  streaming_subscriptions: number;
  clothing_personal: number;
  phone_internet: number;
  utilities: number;
  vehicle_running_costs: number;
  public_transport: number;
  health_insurance: number;
  medical_dental: number;
  gym_sports: number;
  rent_board: number;
  other_discretionary: number;
}

export interface ParsedBankAnomaly {
  description: string;
  amount: number;
  category: string;
  severity: 'warning' | 'critical';
  reason: string;
}

interface ParsedResult {
  bank_name: string;
  statement_period: string;
  account_holder: string;
  income: ParsedIncome[];
  expenses: ParsedExpenses;
  total_income_monthly: number;
  total_expenses_monthly: number;
  red_flags: string[];
  /** Structured anomalies from the model (e.g. gambling, BNPL) with severity. */
  anomalies: ParsedBankAnomaly[];
  undisclosed_repayments: Array<{ description: string; amount: number; frequency: string }>;
  notes: string;
}

function emptyParsedExpenses(): ParsedExpenses {
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
  };
}

function monthlyFromDebitAmount(amount: number, frequency: string): number {
  const f = (frequency || 'monthly').toLowerCase();
  if (f.includes('fortnight')) return (Number(amount) || 0) * 26 / 12;
  if (f.includes('week')) return (Number(amount) || 0) * 52 / 12;
  if (f.includes('year') || f.includes('annual')) return (Number(amount) || 0) / 12;
  return Number(amount) || 0;
}

function mergeExpenseCategoryObject(
  expenses: ParsedExpenses,
  src: Record<string, unknown>,
): void {
  (Object.keys(expenses) as Array<keyof ParsedExpenses>).forEach((k) => {
    if (src[k] != null && src[k] !== '') expenses[k] = Number(src[k]) || 0;
  });
}

function isNonEmptyRecord(o: unknown): o is Record<string, unknown> {
  return (
    o != null &&
    typeof o === 'object' &&
    !Array.isArray(o) &&
    Object.keys(o as object).length > 0
  );
}

export function parseAnomaliesFromExtracted(extracted: Record<string, unknown>): ParsedBankAnomaly[] {
  const raw = extracted.anomalies;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Record<string, unknown>;
      const sev = String(o.severity ?? 'warning').toLowerCase();
      const severity: ParsedBankAnomaly['severity'] = sev === 'critical' ? 'critical' : 'warning';
      return {
        description: String(o.description ?? ''),
        amount: Number(o.amount ?? 0) || 0,
        category: String(o.category ?? ''),
        severity,
        reason: String(o.reason ?? ''),
      };
    })
    .filter((a) => a.description.trim() || a.reason.trim());
}

function mapRowToParsedIncome(row: unknown): ParsedIncome {
  const r = row as Record<string, unknown>;
  const rawFreq = String(r.frequency ?? 'monthly').toLowerCase();
  let frequency = 'monthly';
  if (rawFreq.includes('fortnight')) frequency = 'fortnightly';
  else if (rawFreq.includes('week')) frequency = 'weekly';
  else if (rawFreq.includes('year') || rawFreq.includes('annual')) frequency = 'annually';
  const confRaw = String(r.confidence ?? 'medium').toLowerCase();
  const confidence: ParsedIncome['confidence'] =
    confRaw === 'high' || confRaw === 'low' ? confRaw : 'medium';
  return {
    description: String(r.description ?? 'Income'),
    amount: Number(r.amount ?? 0),
    frequency,
    income_type: String(r.income_type ?? 'salary_wages'),
    confidence,
  };
}

/** Maps Edge Function `extracted_data` (incl. regular_income_credits) into review UI shape. */
export function buildParsedResultFromExtractedData(extracted: Record<string, unknown>): ParsedResult {
  let expenses = emptyParsedExpenses();
  const categorySource =
    isNonEmptyRecord(extracted.expenses) ? (extracted.expenses as Record<string, unknown>)
    : isNonEmptyRecord(extracted.categorised_monthly_expenses)
      ? (extracted.categorised_monthly_expenses as Record<string, unknown>)
      : isNonEmptyRecord(extracted.categorized_monthly_expenses)
        ? (extracted.categorized_monthly_expenses as Record<string, unknown>)
        : isNonEmptyRecord(extracted.monthly_expenses_by_category)
          ? (extracted.monthly_expenses_by_category as Record<string, unknown>)
          : null;

  if (categorySource) {
    mergeExpenseCategoryObject(expenses, categorySource);
  } else if (Array.isArray(extracted.regular_expense_debits) && extracted.regular_expense_debits.length > 0) {
    let sumMonthly = 0;
    for (const row of extracted.regular_expense_debits) {
      const r = row as Record<string, unknown>;
      sumMonthly += monthlyFromDebitAmount(Number(r.amount ?? 0), String(r.frequency ?? 'monthly'));
    }
    expenses.other_discretionary += sumMonthly;
  }

  const anomalies = parseAnomaliesFromExtracted(extracted);

  const income: ParsedIncome[] = [];
  if (Array.isArray(extracted.income)) {
    for (const row of extracted.income) income.push(mapRowToParsedIncome(row));
  }
  if (Array.isArray(extracted.regular_income_credits)) {
    for (const row of extracted.regular_income_credits) income.push(mapRowToParsedIncome(row));
  }

  if (
    income.length === 0 &&
    (extracted.gross_salary != null || extracted.gross != null)
  ) {
    income.push(
      mapRowToParsedIncome({
        description: String(extracted.employer_name ?? 'Salary'),
        amount: Number(extracted.gross_salary ?? extracted.gross ?? 0),
        frequency: String(extracted.pay_frequency ?? extracted.salary_frequency ?? 'monthly'),
        income_type: 'salary_wages',
        confidence: 'high',
      }),
    );
  }

  const statement_period =
    extracted.statement_period != null && String(extracted.statement_period).trim()
      ? String(extracted.statement_period)
      : [extracted.statement_period_start, extracted.statement_period_end]
          .filter((x) => x != null && String(x).trim())
          .join(' → ') || '—';

  const red_flags: string[] = [
    ...(Array.isArray(extracted.flags) ? extracted.flags.map((x) => String(x)) : []),
    ...(Array.isArray(extracted.red_flags) ? extracted.red_flags.map((x) => String(x)) : []),
  ];

  const undisclosed_repayments = Array.isArray(extracted.undisclosed_repayments)
    ? (extracted.undisclosed_repayments as Array<{ description: string; amount: number; frequency: string }>)
    : [];

  return {
    bank_name: String(extracted.bank_name ?? ''),
    statement_period,
    account_holder: String(extracted.account_holder ?? extracted.account_holder_name ?? ''),
    income,
    expenses,
    total_income_monthly: Number(extracted.total_income_monthly ?? extracted.average_monthly_credits ?? 0),
    total_expenses_monthly: Number(extracted.total_expenses_monthly ?? 0),
    red_flags,
    anomalies,
    undisclosed_repayments,
    notes: String(extracted.notes ?? ''),
  };
}

interface InitialParseResponse {
  success: boolean;
  extracted_data?: Record<string, unknown>;
  summary?: string;
  detected_type?: string;
  populated_fields?: string[];
}

interface Props {
  applicantId: string;
  /** When set and non-empty, each income line is saved once per applicant (e.g. joint account). Otherwise `applicantId` is used. */
  applicantIds?: string[];
  document: {
    id: string;
    name: string;
    url: string;
    file_type: string;
    category: string;
    application_id: string;
    firm_id: string;
  };
  onComplete: () => void;
  onClose: () => void;
  /** When set (e.g. Magic Drop already invoked parse-bank-statement), open directly in review mode. */
  initialParseResponse?: InitialParseResponse | null;
  approveButtonLabel?: string;
  discardButtonLabel?: string;
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div>
        <span style={{ fontSize: 12, color: '#374151' }}>{label}</span>
        {sub && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>{sub}</span>}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{value}</span>
    </div>
  );
}

function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-NZ');
}

function confBadge(c: string) {
  const cfg = c === 'high' ? { color: '#16a34a', bg: '#f0fdf4' } : c === 'medium' ? { color: '#d97706', bg: '#fffbeb' } : { color: '#dc2626', bg: '#fef2f2' };
  return <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: cfg.bg, color: cfg.color, fontWeight: 600, textTransform: 'uppercase' as const }}>{c}</span>;
}

export const BankStatementParser: React.FC<Props> = ({
  applicantId,
  applicantIds,
  document,
  onComplete,
  onClose,
  initialParseResponse,
  approveButtonLabel = 'Save to Application ✓',
  discardButtonLabel = 'Cancel',
}) => {
  const incomeApplicantIds =
    applicantIds && applicantIds.length > 0 ? applicantIds : [applicantId];
  const toast = useToast();
  const prefetch = initialParseResponse?.success && initialParseResponse.extracted_data;
  const initialParsed = prefetch ? buildParsedResultFromExtractedData(initialParseResponse!.extracted_data!) : null;

  const [step, setStep] = useState<'idle' | 'parsing' | 'review' | 'saving' | 'done'>(() =>
    initialParsed ? 'review' : 'idle',
  );
  const [result, setResult] = useState<ParsedResult | null>(() => initialParsed);
  const [error, setError] = useState<string | null>(null);
  const [editedExpenses, setEditedExpenses] = useState<ParsedExpenses | null>(() =>
    initialParsed ? initialParsed.expenses : null,
  );
  const [editedIncome, setEditedIncome] = useState<ParsedIncome[] | null>(() =>
    initialParsed ? initialParsed.income : null,
  );
  const [extractedData, setExtractedData] = useState<Record<string, unknown> | null>(() =>
    initialParseResponse?.extracted_data ?? null,
  );
  const [detectedType, setDetectedType] = useState<string | null>(() =>
    initialParseResponse?.detected_type ?? null,
  );
  const [summary, setSummary] = useState<string | null>(() =>
    typeof initialParseResponse?.summary === 'string' ? initialParseResponse.summary : null,
  );
  const [progress, setProgress] = useState('');

  function applySuccessfulServerResponse(data: Record<string, unknown>) {
    const extracted = (data.extracted_data ?? {}) as Record<string, unknown>;
    setExtractedData(extracted);
    setDetectedType(typeof data.detected_type === 'string' ? data.detected_type : null);
    setSummary(typeof data.summary === 'string' ? data.summary : null);
    const parsed = buildParsedResultFromExtractedData(extracted);
    setResult(parsed);
    setEditedExpenses(parsed.expenses);
    setEditedIncome(parsed.income);
    setStep('review');
  }

  async function parsePdf() {
    setStep('parsing');
    setError(null);
    setProgress('Parsing statement with AI...');

    try {
      const { data, error } = await invokeParseBankStatement(
        {
          document_id: document.id,
          application_id: document.application_id,
          firm_id: document.firm_id,
        },
        {
          onProgress: (row) => {
            const pct = Number(row.progress_pct) || 0;
            setProgress(`${row.current_step || row.status || 'Processing'} — ${pct}%`);
          },
        },
      );

      if (error) {
        setError('Failed to parse: ' + error);
        setStep('idle');
        return;
      }

      if (data?.success) {
        applySuccessfulServerResponse(data as Record<string, unknown>);
        if (Array.isArray((data as { populated_fields?: string[] }).populated_fields) &&
          (data as { populated_fields: string[] }).populated_fields.includes('income')) {
          toast.success('Income automatically populated from payslip');
        }
        return;
      }

      setError('Failed to parse: No data returned from parser');
      setStep('idle');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setStep('idle');
    }
  }

  async function saveToApplication() {
    if (!result || !editedExpenses || !editedIncome) return;
    if (incomeApplicantIds.length === 0) {
      setError('Select at least one applicant for income.');
      return;
    }
    setStep('saving');
    try {
      // Save income entries (one row per applicant when joint / multi-select)
      for (const aid of incomeApplicantIds) {
        for (const inc of editedIncome) {
          const amt = Number(inc.amount) || 0;
          if (amt <= 0 && !String(inc.description ?? '').trim()) continue;
          const annualGross = inc.frequency === 'weekly' ? amt * 52
            : inc.frequency === 'fortnightly' ? amt * 26
            : inc.frequency === 'monthly' ? amt * 12
            : amt;

          await IncomeService.create({
            applicant_id: aid,
            income_type: inc.income_type,
            gross_salary: amt,
            salary_frequency: inc.frequency,
            annual_gross_total: annualGross,
            other_income_description: inc.description,
            parsed_from_document_id: document.id,
            parsed_bank_name: result.bank_name,
            parsed_at: new Date().toISOString(),
            verified: false,
            verification_notes: 'Auto-parsed from bank statement. Confidence: ' + inc.confidence,
          });
        }
      }

      // Calculate totals for expenses
      const exp = editedExpenses;
      const totalMonthly = Object.values(exp).reduce((s, v) => s + (Number(v) || 0), 0);

      await ExpensesService.save(document.application_id, {
        food_groceries: exp.food_groceries,
        dining_takeaway: exp.dining_takeaway,
        alcohol_tobacco: exp.alcohol_tobacco,
        entertainment: exp.entertainment,
        streaming_subscriptions: exp.streaming_subscriptions,
        clothing_personal: exp.clothing_personal,
        phone_internet: exp.phone_internet,
        utilities: exp.utilities,
        vehicle_running_costs: exp.vehicle_running_costs,
        public_transport: exp.public_transport,
        health_insurance: exp.health_insurance,
        medical_dental: exp.medical_dental,
        gym_sports: exp.gym_sports,
        rent_board: exp.rent_board,
        other_discretionary: exp.other_discretionary,
        total_monthly: totalMonthly,
        expense_frequency: 'monthly',
        parsed_from_document_id: document.id,
        parsed_bank_name: result.bank_name,
        parsed_at: new Date().toISOString(),
        notes: 'Auto-parsed from bank statement. ' + result.notes,
      });

      // Mark document as parsed
      await DocumentsService.update(document.id, {
        parse_status: 'parsed',
        parsed_at: new Date().toISOString(),
        parsed_bank_name: result.bank_name,
      });

      setStep('done');
      setTimeout(() => { onComplete(); }, 1500);
    } catch (e: any) {
      setError(e.message);
      setStep('review');
    }
  }

  function updateExpense(key: keyof ParsedExpenses, value: string) {
    if (!editedExpenses) return;
    setEditedExpenses({ ...editedExpenses, [key]: parseFloat(value) || 0 });
  }

  function updateIncome(idx: number, field: keyof ParsedIncome, value: string) {
    if (!editedIncome) return;
    const updated = [...editedIncome];
    (updated[idx] as any)[field] = field === 'amount' ? (parseFloat(value) || 0) : value;
    setEditedIncome(updated);
  }

  function removeIncomeRow(idx: number) {
    if (!editedIncome) return;
    setEditedIncome(editedIncome.filter((_, i) => i !== idx));
  }

  function addIncomeRow() {
    const row: ParsedIncome = {
      description: '',
      amount: 0,
      frequency: 'monthly',
      income_type: 'salary_wages',
      confidence: 'medium',
    };
    setEditedIncome((prev) => (prev ? [...prev, row] : [row]));
  }

  // ── IDLE STATE ──
  if (step === 'idle') return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>AI Bank Statement Parser</h3>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 6px' }}>{document.name}</p>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 20px' }}>
        Claude AI will analyse this statement and extract income, expenses, and flag any anomalies.
        <br />Review and confirm before saving to the application.
      </p>
      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#dc2626' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button type="button" onClick={onClose}
          style={{ padding: '9px 18px', background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
          {discardButtonLabel}
        </button>
        <button onClick={parsePdf}
          style={{ padding: '9px 22px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ✨ Parse with AI
        </button>
      </div>
    </div>
  );

  // ── PARSING STATE ──
  if (step === 'parsing') return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>Analysing statement...</p>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{progress}</p>
    </div>
  );

  // ── DONE STATE ──
  if (step === 'done') return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#16a34a', margin: 0 }}>Data saved successfully!</p>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0' }}>Income and expenses have been populated from the bank statement.</p>
    </div>
  );

  // ── REVIEW STATE ──
  if (!result || !editedExpenses || !editedIncome) return null;

  const totalIncomeMonthly = editedIncome.reduce((s, i) => {
    const amt = Number(i.amount) || 0;
    const m = i.frequency === 'weekly' ? amt * 52 / 12
      : i.frequency === 'fortnightly' ? amt * 26 / 12
      : i.frequency === 'annually' ? amt / 12
      : amt;
    return s + m;
  }, 0);
  const totalExpMonthly = Object.values(editedExpenses).reduce((s, v) => s + (Number(v) || 0), 0);

  const EXPENSE_LABELS: Record<keyof ParsedExpenses, string> = {
    food_groceries: 'Food & Groceries',
    dining_takeaway: 'Dining & Takeaway',
    alcohol_tobacco: 'Alcohol & Tobacco',
    entertainment: 'Entertainment',
    streaming_subscriptions: 'Streaming & Subscriptions',
    clothing_personal: 'Clothing & Personal',
    phone_internet: 'Phone & Internet',
    utilities: 'Utilities',
    vehicle_running_costs: 'Vehicle Running',
    public_transport: 'Public Transport',
    health_insurance: 'Health Insurance',
    medical_dental: 'Medical & Dental',
    gym_sports: 'Gym & Sports',
    rent_board: 'Rent / Board',
    other_discretionary: 'Other Discretionary',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        maxHeight: '100%',
        overflow: 'hidden',
      }}
    >
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Summary banner */}
      <div style={{ padding: '12px 20px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', display: 'flex', gap: 24, flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase' }}>Bank</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>{result.bank_name}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase' }}>Period</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>{result.statement_period}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase' }}>Account Holder</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>{result.account_holder}</p>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 1px', fontWeight: 700, textTransform: 'uppercase' }}>Net Position</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: totalIncomeMonthly > totalExpMonthly ? '#16a34a' : '#dc2626', margin: 0 }}>
            {fmt(totalIncomeMonthly - totalExpMonthly)}/mth
          </p>
        </div>
      </div>

      {(detectedType || summary) && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
          {detectedType && (
            <p style={{ fontSize: 11, color: '#475569', margin: '0 0 4px' }}>
              <strong>Detected type:</strong> {detectedType}
            </p>
          )}
          {summary && (
            <p style={{ fontSize: 12, color: '#334155', margin: 0 }}>
              {summary}
            </p>
          )}
          {!summary && extractedData && (
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              AI extraction completed.
            </p>
          )}
        </div>
      )}

      {/* Body — scrolls; footer stays sticky below */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >

        {/* Anomalies + legacy flags */}
        {(result.anomalies.length > 0 || result.red_flags.length > 0 || result.undisclosed_repayments.length > 0) && (
          <div
            style={{
              padding: '10px 14px',
              background:
                result.anomalies.some((a) => a.severity === 'critical') || result.red_flags.length > 0
                  ? '#fef2f2'
                  : '#fffbeb',
              border: `1px solid ${
                result.anomalies.some((a) => a.severity === 'critical') || result.red_flags.length > 0
                  ? '#fca5a5'
                  : '#fde68a'
              }`,
              borderRadius: 8,
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', margin: '0 0 8px' }}>
              ⚠{' '}
              {result.anomalies.length + result.red_flags.length + result.undisclosed_repayments.length}{' '}
              Flag(s) Detected
            </p>
            {result.anomalies.map((a, i) => (
              <div
                key={`a-${i}`}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '3px 8px',
                    borderRadius: 4,
                    flexShrink: 0,
                    background: a.severity === 'critical' ? '#fee2e2' : '#fef9c3',
                    color: a.severity === 'critical' ? '#b91c1c' : '#a16207',
                    border: `1px solid ${a.severity === 'critical' ? '#fecaca' : '#fde047'}`,
                  }}
                >
                  {a.severity === 'critical' ? 'Critical' : 'Warning'}
                </span>
                <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.45 }}>
                  {a.description ? <strong>{a.description}</strong> : null}
                  {a.amount ? (
                    <span style={{ color: '#6b7280' }}>{' '}{fmt(a.amount)}</span>
                  ) : null}
                  {a.category ? (
                    <span style={{ color: '#6b7280' }}>{' · '}{a.category}</span>
                  ) : null}
                  {a.reason ? <span>{a.description || a.amount || a.category ? ' — ' : ''}{a.reason}</span> : null}
                </p>
              </div>
            ))}
            {result.red_flags.map((f, i) => (
              <p key={`f-${i}`} style={{ fontSize: 12, color: '#dc2626', margin: '0 0 4px' }}>• {f}</p>
            ))}
            {result.undisclosed_repayments.map((r, i) => (
              <p key={`u-${i}`} style={{ fontSize: 12, color: '#d97706', margin: '0 0 2px' }}>
                • Undisclosed repayment: {r.description} — {fmt(Number(r.amount))}/{r.frequency}
              </p>
            ))}
          </div>
        )}

        {/* Income */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Income Detected
            </p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', margin: 0 }}>{fmt(totalIncomeMonthly)}/mth total</p>
          </div>
          {editedIncome.map((inc, idx) => (
            <div
              key={idx}
              style={{
                padding: '10px 12px',
                background: '#f9fafb',
                borderRadius: 8,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  value={inc.description}
                  onChange={(e) => updateIncome(idx, 'description', e.target.value)}
                  placeholder="Description"
                  style={{
                    width: '100%',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: 6,
                    padding: '6px 8px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <select
                    value={inc.income_type}
                    onChange={(e) => updateIncome(idx, 'income_type', e.target.value)}
                    style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 4, background: 'white' }}
                  >
                    <option value="salary_wages">Salary / Wages</option>
                    <option value="self_employed">Self-Employed</option>
                    <option value="rental">Rental</option>
                    <option value="other">Other</option>
                  </select>
                  <select
                    value={inc.frequency}
                    onChange={(e) => updateIncome(idx, 'frequency', e.target.value)}
                    style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 4, background: 'white' }}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                    <option value="annually">Annually</option>
                  </select>
                  {confBadge(inc.confidence)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>$</span>
                  <input
                    type="number"
                    value={inc.amount}
                    onChange={(e) => updateIncome(idx, 'amount', e.target.value)}
                    style={{ width: 88, padding: '6px 6px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, textAlign: 'right' }}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Remove income line"
                  onClick={() => removeIncomeRow(idx)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 16,
                    lineHeight: 1,
                    color: '#dc2626',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addIncomeRow}
            style={{
              marginTop: 4,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#6366f1',
              background: '#eef2ff',
              border: '1px dashed #a5b4fc',
              borderRadius: 8,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            + Add Income
          </button>
        </div>

        {/* Expenses */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Monthly Expenses
            </p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#d97706', margin: 0 }}>{fmt(totalExpMonthly)}/mth total</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {(Object.keys(EXPENSE_LABELS) as Array<keyof ParsedExpenses>).map(key => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#f9fafb', borderRadius: 6 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{EXPENSE_LABELS[key]}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>$</span>
                    <input type="number" value={editedExpenses[key] || 0} onChange={e => updateExpense(key, e.target.value)}
                      style={{ width: 70, padding: '2px 4px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, textAlign: 'right' }} />
                  </div>
                </div>
              ))}
          </div>
          {Object.values(editedExpenses).every(v => !v || v === 0) && (
            <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No expenses detected — all values are zero</p>
          )}
        </div>

        {/* Notes */}
        {result.notes && (
          <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', margin: '0 0 4px' }}>AI Notes</p>
            <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>{result.notes}</p>
          </div>
        )}
      </div>

      {/* Footer — sticky so Discard / Approve stay visible while body scrolls */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          padding: '12px 20px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: '#ffffff',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
        }}
      >
        <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Review and edit values before saving. Changes will populate the Income and Expenses tabs.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose}
            style={{ fontSize: 12, padding: '7px 14px', background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer' }}>
            {discardButtonLabel}
          </button>
          <button type="button" onClick={saveToApplication} disabled={step === 'saving' || incomeApplicantIds.length === 0}
            style={{ fontSize: 12, padding: '8px 18px', background: step === 'saving' || incomeApplicantIds.length === 0 ? '#e5e7eb' : '#6366f1', color: step === 'saving' || incomeApplicantIds.length === 0 ? '#9ca3af' : 'white', border: 'none', borderRadius: 7, cursor: step === 'saving' || incomeApplicantIds.length === 0 ? 'default' : 'pointer', fontWeight: 700 }}>
            {step === 'saving' ? 'Saving...' : approveButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
