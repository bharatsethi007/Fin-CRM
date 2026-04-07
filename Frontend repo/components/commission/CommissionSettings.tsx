import React, { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { Icon } from '../common/Icon';
import { invokeFunction } from '../../src/lib/api';

export type LenderRateRow = {
  id: string;
  firm_id: string;
  lender_name: string;
  upfront_rate?: number | null;
  upfront_rate_percent?: number | null;
  aggregator_fee?: number | null;
  trail_rate_percent?: number | null;
  clawback_months?: number | null;
  aggregator_split_percent?: number | null;
  trail_paid_by?: string | null;
};

type XeroConfigRow = {
  id?: string;
  firm_id: string;
  connected: boolean;
  xero_org_name?: string | null;
  tenant_name?: string | null;
  last_synced_at?: string | null;
  total_synced?: number | null;
  income_account_code?: string | null;
  auto_sync_on_receive?: boolean | null;
};

type XeroSyncLogRow = {
  created_at: string;
  action: string | null;
  status: string | null;
  error_message: string | null;
  commissions: {
    lender_name?: string | null;
    lender?: string | null;
    net_amount?: number | null;
  } | null;
};

type TrailPaidBy = 'lender' | 'aggregator' | 'none';

const TRAIL_PAID_OPTIONS: { value: TrailPaidBy; label: string }[] = [
  { value: 'lender', label: 'Lender' },
  { value: 'aggregator', label: 'Aggregator' },
  { value: 'none', label: 'None' },
];

function displayUpfrontPercent(row: LenderRateRow): string {
  if (row.upfront_rate_percent != null && !Number.isNaN(Number(row.upfront_rate_percent))) {
    return Number(row.upfront_rate_percent).toFixed(4);
  }
  const m = row.upfront_rate != null ? Number(row.upfront_rate) : null;
  if (m != null && !Number.isNaN(m)) {
    if (m > 0 && m < 1) return (m * 100).toFixed(4);
    return Number(m).toFixed(4);
  }
  return '';
}

type RowDraft = {
  upfront: string;
  trail: string;
  claw: string;
  split: string;
  trail_paid: TrailPaidBy;
};

function rowToDraft(row: LenderRateRow): RowDraft {
  const upfront = displayUpfrontPercent(row);
  return {
    upfront,
    trail: row.trail_rate_percent != null ? String(row.trail_rate_percent) : '',
    claw: row.clawback_months != null ? String(row.clawback_months) : '',
    split: row.aggregator_split_percent != null ? String(row.aggregator_split_percent) : '',
    trail_paid: (['lender', 'aggregator', 'none'].includes(row.trail_paid_by || '')
      ? row.trail_paid_by
      : 'none') as TrailPaidBy,
  };
}

function draftToPayload(d: RowDraft) {
  const upfront = d.upfront.trim() === '' ? null : Number(d.upfront);
  const trail = d.trail.trim() === '' ? null : Number(d.trail);
  const claw = d.claw.trim() === '' ? null : Math.round(Number(d.claw));
  const split = d.split.trim() === '' ? null : Number(d.split);
  return {
    upfront_rate_percent: upfront != null && !Number.isNaN(upfront) ? upfront : null,
    trail_rate_percent: trail != null && !Number.isNaN(trail) ? trail : null,
    clawback_months: claw != null && !Number.isNaN(claw) ? claw : null,
    aggregator_split_percent: split != null && !Number.isNaN(split) ? split : null,
    trail_paid_by: d.trail_paid,
  };
}

function orgName(x: XeroConfigRow | null): string {
  if (!x) return '—';
  return (x.xero_org_name || x.tenant_name || '—').trim() || '—';
}

function relativeSynced(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

type Props = { firmId: string };

export const CommissionSettings: React.FC<Props> = ({ firmId }) => {
  const toast = useToast();
  const [rates, setRates] = useState<LenderRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [xero, setXero] = useState<XeroConfigRow | null>(null);
  const [xeroLoading, setXeroLoading] = useState(true);
  const [xeroSaving, setXeroSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState('200');
  const [autoSyncDraft, setAutoSyncDraft] = useState(false);
  const [syncLog, setSyncLog] = useState<XeroSyncLogRow[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const loadRates = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('lender_commission_rates')
      .select('*')
      .eq('firm_id', firmId)
      .order('lender_name');
    if (error) logger.error(error);
    setRates((data as LenderRateRow[]) || []);
    setLoading(false);
  }, [firmId]);

  const loadSyncLog = useCallback(async () => {
    if (!firmId) return;
    const q = supabase
      .from('xero_sync_log')
      .select('created_at, action, status, error_message, commissions(lender_name, net_amount, lender)')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false })
      .limit(5);
    const { data, error } = await q;
    if (error) {
      logger.error(error);
      setSyncLog([]);
      return;
    }
    setSyncLog((data as XeroSyncLogRow[]) || []);
  }, [firmId]);

  const loadXero = useCallback(async () => {
    if (!firmId) return;
    setXeroLoading(true);
    const { data, error } = await supabase
      .from('xero_config')
      .select('connected, xero_org_name, last_synced_at, total_synced, income_account_code, auto_sync_on_receive, tenant_name')
      .eq('firm_id', firmId)
      .maybeSingle();
    if (error) {
      logger.error(error);
      setXero(null);
    } else {
      const row = data as XeroConfigRow | null;
      setXero(row);
      setIncomeDraft(row?.income_account_code?.trim() ? row.income_account_code : '200');
      setAutoSyncDraft(!!row?.auto_sync_on_receive);
    }
    setXeroLoading(false);
    await loadSyncLog();
  }, [firmId, loadSyncLog]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  useEffect(() => {
    loadXero();
  }, [loadXero]);

  function startConnectPoll() {
    if (pollRef.current) clearInterval(pollRef.current);
    const started = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - started > 3 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setConnecting(false);
        return;
      }
      const { data } = await supabase.from('xero_config').select('connected').eq('firm_id', firmId).single();
      if (data?.connected) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setConnecting(false);
        await loadXero();
        toast.success('Xero connected successfully');
      }
    }, 2000);
  }

  async function connectXero() {
    if (!firmId) return;
    setConnecting(true);
    try {
      const { data, error } = await invokeFunction<{ auth_url?: string }>('xero-oauth', {
        action: 'connect',
        firm_id: firmId,
      });
      if (error) throw new Error(error);
      const authUrl = (data as { auth_url?: string })?.auth_url;
      if (!authUrl) throw new Error('No auth URL returned');
      window.open(authUrl, 'xero-auth', 'width=700,height=600');
      startConnectPoll();
    } catch (e) {
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : 'Could not start Xero connection');
    }
  }

  async function saveXeroSettingsOnBlur(overrideAuto?: boolean) {
    if (!firmId || !xero?.connected) return;
    const autoVal = overrideAuto !== undefined ? overrideAuto : autoSyncDraft;
    setXeroSaving(true);
    const { error } = await supabase
      .from('xero_config')
      .update({
        income_account_code: incomeDraft.trim() || '200',
        auto_sync_on_receive: autoVal,
        updated_at: new Date().toISOString(),
      })
      .eq('firm_id', firmId);
    setXeroSaving(false);
    if (error) {
      toast.error('Failed to save Xero settings: ' + error.message);
      return;
    }
    await loadXero();
    toast.success('Xero settings saved');
  }

  async function syncXeroNow() {
    if (!firmId) return;
    setSyncing(true);
    try {
      const { data, error } = await invokeFunction<{
        synced?: number;
        failed?: number;
        message?: string;
        errors?: string[];
      }>('xero-sync', { firm_id: firmId });
      if (error) throw new Error(error);
      const d = data as { synced?: number; failed?: number; message?: string; errors?: string[] };
      const parts: string[] = [];
      if (d.message) parts.push(d.message);
      else {
        if (typeof d.synced === 'number') parts.push(`Synced ${d.synced} invoice(s).`);
        if (typeof d.failed === 'number' && d.failed > 0) parts.push(`${d.failed} failed.`);
        if (d.errors?.length) parts.push(d.errors.slice(0, 2).join('; '));
      }
      toast.success(parts.join(' ') || 'Sync finished');
      await loadXero();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectXero() {
    if (!firmId) return;
    if (!window.confirm('Disconnect Xero? You can reconnect at any time.')) return;
    setDisconnecting(true);
    try {
      const { error } = await invokeFunction('xero-oauth', {
        action: 'disconnect',
        firm_id: firmId,
      });
      if (error) throw new Error(error);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      toast.success('Xero disconnected');
      await loadXero();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  }

  function startEdit(row: LenderRateRow) {
    setEditingId(row.id);
    setDraft(rowToDraft(row));
  }

  async function saveRow(id: string) {
    if (!draft) return;
    setSavingId(id);
    const payload = draftToPayload(draft);
    const { error } = await supabase.from('lender_commission_rates').update(payload).eq('id', id);
    setSavingId(null);
    if (error) {
      toast.error('Failed to save commission rate: ' + error.message);
      return;
    }
    setEditingId(null);
    setDraft(null);
    await loadRates();
    toast.success('Commission rate saved');
  }

  const disconnected = !xeroLoading && !xero?.connected;

  return (
    <div className="space-y-8 max-w-5xl relative">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Commission settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Lender panel rates and Xero posting for commission.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Lender commission rates</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Upfront rate as % (4 decimal places). Trail rate as %. Aggregator split as %.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">
                <th className="px-3 py-2">Lender</th>
                <th className="px-3 py-2">Upfront %</th>
                <th className="px-3 py-2">Trail %</th>
                <th className="px-3 py-2">Clawback months</th>
                <th className="px-3 py-2">Aggregator split %</th>
                <th className="px-3 py-2">Trail paid by</th>
                <th className="px-3 py-2 w-32" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    <Icon name="Loader" className="h-5 w-5 animate-spin inline mr-2" />
                    Loading…
                  </td>
                </tr>
              ) : rates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No lender rates yet. Add rows in Supabase or via your import pipeline.
                  </td>
                </tr>
              ) : (
                rates.map((row) => {
                  const isEditing = editingId === row.id;
                  const d = isEditing && draft ? draft : rowToDraft(row);

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50/80 dark:hover:bg-gray-900/50"
                    >
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        {row.lender_name}
                      </td>
                      <td
                        className="px-3 py-2 cursor-pointer"
                        onClick={() => !isEditing && startEdit(row)}
                      >
                        {isEditing && draft ? (
                          <input
                            type="number"
                            step="0.0001"
                            className="w-28 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs tabular-nums"
                            value={draft.upfront}
                            onChange={(e) => setDraft({ ...draft, upfront: e.target.value })}
                          />
                        ) : (
                          <span className="tabular-nums">{displayUpfrontPercent(row) || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => !isEditing && startEdit(row)}>
                        {isEditing && draft ? (
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                            value={draft.trail}
                            onChange={(e) => setDraft({ ...draft, trail: e.target.value })}
                          />
                        ) : (
                          <span className="tabular-nums">
                            {row.trail_rate_percent != null ? String(row.trail_rate_percent) : '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => !isEditing && startEdit(row)}>
                        {isEditing && draft ? (
                          <input
                            type="number"
                            step="1"
                            className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                            value={draft.claw}
                            onChange={(e) => setDraft({ ...draft, claw: e.target.value })}
                          />
                        ) : (
                          row.clawback_months ?? '—'
                        )}
                      </td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => !isEditing && startEdit(row)}>
                        {isEditing && draft ? (
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                            value={draft.split}
                            onChange={(e) => setDraft({ ...draft, split: e.target.value })}
                          />
                        ) : (
                          <span className="tabular-nums">
                            {row.aggregator_split_percent != null ? String(row.aggregator_split_percent) : '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => !isEditing && startEdit(row)}>
                        {isEditing && draft ? (
                          <select
                            value={draft.trail_paid}
                            onChange={(e) =>
                              setDraft({ ...draft, trail_paid: e.target.value as TrailPaidBy })
                            }
                            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                          >
                            {TRAIL_PAID_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="capitalize">{row.trail_paid_by || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => void saveRow(row.id)}
                              disabled={savingId === row.id}
                              className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                              {savingId === row.id ? '…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setDraft(null);
                              }}
                              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Xero */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Xero integration</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Post commission invoices to Xero when payments are received.
          </p>
        </div>

        <div className="p-4">
          {xeroLoading ? (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Icon name="Loader" className="h-4 w-4 animate-spin" /> Loading Xero…
            </p>
          ) : disconnected ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-900/40 p-6 max-w-2xl">
              <div className="mb-4">
                <span
                  className="text-2xl font-black tracking-tight"
                  style={{ color: '#13B5EA', fontFamily: 'system-ui, sans-serif' }}
                >
                  XERO
                </span>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Connect Xero Accounting</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
                Automatically create invoices when commissions are received. Each commission creates an Accounts Receivable
                invoice in Xero.
              </p>
              <button
                type="button"
                onClick={() => void connectXero()}
                disabled={connecting || !firmId}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#13B5EA' }}
              >
                {connecting ? (
                  <>
                    <Icon name="Loader" className="h-4 w-4 animate-spin" /> Waiting for Xero…
                  </>
                ) : (
                  'Connect Xero →'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6 max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  ✓ Connected
                </span>
              </div>
              <div className="text-sm space-y-1">
                <p className="text-gray-900 dark:text-white">
                  <span className="text-gray-500 dark:text-gray-400">Organisation: </span>
                  {orgName(xero)}
                </p>
                <p className="text-gray-900 dark:text-white">
                  <span className="text-gray-500 dark:text-gray-400">Last synced: </span>
                  {relativeSynced(xero?.last_synced_at)}
                  {xero?.last_synced_at && (
                    <span className="text-gray-400 dark:text-gray-500 ml-1">
                      ({new Date(xero.last_synced_at).toLocaleString('en-NZ')})
                    </span>
                  )}
                </p>
                <p className="text-gray-900 dark:text-white">
                  <span className="text-gray-500 dark:text-gray-400">Total invoices created: </span>
                  {xero?.total_synced ?? 0}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Income account code
                  </label>
                  <input
                    value={incomeDraft}
                    onChange={(e) => setIncomeDraft(e.target.value)}
                    onBlur={() => void saveXeroSettingsOnBlur()}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white max-w-xs"
                    placeholder="200"
                  />
                  {xeroSaving && <span className="text-xs text-gray-400 ml-2">Saving…</span>}
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={autoSyncDraft}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setAutoSyncDraft(v);
                        void saveXeroSettingsOnBlur(v);
                      }}
                      className="rounded border-gray-300"
                    />
                    Auto-sync when commission marked as received
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void syncXeroNow()}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                >
                  {syncing ? (
                    <>
                      <Icon name="Loader" className="h-4 w-4 animate-spin" /> Syncing…
                    </>
                  ) : (
                    'Sync Now'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void disconnectXero()}
                  disabled={disconnecting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500 text-red-600 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                >
                  {disconnecting ? '…' : 'Disconnect'}
                </button>
              </div>

              <div>
                <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Recent sync activity
                </h5>
                {syncLog.length === 0 ? (
                  <p className="text-sm text-gray-500">No sync entries yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                    {syncLog.map((log, i) => {
                      const comm = log.commissions;
                      const lender =
                        comm?.lender_name || comm?.lender || '—';
                      const net = comm?.net_amount;
                      return (
                        <li key={i} className="px-3 py-2 text-sm bg-white dark:bg-gray-800/50">
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="text-gray-700 dark:text-gray-200">
                              {new Date(log.created_at).toLocaleString('en-NZ')} · {log.action || '—'}{' '}
                              <span
                                className={
                                  (log.status || '').toLowerCase() === 'success'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'
                                }
                              >
                                {log.status || '—'}
                              </span>
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {lender}
                            {net != null && ` · ${new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(Number(net))}`}
                          </p>
                          {log.error_message && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{log.error_message}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
