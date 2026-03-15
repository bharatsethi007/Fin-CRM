
import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { crmService } from '../../services/api';
import { geminiService } from '../../services/geminiService';
import type { SanitizedDashboardData } from '../../services/geminiService';
import { Icon } from '../common/Icon';
import type { Application, Advisor, Task, Client, Note, Lead } from '../../types';
import { ApplicationStatus } from '../../types';

// Pastel palette: background (pastel) + text/border (darker)
const PASTEL = {
  blue: { bg: '#dbeafe', text: '#2563eb' },
  green: { bg: '#dcfce7', text: '#16a34a' },
  orange: { bg: '#ffedd5', text: '#ea580c' },
  purple: { bg: '#f3e8ff', text: '#9333ea' },
  pink: { bg: '#fce7f3', text: '#db2777' },
  yellow: { bg: '#fef9c3', text: '#ca8a04' },
} as const;

const STAGE_PASTEL: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: PASTEL.blue.bg, text: PASTEL.blue.text, border: PASTEL.blue.text },
  submitted: { bg: PASTEL.yellow.bg, text: PASTEL.yellow.text, border: PASTEL.yellow.text },
  conditional: { bg: PASTEL.orange.bg, text: PASTEL.orange.text, border: PASTEL.orange.text },
  unconditional: { bg: PASTEL.green.bg, text: PASTEL.green.text, border: PASTEL.green.text },
  settled: { bg: PASTEL.purple.bg, text: PASTEL.purple.text, border: PASTEL.purple.text },
  declined: { bg: PASTEL.pink.bg, text: PASTEL.pink.text, border: PASTEL.pink.text },
};

const PASTEL_CHART_COLORS = [PASTEL.blue.text, PASTEL.yellow.text, PASTEL.orange.text, PASTEL.green.text, PASTEL.purple.text];

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

const timeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  return Math.floor(seconds) + ' seconds ago';
};

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

const PIPELINE_BOARD_STAGES = ['draft', 'submitted', 'conditional', 'unconditional', 'settled'] as const;
const ALL_STAGES = ['draft', 'submitted', 'conditional', 'unconditional', 'settled', 'declined'] as const;
const AI_INSIGHTS_CACHE_KEY = 'dashboard_ai_insights';

function getMonthKeysLast6(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' }),
    });
  }
  return out;
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

const Dashboard: React.FC<DashboardProps> = ({
  setCurrentView,
  navigateToClient,
  navigateToApplication,
  advisor,
}) => {
  const [viewMode, setViewMode] = useState<'my' | 'firm'>('firm');
  const [allApplications, setAllApplications] = useState<Application[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeAppsSearch, setActiveAppsSearch] = useState('');
  const [activeAppsStageFilter, setActiveAppsStageFilter] = useState<string>('all');
  const [activeAppsPage, setActiveAppsPage] = useState(1);
  const [leadsTimeFilter, setLeadsTimeFilter] = useState<'this_week' | 'this_month'>('this_week');
  const [aiInsights, setAiInsights] = useState<string>('');
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [advisorPerfFilter, setAdvisorPerfFilter] = useState<'this_month' | 'ytd'>('this_month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      crmService.getApplications(),
      crmService.getTasks(),
      crmService.getClients(),
      crmService.getAdvisors(),
      crmService.getNotes(),
      crmService.getLeads(),
    ])
      .then(([apps, tasks, clientList, advisorList, notes, leadsList]) => {
        if (cancelled) return;
        setAllApplications(apps || []);
        setAllTasks(tasks || []);
        setClients(clientList || []);
        setAdvisors(advisorList || []);
        setRecentNotes((notes || []).slice(0, 5));
        setLeads(leadsList || []);
      })
      .catch((err) => console.error('Dashboard load error:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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

  const avgDealSize =
    settledApplications.length > 0
      ? settledApplications.reduce((s, a) => s + (a.loanAmount || 0), 0) / settledApplications.length
      : 0;

  const pipelineByStage = useMemo(() => {
    const byStage: Record<string, Application[]> = {};
    PIPELINE_BOARD_STAGES.forEach((stage) => {
      byStage[stage] = viewFilteredApplications.filter((a) => workflowKey(a) === stage);
    });
    return byStage;
  }, [viewFilteredApplications]);

  const monthKeys = useMemo(() => getMonthKeysLast6(), []);

  const areaChartData = useMemo(() => {
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

  const monthlySettledData = useMemo(() => {
    return monthKeys.map(({ key, label }) => {
      const sum = settledApplications
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
  }, [settledApplications, monthKeys]);

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

  const pendingTasks = useMemo(() => {
    return (allTasks || [])
      .filter((t) => !t.isCompleted)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 6);
  }, [allTasks]);

  const recentLeadsFiltered = useMemo(() => {
    const now = new Date();
    const isThisWeek = (d: Date) => {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      start.setHours(0,0,0,0);
      const end = new Date(start); end.setDate(start.getDate() + 7);
      return d >= start && d < end;
    };
    const isThisMonth = (d: Date) => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return (leads || [])
      .filter((l) => {
        const d = new Date(l.dateAdded || 0);
        return leadsTimeFilter === 'this_week' ? isThisWeek(d) : isThisMonth(d);
      })
      .sort((a, b) => new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime())
      .slice(0, 5);
  }, [leads, leadsTimeFilter]);

  const fetchAIInsights = React.useCallback(() => {
    setAiInsightsLoading(true);
    const sanitized: SanitizedDashboardData = {
      totalPipelineValue: totalPipelineValue,
      activeApplicationsCount: activeApplications.length,
      tasksDueCount: tasksDueTodayCount,
      applicationsByStage: PIPELINE_BOARD_STAGES.reduce((acc, s) => {
        acc[s] = (pipelineByStage[s] || []).length;
        return acc;
      }, {} as Record<string, number>),
      settledThisMonthCount,
    };
    geminiService
      .getDashboardAIInsights(sanitized)
      .then((text) => {
        setAiInsights(text || '');
        try { sessionStorage.setItem(AI_INSIGHTS_CACHE_KEY, text || ''); } catch (_) {}
      })
      .catch(() => setAiInsights('Unable to load insights.'))
      .finally(() => setAiInsightsLoading(false));
  }, [totalPipelineValue, activeApplications.length, tasksDueTodayCount, pipelineByStage, settledThisMonthCount]);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(AI_INSIGHTS_CACHE_KEY);
      if (cached) setAiInsights(cached);
      else if (!loading) fetchAIInsights();
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!loading && !aiInsights && !aiInsightsLoading) fetchAIInsights();
  }, [loading]);

  const cardClass = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6';
  const advisorNamesById = useMemo(() => {
    const m: Record<string, string> = {};
    (advisors || []).forEach((a) => { m[a.id] = a.name; });
    return m;
  }, [advisors]);

  const metricCardStyles = [
    { backgroundColor: PASTEL.blue.bg, borderLeft: `4px solid ${PASTEL.blue.text}` },
    { backgroundColor: PASTEL.green.bg, borderLeft: `4px solid ${PASTEL.green.text}` },
    { backgroundColor: PASTEL.orange.bg, borderLeft: `4px solid ${PASTEL.orange.text}` },
    { backgroundColor: PASTEL.purple.bg, borderLeft: `4px solid ${PASTEL.purple.text}` },
  ];

  return (
    <div className="min-h-full rounded-xl bg-[#f8fafc] dark:bg-gray-900">
      <div className="space-y-6 p-6">
      {/* HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        {advisor.role === 'admin' && (
          <div className="inline-flex rounded-full p-1 bg-white dark:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={() => setViewMode('my')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                viewMode === 'my'
                  ? 'shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
              style={viewMode === 'my' ? { backgroundColor: PASTEL.blue.bg, color: PASTEL.blue.text } : undefined}
            >
              My View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('firm')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                viewMode === 'firm'
                  ? 'shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
              style={viewMode === 'firm' ? { backgroundColor: PASTEL.blue.bg, color: PASTEL.blue.text } : undefined}
            >
              Firm View
            </button>
          </div>
        )}
      </div>

      {/* ROW 1 — Two hero cards 50/50 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClass}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Pipeline Value</p>
          {loading ? (
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-600 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-4xl font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(totalPipelineValue)}
            </p>
          )}
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            across {activeApplications.length} active applications
          </p>
          <div className="mt-4 h-48">
            {loading ? (
              <div className="h-full w-full bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={areaChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PASTEL.blue.text} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={PASTEL.blue.text} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Value']}
                    labelFormatter={(label) => label}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={PASTEL.blue.text}
                    strokeWidth={2}
                    fill="url(#areaGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className={cardClass}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Settled This Month</p>
          {loading ? (
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-600 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-4xl font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(settledValueThisMonth)}
            </p>
          )}
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            {settledThisMonthCount} deals settled
          </p>
          <div className="mt-4 h-48">
            {loading ? (
              <div className="h-full w-full bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySettledData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}K` : v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Settled']}
                  />
                  <Bar dataKey="value" fill={PASTEL.blue.text} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ROW 2 — 4 metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Active Applications', value: loading ? '—' : activeApplicationsCount.toString(), pct: metricPctChanges.activePct },
          { label: 'New Leads This Month', value: loading ? '—' : newLeadsThisMonth.toString(), pct: metricPctChanges.leadsPct },
          { label: 'Tasks Due Today', value: loading ? '—' : tasksDueTodayCount.toString(), pct: metricPctChanges.tasksPct },
          { label: 'Conversion Rate', value: loading ? '—' : `${conversionRate}%`, pct: metricPctChanges.convPct },
        ].map((m, idx) => (
          <div
            key={m.label}
            className="rounded-xl shadow-sm p-6 border-l-4 dark:bg-gray-800/80"
            style={metricCardStyles[idx]}
          >
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {m.label}
            </p>
            {loading ? (
              <div className="h-9 w-16 bg-gray-200 dark:bg-gray-600 rounded animate-pulse mt-2" />
            ) : (
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{m.value}</p>
            )}
            {!loading && m.pct !== null && (
              <div className="mt-2 flex items-center gap-1">
                {m.pct > 0 && <span className="text-green-600 dark:text-green-400 text-xs">↑</span>}
                {m.pct < 0 && <span className="text-red-600 dark:text-red-400 text-xs">↓</span>}
                {m.pct === 0 && <span className="text-gray-500 dark:text-gray-400 text-xs">→</span>}
                <span
                  className={`text-xs font-medium ${
                    m.pct > 0 ? 'text-green-600 dark:text-green-400' : m.pct < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {m.pct > 0 ? '+' : ''}{m.pct}% vs last month
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ROW 4 — Pending Tasks, Recent Leads, AI Insights */}
      <style>{`
        @keyframes rotateBorder {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .ai-card-wrapper {
          padding: 2px;
          border-radius: 14px;
          background: linear-gradient(270deg, #6366f1, #3b82f6, #06b6d4, #8b5cf6, #6366f1);
          background-size: 400% 400%;
          animation: rotateBorder 4s ease infinite;
        }
        .ai-card-inner {
          background: white;
          border-radius: 12px;
          padding: 24px;
          height: 100%;
        }
        .dark .ai-card-inner { background: rgb(31 41 55); }
      `}</style>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Tasks */}
        <div className={cardClass}>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pending Tasks</h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : pendingTasks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming tasks.</p>
          ) : (
            <ul className="space-y-2">
              {pendingTasks.map((task) => {
                const due = task.dueDate ? new Date(task.dueDate) : null;
                const isOverdue = due && due.getTime() < Date.now() && !task.isCompleted;
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setCurrentView('tasks')}
                      className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <span
                        className={`flex-shrink-0 w-2 h-2 rounded-full ${
                          task.priority === 'High' ? 'bg-red-500' : task.priority === 'Medium' ? 'bg-yellow-500' : 'bg-gray-400'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{task.title}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {task.clientId ? clientNamesById[task.clientId] || '—' : '—'}
                        </p>
                      </div>
                      <span className={`text-xs flex-shrink-0 ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setCurrentView('tasks'); }}
            className="inline-block mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all
          </a>
        </div>
        {/* Recent Leads */}
        <div className={cardClass}>
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Leads</h3>
            <span className="flex-shrink-0 min-w-[1.75rem] h-7 px-2 flex items-center justify-center rounded-full text-xs font-medium bg-[#dbeafe] dark:bg-blue-900/40 text-[#2563eb] dark:text-blue-300">
              {recentLeadsFiltered.length}
            </span>
          </div>
          <div className="inline-flex rounded-lg p-0.5 bg-gray-100 dark:bg-gray-700 mb-4">
            <button
              type="button"
              onClick={() => setLeadsTimeFilter('this_week')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${leadsTimeFilter === 'this_week' ? 'bg-white dark:bg-gray-600 shadow' : ''}`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setLeadsTimeFilter('this_month')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${leadsTimeFilter === 'this_month' ? 'bg-white dark:bg-gray-600 shadow' : ''}`}
            >
              This Month
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentLeadsFiltered.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No leads in this period.</p>
          ) : (
            <ul className="space-y-2">
              {recentLeadsFiltered.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => navigateToClient(l.id)}
                    className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#dbeafe] dark:bg-blue-900/40 flex items-center justify-center text-xs font-medium text-[#2563eb] dark:text-blue-300">
                      {(l.name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{l.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{l.email}</p>
                    </div>
                    <span className="flex-shrink-0 px-2 py-0.5 text-xs rounded bg-[#dbeafe] dark:bg-blue-900/40 text-[#2563eb] dark:text-blue-300">
                      {l.status || 'New'}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">{timeAgo(l.dateAdded || '')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* AI Insights */}
        <div className="ai-card-wrapper">
          <div className="ai-card-inner">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">✨ AI Insights</h3>
              <button
                type="button"
                onClick={() => { try { sessionStorage.removeItem(AI_INSIGHTS_CACHE_KEY); } catch (_) {} fetchAIInsights(); }}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Refresh
              </button>
            </div>
            {aiInsightsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Icon name="Loader" className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : aiInsights ? (
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                {aiInsights.split('\n').filter((l) => l.trim()).slice(0, 3).map((line, i) => {
                  const bulletColor = i === 0 ? '#2563eb' : i === 1 ? '#ea580c' : '#16a34a';
                  return (
                    <li key={i} className="flex gap-2">
                      <span className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: bulletColor }} />
                      <span>{line.replace(/^[-*•]\s*/, '').trim()}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No insights yet. Click Refresh to generate.</p>
            )}
          </div>
        </div>
      </div>

      {/* ROW 5 — Active Applications full-width table */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Active Applications</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Search by client name..."
              value={activeAppsSearch}
              onChange={(e) => { setActiveAppsSearch(e.target.value); setActiveAppsPage(1); }}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 w-48"
            />
            <select
              value={activeAppsStageFilter}
              onChange={(e) => { setActiveAppsStageFilter(e.target.value); setActiveAppsPage(1); }}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            >
              <option value="all">All stages</option>
              {ALL_STAGES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="h-64 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-700 dark:text-gray-300">
                <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="py-2 pr-2">Reference</th>
                    <th className="py-2 px-2">Client Name</th>
                    <th className="py-2 px-2">Loan Amount</th>
                    <th className="py-2 px-2">Type</th>
                    <th className="py-2 px-2">Stage</th>
                    <th className="py-2 px-2">Assigned To</th>
                    <th className="py-2 px-2">Days Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {activeApplicationsPaginated.map((app) => {
                    const stage = workflowKey(app);
                    const pill = STAGE_PASTEL[stage] || { bg: '#dbeafe', text: '#2563eb' };
                    return (
                      <tr
                        key={app.id}
                        onClick={() => navigateToApplication(app.id)}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      >
                        <td className="py-2 pr-2 font-medium text-gray-900 dark:text-white">{app.referenceNumber || '—'}</td>
                        <td className="py-2 px-2">{app.clientName}</td>
                        <td className="py-2 px-2">{app.loanAmount ? formatCurrency(app.loanAmount) : '—'}</td>
                        <td className="py-2 px-2 text-gray-500 dark:text-gray-400">—</td>
                        <td className="py-2 px-2">
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ backgroundColor: pill.bg, color: pill.text }}>
                            {stage.charAt(0).toUpperCase() + stage.slice(1)}
                          </span>
                        </td>
                        <td className="py-2 px-2">{advisorNamesById[app.advisorId] || '—'}</td>
                        <td className="py-2 px-2">{daysInStage(app)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {activeApplicationsFiltered.length === 0 && (
              <p className="py-6 text-center text-gray-500 dark:text-gray-400">No active applications.</p>
            )}
            {activeAppsTotalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600 mt-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Page {activeAppsPage} of {activeAppsTotalPages} ({activeApplicationsFiltered.length} total)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveAppsPage((p) => Math.max(1, p - 1))}
                    disabled={activeAppsPage <= 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveAppsPage((p) => Math.min(activeAppsTotalPages, p + 1))}
                    disabled={activeAppsPage >= activeAppsTotalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
};

export default Dashboard;
