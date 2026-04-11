import React from 'react';
import { AlertTriangle, Briefcase, CheckCircle, Users } from 'lucide-react';
import type { Advisor, Application } from '../../../types';
import { ApplicationStatus } from '../../../types';

export interface DashboardKpiDeckProps {
  loading: boolean;
  pipeline: {
    activeCount: number;
    targetCount: number;
    sparkline7: number[];
    onDrill: () => void;
  };
  settled: {
    dealsCount: number;
    percentOfValueTarget: number;
    targetAmount: number;
    sparkline30: number[];
    formatCurrency: (n: number) => string;
    onDrill: () => void;
  };
  atRisk: {
    sumGross: number;
    rowCount: number;
    formatCurrency: (n: number) => string;
    onDrill: () => void;
  };
  /** Omitted or null hides the Team capacity card (e.g. firm adviser count under 5). */
  teamCapacity?: {
    activeAdvisers: number;
    totalAdvisers: number;
    onDrill: () => void;
  } | null;
}

const SPARK_W = 80;
const SPARK_H = 40;

/** True when a sparkline series is empty or visually flat (no trend). */
function isSparklineFlat(values: number[]): boolean {
  if (!values.length) return true;
  const first = values[0];
  return values.every((v) => v === first);
}

/** Spec sparkline: 80×40 SVG, slate-900 stroke, subtle fill, end dot. */
function MiniSparkline({ values }: { values: number[] }) {
  const padX = 2;
  const padY = 4;
  if (!values.length) {
    return (
      <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} aria-hidden>
        <line x1={0} y1={SPARK_H / 2} x2={SPARK_W} y2={SPARK_H / 2} stroke="#e2e8f0" strokeWidth={1} />
      </svg>
    );
  }
  const n = values.length;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = max - min || 1;
  const coords = values.map((v, i) => {
    const x = n === 1 ? SPARK_W / 2 : padX + (i / (n - 1)) * (SPARK_W - 2 * padX);
    const t = (v - min) / span;
    const y = SPARK_H - padY - t * (SPARK_H - 2 * padY);
    return { x, y };
  });
  const lineCoords =
    n === 1
      ? [
          { x: padX, y: coords[0]!.y },
          { x: SPARK_W - padX, y: coords[0]!.y },
        ]
      : coords;
  const lineD = lineCoords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const first = lineCoords[0]!;
  const last = lineCoords[lineCoords.length - 1]!;
  const areaD = `${lineD} L ${last.x} ${SPARK_H} L ${first.x} ${SPARK_H} Z`;
  const dot = coords[coords.length - 1]!;

  return (
    <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} aria-hidden>
      <path d={areaD} fill="rgba(15,23,42,0.05)" />
      <path d={lineD} fill="none" stroke="#0F172A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={dot.x} cy={dot.y} r={2} fill="#0F172A" />
    </svg>
  );
}

const KPI_CARD =
  'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900';
const KPI_LINK =
  'w-fit rounded-md text-[24px] font-semibold tabular-nums text-slate-900 underline decoration-slate-300 decoration-1 underline-offset-2 outline-none transition hover:decoration-slate-500 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 dark:text-slate-100 dark:decoration-slate-600 dark:focus-visible:ring-slate-100';

/** Firm KPI strip: pipeline, settled, clawback at-risk, optional team capacity. */
export function KPICards({ loading, pipeline, settled, atRisk, teamCapacity }: DashboardKpiDeckProps) {
  const atRiskLinkTone =
    atRisk.sumGross > 0 ? 'text-[24px] font-semibold text-amber-700' : 'text-[24px] font-semibold text-slate-900 dark:text-slate-100';

  const capPct =
    teamCapacity && teamCapacity.totalAdvisers > 0
      ? Math.min(100, Math.round((teamCapacity.activeAdvisers / teamCapacity.totalAdvisers) * 100))
      : 0;

  const stopNav = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const gridCols =
    teamCapacity == null ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className={`grid grid-cols-1 gap-4 px-4 py-2 font-sans sm:px-6 ${gridCols}`}>
      <div className={KPI_CARD}>
        <Briefcase size={16} className="text-slate-400" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Pipeline
        </span>
        {loading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        ) : (
          <a
            href="#"
            onClick={(e) => {
              stopNav(e);
              pipeline.onDrill();
            }}
            className={KPI_LINK}
          >
            {pipeline.activeCount}
          </a>
        )}
        <span className="text-[13px] text-slate-400 dark:text-slate-500">of {pipeline.targetCount} target</span>
        {!loading &&
          (isSparklineFlat(pipeline.sparkline7) ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">No trend data</p>
          ) : (
            <MiniSparkline values={pipeline.sparkline7} />
          ))}
      </div>

      <div className={KPI_CARD}>
        <CheckCircle size={16} className="text-slate-400" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Settled this month
        </span>
        {loading ? (
          <div className="h-10 w-full max-w-[220px] animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        ) : (
          <p className="text-[14px] leading-[20px] text-slate-900 dark:text-slate-100">
            <a
              href="#"
              onClick={(e) => {
                stopNav(e);
                settled.onDrill();
              }}
              className={KPI_LINK}
            >
              {settled.dealsCount}
            </a>
            <span className="font-normal text-slate-700 dark:text-slate-300">
              {' '}
              deals · {settled.percentOfValueTarget}% of {settled.formatCurrency(settled.targetAmount)} target
            </span>
          </p>
        )}
        {!loading &&
          (isSparklineFlat(settled.sparkline30) ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">No trend data</p>
          ) : (
            <MiniSparkline values={settled.sparkline30} />
          ))}
      </div>

      <div className={KPI_CARD}>
        <AlertTriangle size={16} className="text-amber-500" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          At risk (clawback)
        </span>
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        ) : (
          <a
            href="#"
            onClick={(e) => {
              stopNav(e);
              atRisk.onDrill();
            }}
            className={`${atRiskLinkTone} ${KPI_LINK}`}
          >
            {atRisk.formatCurrency(atRisk.sumGross)}
          </a>
        )}
        <span className="text-[13px] text-slate-400 dark:text-slate-500">
          {loading
            ? '—'
            : `${atRisk.rowCount} commission row${atRisk.rowCount === 1 ? '' : 's'} · clawback_risk_until within 30 days`}
        </span>
      </div>

      {teamCapacity != null && (
        <div className={KPI_CARD}>
          <Users size={16} className="text-slate-400" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Team capacity
          </span>
          {loading ? (
            <div className="h-8 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          ) : (
            <>
              <p className="text-[14px] leading-[20px] text-slate-900 dark:text-slate-100">
                <a
                  href="#"
                  onClick={(e) => {
                    stopNav(e);
                    teamCapacity.onDrill();
                  }}
                  className={KPI_LINK}
                >
                  {teamCapacity.activeAdvisers}/{teamCapacity.totalAdvisers}
                </a>
                <span className="font-normal text-slate-700 dark:text-slate-300"> advisers active</span>
              </p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-slate-900 dark:bg-slate-100" style={{ width: `${capPct}%` }} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Last N calendar day keys `YYYY-MM-DD` ending today (local). */
function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  const t = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

/** Counts non-terminal applications touched per calendar day (by `lastUpdated`) for sparklines. */
export function sparklineActiveTouchesByDay(apps: Application[], dayCount: number): number[] {
  const out = Array.from({ length: dayCount }, () => 0);
  const keys = lastNDayKeys(dayCount);
  for (const a of apps) {
    if (a.status === ApplicationStatus.Settled || a.status === ApplicationStatus.Declined) continue;
    const lu = a.lastUpdated?.slice(0, 10);
    if (!lu) continue;
    const idx = keys.indexOf(lu);
    if (idx >= 0) out[idx] += 1;
  }
  return out;
}

/** Counts settled applications per calendar day (`lastUpdated`) for the last N days. */
export function sparklineSettledDealsByDay(apps: Application[], dayCount: number): number[] {
  const out = Array.from({ length: dayCount }, () => 0);
  const keys = lastNDayKeys(dayCount);
  for (const a of apps) {
    if (a.status !== ApplicationStatus.Settled) continue;
    const lu = a.lastUpdated?.slice(0, 10);
    if (!lu) continue;
    const idx = keys.indexOf(lu);
    if (idx >= 0) out[idx] += 1;
  }
  return out;
}

/** Active vs total advisers when `firm_users` is missing (brokers carrying live deals vs firm brokers). */
export function teamCapacityFromAdvisorsAndApps(
  apps: Application[],
  advisorMembers: Advisor[],
  firmId: string,
): { active: number; total: number } {
  const firmApps = apps.filter((a) => a.firmId === firmId);
  const firmTeam = advisorMembers.filter((a) => a.firmId === firmId);
  const brokers = firmTeam.filter((a) => a.role === 'broker');
  const pool = brokers.length > 0 ? brokers : firmTeam;
  if (pool.length === 0) {
    return { active: 0, total: 0 };
  }
  const activeIds = new Set(
    firmApps
      .filter((a) => a.status !== ApplicationStatus.Settled && a.status !== ApplicationStatus.Declined)
      .map((a) => a.advisorId)
      .filter(Boolean),
  );
  const active = pool.filter((m) => activeIds.has(m.id)).length;
  return { active, total: pool.length };
}
