import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import type { SoaLenderOption } from './soaLenderCatalog';

type Props = {
  allLenders: SoaLenderOption[];
  agentShortlistCodes: string[];
  selectedLenders: string[];
  onSelectedChange: (codes: string[]) => void;
  needsRecalc: boolean;
  onMarkNeedsRecalc: () => void;
  onRecalcCosts: () => void | Promise<void>;
  recalculating?: boolean;
};

/** Interactive Step 1 lender checkboxes with agent vs adviser-added badges. */
export function SoaStep1LenderGrid({
  allLenders,
  agentShortlistCodes,
  selectedLenders,
  onSelectedChange,
  needsRecalc,
  onMarkNeedsRecalc,
  onRecalcCosts,
  recalculating = false,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Lender selection</h4>
        <span className="text-xs text-gray-500 dark:text-gray-400">{selectedLenders.length} selected</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {allLenders.map((lender) => {
          const isAgentSuggested = agentShortlistCodes.includes(lender.code);
          const isSelected = selectedLenders.includes(lender.code);
          const isFiltered = !isAgentSuggested;

          return (
            <label
              key={lender.code}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                isSelected
                  ? 'border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40'
                  : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800'
              }`}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    onSelectedChange([...selectedLenders, lender.code]);
                  } else {
                    onSelectedChange(selectedLenders.filter((c) => c !== lender.code));
                  }
                  onMarkNeedsRecalc();
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{lender.name}</span>
                  {isAgentSuggested ? (
                    <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Agent
                    </span>
                  ) : null}
                  {isFiltered && isSelected ? (
                    <span className="inline-flex h-5 items-center rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                      Added
                    </span>
                  ) : null}
                </div>
                {lender.reason ? (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{lender.reason}</p>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>

      {needsRecalc ? (
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={recalculating || selectedLenders.length === 0}
          onClick={() => void onRecalcCosts()}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${recalculating ? 'animate-spin' : ''}`} aria-hidden />
          Recalculate with {selectedLenders.length} lenders
        </Button>
      ) : null}
    </div>
  );
}
