import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { Application, Advisor, Task, Client } from '../../types';
import { CalendarWidget } from './CalendarWidget';
import { MorningBriefing } from './MorningBriefing';
import type { WidgetId } from '../../constants/dashboardWidgets';

const STAGE_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#F1F5F9', text: '#475569' },
  submitted: { bg: '#DBEAFE', text: '#2563EB' },
  conditional: { bg: '#D1FAE5', text: '#059669' },
  unconditional: { bg: '#D1FAE5', text: '#059669' },
  settled: { bg: '#EDE9FE', text: '#7C3AED' },
  declined: { bg: '#FEE2E2', text: '#DC2626' },
};

const ALL_STAGES = ['draft', 'submitted', 'conditional', 'unconditional', 'settled', 'declined'] as const;

/** Matches Tailwind `h-56` (14rem); Recharts needs a definite height, not only `height="100%"`. */
const PIPELINE_CHART_HEIGHT_PX = 224;

export interface DashboardWidgetParams {
  DS: {
    bg: string;
    card: string;
    shadow: string;
    border: string;
    accent: string;
    accent2: string;
    success: string;
    warning: string;
    danger: string;
    text: string;
    textMuted: string;
  };
  CARD_STYLE: React.CSSProperties;
  chartTextColor: string;
  chartGridColor: string;
  chartMonthCount: 6 | 12;
  setChartMonthCount: (n: 6 | 12) => void;
  loading: boolean;
  appsOverTimeData: { month: string; applications: number }[];
  stagePills: { draft: number; submitted: number; approved: number };
  activeAppsSearch: string;
  setActiveAppsSearch: (s: string) => void;
  activeAppsStageFilter: string;
  setActiveAppsStageFilter: (s: string) => void;
  setActiveAppsPage: (n: number | ((p: number) => number)) => void;
  activeApplicationsPaginated: Application[];
  activeApplicationsFiltered: Application[];
  activeAppsPage: number;
  activeAppsTotalPages: number;
  workflowKey: (a: Application) => string;
  navigateToApplication: (id: string) => void;
  setCurrentView: (view: string) => void;
  firmId: string;
  advisorId: string;
  advisor: Advisor;
  briefingRefreshKey: number;
  setBriefingRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  tasksDueTodayCount: number;
  tasksDueTodayList: Task[];
  clientNamesById: Record<string, string>;
  commissionDonutData: { name: string; value: number; fill: string }[];
  commissionExpected: number;
  commissionReceived: number;
  clawbackRiskAmt: number;
  formatCurrency: (n: number) => string;
  refixRows: {
    loan_amount: number | null;
    current_rate_expiry_date: string | null;
    lender_name: string | null;
    client_id: string | null;
  }[];
  refixDaysLeft: (expiry: string) => number;
  refixUrgentCount: number;
  bestRatesDisplay: {
    fixed1: { rate_percent: number; lender_name: string | null } | null;
    fixed2: { rate_percent: number; lender_name: string | null } | null;
    floating: { rate_percent: number; lender_name: string | null } | null;
  };
  daysInStage: (app: Application) => number;
  clients: Client[];
  navigateToClient: (clientId: string) => void;
}

function formatCurrencyLocal(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

export function renderDashboardWidget(widgetId: WidgetId, p: DashboardWidgetParams): React.ReactNode {
  const { DS, CARD_STYLE } = p;

  switch (widgetId) {
    case 'pipeline':
      return (
        <div style={CARD_STYLE}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2
              className="m-0 font-semibold uppercase tracking-wide"
              style={{ fontSize: 13, color: DS.text, letterSpacing: '0.05em' }}
            >
              Pipeline Overview
            </h2>
            <select
              value={p.chartMonthCount}
              onChange={(e) => p.setChartMonthCount(Number(e.target.value) as 6 | 12)}
              className="text-[13px] rounded-lg px-3 py-1.5"
              style={{ background: 'var(--bg-card)', border: DS.border, color: DS.text }}
            >
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
            </select>
          </div>
          <div className="h-56 w-full min-h-56">
            {p.loading ? (
              <div className="h-full w-full bg-slate-100 dark:bg-slate-700/40 rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={PIPELINE_CHART_HEIGHT_PX}>
                <LineChart data={p.appsOverTimeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={p.chartGridColor} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: p.chartTextColor }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: p.chartTextColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: DS.border,
                      boxShadow: DS.shadow,
                      fontSize: 12,
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="applications"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    dot={{ fill: 'var(--accent)', r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              { label: 'Draft', n: p.stagePills.draft, bg: '#F1F5F9', c: '#475569' },
              { label: 'Submitted', n: p.stagePills.submitted, bg: '#DBEAFE', c: '#2563EB' },
              { label: 'Approved', n: p.stagePills.approved, bg: '#D1FAE5', c: '#059669' },
            ].map((x) => (
              <span
                key={x.label}
                className="text-[12px] font-semibold px-3 py-1 rounded-full"
                style={{ background: x.bg, color: x.c }}
              >
                {x.label} {x.n}
              </span>
            ))}
          </div>
        </div>
      );

    case 'applications':
      return (
        <div style={CARD_STYLE}>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2
              className="m-0 font-semibold uppercase tracking-wide"
              style={{ fontSize: 13, color: DS.text, letterSpacing: '0.05em' }}
            >
              Active Applications
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                placeholder="Search client..."
                value={p.activeAppsSearch}
                onChange={(e) => {
                  p.setActiveAppsSearch(e.target.value);
                  p.setActiveAppsPage(1);
                }}
                className="text-[13px] rounded-xl px-3 py-2 min-w-[180px]"
                style={{ background: 'var(--bg-card)', border: DS.border, color: DS.text }}
              />
              <select
                value={p.activeAppsStageFilter}
                onChange={(e) => {
                  p.setActiveAppsStageFilter(e.target.value);
                  p.setActiveAppsPage(1);
                }}
                className="text-[13px] rounded-xl px-3 py-2"
                style={{ background: 'var(--bg-card)', border: DS.border, color: DS.text }}
              >
                <option value="all">All stages</option>
                {ALL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {p.loading ? (
            <div className="h-48 bg-slate-100 dark:bg-slate-700/40 rounded-xl animate-pulse" />
          ) : (
            <>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[13px]" style={{ color: DS.text }}>
                  <tbody>
                    {p.activeApplicationsPaginated.map((app) => {
                      const stage = p.workflowKey(app);
                      const pill = STAGE_STYLES[stage] || STAGE_STYLES.draft;
                      const initial = (app.clientName || '?').charAt(0).toUpperCase();
                      return (
                        <tr
                          key={app.id}
                          onClick={() => p.navigateToApplication(app.id)}
                          className="cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                          style={{ borderBottom: '1px solid var(--border-color)' }}
                        >
                          <td className="py-3 pr-2">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                                style={{
                                  background: 'rgba(99,102,241,0.12)',
                                  color: DS.accent,
                                }}
                              >
                                {initial}
                              </div>
                              <span className="font-medium truncate max-w-[140px]">{app.clientName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 whitespace-nowrap font-medium">
                            {app.loanAmount ? formatCurrencyLocal(app.loanAmount) : '—'}
                          </td>
                          <td className="py-3 px-2">
                            <span
                              className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                              style={{ background: pill.bg, color: pill.text }}
                            >
                              {stage.charAt(0).toUpperCase() + stage.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 pl-2 text-right whitespace-nowrap">
                            <span
                              className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                              style={{ background: 'var(--accent-soft)', color: DS.textMuted }}
                            >
                              {p.daysInStage(app)}d
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {p.activeApplicationsFiltered.length === 0 && (
                <p className="text-center py-8" style={{ color: DS.textMuted, fontSize: 13 }}>
                  No active applications.
                </p>
              )}
              {p.activeAppsTotalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-2">
                  <span style={{ fontSize: 12, color: DS.textMuted }}>
                    Page {p.activeAppsPage} of {p.activeAppsTotalPages} ({p.activeApplicationsFiltered.length} total)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => p.setActiveAppsPage((x) => Math.max(1, x - 1))}
                      disabled={p.activeAppsPage <= 1}
                      className="text-[13px] px-3 py-1.5 rounded-lg disabled:opacity-40"
                      style={{ border: DS.border, background: DS.card }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => p.setActiveAppsPage((x) => Math.min(p.activeAppsTotalPages, x + 1))}
                      disabled={p.activeAppsPage >= p.activeAppsTotalPages}
                      className="text-[13px] px-3 py-1.5 rounded-lg disabled:opacity-40"
                      style={{ border: DS.border, background: DS.card }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => p.setCurrentView('applications')}
                className="mt-4 text-[13px] font-semibold w-full text-left bg-transparent border-none cursor-pointer hover:underline p-0"
                style={{ color: DS.accent }}
              >
                View all →
              </button>
            </>
          )}
        </div>
      );

    case 'insights':
      return (
        <div style={CARD_STYLE} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2
              className="m-0 font-semibold uppercase tracking-wide"
              style={{ fontSize: 13, color: DS.text, letterSpacing: '0.05em' }}
            >
              AI Insights
            </h2>
            <button
              type="button"
              onClick={() => p.setBriefingRefreshKey((k) => k + 1)}
              className="text-[12px] font-semibold px-3 py-1 rounded-lg"
              style={{ border: DS.border, background: DS.bg, color: DS.accent }}
            >
              Refresh
            </button>
          </div>
          <div className="-mx-2">
            <MorningBriefing key={p.briefingRefreshKey} firmId={p.firmId} advisorId={p.advisorId} />
          </div>
        </div>
      );

    case 'tasks':
      return (
        <div style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="m-0 font-semibold uppercase tracking-wide"
              style={{ fontSize: 13, color: DS.text, letterSpacing: '0.05em' }}
            >
              Due Today
            </h2>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: DS.accent }}
            >
              {p.loading ? '—' : p.tasksDueTodayCount}
            </span>
          </div>
          {p.loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : p.tasksDueTodayList.length === 0 ? (
            <p style={{ fontSize: 13, color: DS.textMuted }}>Nothing due today.</p>
          ) : (
            <ul className="space-y-0 m-0 p-0 list-none">
              {p.tasksDueTodayList.map((task) => (
                <li
                  key={task.id}
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                  className="last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => p.setCurrentView('tasks')}
                    className="w-full text-left flex items-center gap-3 py-3 bg-transparent border-none cursor-pointer"
                  >
                    <span
                      className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: 'var(--border-color)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="m-0 text-[13px] font-semibold truncate" style={{ color: DS.text }}>
                        {task.taskType === 'compliance' ? '⚡ ' : ''}
                        {task.title}
                      </p>
                      <p className="m-0 text-[12px] truncate" style={{ color: DS.textMuted }}>
                        {task.clientId ? p.clientNamesById[task.clientId] || '—' : '—'}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
                      style={{
                        background:
                          task.priority === 'High'
                            ? 'rgba(239,68,68,0.12)'
                            : task.priority === 'Medium'
                              ? 'rgba(245,158,11,0.15)'
                              : 'rgba(100,116,139,0.12)',
                        color:
                          task.priority === 'High'
                            ? DS.danger
                            : task.priority === 'Medium'
                              ? DS.warning
                              : DS.textMuted,
                      }}
                    >
                      {task.priority}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => p.setCurrentView('tasks')}
            className="mt-3 text-[13px] font-semibold w-full text-left bg-transparent border-none cursor-pointer hover:underline p-0"
            style={{ color: DS.accent }}
          >
            View all tasks →
          </button>
        </div>
      );

    case 'calendar':
      return (
        <CalendarWidget userId={p.advisor.id} firmId={p.advisor.firmId} setCurrentView={p.setCurrentView} />
      );

    case 'rates':
      return (
        <div style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="m-0 font-semibold uppercase tracking-wide"
              style={{ fontSize: 13, color: DS.text, letterSpacing: '0.05em' }}
            >
              Best Rates Now
            </h2>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: DS.accent }}>
              Updated today
            </span>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ color: DS.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th className="text-left font-semibold pb-2">Term</th>
                <th className="text-left font-semibold pb-2">Best Rate</th>
                <th className="text-left font-semibold pb-2">Lender</th>
              </tr>
            </thead>
            <tbody>
              {[
                { term: '1yr fixed', row: p.bestRatesDisplay.fixed1, key: '1yr' },
                { term: '2yr fixed', row: p.bestRatesDisplay.fixed2, key: '2yr' },
                { term: 'Floating', row: p.bestRatesDisplay.floating, key: 'fl' },
              ].map((r, i) => (
                <tr
                  key={r.key}
                  className="border-t"
                  style={
                    i === 1
                      ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', borderColor: 'var(--border-color)' }
                      : { borderColor: 'var(--border-color)' }
                  }
                >
                  <td className="py-2.5 font-medium">{r.term}</td>
                  <td className="py-2.5 font-bold" style={{ color: DS.text }}>
                    {r.row ? `${r.row.rate_percent?.toFixed(2)}%` : '—'}
                  </td>
                  <td className="py-2.5" style={{ color: DS.textMuted }}>
                    {r.row?.lender_name || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'commission':
      return (
        <div style={CARD_STYLE}>
          <h2
            className="m-0 font-semibold uppercase tracking-wide mb-2"
            style={{ fontSize: 13, color: DS.text, letterSpacing: '0.05em' }}
          >
            Commission This Month
          </h2>
          <div className="h-44 w-full flex items-center justify-center">
            {p.loading ? (
              <div className="h-36 w-36 rounded-full bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
            ) : p.commissionDonutData.length === 0 ? (
              <p style={{ fontSize: 13, color: DS.textMuted }}>No commission data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={p.commissionDonutData} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2}>
                    {p.commissionDonutData.map((entry, index) => (
                      <Cell key={`c-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => p.formatCurrency(v)}
                    contentStyle={{
                      borderRadius: 12,
                      border: DS.border,
                      boxShadow: DS.shadow,
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-1 mt-2 text-[13px]" style={{ color: DS.text }}>
            <div className="flex justify-between">
              <span style={{ color: DS.textMuted }}>Expected</span>
              <span className="font-semibold">{p.loading ? '—' : p.formatCurrency(p.commissionExpected)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: DS.textMuted }}>Received</span>
              <span className="font-semibold">{p.loading ? '—' : p.formatCurrency(p.commissionReceived)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: DS.textMuted }}>Clawback risk</span>
              <span className="font-semibold" style={{ color: DS.danger }}>
                {p.loading ? '—' : p.formatCurrency(p.clawbackRiskAmt)}
              </span>
            </div>
          </div>
        </div>
      );

    case 'refix':
      return (
        <div style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="m-0 font-semibold uppercase tracking-wide"
              style={{ fontSize: 13, color: DS.text, letterSpacing: '0.05em' }}
            >
              Rate Refixes
            </h2>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: DS.danger }}
            >
              {p.refixUrgentCount} urgent
            </span>
          </div>
          {p.loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : p.refixRows.length === 0 ? (
            <p style={{ fontSize: 13, color: DS.textMuted }}>No refix windows in the next 90 days.</p>
          ) : (
            <ul className="m-0 p-0 list-none space-y-0 max-h-[200px] overflow-y-auto">
              {p.refixRows.slice(0, 6).map((row, idx) => {
                const exp = row.current_rate_expiry_date;
                const days = exp ? p.refixDaysLeft(exp) : 0;
                const badgeBg =
                  days < 30 ? 'rgba(239,68,68,0.15)' : days <= 60 ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.12)';
                const badgeColor = days < 30 ? DS.danger : days <= 60 ? DS.warning : '#2563EB';
                const cname = row.client_id ? p.clientNamesById[row.client_id] || '—' : '—';
                return (
                  <li
                    key={`${row.client_id}-${idx}`}
                    className="flex items-center justify-between gap-2 py-2.5"
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                  >
                    <div className="min-w-0">
                      <p className="m-0 text-[13px] font-semibold truncate">{cname}</p>
                      <p className="m-0 text-[11px]" style={{ color: DS.textMuted }}>
                        {exp ? new Date(exp).toLocaleDateString('en-NZ') : '—'}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: badgeBg, color: badgeColor }}>
                      {days}d
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => p.setCurrentView('clients')}
            className="mt-4 w-full text-[13px] font-semibold py-2 rounded-xl text-white border-none cursor-pointer"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-end))' }}
          >
            Draft refix emails →
          </button>
        </div>
      );

    case 'leads': {
      const recentClients = (p.clients || [])
        .filter((c) => c.createdAt)
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 6);
      return (
        <div style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="m-0 font-semibold uppercase tracking-wide"
              style={{ fontSize: 13, color: DS.text, letterSpacing: '0.05em' }}
            >
              Recent Leads
            </h2>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: DS.accent }}
            >
              {recentClients.length}
            </span>
          </div>
          {p.loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentClients.length === 0 ? (
            <p style={{ fontSize: 13, color: DS.textMuted }}>No recent leads.</p>
          ) : (
            <ul className="m-0 p-0 list-none space-y-0">
              {recentClients.map((c) => (
                <li
                  key={c.id}
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                  className="last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => p.navigateToClient(c.id)}
                    className="w-full text-left flex items-center gap-3 py-2.5 bg-transparent border-none cursor-pointer"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: 'rgba(99,102,241,0.12)', color: DS.accent }}
                    >
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[13px] font-semibold truncate" style={{ color: DS.text }}>
                        {c.name}
                      </p>
                      <p className="m-0 text-[11px]" style={{ color: DS.textMuted }}>
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-NZ') : '—'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => p.setCurrentView('leads')}
            className="mt-3 text-[13px] font-semibold w-full text-left bg-transparent border-none cursor-pointer hover:underline p-0"
            style={{ color: DS.accent }}
          >
            View all leads →
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}
