import { AlertTriangle } from 'lucide-react';
import { cn } from '../../src/lib/utils';
import { Badge } from '../ui/badge';
import type { SoaClientDnaView } from './soaClientDnaTypes';

type Props = { dna: SoaClientDnaView | null; className?: string };

/** Compact Client DNA summary for the SOA workspace (leverage grid + top risks). */
export function SoaClientDnaPanel({ dna, className }: Props) {
  if (!dna) return null;

  const tier = String(dna.risk_tier ?? '').toLowerCase();
  const badgeClass =
    tier === 'low'
      ? 'border-0 bg-emerald-900/50 text-emerald-300'
      : tier === 'moderate'
        ? 'border-0 bg-amber-900/50 text-amber-300'
        : 'border-0 bg-red-900/50 text-red-300';

  const lm = dna.leverage_metrics ?? {};
  const lvr = typeof lm.lvr_percent === 'number' ? lm.lvr_percent : null;
  const dti = typeof lm.dti_ratio === 'number' ? lm.dti_ratio : null;
  const umi2 = typeof lm.umi_plus2 === 'number' ? lm.umi_plus2 : null;
  const cash = typeof lm.cash_post_settlement === 'number' ? lm.cash_post_settlement : null;

  const metrics: { label: string; value: string; alert: boolean }[] = [
    { label: 'LVR', value: lvr != null ? `${lvr}%` : '—', alert: lvr != null && lvr > 90 },
    { label: 'DTI', value: dti != null ? `${dti}x` : '—', alert: dti != null && dti > 6 },
    { label: 'UMI+2%', value: umi2 != null ? `$${umi2}` : '—', alert: umi2 != null && umi2 < 0 },
    {
      label: 'Cash left',
      value: cash != null && Number.isFinite(cash) ? `$${(cash / 1000).toFixed(0)}k` : '—',
      alert: cash != null && cash < 5000,
    },
  ];

  const risks = Array.isArray(dna.key_risks_top5) ? dna.key_risks_top5 : [];
  const propRisks = Array.isArray(dna.property_risks) ? dna.property_risks : [];

  return (
    <div className={cn('mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Client DNA</h4>
        <div className="flex gap-1.5">
          {dna.risk_tier ? (
            <Badge variant="secondary" className={badgeClass}>
              {dna.risk_tier}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="rounded bg-slate-800/50 p-1.5">
            <div className="text-xs text-slate-400">{m.label}</div>
            <div className={`text-sm font-medium ${m.alert ? 'text-amber-400' : 'text-white'}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {risks.slice(0, 3).map((risk, i) => (
          <div key={i} className="flex gap-1.5 text-xs">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-500" aria-hidden />
            <span className="leading-snug text-slate-200">{risk}</span>
          </div>
        ))}
      </div>

      {propRisks.length > 0 ? (
        <div className="mt-2 border-t border-slate-800 pt-2">
          <div className="mb-1 text-xs text-slate-400">Property</div>
          <div className="text-xs text-amber-300">{propRisks[0]}</div>
        </div>
      ) : null}
    </div>
  );
}
