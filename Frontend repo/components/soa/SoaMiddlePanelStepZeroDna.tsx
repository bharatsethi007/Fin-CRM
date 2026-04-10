import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { supabase } from '../../src/lib/supabase';
import { logger } from '../../utils/logger';
import { SITUATION_OPTIONS } from './soaDnaSituations';
import type { SoaClientDnaView } from './soaClientDnaTypes';
import {
  SoaStepZeroApplicationProperties,
  type SoaApplicationPropertyRow,
} from './SoaStepZeroApplicationProperties';

type Props = {
  dna: SoaClientDnaView | null;
  onRunDna: () => void | Promise<void>;
  runningDna: boolean;
  selectedSituations?: string[];
  onSelectedSituationsChange?: Dispatch<SetStateAction<string[]>>;
  /** Application / deal id — loads `application_properties` for live property cards. */
  applicationId?: string;
};

/** Checkbox grid mapping selected situation ids into the analyze-client-dna request body. */
function DnaSituationsSelector({
  selectedSituations,
  onSelectedSituationsChange,
}: {
  selectedSituations: string[];
  onSelectedSituationsChange: Dispatch<SetStateAction<string[]>>;
}) {
  return (
    <div className="mt-4 rounded bg-slate-100 p-3 dark:bg-slate-800">
      <label className="mb-2 block text-xs text-slate-600 dark:text-slate-400">
        Add client situations (optional)
      </label>
      <div className="grid grid-cols-2 gap-2">
        {SITUATION_OPTIONS.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selectedSituations.includes(s.id)}
              onChange={(e) => {
                onSelectedSituationsChange((prev) =>
                  e.target.checked
                    ? prev.includes(s.id)
                      ? prev
                      : [...prev, s.id]
                    : prev.filter((x) => x !== s.id),
                );
              }}
              className="rounded border-slate-400"
            />
            <span className="text-slate-800 dark:text-slate-200">{s.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Step 0 — Client DNA collapsible block for the SOA middle column. */
export function SoaMiddlePanelStepZeroDna({
  dna,
  onRunDna,
  runningDna,
  selectedSituations = [],
  onSelectedSituationsChange,
  applicationId,
}: Props) {
  const [applicationProperties, setApplicationProperties] = useState<SoaApplicationPropertyRow[]>([]);

  useEffect(() => {
    const id = applicationId?.trim();
    if (!id) {
      setApplicationProperties([]);
      return;
    }
    void supabase
      .from('application_properties')
      .select('id, address_full, address_normalized, title_number, legal_description, estate_type, land_area_m2')
      .eq('application_id', id)
      .then(({ data, error }) => {
        if (error) {
          logger.log('SoaMiddlePanelStepZeroDna: application_properties load failed', error.message);
          setApplicationProperties([]);
          return;
        }
        setApplicationProperties((data as SoaApplicationPropertyRow[]) ?? []);
      });
  }, [applicationId]);

  const tier = String(dna?.risk_tier ?? '').toLowerCase();
  const bannerClass =
    tier === 'low'
      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
      : tier === 'moderate'
        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
        : 'border-red-500 bg-red-50 dark:bg-red-950/30';

  const stabilityPct = Math.round(Number(dna?.income_stability_score ?? 0) * 100);
  const lm = dna?.leverage_metrics ?? {};
  const lvr = lm.lvr_percent;
  const dti = lm.dti_ratio;
  const lti = lm.lti_ratio;
  const dta = lm.debt_to_assets;
  const umi2 = lm.umi_plus2;
  const cash = lm.cash_post_settlement;

  const leverageEntries: [string, string][] = [
    ['LVR', lvr != null ? `${lvr}%` : '—'],
    ['DTI', dti != null ? `${dti}x` : '—'],
    ['LTI', lti != null ? `${lti}x` : '—'],
    ['Debt/Assets', `${Math.round(Number(dta ?? 0) * 100)}%`],
    ['UMI +2%', umi2 != null ? `$${umi2}` : '—'],
    ['Cash left', `$${Math.round(Number(cash ?? 0) / 1000)}k`],
  ];

  const risks = Array.isArray(dna?.key_risks_top5) ? dna.key_risks_top5 : [];
  const strengths = Array.isArray(dna?.strengths) ? dna.strengths : [];

  return (
    <details
      open
      className="mb-3 rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
        <span>▼ Step 0 — Client DNA Analysis</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{dna ? 'Complete' : 'Pending'}</span>
      </summary>
      <div className="border-t border-gray-200 px-4 pb-4 dark:border-gray-600">
        {!dna ? (
          <div className="py-6 text-center">
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Run DNA analysis to assess full application risk
            </p>
            {onSelectedSituationsChange ? (
              <DnaSituationsSelector
                selectedSituations={selectedSituations}
                onSelectedSituationsChange={onSelectedSituationsChange}
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              className="mt-4"
              onClick={() => void onRunDna()}
              disabled={runningDna}
            >
              {runningDna ? 'Analyzing...' : 'Analyze Client'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pt-3">
            <div className={`rounded-lg border-l-4 p-3 ${bannerClass}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Overall Risk
                  </p>
                  <p className="mt-0.5 text-lg font-semibold capitalize text-gray-900 dark:text-gray-100">
                    {dna.risk_tier ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-600 dark:text-slate-400">Income Stability</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stabilityPct}%</p>
                </div>
              </div>
              {dna.underwriting_summary ? (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{dna.underwriting_summary}</p>
              ) : null}
            </div>

            <div>
              <h5 className="mb-2 text-xs font-semibold text-gray-900 dark:text-gray-100">Leverage & Ratios</h5>
              <div className="grid grid-cols-3 gap-2">
                {leverageEntries.map(([k, v]) => (
                  <div key={k} className="rounded bg-slate-50 p-2 dark:bg-gray-800/80">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{k}</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h5 className="mb-2 text-xs font-semibold text-gray-900 dark:text-gray-100">Key Risks Identified</h5>
              <div className="space-y-1.5">
                {risks.map((risk, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="font-medium text-amber-600 dark:text-amber-400">{i + 1}.</span>
                    <span className="text-slate-700 dark:text-slate-300">{risk}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h5 className="mb-2 text-xs font-semibold text-gray-900 dark:text-gray-100">Property details</h5>
              <SoaStepZeroApplicationProperties properties={applicationProperties} />
            </div>

            {strengths.length > 0 ? (
              <div>
                <h5 className="mb-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Strengths</h5>
                <div className="flex flex-wrap gap-1.5">
                  {strengths.map((s, i) => (
                    <Badge key={i} variant="secondary" className="border-0 bg-emerald-50 text-xs text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {onSelectedSituationsChange ? (
              <DnaSituationsSelector
                selectedSituations={selectedSituations}
                onSelectedSituationsChange={onSelectedSituationsChange}
              />
            ) : null}

            <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={() => void onRunDna()} disabled={runningDna}>
              {runningDna ? 'Re-analyzing...' : 'Re-run DNA analysis'}
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
