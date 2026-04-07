import { useAuth } from '../../src/contexts/AuthContext';
import { logger } from '../../utils/logger';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { crmService } from '../../services/api';
import { supabase } from '../../services/supabaseClient';
import { Icon } from '../common/Icon';
import { useToast } from '../../hooks/useToast';
import { SortableDashboardWidget } from '../dashboard/SortableDashboardWidget';
import { renderDashboardWidget, type DashboardWidgetParams } from '../dashboard/dashboardWidgetRender';
import {
  type WidgetId,
  type WidgetLayoutItem,
  WIDGET_LABELS,
  WIDGET_CUSTOMISE_ORDER,
  defaultWidgetLayout,
  mergeWidgetLayout,
  normalizeWidgetOrder,
} from '../../constants/dashboardWidgets';
import type { Application, Advisor, Task, Client, Note } from '../../types';
import { ApplicationStatus } from '../../types';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

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
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

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

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
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
}) => {
  const { theme } = useTheme();
  const { toast } = useToast();
  const chartTextColor = theme === 'dark' ? '#94A3B8' : '#64748B';
  const chartGridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const [viewMode, setViewMode] = useState<'my' | 'firm'>('firm');
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
  const [widgetLayout, setWidgetLayout] = useState<WidgetLayoutItem[]>(() => defaultWidgetLayout());
  const [showCustomise, setShowCustomise] = useState(false);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestionChip[]>([
    { label: '📊 Pipeline', message: 'Give me a pipeline summary' },
    { label: '💰 Commission', message: 'What is my commission this month?' },
  ]);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, tasks, clientList, advisorList, notes] = await Promise.all([
        crmService.getApplications(),
        crmService.getTasks(),
        crmService.getClients(),
        crmService.getAdvisors(),
        crmService.getNotes(),
      ]);
      setAllApplications(apps || []);
      setAllTasks(tasks || []);
      setClients(clientList || []);
      setAdvisors(advisorList || []);
      setRecentNotes((notes || []).slice(0, 5));

      const firmId = advisor.firmId;
      const today = new Date().toISOString().split('T')[0];
      const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const msStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const prevMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

      const [ratesRes, commRes, refixRes] = await Promise.all([
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
      ]);

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
  }, [advisor.firmId]);

  // useAutoRefresh(loadDashboardData, 30);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('dashboard_preferences')
        .select('widget_layout')
        .eq('advisor_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.widget_layout) {
        setWidgetLayout(normalizeWidgetOrder(mergeWidgetLayout(data.widget_layout)));
      } else {
        setWidgetLayout(defaultWidgetLayout());
      }
    })();
    return () => { cancelled = true; };
  }, [advisor.id]);

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
                return { label: '📈 Rate opportunities', message: 'Show me all rate opportunities' };
              case 'refix_opportunity':
                return { label: '🔄 Rate refixes', message: 'Which clients have rate refixes due?' };
              case 'stale_application':
                return { label: '⏸ Stale applications', message: 'Show me stale applications' };
              default:
                return { label: '⚠ Review alerts', message: 'Show me my open alerts' };
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

  const persistWidgetLayout = useCallback(
    async (layout: WidgetLayoutItem[]) => {
      const normalized = normalizeWidgetOrder(layout);
      setWidgetLayout(normalized);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('dashboard_preferences').upsert(
        {
          advisor_id: user.id,
          firm_id: advisor.firmId,
          widget_layout: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'advisor_id' },
      );
    },
    [advisor.firmId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const vis = widgetLayout.filter((w) => w.visible).sort((a, b) => a.order - b.order);
      const oldIndex = vis.findIndex((w) => w.id === active.id);
      const newIndex = vis.findIndex((w) => w.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reorderedVisible = arrayMove(vis, oldIndex, newIndex);
      const invisible = widgetLayout.filter((w) => !w.visible).sort((a, b) => a.order - b.order);
      const combined = [...reorderedVisible, ...invisible];
      const next = combined.map((w, i) => ({ ...w, order: i + 1 }));
      void persistWidgetLayout(next);
    },
    [widgetLayout, persistWidgetLayout],
  );

  const toggleWidgetVisible = useCallback(
    (id: WidgetId, visible: boolean) => {
      const next = widgetLayout.map((w) => (w.id === id ? { ...w, visible } : w));
      void persistWidgetLayout(next);
    },
    [widgetLayout, persistWidgetLayout],
  );

  const resetWidgetLayoutToDefault = useCallback(async () => {
    const defaults = defaultWidgetLayout();
    setWidgetLayout(defaults);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('dashboard_preferences').upsert(
        {
          advisor_id: user.id,
          firm_id: advisor.firmId,
          widget_layout: defaults,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'advisor_id' },
      );
    }

    setShowCustomise(false);
    toast.success('Dashboard reset to default layout');
  }, [advisor.firmId, toast]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const visibleWidgets = useMemo(
    () => widgetLayout.filter((w) => w.visible).sort((a, b) => a.order - b.order),
    [widgetLayout],
  );

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

  const greetingAlertCount = useMemo(() => refixUrgentCount, [refixUrgentCount]);

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

  const firstName = advisor.name?.split(' ')[0] || 'there';

  const refixDaysLeft = (expiry: string) =>
    Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);

  const navigateToFI = (prefillMessage?: string) => {
    if (prefillMessage) {
      sessionStorage.setItem(FI_PREFILL_KEY, prefillMessage);
    }
    setCurrentView('flow-intelligence');
  };

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

  const isDark = theme === 'dark';

  const kpiCards = [
    {
      label: 'Pipeline Value',
      value: loading ? '—' : formatCurrency(totalPipelineValue),
      pct: pipelineKpiTrendPct,
      icon: '💼',
      iconBg: isDark ? '#1E1B4B' : '#EEF2FF',
    },
    {
      label: 'Settled This Month',
      value: loading ? '—' : formatCurrency(settledValueThisMonth),
      pct: settledKpiTrendPct,
      icon: '✓',
      iconBg: isDark ? '#052E16' : '#F0FDF4',
    },
    {
      label: 'Commission Expected',
      value: loading ? '—' : formatCurrency(commissionExpected),
      pct: commissionKpiTrendPct,
      icon: '💰',
      iconBg: isDark ? '#292524' : '#FFFBEB',
    },
    {
      label: 'Active Applications',
      value: loading ? '—' : String(activeApplicationsCount),
      pct: metricPctChanges.activePct,
      icon: '📋',
      iconBg: isDark ? '#0C1A2E' : '#F0F9FF',
    },
  ];

  return (
    <div
      className="min-h-full"
      style={{ background: DS.bg, fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: DS.text }}
    >
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {/* ── Prodify page header ── */}
        <div style={{ padding: '28px 32px 0px 32px', background: 'transparent' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500, margin: '0 0 4px' }}>
            {new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{
                fontSize: 26, fontWeight: 800, color: 'var(--text-primary)',
                margin: '0 0 4px', letterSpacing: '-0.02em',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}>
                Good {getTimeOfDay()}, {firstName} 👋
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                {tasksDueTodayCount > 0
                  ? `You have ${tasksDueTodayCount} task${tasksDueTodayCount > 1 ? 's' : ''} due`
                  : 'Your pipeline is up to date'}
                {greetingAlertCount > 0
                  ? ` and ${greetingAlertCount} alert${greetingAlertCount > 1 ? 's' : ''}`
                  : ''}.
              </p>
            </div>

            {advisor.role === 'admin' && (
              <div
                className="inline-flex rounded-full p-1 flex-shrink-0"
                style={{ background: DS.card, boxShadow: DS.shadow, border: DS.border }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('my')}
                  className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${viewMode === 'my' ? 'text-white' : ''}`}
                  style={viewMode === 'my'
                    ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-end))' }
                    : { color: DS.textMuted }}
                >
                  My View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('firm')}
                  className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${viewMode === 'firm' ? 'text-white' : ''}`}
                  style={viewMode === 'firm'
                    ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-end))' }
                    : { color: DS.textMuted }}
                >
                  Firm View
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
            <div className="fi-button-wrapper" onClick={() => navigateToFI()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigateToFI(); }} style={{ cursor: 'pointer' }}>
              <div className="fi-button-inner" style={{ padding: '8px 18px', gap: 8 }}>
                <span style={{ fontSize: 13 }}>✦</span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>Ask Flow Intelligence</span>
              </div>
            </div>

            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => navigateToFI(s.message)}
                style={{
                  fontSize: 12, fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 20, padding: '7px 14px',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: 'var(--shadow-card)',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#6366f1';
                  e.currentTarget.style.color = '#6366f1';
                  e.currentTarget.style.background = 'var(--accent-soft)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'var(--bg-card)';
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPI cards ── */}
        <div
          className="dash-kpi-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            padding: '0 32px',
            marginBottom: 24,
          }}
        >
          {kpiCards.map((k) => (
            <div
              key={k.label}
              style={{
                background: 'var(--bg-card)',
                borderRadius: 16,
                padding: '20px 24px',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-card)',
                minHeight: 110,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {k.label}
                </span>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: k.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}>
                  {k.icon}
                </div>
              </div>

              {loading ? (
                <div className="h-8 w-24 rounded animate-pulse" style={{ background: 'var(--border-color)' }} />
              ) : (
                <div style={{
                  fontSize: 28, fontWeight: 800, color: 'var(--text-primary)',
                  letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 8,
                }}>
                  {k.value}
                </div>
              )}

              {!loading && k.pct != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: k.pct > 0 ? 'var(--success)' : k.pct < 0 ? 'var(--danger)' : 'var(--text-muted)',
                  }}>
                    {k.pct > 0 ? '↑' : k.pct < 0 ? '↓' : '→'} {k.pct > 0 ? '+' : ''}{k.pct}%
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>vs last month</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Customise button ── */}
        <div style={{ padding: '0 32px', marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setShowCustomise(true)}
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            ⊞ Customise
          </button>
        </div>

        {/* ── Customise panel ── */}
        {showCustomise && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40"
              role="presentation"
              aria-hidden
              onClick={() => setShowCustomise(false)}
            />
            <div
              className="fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-y-auto"
              style={{
                width: 320,
                background: 'var(--bg-card)',
                borderLeft: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <h2 className="m-0 text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  Customise Dashboard
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCustomise(false)}
                  className="p-1.5 rounded-lg border-none cursor-pointer bg-transparent"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Close"
                >
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-4 flex-1">
                {WIDGET_CUSTOMISE_ORDER.map((wid) => {
                  const w = widgetLayout.find((x) => x.id === wid);
                  const on = w?.visible ?? true;
                  return (
                    <label key={wid} className="flex items-center justify-between gap-3 cursor-pointer">
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{WIDGET_LABELS[wid]}</span>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggleWidgetVisible(wid, e.target.checked)}
                        className="h-4 w-4 accent-indigo-600"
                      />
                    </label>
                  );
                })}
              </div>
              <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => resetWidgetLayoutToDefault()}
                  className="w-full py-2.5 rounded-lg text-[13px] font-semibold border-none cursor-pointer"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  Reset to default
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Widget grid ── */}
        <style>{`
          @media (max-width: 767px) {
            .dash-widget-slot {
              grid-column: 1 / -1 !important;
            }
          }
          @media (max-width: 1023px) {
            .dash-kpi-grid {
              grid-template-columns: repeat(2, 1fr) !important;
            }
          }
          @media (max-width: 639px) {
            .dash-kpi-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div
              className="dashboard-dnd-grid min-w-0"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                gap: 16,
                padding: '0 32px',
                paddingBottom: 32,
              }}
            >
              {visibleWidgets.length === 0 ? (
                <p className="col-span-full" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  No widgets visible. Use Customise to show cards.
                </p>
              ) : (
                visibleWidgets.map((w) => (
                  <SortableDashboardWidget key={w.id} id={w.id} size={w.size}>
                    {renderWidget(w.id)}
                  </SortableDashboardWidget>
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default Dashboard;
