import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { crmService } from '../../services/api';
import type { Lead } from '../../types';
import { useToast } from '../../hooks/useToast';
import { Button } from './Button';
import { Icon } from './Icon';
import {
  calculateAffordability,
  type AffordabilityInput,
  type AffordabilityResult,
} from '../../utils/affordabilityCalculator';

export type { AffordabilityInput, AffordabilityResult };
export { calculateAffordability };

const fmt = (n: number, prefix = '$') =>
  `${prefix}${Math.round(n).toLocaleString('en-NZ')}`;

function parseNum(v: string): number | null {
  const t = v.trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type AffordabilityConvertLead = {
  leadId: string;
  name: string;
  email: string;
  phone?: string;
};

export type OpenAffordabilityOptions = {
  initialValues?: Partial<AffordabilityInput>;
  convertLead?: AffordabilityConvertLead | null;
};

type AffordabilityContextValue = {
  open: (options?: OpenAffordabilityOptions) => void;
  close: () => void;
};

const AffordabilityContext = createContext<AffordabilityContextValue | null>(
  null,
);

export function useAffordabilityCalculator(): AffordabilityContextValue {
  const ctx = useContext(AffordabilityContext);
  if (!ctx) {
    throw new Error(
      'useAffordabilityCalculator must be used within AffordabilityCalculatorProvider',
    );
  }
  return ctx;
}

type ProviderProps = {
  children: React.ReactNode;
  navigateToApplication: (applicationId: string) => void;
};

export const AffordabilityCalculatorProvider: React.FC<ProviderProps> = ({
  children,
  navigateToApplication,
}) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<OpenAffordabilityOptions>({});

  const openModal = useCallback((opts?: OpenAffordabilityOptions) => {
    setOptions(opts ?? {});
    setOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    setOptions({});
  }, []);

  const value = useMemo(
    () => ({ open: openModal, close: closeModal }),
    [openModal, closeModal],
  );

  return (
    <AffordabilityContext.Provider value={value}>
      {children}
      {open && (
        <AffordabilityCalculatorModal
          onClose={closeModal}
          initialValues={options.initialValues}
          convertLead={options.convertLead ?? undefined}
          navigateToApplication={navigateToApplication}
          toast={toast}
        />
      )}
    </AffordabilityContext.Provider>
  );
};

type RowHighlight = 'green' | 'red' | 'yellow' | null;

const ResultRow: React.FC<{
  label: string;
  value: string;
  sub?: string;
  highlight?: RowHighlight;
}> = ({ label, value, sub, highlight }) => (
  <div
    className="flex items-center justify-between py-2 border-b"
    style={{ borderColor: 'var(--border-color)' }}
  >
    <div>
      <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      {sub && (
        <span
          className="text-[11px] ml-1.5"
          style={{ color: 'var(--text-muted)' }}
        >
          {sub}
        </span>
      )}
    </div>
    <span
      className="text-[13px] font-semibold"
      style={{
        color:
          highlight === 'green'
            ? 'var(--success)'
            : highlight === 'red'
              ? 'var(--danger)'
              : highlight === 'yellow'
                ? 'var(--warning)'
                : 'var(--text-primary)',
      }}
    >
      {value}
    </span>
  </div>
);

export type AffordabilityCalculatorPanelProps = {
  initialValues?: Partial<AffordabilityInput>;
  convertLead?: AffordabilityConvertLead;
  onClose?: () => void;
  navigateToApplication: (applicationId: string) => void;
  toast: ReturnType<typeof useToast>;
};

export const AffordabilityCalculatorPanel: React.FC<
  AffordabilityCalculatorPanelProps
> = ({
  initialValues,
  convertLead,
  onClose,
  navigateToApplication,
  toast,
}) => {
  const [annualIncome, setAnnualIncome] = useState(
    initialValues?.annualIncome != null
      ? String(initialValues.annualIncome)
      : '',
  );
  const [monthlyExpenses, setMonthlyExpenses] = useState(
    initialValues?.monthlyExpenses != null
      ? String(initialValues.monthlyExpenses)
      : '',
  );
  const [loanAmount, setLoanAmount] = useState(
    initialValues?.loanAmount != null ? String(initialValues.loanAmount) : '',
  );
  const [propertyValue, setPropertyValue] = useState(
    initialValues?.propertyValue != null
      ? String(initialValues.propertyValue)
      : '',
  );
  const [existingDebts, setExistingDebts] = useState(
    initialValues?.existingDebts != null
      ? String(initialValues.existingDebts)
      : '',
  );
  const [dependants, setDependants] = useState(
    initialValues?.dependants != null ? String(initialValues.dependants) : '0',
  );
  const [loanTermYears, setLoanTermYears] = useState(
    initialValues?.loanTermYears != null
      ? String(initialValues.loanTermYears)
      : '30',
  );
  const [testRate, setTestRate] = useState(
    initialValues?.testRate != null ? String(initialValues.testRate) : '8.5',
  );

  const [converting, setConverting] = useState(false);

  const inputParsed = useMemo(() => {
    const ai = parseNum(annualIncome);
    const me = parseNum(monthlyExpenses);
    const la = parseNum(loanAmount);
    const pv = propertyValue.trim() === '' ? undefined : parseNum(propertyValue);
    const ed = existingDebts.trim() === '' ? undefined : parseNum(existingDebts);
    const dep = parseNum(dependants);
    const lt = parseNum(loanTermYears);
    const tr = parseNum(testRate);

    const valid =
      ai != null &&
      ai > 0 &&
      me != null &&
      me >= 0 &&
      la != null &&
      la > 0 &&
      dep != null &&
      dep >= 0 &&
      lt != null &&
      lt > 0 &&
      tr != null &&
      tr > 0 &&
      (pv === undefined || pv === null || pv > 0) &&
      (ed === undefined || ed === null || ed >= 0);

    if (!valid) return { valid: false as const };

    return {
      valid: true as const,
      input: {
        annualIncome: ai,
        monthlyExpenses: me,
        loanAmount: la,
        propertyValue: pv ?? undefined,
        existingDebts: ed ?? 0,
        dependants: Math.min(5, Math.floor(dep)),
        loanTermYears: lt,
        testRate: tr,
      } satisfies AffordabilityInput,
    };
  }, [
    annualIncome,
    monthlyExpenses,
    loanAmount,
    propertyValue,
    existingDebts,
    dependants,
    loanTermYears,
    testRate,
  ]);

  const result: AffordabilityResult | null = useMemo(() => {
    if (!inputParsed.valid) return null;
    return calculateAffordability(inputParsed.input);
  }, [inputParsed]);

  const lvrOk = result?.lvr == null || result.lvr <= 80;
  const lvrWarn = result?.lvr != null && result.lvr > 80 && result.lvr <= 90;
  const dtiOk = result != null && result.dti <= 5;
  const dtiWarn = result != null && result.dti > 5 && result.dti <= 6;
  const dtiBad = result != null && result.dti > 6;

  const handleConvert = async () => {
    if (!convertLead || !inputParsed.valid) return;
    setConverting(true);
    try {
      const { input } = inputParsed;
      await crmService.updateClient(convertLead.leadId, {
        annualIncome: input.annualIncome,
        annualExpenses: input.monthlyExpenses * 12,
      });
      const { id } = await crmService.createApplication({
        clientId: convertLead.leadId,
        loanAmount: input.loanAmount,
        propertyValue: input.propertyValue,
        loanTermYears: input.loanTermYears,
      });
      toast.success('Application created and client details updated');
      onClose?.();
      navigateToApplication(id);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not convert lead or create application',
      );
    } finally {
      setConverting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-md border text-sm bg-transparent';
  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--border-color)',
    color: 'var(--text-primary)',
  };

  const showCloseToLimit =
    result?.affordable &&
    (result.surplus < 500 ||
      result.dti > 5 ||
      (result.lvr != null && result.lvr > 75));

  return (
    <div className="flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
      <div>
        <h3
          className="text-sm font-semibold uppercase tracking-wide mb-3"
          style={{ color: 'var(--text-muted)' }}
        >
          Inputs
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>
              Annual household income <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={annualIncome}
              onChange={(e) => setAnnualIncome(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="e.g. 100000"
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>
              Monthly expenses estimate <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={monthlyExpenses}
              onChange={(e) => setMonthlyExpenses(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="e.g. 3200"
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>
              Desired loan amount <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="e.g. 650000"
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>
              Property value (optional — LVR)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={propertyValue}
              onChange={(e) => setPropertyValue(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="e.g. 812500"
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>
              Existing debts / monthly repayments
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={existingDebts}
              onChange={(e) => setExistingDebts(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="0"
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Dependants (HEM)</span>
            <input
              type="text"
              inputMode="numeric"
              value={dependants}
              onChange={(e) => setDependants(e.target.value)}
              className={inputClass}
              style={inputStyle}
              placeholder="0"
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Loan term (years)</span>
            <input
              type="text"
              inputMode="decimal"
              value={loanTermYears}
              onChange={(e) => setLoanTermYears(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Test rate (% p.a.)</span>
            <input
              type="text"
              inputMode="decimal"
              value={testRate}
              onChange={(e) => setTestRate(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </label>
        </div>
      </div>

      {result && (
        <div
          className="rounded-xl p-4 sm:p-5 border"
          style={{
            background: result.affordable
              ? 'rgba(16, 185, 129, 0.08)'
              : 'rgba(239, 68, 68, 0.08)',
            borderColor: result.affordable
              ? 'rgba(16, 185, 129, 0.35)'
              : 'rgba(239, 68, 68, 0.35)',
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            Affordability result
          </p>
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl shrink-0" aria-hidden>
              {result.affordable ? '✓' : '✗'}
            </span>
            <div>
              <p
                className="text-base font-bold m-0"
                style={{
                  color: result.affordable ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {result.affordable ? 'LIKELY AFFORDABLE' : 'UNLIKELY'}
              </p>
              <p
                className="text-xs mt-1 m-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                Stress-tested at {result.testRateUsed}% p.a. ·{' '}
                {inputParsed.valid ? `${inputParsed.input.loanTermYears} yr` : ''}{' '}
                term
              </p>
            </div>
          </div>

          <ResultRow label="Monthly Income" value={fmt(result.monthlyIncome)} />
          <ResultRow label="Monthly Expenses" value={fmt(result.expensesUsed) + '/mth'} />
          <ResultRow label="Existing Debts" value={fmt(result.existingDebts) + '/mth'} />
          <ResultRow
            label="Available for Loan"
            value={fmt(result.availableForRepayment) + '/mth'}
            highlight={
              result.availableForRepayment <= 0
                ? 'red'
                : result.availableForRepayment < 500
                  ? 'yellow'
                  : 'green'
            }
          />
          <ResultRow
            label="Requested Repayment"
            value={fmt(result.monthlyRepayment) + '/mth'}
          />
          <ResultRow
            label="Surplus / Deficit"
            value={
              (result.surplus >= 0 ? '+' : '') +
              fmt(result.surplus) +
              '/mth'
            }
            highlight={
              result.surplus >= 200
                ? 'green'
                : result.surplus >= 0
                  ? 'yellow'
                  : 'red'
            }
          />
          <ResultRow
            label="Max Borrowing Capacity"
            value={fmt(result.maxBorrowing)}
            highlight={
              inputParsed.valid && result.maxBorrowing >= inputParsed.input.loanAmount
                ? 'green'
                : 'yellow'
            }
          />
          {result.lvr != null && (
            <ResultRow
              label="LVR"
              value={`${result.lvr}%${lvrOk ? ' ✓' : lvrWarn ? ' ⚠' : ' ✗'}`}
              highlight={lvrOk ? 'green' : lvrWarn ? 'yellow' : 'red'}
            />
          )}
          <ResultRow
            label="DTI ratio"
            value={`${result.dti}x${dtiOk ? ' ✓' : dtiWarn ? ' ⚠' : ' ✗'}`}
            highlight={dtiOk ? 'green' : dtiWarn ? 'yellow' : dtiBad ? 'red' : 'yellow'}
          />

          {showCloseToLimit && (
            <div
              className="mt-4 p-3 rounded-lg text-sm"
              style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: 'var(--warning)',
              }}
            >
              <span className="font-semibold">⚠ Close to limit</span> — consider
              reducing loan amount or increasing deposit
              {result.flags.length > 0 && (
                <ul className="mt-2 mb-0 pl-4 list-disc text-[13px] opacity-95">
                  {result.flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!showCloseToLimit && result.flags.length > 0 && (
            <ul
              className="mt-3 mb-0 pl-4 text-[13px] list-disc"
              style={{ color: 'var(--text-secondary)' }}
            >
              {result.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!result && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Enter required fields (annual income, monthly expenses, desired loan) with valid numbers
          to see instant results.
        </p>
      )}

      <div className="flex flex-wrap gap-2 justify-end pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
        {convertLead && (
          <Button
            type="button"
            variant="primary"
            disabled={!inputParsed.valid || converting}
            isLoading={converting}
            onClick={handleConvert}
          >
            Convert to Client
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={() => onClose?.()}>
          Save &amp; Close
        </Button>
      </div>
    </div>
  );
};

const AffordabilityCalculatorModal: React.FC<{
  onClose: () => void;
  initialValues?: Partial<AffordabilityInput>;
  convertLead?: AffordabilityConvertLead;
  navigateToApplication: (applicationId: string) => void;
  toast: ReturnType<typeof useToast>;
}> = ({
  onClose,
  initialValues,
  convertLead,
  navigateToApplication,
  toast,
}) => {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="affordability-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg-card)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <h2
            id="affordability-modal-title"
            className="text-lg font-bold m-0"
            style={{ color: 'var(--text-primary)' }}
          >
            Quick Affordability
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border-none cursor-pointer bg-transparent hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            <Icon name="X" className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <AffordabilityCalculatorPanel
            initialValues={initialValues}
            convertLead={convertLead}
            onClose={onClose}
            navigateToApplication={navigateToApplication}
            toast={toast}
          />
        </div>
      </div>
    </div>
  );
};

/** Standalone modal for embedding outside the provider (e.g. Lead card). */
export const AffordabilityCalculatorStandaloneModal: React.FC<{
  open: boolean;
  onClose: () => void;
  initialValues?: Partial<AffordabilityInput>;
  convertLead?: AffordabilityConvertLead;
  navigateToApplication: (applicationId: string) => void;
}> = ({
  open,
  onClose,
  initialValues,
  convertLead,
  navigateToApplication,
}) => {
  const toast = useToast();
  if (!open) return null;
  return (
    <AffordabilityCalculatorModal
      onClose={onClose}
      initialValues={initialValues}
      convertLead={convertLead}
      navigateToApplication={navigateToApplication}
      toast={toast}
    />
  );
};

export function leadToAffordabilityDefaults(lead: Lead): Partial<AffordabilityInput> {
  return {
    loanAmount:
      lead.estimatedLoanAmount > 0 ? lead.estimatedLoanAmount : undefined,
  };
}
