import { logger } from '../../utils/logger';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { crmService } from '../../services/api';
import { supabase } from '../../services/supabaseClient';
import { renderDashboardWidget, type DashboardWidgetParams } from '../dashboard/dashboardWidgetRender';
import type { WidgetId } from '../../constants/dashboardWidgets';
import type { Application, Advisor, Task, Client, Note } from '../../types';
import { ApplicationStatus } from '../../types';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { FirmDashboardPage } from '@/app/dashboard/page';
import type { FlowBriefingMetric } from '@/components/dashboard/FlowBriefing';
import {
  sparklineActiveTouchesByDay,
  sparklineSettledDealsByDay,
  teamCapacityFromAdvisorsAndApps,
  type DashboardKpiDeckProps,
} from '@/components/dashboard/KPICards';
import { type ApplicationRow } from '@/components/dashboard/PriorityQueue';
import {
  stashApplicationsListPreset,
  stashCommissionListPreset,
  type AppListPreset,
  type CommissionListPreset,
} from '@/constants/dashboardDrill';

/** Design tokens — src/index.css */
const DS = {
  bg: 'var(--bg-primary)',
  card: 'var(--bg-card)',
  shadow: 'var(--shadow-card)',
  border: '1px solid var(--border-color)',
  accent: 'var(--accent)',
  accent2: 'var(--accent-end)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  text: 'var(--text-primary)',
  textMuted: 'var(--text-secondary)',
} as const;

const CARD_STYLE: React.CSSProperties = {
  background: DS.card,
  borderRadius: 16,
  padding: '20px 24px',
  boxShadow: DS.shadow,
  border: DS.border,
};

const FIXED_RATE_TYPES = ['fixed', 'fixed_6m', 'fixed_1yr', 'fixed_2yr', 'fixed_3yr', 'fixed_5yr'] as const;

const STAGE_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#F1F5F9', text: '#475569' },
  submitted: { bg: '#DBEAFE', text: '#2563EB' },
  conditional: { bg: '#D1FAE5', text: '#059669' },
  unconditional: { bg: '#D1FAE5', text: '#059669' },
  settled: { bg: '#EDE9FE', text: '#7C3AED' },
  declined: { bg: '#FEE2E2', text: '#DC2626' },
};

interface DashboardProps {
  setCurrentView: (view: string) => void;
  navigateToClient: (clientId: string) => void;
  navigateToApplication: (applicationId: string) => void;
  advisor: Advisor;
  viewMode: 'my' | 'firm';
  setViewMode: (mode: 'my' | 'firm') => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

const PQ_APPLICATION_STATUSES = ['active', 'in_progress', 'submitted', 'pre_approval', 'on_hold'] as const;

type PriorityQueueMergedRow = {
  id: string;
  reference_number: string | null;
  loan_amount: number | null;
  status: string | null;
  workflow_stage: string | null;
  settlement_date: string | null;
  assigned_to: string | null;
  client_id: string | null;
  readiness: {
    total_score: number | null;
    score_grade: string | null;
    is_ready_to_submit: boolean | null;
  } | null;
  client: { first_name?: string | null; last_name?: string | null } | null;
};

/** Latest readiness row per application from a flat score list (by scored_at). */
function latestReadinessByApplicationId(
  scores: {
    application_id: string;
    total_score?: number | null;
    score_grade?: string | null;
    is_ready_to_submit?: boolean | null;
    scored_at?: string | null;
  }[],
): Map<string, NonNullable<PriorityQueueMergedRow['readiness']>> {
  const sorted = [...scores].sort((a, b) => {
    const ta = a.scored_at ? new Date(a.scored_at).getTime() : 0;
    const tb = b.scored_at ? new Date(b.scored_at).getTime() : 0;
    return tb - ta;
  });
  const map = new Map<string, NonNullable<PriorityQueueMergedRow['readiness']>>();
  for (const s of sorted) {
    if (!map.has(s.application_id)) {
      map.set(s.application_id, {
        total_score: s.total_score == null ? null : Number(s.total_score),
        score_grade: s.score_grade ?? null,
        is_ready_to_submit: s.is_ready_to_submit ?? null,
      });
    }
  }
  return map;
}

/** Sorts merged queue rows: total_score ASC (nulls last), settlement_date ASC. */
function sortPriorityQueueMerged(merged: PriorityQueueMergedRow[]): PriorityQueueMergedRow[] {
  return [...merged].sort((a, b) => {
    const sA = a.readiness?.total_score ?? 999;
    const sB = b.readiness?.total_score ?? 999;
    if (sA !== sB) return sA - sB;
    return (
      new Date(a.settlement_date ?? '9999-12-31').getTime() -
      new Date(b.settlement_date ?? '9999-12-31').getTime()
    );
  });
}

/** Fetches applications → scores → clients, merges in JS (no nested FK). */
async function fetchPriorityQueueMerged(
  firmId: string,
  viewMode: 'my' | 'firm',
  advisorId: string,
): Promise<PriorityQueueMergedRow[]> {
  let appsQuery = supabase
    .from('applications')
    .select('id, reference_number, loan_amount, status, workflow_stage, settlement_date, assigned_to, client_id')
    .eq('firm_id', firmId)
    .in('status', [...PQ_APPLICATION_STATUSES])
    .limit(20);
  if (viewMode === 'my') {
    appsQuery = appsQuery.eq('assigned_to', advisorId);
  }
  const { data: apps, error: appsErr } = await appsQuery;
  if (appsErr) {
    logger.log('Priority queue: applications query failed', appsErr.message);
    return [];
  }
  if (!apps?.length) return [];
  const appIds = apps.map((a) => a.id);
  const { data: scores, error: scErr } = await supabase
    .from('application_readiness_scores')
    .select(
      'application_id, total_score, score_grade, is_ready_to_submit, critical_count, high_count, scored_at',
    )
    .in('application_id', appIds);
  if (scErr) logger.log('Priority queue: application_readiness_scores unavailable', scErr.message);
  const scoreMap = latestReadinessByApplicationId(scores ?? []);
  const rawClientIds = apps.map((a) => a.client_id).filter(Boolean) as string[];
  const clientIds = [...new Set(rawClientIds)];
  let clientRows: { id: string; first_name?: string | null; last_name?: string | null }[] = [];
  if (clientIds.length > 0) {
    const { data: cdata, error: cErr } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .in('id', clientIds);
    if (cErr) logger.log('Priority queue: clients query failed', cErr.message);
    clientRows = cdata ?? [];
  }
  const clientById = new Map(clientRows.map((c) => [c.id, c]));
  let merged: PriorityQueueMergedRow[] = apps.map((app) => ({
    id: app.id,
    reference_number: app.reference_number,
    loan_amount: app.loan_amount,
    status: app.status,
    workflow_stage: app.workflow_stage,
    settlement_date: app.settlement_date,
    assigned_to: app.assigned_to,
    client_id: app.client_id,
    readiness: scoreMap.get(app.id) ?? null,
    client: app.client_id ? clientById.get(app.client_id) ?? null : null,
  }));
  merged = sortPriorityQueueMerged(merged);
  return merged;
}

/** Builds the left-hand date segment for the firm briefing strip (e.g. "Saturday 11 Apr"). */
function formatBriefingStripDate(d: Date): string {
  const weekday = d.toLocaleDateString('en-NZ', { weekday: 'long' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-NZ', { month: 'short' });
  return `${weekday} ${day} ${month}`;
}

/** Active application count target for Pipeline KPI delta; replace with firm-configured goal when available. */
const KPI_PIPELINE_ACTIVE_TARGET = 30;
/** Monthly settled loan value target for Settled KPI copy; replace with firm-configured goal when available. */
const KPI_SETTLED_VALUE_TARGET = 2_800_000;

function workflowKey(a: Application): string {
  const s = (a.status as string) || '';
  const k = s.toLowerCase().replace(/\s+/g, '_');
  if (k === 'application_submitted') return 'submitted';
  if (k === 'conditional_approval') return 'conditional';
  if (k === 'unconditional_approval') return 'unconditional';
  if (k === 'draft') return 'draft';
  if (k === 'settled') return 'settled';
  if (k === 'declined') return 'declined';
  return k;
}

const ALL_STAGES = ['draft', 'submitted', 'conditional', 'unconditional', 'settled', 'declined'] as const;

function getMonthKeys(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' }),
    });
  }
  return out;
}

function bestRateForType(
  rows: { lender_name: string | null; rate_type: string | null; rate_percent: number | null }[],
  rateType: string,
): { rate_percent: number; lender_name: string | null } | null {
  let pick: { lender_name: string | null; rate_percent: number } | null = null;
  for (const r of rows) {
    if (r.rate_type !== rateType || r.rate_percent == null) continue;
    if (!pick || r.rate_percent < pick.rate_percent) {
      pick = { lender_name: r.lender_name, rate_percent: r.rate_percent };
    }
  }
  return pick;
}

function lastMonthKey(now: Date): string {
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${y}-${String(m).padStart(2, '0')}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

const FI_PREFILL_KEY = 'fi_prefill_message';

interface SuggestionChip {
  label: string;
  message: string;
}

const Dashboard: React.FC<DashboardProps> = ({
  setCurrentView,
  navigateToClient,
  navigateToApplication,
  advisor,
  viewMode,
  setViewMode,
}) => {
  const { theme } = useTheme();
  const chartTextColor = theme === 'dark' ? '#94A3B8' : '#64748B';
  const chartGridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const [allApplications, setAllApplications] = useState<Application[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [activeAppsSearch, setActiveAppsSearch] = useState('');
  const [activeAppsStageFilter, setActiveAppsStageFilter] = useState<string>('all');
  const [activeAppsPage, setActiveAppsPage] = useState(1);
  const [advisorPerfFilter, setAdvisorPerfFilter] = useState<'this_month' | 'ytd'>('this_month');
  const [chartMonthCount, setChartMonthCount] = useState<6 | 12>(6);
  const [marketRatesRows, setMarketRatesRows] = useState<
    { lender_name: string | null; rate_type: string | null; rate_percent: number | null }[]
  >([]);
  const [commissionExpected, setCommissionExpected] = useState(0);
  const [commissionReceived, setCommissionReceived] = useState(0);
  const [clawbackRiskAmt, setClawbackRiskAmt] = useState(0);
  const [commissionExpectedPrev, setCommissionExpectedPrev] = useState(0);
  const [refixRows, setRefixRows] = useState<
    { loan_amount: number | null; current_rate_expiry_date: string | null; lender_name: string | null; client_id: string | null }[]
  >([]);
  const [briefingRefreshKey, setBriefingRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestionChip[]>([
    { label: 'Pipeline', message: 'Give me a pipeline summary' },
    { label: 'Commission', message: 'What is my commission this month?' },
  ]);
  const [briefingStripActiveCount, setBriefingStripActiveCount] = useState(0);
  const [briefingStripAnomalyCount, setBriefingStripAnomalyCount] = useState(0);
  const [briefingStripPipelineTotal, setBriefingStripPipelineTotal] = useState(0);
  const [kpiAtRiskSum, setKpiAtRiskSum] = useState(0);
  const [kpiAtRiskCount, setKpiAtRiskCount] = useState(0);
  const [teamActiveAdvisers, setTeamActiveAdvisers] = useState(0);
  const [teamTotalAdvisers, setTeamTotalAdvisers] = useState(0);
  const [priorityQueueMerged, setPriorityQueueMerged] = useState<PriorityQueueMergedRow[]>([]);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const firmId = advisor.firmId;
      const today = new Date().toISOString().split('T')[0];
      const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const msStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const prevMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

      let activeStripQuery = supabase
        .from('applications')
        .select('loan_amount')
        .eq('firm_id', firmId)
        .eq('status', 'active');
      if (viewMode === 'my') {
        activeStripQuery = activeStripQuery.eq('assigned_to', advisor.id);
      }

      const anomalyCountPromise =
        viewMode === 'firm'
          ? supabase
              .from('anomaly_flags')
              .select('id', { count: 'exact', head: true })
              .eq('firm_id', firmId)
              .eq('status', 'open')
          : (async () => {
              const appsRes = await supabase
                .from('applications')
                .select('id')
                .eq('firm_id', firmId)
                .eq('assigned_to', advisor.id);
              if (appsRes.error) {
                logger.log('Dashboard: scoped anomaly count (apps) failed', appsRes.error.message);
                return { count: 0, error: null };
              }
              const ids = (appsRes.data ?? []).map((r) => r.id).filter(Boolean);
              if (ids.length === 0) return { count: 0, error: null };
              return supabase
                .from('anomaly_flags')
                .select('id', { count: 'exact', head: true })
                .eq('firm_id', firmId)
                .eq('status', 'open')
                .in('application_id', ids);
            })();

      const [
        apps,
        tasks,
        clientList,
        advisorList,
        notes,
        ratesRes,
        commRes,
        refixRes,
        activeStripRes,
        teamUsersRes,
        atRiskRes,
        anomalyCountRes,
        pqMerged,
      ] = await Promise.all([
        crmService.getApplications(),
        crmService.getTasks(),
        crmService.getClients(),
        crmService.getAdvisors(),
        crmService.getNotes(),
        supabase
          .from('market_rates')
          .select('lender_name, rate_type, rate_percent')
          .eq('is_current', true)
          .eq('owner_occupied', true)
          .order('rate_percent', { ascending: true }),
        supabase.from('commissions').select('*').eq('firm_id', firmId),
        supabase
          .from('settled_loans')
          .select('loan_amount, current_rate_expiry_date, lender_name, client_id')
          .eq('firm_id', firmId)
          .eq('status', 'active')
          .in('current_rate_type', [...FIXED_RATE_TYPES])
          .gte('current_rate_expiry_date', today)
          .lte('current_rate_expiry_date', in90),
        activeStripQuery,
        supabase.from('users').select('status, role').eq('firm_id', firmId).eq('role', 'adviser'),
        supabase
          .from('commissions')
          .select('clawback_amount')
          .eq('firm_id', firmId)
          .not('clawback_amount', 'is', null)
          .lte('clawback_risk_until', thirtyDaysOut),
        anomalyCountPromise,
        fetchPriorityQueueMerged(firmId, viewMode, advisor.id),
      ]);

      setAllApplications(apps || []);
      setAllTasks(tasks || []);
      setClients(clientList || []);
      setAdvisors(advisorList || []);
      setRecentNotes((notes || []).slice(0, 5));
      setPriorityQueueMerged(pqMerged);

      const stripRows = activeStripRes.data ?? [];
      setBriefingStripActiveCount(stripRows.length);
      setBriefingStripPipelineTotal(
        stripRows.reduce((s, r: { loan_amount?: number | null }) => s + Number(r.loan_amount ?? 0), 0),
      );
      setBriefingStripAnomalyCount(anomalyCountRes.error ? 0 : anomalyCountRes.count ?? 0);

      const teamRows = (teamUsersRes.data ?? []) as { status?: string | null; role?: string | null }[];
      if (!teamUsersRes.error && teamRows.length > 0) {
        setTeamTotalAdvisers(teamRows.length);
        setTeamActiveAdvisers(teamRows.filter((u) => u.status === 'active').length);
      } else {
        if (teamUsersRes.error) {
          logger.log('Team capacity: users query unavailable; using advisors + applications', teamUsersRes.error.message);
        }
        const cap = teamCapacityFromAdvisorsAndApps(
          (apps || []) as Application[],
          (advisorList || []) as Advisor[],
          firmId,
        );
        setTeamActiveAdvisers(cap.active);
        setTeamTotalAdvisers(cap.total);
      }

      if (atRiskRes.error) {
        logger.log('KPI at risk: commissions clawback query failed', atRiskRes.error.message);
        setKpiAtRiskSum(0);
        setKpiAtRiskCount(0);
      } else {
        const atRiskRows = (atRiskRes.data ?? []) as { clawback_amount?: number | null }[];
        const totalAtRisk = atRiskRows.reduce((s, r) => s + Number(r.clawback_amount ?? 0), 0);
        setKpiAtRiskSum(totalAtRisk);
        setKpiAtRiskCount(atRiskRows.length);
      }

      setMarketRatesRows(ratesRes.data || []);

      const commRows = commRes.data || [];
      const expected = commRows
        .filter((c: { status?: string }) => (c.status || '').toLowerCase() === 'expected')
        .filter((c: { settlement_date?: string }) => {
          if (!c.settlement_date) return false;
          return new Date(c.settlement_date) >= msStart;
        })
        .reduce((s: number, c: { net_amount?: number }) => s + Number(c.net_amount), 0);
      const received = commRows
        .filter((c: { status?: string }) => (c.status || '').toLowerCase() === 'received')
        .filter((c: { received_date?: string }) => {
          if (!c.received_date) return false;
          return new Date(c.received_date) >= msStart;
        })
        .reduce((s: number, c: { net_amount?: number }) => s + Number(c.net_amount), 0);
      const claw = commRows
        .filter((c: { clawback_risk_until?: string }) => c.clawback_risk_until && new Date(c.clawback_risk_until) > new Date())
        .reduce((s: number, c: { gross_amount?: number }) => s + Number(c.gross_amount), 0);
      const expectedPrev = commRows
        .filter((c: { status?: string }) => (c.status || '').toLowerCase() === 'expected')
        .filter((c: { settlement_date?: string }) => {
          if (!c.settlement_date) return false;
          const d = new Date(c.settlement_date);
          return d.getMonth() === prevMonth.getMonth() && d.getFullYear() === prevMonth.getFullYear();
        })
        .reduce((s: number, c: { net_amount?: number }) => s + Number(c.net_amount), 0);

      setCommissionExpected(expected);
      setCommissionReceived(received);
      setClawbackRiskAmt(claw);
      setCommissionExpectedPrev(expectedPrev);
      setRefixRows(refixRes.data || []);
    } catch (err) {
      logger.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [advisor.firmId, advisor.id, viewMode]);

  // useAutoRefresh(loadDashboardData, 30);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const loadSuggestions = useCallback(async () => {
    try {
      const fid = advisor.firmId;
      if (!fid) return;
      const { data: alerts } = await supabase
        .from('ai_insights')
        .select('insight_type, priority')
        .eq('firm_id', fid)
        .eq('is_actioned', false)
        .eq('is_dismissed', false)
        .order('priority')
        .limit(2);

      if (alerts && alerts.length > 0) {
        setSuggestions(
          alerts.map((a) => {
            switch (a.insight_type) {
              case 'rate_opportunity':
                return { label: 'Rate opportunities', message: 'Show me all rate opportunities' };
              case 'refix_opportunity':
                return { label: 'Rate refixes', message: 'Which clients have rate refixes due?' };
              case 'stale_application':
                return { label: 'Stale applications', message: 'Show me stale applications' };
              default:
                return { label: 'Review alerts', message: 'Show me my open alerts' };
            }
          }),
        );
      }
    } catch {
      // keep default suggestions
    }
  }, [advisor.firmId]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const viewFilteredApplications = useMemo(() => {
    if (viewMode === 'my') return allApplications.filter((a) => a.advisorId === advisor.id);
    return allApplications;
  }, [allApplications, viewMode, advisor.id]);

  const activeApplications = useMemo(
    () =>
      viewFilteredApplications.filter(
        (a) => a.status !== ApplicationStatus.Settled && a.status !== ApplicationStatus.Declined
      ),
    [viewFilteredApplications]
  );

  const totalPipelineValue = useMemo(
    () => activeApplications.reduce((s, a) => s + (a.loanAmount || 0), 0),
    [activeApplications]
  );

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const newLeadsThisMonth = useMemo(() => {
    return clients.filter((c) => {
      const createdAt = c.createdAt;
      if (!createdAt) return false;
      const d = new Date(createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [clients]);

  const todayStr = todayISO();
  const tasksDueTodayList = useMemo(
    () => (allTasks || []).filter((t) => t.dueDate === todayStr && !t.isCompleted),
    [allTasks]
  );
  const tasksDueTodayCount = tasksDueTodayList.length;

  const activeApplicationsCount = useMemo(
    () => viewFilteredApplications.filter((a) => a.status_detail === 'Active').length,
    [viewFilteredApplications]
  );

  const settledApplications = useMemo(
    () => viewFilteredApplications.filter((a) => a.status === ApplicationStatus.Settled),
    [viewFilteredApplications]
  );
  const totalApplicationsCount = viewFilteredApplications.length;
  const conversionRate =
    totalApplicationsCount > 0
      ? ((settledApplications.length / totalApplicationsCount) * 100).toFixed(1)
      : '0';

  const settledThisMonthCount = useMemo(() => {
    return settledApplications.filter((a) => {
      const lu = a.lastUpdated;
      if (!lu) return false;
      const d = new Date(lu);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [settledApplications]);

  const settledValueThisMonth = useMemo(() => {
    return settledApplications
      .filter((a) => {
        const lu = a.lastUpdated;
        if (!lu) return false;
        const d = new Date(lu);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s, a) => s + (a.loanAmount || 0), 0);
  }, [settledApplications]);

  const lastMonthKeyVal = useMemo(() => lastMonthKey(now), []);
  const activeApplicationsLastMonth = useMemo(() => {
    return viewFilteredApplications.filter((a) => {
      if (a.status === ApplicationStatus.Settled || a.status === ApplicationStatus.Declined) return false;
      const lu = a.lastUpdated;
      if (!lu) return false;
      const d = new Date(lu);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return m === lastMonthKeyVal;
    }).length;
  }, [viewFilteredApplications, lastMonthKeyVal]);
  const newLeadsLastMonth = useMemo(() => {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return clients.filter((c) => {
      const createdAt = c.createdAt;
      if (!createdAt) return false;
      const d = new Date(createdAt);
      return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
    }).length;
  }, [clients]);
  const lastMonthSameDay = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    return d.toISOString().slice(0, 10);
  }, []);
  const tasksDueTodayLastMonth = useMemo(
    () => (allTasks || []).filter((t) => t.dueDate === lastMonthSameDay && !t.isCompleted).length,
    [allTasks, lastMonthSameDay]
  );
  const conversionRateLastMonth = useMemo(() => {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const inLastMonth = (lu: string) => {
      const d = new Date(lu);
      return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
    };
    const settledLastMonth = settledApplications.filter((a) => a.lastUpdated && inLastMonth(a.lastUpdated)).length;
    const totalLastMonth = viewFilteredApplications.filter((a) => a.lastUpdated && inLastMonth(a.lastUpdated)).length;
    if (totalLastMonth === 0) return 0;
    return (settledLastMonth / totalLastMonth) * 100;
  }, [viewFilteredApplications, settledApplications]);

  const metricPctChanges = useMemo(() => {
    const activePct = pctChange(activeApplicationsCount, activeApplicationsLastMonth);
    const leadsPct = pctChange(newLeadsThisMonth, newLeadsLastMonth);
    const tasksPct = pctChange(tasksDueTodayCount, tasksDueTodayLastMonth);
    const convCurrent = totalApplicationsCount > 0 ? (settledApplications.length / totalApplicationsCount) * 100 : 0;
    const convPct = conversionRateLastMonth !== 0 ? pctChange(convCurrent, conversionRateLastMonth) : (convCurrent > 0 ? 100 : null);
    return { activePct, leadsPct, tasksPct, convPct };
  }, [
    activeApplicationsCount,
    activeApplicationsLastMonth,
    newLeadsThisMonth,
    newLeadsLastMonth,
    tasksDueTodayCount,
    tasksDueTodayLastMonth,
    totalApplicationsCount,
    settledApplications.length,
    conversionRateLastMonth,
  ]);

  const advisorPerformanceRows = useMemo(() => {
    const firmAdvisors = (advisors || []).filter((a) => a.firmId === advisor.firmId);
    const byAdvisor = new Map<string, { activeDeals: number; pipelineValue: number; settledThisMonth: number; settledYTD: number }>();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();
    viewFilteredApplications.forEach((app) => {
      const aid = app.advisorId || '';
      if (!aid) return;
      if (!byAdvisor.has(aid)) {
        byAdvisor.set(aid, { activeDeals: 0, pipelineValue: 0, settledThisMonth: 0, settledYTD: 0 });
      }
      const row = byAdvisor.get(aid)!;
      const isSettled = app.status === ApplicationStatus.Settled;
      const isActive = !isSettled && app.status !== ApplicationStatus.Declined;
      if (isActive) {
        row.activeDeals += 1;
        row.pipelineValue += app.loanAmount || 0;
      }
      if (isSettled && app.lastUpdated) {
        const d = new Date(app.lastUpdated);
        if (d.getFullYear() === thisYear) row.settledYTD += app.loanAmount || 0;
        if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) row.settledThisMonth += app.loanAmount || 0;
      }
    });
    return firmAdvisors
      .map((a) => ({
        advisor: a,
        activeDeals: byAdvisor.get(a.id)?.activeDeals ?? 0,
        pipelineValue: byAdvisor.get(a.id)?.pipelineValue ?? 0,
        settledThisMonth: byAdvisor.get(a.id)?.settledThisMonth ?? 0,
        settledYTD: byAdvisor.get(a.id)?.settledYTD ?? 0,
      }))
      .sort((x, y) => y.settledThisMonth - x.settledThisMonth);
  }, [advisors, advisor.firmId, viewFilteredApplications]);

  const monthKeys = useMemo(() => getMonthKeys(chartMonthCount), [chartMonthCount]);

  /** Loan volume touched per month (pipeline activity) — used for KPI trend */
  const pipelineVolumeByMonth = useMemo(() => {
    return monthKeys.map(({ key, label }) => {
      const sum = viewFilteredApplications
        .filter((a) => {
          const lu = a.lastUpdated;
          if (!lu) return false;
          const d = new Date(lu);
          const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return m === key;
        })
        .reduce((s, a) => s + (a.loanAmount || 0), 0);
      return { month: label, value: sum };
    });
  }, [viewFilteredApplications, monthKeys]);

  const appsOverTimeData = useMemo(() => {
    return monthKeys.map(({ key, label }) => {
      const applications = viewFilteredApplications.filter((a) => {
        const lu = a.lastUpdated;
        if (!lu) return false;
        const d = new Date(lu);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return m === key;
      }).length;
      return { month: label, applications };
    });
  }, [viewFilteredApplications, monthKeys]);

  const pipelineKpiTrendPct = useMemo(() => {
    if (pipelineVolumeByMonth.length < 2) return null;
    const cur = pipelineVolumeByMonth[pipelineVolumeByMonth.length - 1]?.value ?? 0;
    const prev = pipelineVolumeByMonth[pipelineVolumeByMonth.length - 2]?.value ?? 0;
    return pctChange(cur, prev);
  }, [pipelineVolumeByMonth]);

  const settledKpiTrendPct = useMemo(() => {
    if (monthKeys.length < 2) return null;
    const curKey = monthKeys[monthKeys.length - 1]?.key;
    const prevKey = monthKeys[monthKeys.length - 2]?.key;
    if (!curKey || !prevKey) return null;
    const cur = settledApplications
      .filter((a) => {
        const lu = a.lastUpdated;
        if (!lu) return false;
        const d = new Date(lu);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return m === curKey;
      })
      .reduce((s, a) => s + (a.loanAmount || 0), 0);
    const prev = settledApplications
      .filter((a) => {
        const lu = a.lastUpdated;
        if (!lu) return false;
        const d = new Date(lu);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return m === prevKey;
      })
      .reduce((s, a) => s + (a.loanAmount || 0), 0);
    return pctChange(cur, prev);
  }, [settledApplications, monthKeys]);

  const commissionKpiTrendPct = useMemo(
    () => pctChange(commissionExpected, commissionExpectedPrev),
    [commissionExpected, commissionExpectedPrev],
  );

  const stagePills = useMemo(() => {
    const apps = viewFilteredApplications;
    const draft = apps.filter((a) => workflowKey(a) === 'draft').length;
    const submitted = apps.filter((a) => workflowKey(a) === 'submitted').length;
    const approved = apps.filter((a) => {
      const w = workflowKey(a);
      return w === 'conditional' || w === 'unconditional';
    }).length;
    return { draft, submitted, approved };
  }, [viewFilteredApplications]);

  const bestRatesDisplay = useMemo(() => {
    const rows = marketRatesRows;
    return {
      fixed1: bestRateForType(rows, 'fixed_1yr'),
      fixed2: bestRateForType(rows, 'fixed_2yr'),
      floating: bestRateForType(rows, 'floating'),
    };
  }, [marketRatesRows]);

  const refixUrgentCount = useMemo(() => {
    const now = Date.now();
    const d30 = 30 * 24 * 60 * 60 * 1000;
    return refixRows.filter((r) => {
      if (!r.current_rate_expiry_date) return false;
      return new Date(r.current_rate_expiry_date).getTime() - now <= d30;
    }).length;
  }, [refixRows]);

  const clientNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [clients]);

  const daysInStage = (app: Application): number => {
    const lu = app.lastUpdated;
    if (!lu) return 0;
    return Math.floor((Date.now() - new Date(lu).getTime()) / 86400000);
  };

  const activeApplicationsFiltered = useMemo(() => {
    const q = activeAppsSearch.trim().toLowerCase();
    let list = activeApplications;
    if (q) list = list.filter((a) => (a.clientName || '').toLowerCase().includes(q));
    if (activeAppsStageFilter !== 'all') {
      list = list.filter((a) => workflowKey(a) === activeAppsStageFilter);
    }
    return list;
  }, [activeApplications, activeAppsSearch, activeAppsStageFilter]);

  const ACTIVE_APPS_PAGE_SIZE = 10;
  const activeApplicationsPaginated = useMemo(() => {
    const start = (activeAppsPage - 1) * ACTIVE_APPS_PAGE_SIZE;
    return activeApplicationsFiltered.slice(start, start + ACTIVE_APPS_PAGE_SIZE);
  }, [activeApplicationsFiltered, activeAppsPage]);
  const activeAppsTotalPages = Math.max(1, Math.ceil(activeApplicationsFiltered.length / ACTIVE_APPS_PAGE_SIZE));

  const advisorNamesById = useMemo(() => {
    const m: Record<string, string> = {};
    (advisors || []).forEach((a) => { m[a.id] = a.name; });
    return m;
  }, [advisors]);

  const commissionDonutData = useMemo(() => {
    const recv = commissionReceived;
    const exp = commissionExpected;
    const remaining = Math.max(0, exp - recv);
    const rows = [
      { name: 'Received', value: recv, fill: DS.success },
      { name: 'Remaining', value: remaining, fill: DS.accent },
    ];
    return rows.filter((r) => r.value > 0);
  }, [commissionReceived, commissionExpected]);

  const firmId = advisor.firmId;
  const advisorId = advisor.id;

  const refixDaysLeft = (expiry: string) =>
    Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);

  const refixNextDaysMin = useMemo(() => {
    if (!refixRows.length) return null;
    const days = refixRows
      .map((r) => {
        const d = r.current_rate_expiry_date;
        return d ? refixDaysLeft(d) : NaN;
      })
      .filter((n) => !Number.isNaN(n) && n >= 0);
    return days.length ? Math.min(...days) : null;
  }, [refixRows]);

  const navigateToFI = (prefillMessage?: string) => {
    if (prefillMessage) {
      sessionStorage.setItem(FI_PREFILL_KEY, prefillMessage);
    }
    setCurrentView('flow-intelligence');
  };

  /** Navigates to Applications with a list preset applied on arrival. */
  const openApplicationsDrill = useCallback(
    (preset: AppListPreset) => {
      stashApplicationsListPreset(preset);
      setCurrentView('applications');
    },
    [setCurrentView],
  );

  /** Navigates to Commission with register filter (expected or clawback context). */
  const openCommissionDrill = useCallback(
    (preset: CommissionListPreset) => {
      stashCommissionListPreset(preset);
      setCurrentView('commission');
    },
    [setCurrentView],
  );

  const briefingMetrics = useMemo((): FlowBriefingMetric[] => {
    return [
      {
        id: 'bf-pipeline',
        label: 'pipeline',
        value: formatCurrency(totalPipelineValue),
        onDrill: () => openApplicationsDrill('pipeline_active'),
      },
      {
        id: 'bf-active',
        label: 'active',
        value: String(activeApplicationsCount),
        onDrill: () => openApplicationsDrill('pipeline_active'),
      },
      {
        id: 'bf-tasks',
        label: 'tasks today',
        value: String(tasksDueTodayCount),
        onDrill: () => setCurrentView('tasks'),
      },
      {
        id: 'bf-comm',
        label: 'comm expected',
        value: formatCurrency(commissionExpected),
        onDrill: () => openCommissionDrill('expected'),
      },
      {
        id: 'bf-refix',
        label: 'refix 90d',
        value: String(refixRows.length),
        onDrill: () => setCurrentView('trail-book'),
      },
      {
        id: 'bf-claw',
        label: 'clawback exp.',
        value: formatCurrency(clawbackRiskAmt),
        onDrill: () => openCommissionDrill('clawback'),
      },
    ];
  }, [
    activeApplicationsCount,
    clawbackRiskAmt,
    commissionExpected,
    formatCurrency,
    openApplicationsDrill,
    openCommissionDrill,
    refixRows.length,
    setCurrentView,
    tasksDueTodayCount,
    totalPipelineValue,
  ]);

  const settledPctOfValueTarget = useMemo(() => {
    if (KPI_SETTLED_VALUE_TARGET <= 0) return 0;
    return Math.min(999, Math.round((settledValueThisMonth / KPI_SETTLED_VALUE_TARGET) * 100));
  }, [settledValueThisMonth]);

  const kpiDeck: DashboardKpiDeckProps = useMemo(
    () => ({
      loading,
      pipeline: {
        activeCount: briefingStripActiveCount,
        targetCount: KPI_PIPELINE_ACTIVE_TARGET,
        sparkline7: sparklineActiveTouchesByDay(viewFilteredApplications, 7),
        onDrill: () => openApplicationsDrill('pipeline_active'),
      },
      settled: {
        dealsCount: settledThisMonthCount,
        percentOfValueTarget: settledPctOfValueTarget,
        targetAmount: KPI_SETTLED_VALUE_TARGET,
        sparkline30: sparklineSettledDealsByDay(viewFilteredApplications, 30),
        formatCurrency,
        onDrill: () => openApplicationsDrill('settled_this_month'),
      },
      atRisk: {
        sumGross: kpiAtRiskSum,
        rowCount: kpiAtRiskCount,
        formatCurrency,
        onDrill: () => openCommissionDrill('clawback'),
      },
      teamCapacity:
        teamTotalAdvisers >= 5
          ? {
              activeAdvisers: teamActiveAdvisers,
              totalAdvisers: teamTotalAdvisers,
              onDrill: () => openApplicationsDrill('live_files'),
            }
          : null,
    }),
    [
      briefingStripActiveCount,
      formatCurrency,
      kpiAtRiskCount,
      kpiAtRiskSum,
      loading,
      openApplicationsDrill,
      openCommissionDrill,
      settledPctOfValueTarget,
      settledThisMonthCount,
      teamActiveAdvisers,
      teamTotalAdvisers,
      viewFilteredApplications,
    ],
  );

  /** Pre-merged rows for `PriorityQueue` (parent sort already applied in fetch). */
  const priorityQueueApplications = useMemo((): ApplicationRow[] => {
    return priorityQueueMerged.map((m) => {
      const r = m.readiness;
      const readiness =
        r == null || r.total_score == null || Number.isNaN(Number(r.total_score))
          ? null
          : {
              total_score: Math.round(Number(r.total_score)),
              score_grade: r.score_grade || '',
              is_ready_to_submit: Boolean(r.is_ready_to_submit),
            };
      const c = m.client;
      return {
        id: m.id,
        reference_number: (m.reference_number || '').trim(),
        loan_amount: Number(m.loan_amount ?? 0),
        status: (m.status || '').toString(),
        workflow_stage: m.workflow_stage,
        settlement_date: m.settlement_date,
        assigned_to: m.assigned_to,
        client: c
          ? { first_name: c.first_name || '', last_name: c.last_name || '' }
          : null,
        readiness,
        assigned_adviser_name: m.assigned_to ? advisorNamesById[m.assigned_to] ?? null : null,
      };
    });
  }, [priorityQueueMerged, advisorNamesById]);

  const widgetParams: DashboardWidgetParams = {
    DS,
    CARD_STYLE,
    chartTextColor,
    chartGridColor,
    chartMonthCount,
    setChartMonthCount,
    loading,
    appsOverTimeData,
    stagePills,
    activeAppsSearch,
    setActiveAppsSearch,
    activeAppsStageFilter,
    setActiveAppsStageFilter,
    setActiveAppsPage,
    activeApplicationsPaginated,
    activeApplicationsFiltered,
    activeAppsPage,
    activeAppsTotalPages,
    workflowKey,
    navigateToApplication,
    setCurrentView,
    firmId,
    advisorId,
    advisor,
    briefingRefreshKey,
    setBriefingRefreshKey,
    tasksDueTodayCount,
    tasksDueTodayList,
    clientNamesById,
    commissionDonutData,
    commissionExpected,
    commissionReceived,
    clawbackRiskAmt,
    formatCurrency,
    refixRows,
    refixDaysLeft,
    refixUrgentCount,
    bestRatesDisplay,
    daysInStage,
    clients,
    navigateToClient,
  };

  const renderWidget = (id: WidgetId) => renderDashboardWidget(id, widgetParams);

  return (
    <div className="min-h-full" style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: DS.text }}>
      <FirmDashboardPage
        loading={loading}
        briefingDateLabel={formatBriefingStripDate(new Date())}
        briefingActiveCount={briefingStripActiveCount}
        briefingAnomalyCount={briefingStripAnomalyCount}
        briefingPipelineDisplay={formatCurrency(briefingStripPipelineTotal)}
        briefingPipelineSubtitle={viewMode === 'firm' ? 'Firm pipeline' : 'Your pipeline'}
        onBriefingDrillActive={() => openApplicationsDrill('pipeline_active')}
        onBriefingDrillAttention={() =>
          navigateToFI('List all open anomaly flags (status = open) for the firm')
        }
        onBriefingDrillPipeline={() => openApplicationsDrill('pipeline_active')}
        flowReviewedApplications={viewFilteredApplications.length}
        flowNeedAttentionCount={briefingStripAnomalyCount}
        flowRefixCount={refixRows.length}
        flowRefixNextDays={refixNextDaysMin}
        briefingMetrics={briefingMetrics}
        suggestions={suggestions}
        onNavigateFI={() => navigateToFI()}
        onNavigateFIWithMessage={(msg) => navigateToFI(msg)}
        kpiDeck={kpiDeck}
        firmId={advisor.firmId}
        anomalyScopeAdviserId={viewMode === 'my' ? advisor.id : null}
        priorityQueueLoading={loading}
        priorityQueueApplications={priorityQueueApplications}
        firmView={viewMode === 'firm'}
        onApplicationOpen={navigateToApplication}
        onBriefingAnomalyCountChange={setBriefingStripAnomalyCount}
      >
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {renderWidget('pipeline')}
          {renderWidget('commission')}
        </div>
      </FirmDashboardPage>
    </div>
  );
};

export default Dashboard;
