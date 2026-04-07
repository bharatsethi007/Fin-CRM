import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { Icon } from '../common/Icon';
import { useToast } from '../../hooks/useToast';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { AggregatorStatement } from './AggregatorStatement';
import { CommissionSettings } from './CommissionSettings';

export type CommissionRecord = {
  id: string;
  firm_id: string;
  client_name?: string | null;
  lender?: string | null;
  commission_type?: string | null;
  loan_amount?: number | null;
  gross_amount?: number | null;
  gst?: number | null;
  aggregator_fee?: number | null;
  net_amount?: number | null;
  settlement_date?: string | null;
  expected_date?: string | null;
  received_date?: string | null;
  clawback_risk_until?: string | null;
  status?: string | null;
  clients?: { first_name?: string | null; last_name?: string | null } | null;
  advisors?: { first_name?: string | null; last_name?: string | null } | null;
};

type CommissionSummary = {
  total_expected: number;
  total_received: number;
  total_overdue: number;
  clawback_at_risk: number;
};

type StatusFilter = 'all' | 'expected' | 'received' | 'overdue' | 'clawback';
type TypeFilter = 'all' | 'upfront' | 'trail' | 'clawback';
type PageTab = 'commissions' | 'statements' | 'settings';
type CommissionSubTab = 'register' | 'clawback';

const fmtMoney = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(Number(n));
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const t = Date.parse(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toLocaleDateString('en-NZ');
};

/** YYYY-MM-DD (ISO date string). */
function toYmd(d: Date) {
  return d.toISOString().split('T')[0];
}

function displayClientName(r: CommissionRecord): string {
  const j = r.clients;
  if (j && (j.first_name != null || j.last_name != null)) {
    const n = [j.first_name, j.last_name]
      .filter((x) => x != null && String(x).trim() !== '')
      .join(' ')
      .trim();
    if (n) return n;
  }
  return (r.client_name && r.client_name.trim()) || '—';
}

function statusBadgeClass(status: string | null | undefined) {
  const s = (status || '').toLowerCase();
  if (s === 'received') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (s === 'expected') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
  if (s === 'overdue') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  if (s === 'clawback') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

function clawbackRowColor(days: number | null | undefined) {
  if (days == null || Number.isNaN(days)) return 'bg-gray-50 dark:bg-gray-800/50';
  if (days < 30) return 'bg-red-50 dark:bg-red-950/30';
  if (days <= 90) return 'bg-amber-50 dark:bg-amber-950/30';
  return 'bg-emerald-50 dark:bg-emerald-950/30';
}

export const CommissionPage: React.FC = () => {
  const [firmId, setFirmId] = useState<string | null>(null);
  const [pageTab, setPageTab] = useState<PageTab>('commissions');
  const [commissionSubTab, setCommissionSubTab] = useState<CommissionSubTab>('register');
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [lenderOptions, setLenderOptions] = useState<string[]>([]);
  const [clawbackRows, setClawbackRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [clawbackLoading, setClawbackLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(() => {
    const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0];
    return defaultFrom;
  });
  const [dateTo, setDateTo] = useState(() => {
    const defaultTo = new Date().toISOString().split('T')[0];
    return defaultTo;
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [lenderFilter, setLenderFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<CommissionRecord | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<CommissionRecord>>({});
  const [saving, setSaving] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const toast = useToast();

  useEffect(() => {
    async function getFirmId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: adv } = await supabase
        .from('advisors')
        .select('firm_id')
        .eq('id', user.id)
        .single();
      if (adv?.firm_id) setFirmId(adv.firm_id);
      else setLoading(false);
    }
    void getFirmId();
  }, []);

  const loadSummary = useCallback(async () => {
    if (!firmId) return;
    setSummaryError(null);
    const { data, error } = await supabase
      .from('commissions')
      .select('net_amount, gross_amount, status, commission_type, clawback_risk_until, settlement_date')
      .eq('firm_id', firmId)
      .gte('settlement_date', dateFrom)
      .lte('settlement_date', dateTo);

    if (error) {
      logger.error(error);
      setSummaryError(error.message);
      return;
    }
    if (!data) return;

    const expected = data
      .filter((r) => (r.status || '').toLowerCase() === 'expected')
      .reduce((s, r) => s + Number(r.net_amount), 0);
    const received = data
      .filter((r) => (r.status || '').toLowerCase() === 'received')
      .reduce((s, r) => s + Number(r.net_amount), 0);
    const overdue = data
      .filter((r) => (r.status || '').toLowerCase() === 'overdue')
      .reduce((s, r) => s + Number(r.net_amount), 0);
    const clawback = data
      .filter(
        (r) =>
          (r.status || '').toLowerCase() === 'received' &&
          r.clawback_risk_until &&
          new Date(r.clawback_risk_until) > new Date(),
      )
      .reduce((s, r) => s + Number(r.gross_amount), 0);

    setSummary({
      total_expected: expected,
      total_received: received,
      total_overdue: overdue,
      clawback_at_risk: clawback,
    });
  }, [firmId, dateFrom, dateTo]);

  const loadCommissions = useCallback(async () => {
    if (!firmId) return;
    setTableError(null);
    let query = supabase
      .from('commissions')
      .select(
        `
      *,
      clients(first_name, last_name),
      advisors(first_name, last_name)
    `,
      )
      .eq('firm_id', firmId)
      .gte('settlement_date', dateFrom)
      .lte('settlement_date', dateTo)
      .order('settlement_date', { ascending: false });

    if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (typeFilter && typeFilter !== 'all') query = query.eq('commission_type', typeFilter);
    if (lenderFilter && lenderFilter !== 'all') query = query.eq('lender', lenderFilter);

    const { data, error } = await query;
    if (error) {
      logger.error(error);
      setTableError(error.message);
      setCommissions([]);
      return;
    }
    setCommissions((data as CommissionRecord[]) || []);
  }, [firmId, dateFrom, dateTo, statusFilter, typeFilter, lenderFilter]);

  const loadClawbackView = useCallback(async () => {
    if (!firmId) return;
    setClawbackLoading(true);
    try {
      const q = supabase.from('v_clawback_risk').select('*').order('days_until_safe', { ascending: true });
      const { data, error } = await q;
      if (error) {
        setClawbackRows([]);
        setTableError(error.message);
        return;
      }
      const list = (data as Record<string, unknown>[]) || [];
      setClawbackRows(
        list.filter((r) => {
          const fid = r.firm_id as string | undefined;
          return !fid || fid === firmId;
        }),
      );
    } finally {
      setClawbackLoading(false);
    }
  }, [firmId]);

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadSummary(), loadCommissions()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [firmId, dateFrom, dateTo, statusFilter, typeFilter, lenderFilter, loadSummary, loadCommissions]);

  useEffect(() => {
    if (!firmId) return;
    (async () => {
      const { data } = await supabase.from('commissions').select('lender').eq('firm_id', firmId);
      const s = new Set<string>();
      (data || []).forEach((r: { lender: string | null }) => {
        if (r.lender) s.add(r.lender);
      });
      setLenderOptions(Array.from(s).sort());
    })();
  }, [firmId]);

  useEffect(() => {
    if (pageTab === 'commissions' && commissionSubTab === 'clawback') loadClawbackView();
  }, [pageTab, commissionSubTab, loadClawbackView]);

  const refreshCommissionList = useCallback(() => {
    if (!firmId) return;
    void loadCommissions();
    void loadSummary();
  }, [firmId, loadCommissions, loadSummary]);

  useAutoRefresh(refreshCommissionList, 30);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return commissions;
    const q = search.trim().toLowerCase();
    return commissions.filter((r) => {
      const name = displayClientName(r).toLowerCase();
      const fallback = (r.client_name || '').toLowerCase();
      return name.includes(q) || fallback.includes(q);
    });
  }, [commissions, search]);

  const openPanel = (r: CommissionRecord) => {
    setSelected(r);
    setDraft({ ...r });
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setSelected(null);
    setDraft({});
  };

  const saveDraft = async () => {
    if (!selected?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('commissions')
        .update({
          client_name: draft.client_name,
          lender: draft.lender,
          commission_type: draft.commission_type,
          loan_amount: draft.loan_amount,
          gross_amount: draft.gross_amount,
          gst: draft.gst,
          aggregator_fee: draft.aggregator_fee,
          net_amount: draft.net_amount,
          settlement_date: draft.settlement_date || null,
          expected_date: draft.expected_date || null,
          received_date: draft.received_date || null,
          clawback_risk_until: draft.clawback_risk_until || null,
          status: draft.status,
        })
        .eq('id', selected.id);

      if (error) throw error;
      await loadCommissions();
      await loadSummary();
      const updated = { ...selected, ...draft } as CommissionRecord;
      setSelected(updated);
      toast.success('Commission updated');
    } catch (e) {
      logger.error(e);
      toast.error('Failed to update commission');
    } finally {
      setSaving(false);
    }
  };

  const applyMarkReceived = async (row: CommissionRecord) => {
    setMarkingId(row.id);
    const today = toYmd(new Date());
    try {
      const { error } = await supabase
        .from('commissions')
        .update({ status: 'received', received_date: today })
        .eq('id', row.id);
      if (error) throw error;
      await loadCommissions();
      await loadSummary();
      if (selected?.id === row.id) {
        setSelected({ ...row, status: 'received', received_date: today });
        setDraft((d) => ({ ...d, status: 'received', received_date: today }));
      }
      toast.success('Commission marked as received');
    } catch (err) {
      logger.error(err);
      toast.error('Failed to update commission');
    } finally {
      setMarkingId(null);
    }
  };

  const markReceived = (e: React.MouseEvent, row: CommissionRecord) => {
    e.stopPropagation();
    void applyMarkReceived(row);
  };

  const s = summary || {
    total_expected: 0,
    total_received: 0,
    total_overdue: 0,
    clawback_at_risk: 0,
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Commission</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Track upfront, trail, and clawback commission across your panel.
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-800/80">
          <button
            type="button"
            onClick={() => setPageTab('commissions')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              pageTab === 'commissions'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Commissions
          </button>
          <button
            type="button"
            onClick={() => setPageTab('statements')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              pageTab === 'statements'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Statements
          </button>
          <button
            type="button"
            onClick={() => setPageTab('settings')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              pageTab === 'settings'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {pageTab === 'commissions' && (
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-50/80 dark:bg-gray-800/50 w-fit">
          <button
            type="button"
            onClick={() => setCommissionSubTab('register')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              commissionSubTab === 'register'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Commission register
          </button>
          <button
            type="button"
            onClick={() => setCommissionSubTab('clawback')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              commissionSubTab === 'clawback'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Clawback risk
          </button>
        </div>
      )}

      {summaryError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Summary could not be loaded: {summaryError}
        </div>
      )}

      {pageTab === 'commissions' && commissionSubTab === 'register' && (
        <>
          {/* SECTION 1 — Summary */}
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Expected this month
              </p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 tabular-nums">
                {loading ? '…' : fmtMoney(s.total_expected)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Received this month
              </p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 tabular-nums">
                {loading ? '…' : fmtMoney(s.total_received)}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/30 p-4 shadow-sm">
              <p className="text-xs font-medium text-red-700 dark:text-red-300 uppercase tracking-wide">
                Overdue
              </p>
              <p className="text-2xl font-semibold text-red-800 dark:text-red-200 mt-1 tabular-nums">
                {loading ? '…' : fmtMoney(s.total_overdue)}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/40 p-4 shadow-sm">
              <p className="text-xs font-medium text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                Clawback at risk
              </p>
              <p className="text-2xl font-semibold text-amber-950 dark:text-amber-100 mt-1 tabular-nums">
                {loading ? '…' : fmtMoney(s.clawback_at_risk)}
              </p>
            </div>
          </section>

          {/* SECTION 2 — Filters */}
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm px-3 py-2 min-w-[140px]"
                >
                  <option value="all">All</option>
                  <option value="expected">Expected</option>
                  <option value="received">Received</option>
                  <option value="overdue">Overdue</option>
                  <option value="clawback">Clawback</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm px-3 py-2 min-w-[140px]"
                >
                  <option value="all">All</option>
                  <option value="upfront">Upfront</option>
                  <option value="trail">Trail</option>
                  <option value="clawback">Clawback</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Lender</label>
                <select
                  value={lenderFilter}
                  onChange={(e) => setLenderFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm px-3 py-2 min-w-[160px]"
                >
                  <option value="all">All lenders</option>
                  {lenderOptions.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Search client</label>
                <div className="relative">
                  <Icon
                    name="Search"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                  />
                  <input
                    type="search"
                    placeholder="Name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm pl-9 pr-3 py-2"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3 — Table */}
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            {tableError && (
              <div className="px-4 py-3 text-sm text-red-700 dark:text-red-300 border-b border-gray-200 dark:border-gray-600">
                {tableError}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    <th className="px-3 py-3 whitespace-nowrap">Client</th>
                    <th className="px-3 py-3 whitespace-nowrap">Lender</th>
                    <th className="px-3 py-3 whitespace-nowrap">Type</th>
                    <th className="px-3 py-3 whitespace-nowrap text-right">Loan amount</th>
                    <th className="px-3 py-3 whitespace-nowrap text-right">Gross</th>
                    <th className="px-3 py-3 whitespace-nowrap text-right">GST</th>
                    <th className="px-3 py-3 whitespace-nowrap text-right">Aggregator fee</th>
                    <th className="px-3 py-3 whitespace-nowrap text-right">Net</th>
                    <th className="px-3 py-3 whitespace-nowrap">Settlement</th>
                    <th className="px-3 py-3 whitespace-nowrap">Expected</th>
                    <th className="px-3 py-3 whitespace-nowrap">Received</th>
                    <th className="px-3 py-3 whitespace-nowrap">Clawback until</th>
                    <th className="px-3 py-3 whitespace-nowrap">Status</th>
                    <th className="px-3 py-3 whitespace-nowrap"> </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={14} className="px-4 py-12 text-center text-gray-500">
                        <Icon name="Loader" className="h-6 w-6 animate-spin inline mr-2" />
                        Loading…
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                        No commission rows match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => openPanel(r)}
                        className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white whitespace-nowrap max-w-[180px] truncate">
                          {displayClientName(r)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.lender || '—'}</td>
                        <td className="px-3 py-2.5 capitalize text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {r.commission_type || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(r.loan_amount)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(r.gross_amount)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(r.gst)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(r.aggregator_fee)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900 dark:text-white">{fmtMoney(r.net_amount)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{fmtDate(r.settlement_date)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{fmtDate(r.expected_date)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{fmtDate(r.received_date)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{fmtDate(r.clawback_risk_until)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeClass(r.status)}`}>
                            {r.status || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={
                              markingId === r.id ||
                              (r.status || '').toLowerCase() === 'received'
                            }
                            onClick={(e) => markReceived(e, r)}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {markingId === r.id ? '…' : 'Mark received'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {pageTab === 'commissions' && commissionSubTab === 'clawback' && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Within clawback window</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Sorted by days until safe (soonest first). Colours: red &lt; 30 days, amber 30–90, green &gt; 90.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">
                  <th className="px-3 py-3">Client</th>
                  <th className="px-3 py-3">Lender</th>
                  <th className="px-3 py-3 text-right">Net</th>
                  <th className="px-3 py-3">Clawback until</th>
                  <th className="px-3 py-3 text-right">Days until safe</th>
                </tr>
              </thead>
              <tbody>
                {clawbackLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                      <Icon name="Loader" className="h-6 w-6 animate-spin inline mr-2" />
                      Loading…
                    </td>
                  </tr>
                ) : clawbackRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                      No rows in <code className="text-xs">v_clawback_risk</code> for this firm.
                    </td>
                  </tr>
                ) : (
                  clawbackRows.map((raw, idx) => {
                    const days = raw.days_until_safe != null ? Number(raw.days_until_safe) : null;
                    const rowBg = clawbackRowColor(days);
                    const client =
                      (raw.client_name as string) ||
                      (raw.client as string) ||
                      '—';
                    const lender = (raw.lender as string) || '—';
                    const net = raw.net_amount ?? raw.net;
                    const until = (raw.clawback_risk_until as string) || (raw.clawback_until as string);
                    return (
                      <tr key={(raw.id as string) || String(idx)} className={`border-b border-gray-100 dark:border-gray-700 ${rowBg}`}>
                        <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{client}</td>
                        <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200">{lender}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(net as number)}</td>
                        <td className="px-3 py-2.5">{fmtDate(until)}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-900 dark:text-white">
                          {days != null && !Number.isNaN(days) ? days : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pageTab === 'statements' && firmId && <AggregatorStatement firmId={firmId} />}

      {pageTab === 'settings' && firmId && <CommissionSettings firmId={firmId} />}

      {/* Side panel */}
      {pageTab === 'commissions' && commissionSubTab === 'register' && panelOpen && selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close panel"
            onClick={closePanel}
          />
          <div className="relative w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Commission detail</h2>
              <button
                type="button"
                onClick={closePanel}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <Icon name="X" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(
                [
                  ['client_name', 'Client name'],
                  ['lender', 'Lender'],
                  ['commission_type', 'Type'],
                  ['loan_amount', 'Loan amount'],
                  ['gross_amount', 'Gross'],
                  ['gst', 'GST'],
                  ['aggregator_fee', 'Aggregator fee'],
                  ['net_amount', 'Net amount'],
                  ['settlement_date', 'Settlement date'],
                  ['expected_date', 'Expected date'],
                  ['received_date', 'Received date'],
                  ['clawback_risk_until', 'Clawback risk until'],
                  ['status', 'Status'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
                  {key === 'commission_type' || key === 'status' ? (
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                      value={String(draft[key] ?? '')}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                  ) : key.includes('date') ? (
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                      value={
                        draft[key] && String(draft[key]).length >= 10
                          ? String(draft[key]).slice(0, 10)
                          : ''
                      }
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value || null }))}
                    />
                  ) : (
                    <input
                      type={['loan_amount', 'gross_amount', 'gst', 'aggregator_fee', 'net_amount'].includes(key) ? 'number' : 'text'}
                      step="0.01"
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                      value={
                        draft[key] === null || draft[key] === undefined
                          ? ''
                          : String(draft[key])
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (['loan_amount', 'gross_amount', 'gst', 'aggregator_fee', 'net_amount'].includes(key)) {
                          setDraft((d) => ({
                            ...d,
                            [key]: v === '' ? null : Number(v),
                          }));
                        } else {
                          setDraft((d) => ({ ...d, [key]: v }));
                        }
                      }}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => selected && void applyMarkReceived(selected)}
                disabled={saving || markingId === selected.id || (selected.status || '').toLowerCase() === 'received'}
                className="py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {markingId === selected.id ? 'Marking…' : 'Mark received'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
