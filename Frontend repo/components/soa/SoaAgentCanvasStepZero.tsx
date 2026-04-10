import { useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { SoaClientDnaView } from './soaClientDnaTypes';
import { SoaClientDnaPanel } from './SoaClientDnaPanel';

type Props = {
  dna: SoaClientDnaView | null;
  dnaUpdatedAt?: string | null;
  dnaLoading?: boolean;
};

/** Formats age since DNA analysis was stored (compact, for sidebar). */
function formatDnaAge(iso: string | null | undefined): string {
  if (!iso) return '';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

/** Step 0 — Client DNA status card above agent steps (Agent Canvas). */
export function SoaAgentCanvasStepZero({ dna, dnaUpdatedAt, dnaLoading = false }: Props) {
  const [showDnaDetails, setShowDnaDetails] = useState(false);
  const dnaTime = formatDnaAge(dnaUpdatedAt ?? null);
  const riskCount = Array.isArray(dna?.key_risks_top5) ? dna.key_risks_top5.length : 0;
  const stabilityPct = Math.round((Number(dna?.income_stability_score) || 0) * 100);

  return (
    <div className="mb-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-slate-200">Client DNA Analysis</h4>
        <Badge className={dna ? 'border-0 bg-emerald-900 text-emerald-300' : 'border-0 bg-amber-900 text-amber-300'}>
          {dna ? 'COMPLETE' : 'BASELINE'}
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {dna ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
            <span className="text-slate-300">{dnaTime ? `Done ${dnaTime}` : 'Done'}</span>
          </>
        ) : (
          <>
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
            <span className="text-slate-400">{dnaLoading ? 'Loading analysis…' : 'Waiting for analysis'}</span>
          </>
        )}
      </div>
      <p className="mt-1 text-xs leading-snug text-slate-400">
        {dnaLoading && !dna
          ? 'Loading Client DNA from application…'
          : dna
            ? `Risk: ${dna.risk_tier ?? '—'}. ${riskCount} risks. Income stability ${stabilityPct}%`
            : 'Waiting for analysis'}
      </p>
      {dna ? (
        <button
          type="button"
          onClick={() => setShowDnaDetails((v) => !v)}
          className="mt-1.5 text-xs text-violet-400 hover:underline"
        >
          {showDnaDetails ? 'Hide details' : 'Details'}
        </button>
      ) : null}
      {dna && showDnaDetails ? (
        <div className="mt-2 border-t border-slate-700 pt-2">
          <SoaClientDnaPanel dna={dna} className="mb-0" />
        </div>
      ) : null}
    </div>
  );
}
