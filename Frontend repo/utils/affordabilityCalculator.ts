export interface AffordabilityInput {
  annualIncome: number;
  monthlyExpenses: number;
  loanAmount: number;
  propertyValue?: number;
  existingDebts?: number;
  dependants?: number;
  loanTermYears?: number;
  testRate?: number;
}

export interface AffordabilityResult {
  affordable: boolean;
  monthlyIncome: number;
  expensesUsed: number;
  hemBenchmark: number;
  existingDebts: number;
  availableForRepayment: number;
  monthlyRepayment: number;
  surplus: number;
  maxBorrowing: number;
  lvr: number | null;
  dti: number;
  flags: string[];
  testRateUsed: number;
}

export function calculateAffordability(input: AffordabilityInput): AffordabilityResult {
  const monthlyIncome = input.annualIncome / 12;
  const testRate = (input.testRate ?? 8.5) / 100 / 12;
  const termMonths = (input.loanTermYears ?? 30) * 12;
  const existingDebts = input.existingDebts ?? 0;

  const hemByDependants: Record<number, number> = {
    0: 1800,
    1: 2200,
    2: 2500,
    3: 2800,
    4: 3100,
    5: 3400,
  };
  const hemBenchmark =
    hemByDependants[Math.min(input.dependants ?? 0, 5)] ?? 1800;
  const expensesUsed = Math.max(input.monthlyExpenses, hemBenchmark);

  const availableForRepayment = monthlyIncome - expensesUsed - existingDebts;

  const repayment =
    (input.loanAmount *
      (testRate * Math.pow(1 + testRate, termMonths))) /
    (Math.pow(1 + testRate, termMonths) - 1);

  const maxBorrowing =
    availableForRepayment > 0
      ? availableForRepayment *
        ((1 - Math.pow(1 + testRate, -termMonths)) / testRate)
      : 0;

  const lvr = input.propertyValue
    ? (input.loanAmount / input.propertyValue) * 100
    : null;

  const dti =
    input.annualIncome > 0 ? input.loanAmount / input.annualIncome : 0;

  const surplus = availableForRepayment - repayment;
  const affordable = surplus >= 0;

  const flags: string[] = [];
  if (dti > 6) flags.push('DTI above RBNZ 6x limit for investors');
  if (dti > 5) flags.push('DTI close to limit — may restrict lender options');
  if (lvr && lvr > 80) flags.push('LVR above 80% — low equity premium applies');
  if (lvr && lvr > 90) flags.push('LVR above 90% — very limited lender options');
  if (surplus < 200 && surplus >= 0)
    flags.push('Tight surplus — consider reducing loan amount');
  if (expensesUsed > input.monthlyExpenses)
    flags.push(
      `HEM benchmark ($${hemBenchmark}/mth) used — higher than declared expenses`,
    );

  return {
    affordable,
    monthlyIncome: Math.round(monthlyIncome),
    expensesUsed: Math.round(expensesUsed),
    hemBenchmark,
    existingDebts: Math.round(existingDebts),
    availableForRepayment: Math.round(availableForRepayment),
    monthlyRepayment: Math.round(repayment),
    surplus: Math.round(surplus),
    maxBorrowing: Math.round(maxBorrowing),
    lvr: lvr != null ? Math.round(lvr * 10) / 10 : null,
    dti: Math.round(dti * 10) / 10,
    flags,
    testRateUsed: input.testRate ?? 8.5,
  };
}
