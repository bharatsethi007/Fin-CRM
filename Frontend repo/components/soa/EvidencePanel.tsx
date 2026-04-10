import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useToast } from '../../hooks/useToast';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { SoaRiskNotesPopover } from './SoaRiskNotesPopover';
import type { AgentStepRow } from './soaAgentTypes';
import { safeArray } from './soaAgentUtils';

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type SentencePick = { sentence_key: string; sentence: string };

type Props = {
  applicationId: string;
  soaId: string;
  firmId: string;
  steps: AgentStepRow[];
  reasons: SentencePick[];
  risks: SentencePick[];
  structures: SentencePick[];
  reasonKey: string;
  riskKeys: string[];
  structureKey: string;
  onReasonSelect: (key: string) => void | Promise<void>;
  onRiskToggle: (key: string) => void | Promise<void>;
  onRiskClear: () => void | Promise<void>;
  onStructureSelect: (key: string) => void | Promise<void>;
  onRecommendedLenderChange: (value: string) => void | Promise<void>;
  /** Radix Select value: catalogue code or `__agent__`. */
  recommendedLenderValue: string;
  /** Lenders currently selected in Step 1 (drives override dropdown options). */
  selectedLenderCodes: string[];
  /** Maps lender code to display label. */
  lenderCodeToName: (code: string) => string;
  onApprove: () => void | Promise<void>;
  approving: boolean;
  compliancePct: number;
};

type PolicyChunk = { text?: string; page?: number; citation?: string; similarity?: number; is_baseline?: boolean };

type CitationItem = { source?: string; note?: string; page?: number };

const CHECK_ITEMS: { key: string; label: string }[] = [
  { key: 'three_options', label: '3 options shown' },
  { key: 'risks_documented', label: 'Risks documented' },
  { key: 'commission_disclosed', label: 'Commission disclosed' },
  { key: 'claims_cited', label: 'Claims cited' },
  { key: 'no_invented_rates', label: 'No invented rates' },
  { key: 'baseline_flagged', label: 'Baseline flagged' },
];

/** Truncates sentence labels for compact select rows. */
function sentencePreview(s: string, max = 72): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...`;
}

/** Compliance, citations, policy evidence, labelled adviser overrides, approve/regenerate. */
export function EvidencePanel({
  applicationId,
  soaId,
  firmId,
  steps,
  reasons,
  risks,
  structures,
  reasonKey,
  riskKeys,
  structureKey,
  onReasonSelect,
  onRiskToggle,
  onRiskClear,
  onStructureSelect,
  onRecommendedLenderChange,
  recommendedLenderValue,
  selectedLenderCodes,
  lenderCodeToName,
  onApprove,
  approving,
  compliancePct,
}: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const step2 = steps.find((s) => s.step_number === 2);
  const step5 = steps.find((s) => s.step_number === 5);
  const checks = (step5?.output_json as Record<string, unknown> | null) ?? {};
  const policyEvidence = (step2?.output_json?.policy_evidence as Record<string, unknown> | undefined) ?? {};
  const evidenceEntries = Object.entries(policyEvidence) as [string, unknown][];

  const allCitations = useMemo(
    () => steps.flatMap((s) => safeArray<CitationItem>(s.citations)),
    [steps],
  );

  /** Re-runs the SOA agent for this application context. */
  async function regenerateSOA() {
    if (!firmId) return;
    const res = await fetch(`${VITE_SUPABASE_URL}/functions/v1/run-soa-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ application_id: applicationId, firm_id: firmId }),
    });
    if (!res.ok) return toast.error('Failed to regenerate');
    toast.success('SOA regeneration started');
    await queryClient.invalidateQueries({ queryKey: ['soa-popup', soaId] });
    await queryClient.invalidateQueries({ queryKey: ['soa-steps-preview', soaId] });
  }

  const lenderSelectValue = recommendedLenderValue && recommendedLenderValue !== '' ? recommendedLenderValue : '__agent__';

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 dark:bg-gray-950">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Evidence Panel</h3>
      <section className="mb-4 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Compliance Checklist</p>
        {CHECK_ITEMS.map((item) => (
          <div key={item.key} className="flex gap-2 text-sm text-gray-800 dark:text-gray-200">
            <span>{checks[item.key] ? '✅' : '❌'}</span>
            <span>{item.label}</span>
          </div>
        ))}
        <p
          className={`mt-2 inline-block rounded px-2 py-0.5 text-xs ${
            compliancePct >= 80
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
              : compliancePct >= 60
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
          }`}
        >
          Compliance {compliancePct}%
        </p>
      </section>
      <section className="mb-4 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Evidence Sources</p>
        {evidenceEntries.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">No policy evidence yet.</p>
        ) : (
          evidenceEntries.map(([lenderName, chunksRaw]) => {
            const chunks = safeArray<PolicyChunk>(chunksRaw);
            return (
              <div key={lenderName} className="mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-0 last:pb-0 dark:border-gray-700">
                <strong className="text-sm text-gray-900 dark:text-gray-100">{lenderName}</strong>
                {chunks.map((chunk, i) => (
                  <div key={i} className="mt-2 text-xs">
                    <p className="flex flex-wrap items-center gap-2">
                      {chunk.similarity != null ? <span>{String(chunk.similarity)}% match</span> : null}
                      {chunk.is_baseline ? <span className="font-medium text-amber-600 dark:text-amber-400">BASELINE</span> : null}
                    </p>
                    <p className="mt-1 text-gray-800 dark:text-gray-200">{chunk.text?.slice(0, 150)}</p>
                    <small className="text-gray-500 dark:text-gray-400">{String(chunk.citation ?? '—')}</small>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </section>
      {allCitations.length > 0 ? (
        <section className="mb-4 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Citations</p>
          <ul className="list-inside list-disc text-xs text-gray-700 dark:text-gray-300">
            {allCitations.map((c, i) => (
              <li key={i}>
                {c.source ?? '—'}
                {c.page != null ? ` (p.${c.page})` : ''}
                {c.note ? ` — ${c.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-4 rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="space-y-4 border-t-0 pt-0">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Adviser overrides</h4>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Recommended lender
              <span className="ml-1.5 font-normal text-gray-500 dark:text-gray-400">Overrides agent&apos;s choice</span>
            </Label>
            <Select
              value={lenderSelectValue}
              onValueChange={(val) => void onRecommendedLenderChange(val === '__agent__' ? '' : val)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Use agent recommendation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__agent__">Use agent recommendation</SelectItem>
                {selectedLenderCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {lenderCodeToName(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">Recommendation reason</Label>
            <Select value={reasonKey || undefined} onValueChange={(v) => void onReasonSelect(v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select reason…" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((s) => (
                  <SelectItem key={s.sentence_key} value={s.sentence_key}>
                    {sentencePreview(s.sentence)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">From your Sentence Library (reason)</p>
          </div>

          <SoaRiskNotesPopover
            risks={risks}
            riskKeys={riskKeys}
            onRiskToggle={onRiskToggle}
            onRiskClear={onRiskClear}
          />

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">Loan structure</Label>
            <Select value={structureKey || undefined} onValueChange={(v) => void onStructureSelect(v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Structure template…" />
              </SelectTrigger>
              <SelectContent>
                {structures.map((s) => (
                  <SelectItem key={s.sentence_key} value={s.sentence_key}>
                    {sentencePreview(s.sentence)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">From your Sentence Library (structure)</p>
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 flex flex-wrap gap-2 bg-gray-50 pt-2 dark:bg-gray-950">
        <Button onClick={() => void onApprove()} disabled={compliancePct < 60 || approving || !soaId}>
          {approving ? 'Saving...' : `Approve SOA${compliancePct >= 60 ? '' : ` (${compliancePct}%)`}`}
        </Button>
        <Button variant="outline" onClick={() => void regenerateSOA()} disabled={!applicationId || !firmId}>
          Regenerate
        </Button>
      </div>
    </div>
  );
}
