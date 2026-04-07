import { supabase } from './supabaseClient';

/** Matches `market_rates` + NZ term products used in RatesPage */
const FIXED_RATE_TYPES = ['fixed', 'fixed_6m', 'fixed_1yr', 'fixed_2yr', 'fixed_3yr', 'fixed_5yr'] as const;

export interface FlowInsightRow {
  id: string;
  insight_type: string;
  priority: string;
  title: string;
  body: string;
  action_label: string;
  action_type: string;
  action_data: unknown;
  draft_type: string;
  draft_subject: string;
  draft_content: unknown;
  created_at: string;
  client_id: string;
  application_id: string;
}

export interface FlowIntelligenceDashboardData {
  pipeline: {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    settled_this_month: number;
    total_value: number;
  };
  anomalies: {
    total: number;
    critical: number;
    high: number;
    items: { severity: string | null; title: string | null; application_id: string | null }[];
  };
  commissions: {
    expected: number;
    received: number;
    clawback_risk: number;
  };
  refix: {
    due_30: number;
    due_60: number;
    due_90: number;
    total_value: number;
    items: {
      loan_amount: number | null;
      current_rate_expiry_date: string | null;
      lender_name: string | null;
      client_id: string | null;
    }[];
  };
  insights: FlowInsightRow[];
  market_rates: { lender_name: string | null; rate_type: string | null; rate_percent: number | null }[];
  /** Best rate + lender for the FI dashboard table */
  market_rates_best: {
    fixed_1yr: { rate_percent: number; lender_name: string | null } | null;
    fixed_2yr: { rate_percent: number; lender_name: string | null } | null;
    floating: { rate_percent: number; lender_name: string | null } | null;
  };
  rates_unique_lender_count: number;
  /** Distinct application ids with an open anomaly (for navigation filter) */
  anomaly_application_ids: string[];
  tasks_due: {
    id: string;
    title: string | null;
    priority: string | null;
    due_date: string | null;
    auto_generated: boolean | null;
    status: string | null;
  }[];
  loaded_at: Date;
}

function monthStart(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

function isApprovedStage(workflowStage: string | null | undefined): boolean {
  const s = (workflowStage || '').toLowerCase();
  return ['approved', 'conditionally_approved', 'conditional', 'unconditional'].includes(s);
}

function bestRatePerTerm(
  rows: { lender_name: string | null; rate_type: string | null; rate_percent: number | null }[],
): { lender_name: string | null; rate_type: string | null; rate_percent: number | null }[] {
  const best = new Map<string, { lender_name: string | null; rate_type: string | null; rate_percent: number | null }>();
  for (const r of rows) {
    if (r.rate_type == null || r.rate_percent == null) continue;
    const prev = best.get(r.rate_type);
    if (!prev || r.rate_percent < (prev.rate_percent ?? 999)) best.set(r.rate_type, r);
  }
  return Array.from(best.values()).sort((a, b) => (a.rate_percent ?? 0) - (b.rate_percent ?? 0));
}

function bestForType(
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

/**
 * Single parallel load for Flow Intelligence home (pipeline, anomalies, commissions, refix, insights, rates, tasks).
 */
export async function loadFlowIntelligenceDashboard(): Promise<FlowIntelligenceDashboardData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: adv, error: advErr } = await supabase.from('advisors').select('firm_id').eq('id', user.id).single();
  if (advErr || !adv?.firm_id) return null;

  const firmId = adv.firm_id as string;
  const today = new Date().toISOString().split('T')[0];
  const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const msStart = monthStart();

  const [
    apps,
    anomalies,
    commissions,
    refix,
    insights,
    rates,
    tasks,
  ] = await Promise.all([
    supabase
      .from('applications')
      .select('workflow_stage, loan_amount, status, updated_at')
      .eq('firm_id', firmId)
      .eq('status', 'active'),
    supabase
      .from('anomaly_flags')
      .select('severity, title, application_id')
      .eq('firm_id', firmId)
      .eq('status', 'open'),
    supabase
      .from('commissions')
      .select('net_amount, gross_amount, status, received_date, clawback_risk_until, settlement_date')
      .eq('firm_id', firmId),
    supabase
      .from('settled_loans')
      .select('loan_amount, current_rate_expiry_date, lender_name, client_id')
      .eq('firm_id', firmId)
      .eq('status', 'active')
      .in('current_rate_type', [...FIXED_RATE_TYPES])
      .gte('current_rate_expiry_date', today)
      .lte('current_rate_expiry_date', in90),
    supabase
      .from('ai_insights')
      .select('*')
      .eq('firm_id', firmId)
      .eq('is_actioned', false)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('market_rates')
      .select('lender_name, rate_type, rate_percent')
      .eq('is_current', true)
      .eq('owner_occupied', true)
      .order('rate_percent', { ascending: true }),
    supabase
      .from('tasks')
      .select('title, priority, due_date, auto_generated, status')
      .eq('assigned_to', user.id)
      .eq('firm_id', firmId)
      .eq('status', 'pending')
      .lte('due_date', tomorrow)
      .order('due_date', { ascending: true })
      .limit(10),
  ]);

  const appRows = apps.data ?? [];
  const anomRows = anomalies.data ?? [];
  const commRows = commissions.data ?? [];
  const refixRows = refix.data ?? [];
  const rateRows = rates.data ?? [];

  const settledThisMonth = appRows.filter((a) => {
    if ((a.workflow_stage || '').toLowerCase() !== 'settled') return false;
    const u = a.updated_at ? new Date(a.updated_at) : null;
    return u && u >= msStart;
  }).length;

  const pipeline = {
    total: appRows.filter((a) => (a.status || '').toLowerCase() === 'active').length,
    draft: appRows.filter((a) => (a.workflow_stage || '').toLowerCase() === 'draft').length,
    submitted: appRows.filter((a) => (a.workflow_stage || '').toLowerCase() === 'submitted').length,
    approved: appRows.filter((a) => isApprovedStage(a.workflow_stage)).length,
    settled_this_month: settledThisMonth,
    total_value: appRows.reduce((s, a) => s + (Number(a.loan_amount) || 0), 0),
  };

  const anomaly_application_ids = [
    ...new Set(
      anomRows
        .map((a) => a.application_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const anomaliesAgg = {
    total: anomRows.length,
    critical: anomRows.filter((a) => (a.severity || '').toLowerCase() === 'critical').length,
    high: anomRows.filter((a) => (a.severity || '').toLowerCase() === 'high').length,
    items: anomRows.slice(0, 3).map((a) => ({
      severity: a.severity,
      title: a.title,
      application_id: a.application_id,
    })),
  };

  const commissionsAgg = {
    expected:
      commRows
        .filter((c) => (c.status || '').toLowerCase() === 'expected')
        .filter((c) => {
          if (!c.settlement_date) return false;
          return new Date(c.settlement_date) >= msStart;
        })
        .reduce((s, c) => s + Number(c.net_amount), 0) || 0,
    received:
      commRows
        .filter((c) => (c.status || '').toLowerCase() === 'received')
        .filter((c) => {
          if (!c.received_date) return false;
          return new Date(c.received_date) >= msStart;
        })
        .reduce((s, c) => s + Number(c.net_amount), 0) || 0,
    clawback_risk:
      commRows
        .filter((c) => c.clawback_risk_until && new Date(c.clawback_risk_until) > new Date())
        .reduce((s, c) => s + Number(c.gross_amount), 0) || 0,
  };

  const now = Date.now();
  const d30 = 30 * 24 * 60 * 60 * 1000;
  const d60 = 60 * 24 * 60 * 60 * 1000;

  const refixAgg = {
    due_30: refixRows.filter((r) => {
      if (!r.current_rate_expiry_date) return false;
      return new Date(r.current_rate_expiry_date).getTime() - now <= d30;
    }).length,
    due_60: refixRows.filter((r) => {
      if (!r.current_rate_expiry_date) return false;
      return new Date(r.current_rate_expiry_date).getTime() - now <= d60;
    }).length,
    due_90: refixRows.length,
    total_value: refixRows.reduce((s, r) => s + (Number(r.loan_amount) || 0), 0),
    items: refixRows,
  };

  const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const insightRows = (insights.data || []) as FlowInsightRow[];
  insightRows.sort((a, b) => {
    const pa = priorityRank[(a.priority || '').toLowerCase()] ?? 99;
    const pb = priorityRank[(b.priority || '').toLowerCase()] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const ratesLenderCount = new Set(rateRows.map((r) => r.lender_name).filter(Boolean)).size;

  return {
    pipeline,
    anomalies: anomaliesAgg,
    commissions: commissionsAgg,
    refix: refixAgg,
    insights: insightRows,
    market_rates: bestRatePerTerm(rateRows),
    market_rates_best: {
      fixed_1yr: bestForType(rateRows, 'fixed_1yr'),
      fixed_2yr: bestForType(rateRows, 'fixed_2yr'),
      floating: bestForType(rateRows, 'floating'),
    },
    rates_unique_lender_count: ratesLenderCount,
    anomaly_application_ids,
    tasks_due: (tasks.data || []) as FlowIntelligenceDashboardData['tasks_due'],
    loaded_at: new Date(),
  };
}
