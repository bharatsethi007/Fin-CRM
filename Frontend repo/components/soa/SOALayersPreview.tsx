import { type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { SoaMiddlePanelStepZeroDna } from './SoaMiddlePanelStepZeroDna';
import { SoaMiddlePanelStepTwoPolicy } from './SoaMiddlePanelStepTwoPolicy';
import { SoaStep1LenderGrid } from './SoaStep1LenderGrid';
import type { SoaClientDnaView } from './soaClientDnaTypes';
import type { SoaLenderOption } from './soaLenderCatalog';
import { formatValue, layerText, safeArray, toStringArray } from './soaAgentUtils';
import type { AgentStepRow, SOAPreviewRow } from './soaAgentTypes';
import type { LayerFormValues } from './soaLayerFormTypes';
import { Textarea } from '../ui/textarea';

/** Optional Step 1 lender checklist + recalc (wired from `useSOAGenerateWorkspace`). */
export type SoaLenderSelectionProps = {
  allLenders: SoaLenderOption[];
  agentShortlistCodes: string[];
  selectedLenders: string[];
  onSelectedChange: (codes: string[]) => void;
  needsRecalc: boolean;
  onMarkNeedsRecalc: () => void;
  onRecalcCosts: () => void | Promise<void>;
  recalcBusy?: boolean;
};

type Props = {
  soa: SOAPreviewRow | undefined;
  steps: AgentStepRow[];
  register: UseFormRegister<LayerFormValues>;
  onLayerBlur: (field: keyof LayerFormValues) => void;
  /** When true, layers 2–4 use textareas like the narrative layers. */
  allLayersEditable?: boolean;
  lenderSelection?: SoaLenderSelectionProps | null;
  /** Step 0 Client DNA (middle column). */
  clientDna?: SoaClientDnaView | null;
  onRunDna?: () => void | Promise<void>;
  runningDna?: boolean;
  selectedDnaSituations?: string[];
  onSelectedDnaSituationsChange?: Dispatch<SetStateAction<string[]>>;
  /** Application id for loading `application_properties` in Step 0. */
  applicationId?: string;
};

const LAYER_SECTIONS: {
  formKey: keyof LayerFormValues;
  outKey: string;
  title: string;
  editable: boolean;
}[] = [
  { formKey: 'layer1', outKey: 'layer1_client_situation', title: 'Layer 1 — Client Situation', editable: true },
  { formKey: 'layer2', outKey: 'layer2_regulatory_gate', title: 'Layer 2 — Regulatory Gate', editable: false },
  { formKey: 'layer3', outKey: 'layer3_market_scan', title: 'Layer 3 — Market Scan', editable: false },
  { formKey: 'layer4', outKey: 'layer4_quantitative', title: 'Layer 4 — Quantitative Comparison', editable: false },
  { formKey: 'layer5', outKey: 'layer5_recommendation', title: 'Layer 5 — Recommendation', editable: true },
  { formKey: 'layer6', outKey: 'layer6_sensitivity', title: 'Layer 6 — Sensitivity', editable: true },
  { formKey: 'layer7', outKey: 'layer7_risks', title: 'Layer 7 — Risks', editable: true },
  { formKey: 'layer8', outKey: 'layer8_commission', title: 'Layer 8 — Commission & Conflicts', editable: true },
];

/** Step 1 / 3 agent data plus editable narrative layers (form + step 4 strings). */
export function SOALayersPreview({
  soa,
  steps,
  register,
  onLayerBlur,
  allLayersEditable = false,
  lenderSelection = null,
  clientDna = null,
  onRunDna,
  runningDna = false,
  selectedDnaSituations = [],
  onSelectedDnaSituationsChange,
  applicationId,
}: Props) {
  const step1 = steps.find((s) => s.step_number === 1);
  const step2 = steps.find((s) => s.step_number === 2);
  const step3 = steps.find((s) => s.step_number === 3);
  const step4 = steps.find((s) => s.step_number === 4);
  const policyEvidence =
    (step2?.output_json?.policy_evidence as Record<string, unknown> | undefined) ?? {};
  const out1 = step1?.output_json ?? {};
  const comparison = safeArray<Record<string, unknown>>(step3?.output_json?.comparison);
  const layers = (step4?.output_json ?? {}) as Record<string, unknown>;
  const shortlisted = safeArray<string>(out1.shortlisted);
  const declined = safeArray<Record<string, unknown>>(out1.declined);

  return (
    <div className="h-full overflow-y-auto bg-white p-4 dark:bg-gray-900">
      {soa?.is_baseline ? (
        <div className="sticky top-0 z-10 mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">⚠️ BASELINE ANALYSIS</p>
          {toStringArray(soa.baseline_warnings).map((w) => (
            <p key={w}>- {w}</p>
          ))}
          <p>Upload policy PDFs in Settings &gt; Knowledge Bank for precise analysis.</p>
        </div>
      ) : null}

      {onRunDna ? (
        <SoaMiddlePanelStepZeroDna
          dna={clientDna}
          onRunDna={onRunDna}
          runningDna={runningDna}
          selectedSituations={selectedDnaSituations}
          onSelectedSituationsChange={onSelectedDnaSituationsChange}
          applicationId={applicationId}
        />
      ) : null}

      <Section title="Step 1 — Lender filter" body={step1}>
        <p className="text-sm">
          LVR {formatValue(typeof out1.lvr === 'number' ? out1.lvr : 0)} | DTI{' '}
          {formatValue(typeof out1.dti === 'number' ? out1.dti : 0)}
        </p>
        {lenderSelection && step1 ? (
          <SoaStep1LenderGrid
            allLenders={lenderSelection.allLenders}
            agentShortlistCodes={lenderSelection.agentShortlistCodes}
            selectedLenders={lenderSelection.selectedLenders}
            onSelectedChange={lenderSelection.onSelectedChange}
            needsRecalc={lenderSelection.needsRecalc}
            onMarkNeedsRecalc={lenderSelection.onMarkNeedsRecalc}
            onRecalcCosts={lenderSelection.onRecalcCosts}
            recalculating={lenderSelection.recalcBusy}
          />
        ) : shortlisted.length > 0 ? (
          <div className="flex flex-wrap gap-1 text-xs">
            <span className="font-medium">Shortlisted:</span>
            {shortlisted.map((name) => (
              <span key={name} className="rounded bg-green-100 px-2 py-0.5 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No shortlisted lenders yet.</p>
        )}
        {declined.length > 0 ? (
          <ul className="list-inside list-disc text-xs text-red-800">
            {declined.map((d, i) => (
              <li key={i}>
                {formatValue(d.lender)} — {formatValue(d.reason)}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <SoaMiddlePanelStepTwoPolicy
        step2={step2}
        policyEvidence={policyEvidence}
        selectedLenderCodes={lenderSelection?.selectedLenders ?? []}
        shortlistedNames={shortlisted}
      />

      <Section title="Step 3 — Cost comparison" body={step3}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100">
                {[
                  'Lender',
                  'Rate',
                  'Monthly',
                  'Stress',
                  '+2%',
                  '5yr',
                  'Cashback',
                  'Net',
                  'Rank',
                  'vs cheapest',
                  'Break fee',
                  'Comm ↑',
                  'Trail',
                  'Clawback',
                ].map((h) => (
                  <th key={h} className="px-1 py-1 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-3 text-gray-500">
                    Analysing…
                  </td>
                </tr>
              ) : (
                comparison.map((row, idx) => (
                  <tr key={`${String(row.lender)}-${idx}`} className="border-b border-gray-100">
                    <td className="px-1 py-1">
                      {formatValue(row.lender)}
                      {row.is_baseline ? (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">BASELINE</span>
                      ) : null}
                    </td>
                    <td className="px-1 py-1">{formatValue(row.rate)}</td>
                    <td className="px-1 py-1">{formatValue(row.monthly_payment)}</td>
                    <td className="px-1 py-1">{formatValue(row.monthly_stress)}</td>
                    <td className="px-1 py-1">{formatValue(row.monthly_plus2pct)}</td>
                    <td className="px-1 py-1">{formatValue(row.five_yr_cost)}</td>
                    <td className="px-1 py-1">{formatValue(row.cashback)}</td>
                    <td className="px-1 py-1">{formatValue(row.net_cost)}</td>
                    <td className="px-1 py-1">{formatValue(row.rank)}</td>
                    <td className="px-1 py-1">{formatValue(row.cost_vs_cheapest)}</td>
                    <td className="px-1 py-1">{formatValue(row.break_fee_risk)}</td>
                    <td className="px-1 py-1">{formatValue(row.commission_upfront)}</td>
                    <td className="px-1 py-1">{formatValue(row.commission_trail)}</td>
                    <td className="px-1 py-1">{formatValue(row.clawback_months)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Step 4 — Narrative layers" body={step4}>
        <div className="space-y-3">
          {LAYER_SECTIONS.map(({ formKey, outKey, title, editable }) => {
            const readSource = layerText(layers[outKey]);
            const useTextarea = editable || allLayersEditable;
            if (useTextarea) {
              return (
                <details key={formKey} open className="rounded border border-gray-200 bg-gray-50 p-2">
                  <summary className="cursor-pointer text-xs font-semibold">{title}</summary>
                  <Textarea
                    {...register(formKey, {
                      onBlur: () => {
                        onLayerBlur(formKey);
                      },
                    })}
                    className="mt-2 min-h-[80px] text-sm"
                  />
                </details>
              );
            }
            return (
              <details key={formKey} open className="rounded border border-gray-200 bg-gray-50 p-2">
                <summary className="cursor-pointer text-xs font-semibold">{title}</summary>
                <div className="mt-2 whitespace-pre-wrap rounded bg-gray-100 p-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {readSource || 'Analysing...'}
                </div>
              </details>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/** Renders a collapsible block; skeleton until the step row exists. */
function Section({ title, body, children }: { title: string; body: unknown; children: ReactNode }) {
  return (
    <details open className="mb-3 rounded border border-gray-200 bg-gray-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="mt-2 space-y-2">{body == null ? <div className="h-12 animate-pulse rounded bg-gray-200" /> : children}</div>
    </details>
  );
}
