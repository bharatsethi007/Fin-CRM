import { AlertTriangle } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { AgentStepRow } from './soaAgentTypes';
import {
  chunksForPolicyLender,
  policyEvidenceHasData,
  policyStepLenderRows,
} from './soaPolicyEvidenceUtils';

type Props = {
  step2: AgentStepRow | undefined;
  policyEvidence: Record<string, unknown>;
  selectedLenderCodes: string[];
  shortlistedNames: string[];
};

/** Step 2 — Policy evidence block between Step 1 and Step 3 in the SOA middle column. */
export function SoaMiddlePanelStepTwoPolicy({
  step2,
  policyEvidence,
  selectedLenderCodes,
  shortlistedNames,
}: Props) {
  const hasData = policyEvidenceHasData(policyEvidence);
  const statusLabel = hasData ? 'Retrieved' : 'BASELINE';
  let lenderRows = policyStepLenderRows(selectedLenderCodes, shortlistedNames);
  if (hasData && lenderRows.length === 0) {
    lenderRows = Object.keys(policyEvidence).map((k) => ({ code: k, label: k }));
  }

  return (
    <details
      open
      className="mb-3 rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
        <span>▼ Step 2 — Policy Evidence</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{statusLabel}</span>
      </summary>
      <div className="border-t border-gray-200 px-4 pb-4 dark:border-gray-600">
        <div className="pt-3">
          {step2 == null ? (
            <div className="h-12 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          ) : !hasData ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">No Knowledge Bank loaded</p>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">
                    Using RBNZ BS19 baseline rules. Upload bank policy PDFs to enable real policy retrieval with page
                    citations.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {lenderRows.map(({ code, label }) => {
                const allChunks = chunksForPolicyLender(policyEvidence, code, label);
                const evs = allChunks.slice(0, 2);
                const sourceCount = allChunks.length;
                return (
                  <div key={`${code}-${label}`} className="rounded-lg border border-gray-200 p-2.5 dark:border-gray-600">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
                      <Badge variant="outline" className="text-xs font-normal">
                        {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {evs.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">No chunks for this lender.</p>
                      ) : (
                        evs.map((ev, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-violet-600 dark:text-violet-400">
                              {ev.source} p.{ev.page}:
                            </span>
                            <span className="ml-1.5 text-slate-600 dark:text-slate-400">{ev.excerpt}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-600">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Policy checks: LVR limits, DTI caps, income types, property restrictions, documentation
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}
