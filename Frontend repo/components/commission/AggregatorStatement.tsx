import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Icon } from '../common/Icon';
import type { CommissionRecord } from './CommissionPage';

const AGGREGATORS = ['NZFSG', 'Kepa', 'Astute', 'Custom'] as const;

type AggregatorName = (typeof AGGREGATORS)[number];

type StatementRow = {
  id: string;
  firm_id: string;
  aggregator_name: string;
  period_start: string | null;
  period_end: string | null;
  storage_path: string;
  file_name: string | null;
  parse_status: string;
  parse_error: string | null;
  reconciled: boolean;
  created_at: string;
};

type LineRow = {
  id: string;
  statement_id: string;
  line_index: number;
  lender_name: string | null;
  loan_amount: number | null;
  statement_amount: number | null;
  matched_commission_id: string | null;
  manual_override: boolean;
};

const fmtMoney = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(Number(n));
};

function normalizeLender(s: string | null | undefined) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function withinFivePct(a: number, b: number) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  if (x <= 0 && y <= 0) return true;
  const max = Math.max(Math.abs(x), Math.abs(y));
  if (max === 0) return true;
  return Math.abs(x - y) / max <= 0.05;
}

function parseCsvToLines(text: string): { lender_name: string; loan_amount: number; statement_amount: number }[] {
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim());
  if (rawLines.length < 2) return [];

  const header = splitCsvRow(rawLines[0]).map((c) => c.trim().toLowerCase());
  const findCol = (pred: (h: string) => boolean) => header.findIndex(pred);

  let iLender = findCol((h) => h.includes('lender') || h.includes('bank') || h === 'lender name');
  let iLoan = findCol((h) => (h.includes('loan') && !h.includes('purpose')) || h.includes('principal') || h === 'advance');
  let iAmt = findCol(
    (h) =>
      h.includes('commission') ||
      h.includes('net') ||
      h === 'amount' ||
      h.includes('payment'),
  );

  if (iLender < 0) iLender = 0;
  if (iLoan < 0) iLoan = 1;
  if (iAmt < 0) iAmt = Math.min(header.length - 1, 2);

  const out: { lender_name: string; loan_amount: number; statement_amount: number }[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const cols = splitCsvRow(rawLines[i]);
    const lender = (cols[iLender] || '').trim();
    const loan = parseFloat(String(cols[iLoan] || '').replace(/[,$]/g, ''));
    const amt = parseFloat(String(cols[iAmt] || '').replace(/[,$]/g, ''));
    if (!lender && !Number.isFinite(loan) && !Number.isFinite(amt)) continue;
    out.push({
      lender_name: lender || 'Unknown',
      loan_amount: Number.isFinite(loan) ? loan : 0,
      statement_amount: Number.isFinite(amt) ? amt : 0,
    });
  }
  return out;
}

function splitCsvRow(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
    } else if ((c === ',' && !inQ) || c === '\n') {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result.map((s) => s.replace(/^"|"$/g, '').trim());
}

function findBestMatch(
  line: LineRow,
  commissions: CommissionRecord[],
  usedIds: Set<string>,
): CommissionRecord | null {
  const ln = normalizeLender(line.lender_name);
  let best: CommissionRecord | null = null;
  let bestDiff = Infinity;
  for (const c of commissions) {
    if (!c.lender || usedIds.has(c.id)) continue;
    if (normalizeLender(c.lender) !== ln) continue;
    const la = Number(line.loan_amount);
    const ca = Number(c.loan_amount);
    if (!withinFivePct(la, ca)) continue;
    const diff = Math.abs(la - ca);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

type Props = { firmId: string };

export const AggregatorStatement: React.FC<Props> = ({ firmId }) => {
  const [aggregator, setAggregator] = useState<AggregatorName>('NZFSG');
  const [customAggregator, setCustomAggregator] = useState('');
  const [periodStart, setPeriodStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const loadCommissions = useCallback(async () => {
    if (!firmId) return;
    const { data } = await supabase.from('commissions').select('*').eq('firm_id', firmId);
    setCommissions((data as CommissionRecord[]) || []);
  }, [firmId]);

  const loadStatements = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const { data } = await supabase
      .from('aggregator_statements')
      .select('*')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false });
    setStatements((data as StatementRow[]) || []);
    setLoading(false);
  }, [firmId]);

  const loadLines = useCallback(async (statementId: string) => {
    const { data } = await supabase
      .from('aggregator_statement_lines')
      .select('*')
      .eq('statement_id', statementId)
      .order('line_index', { ascending: true });
    setLines((data as LineRow[]) || []);
  }, []);

  useEffect(() => {
    loadStatements();
    loadCommissions();
  }, [loadStatements, loadCommissions]);

  useEffect(() => {
    if (selectedId) loadLines(selectedId);
    else setLines([]);
  }, [selectedId, loadLines]);

  useEffect(() => {
    if (statements.length > 0 && !selectedId) {
      setSelectedId(statements[0].id);
    }
  }, [statements, selectedId]);

  const selectedStatement = useMemo(
    () => statements.find((s) => s.id === selectedId) || null,
    [statements, selectedId],
  );

  const rowsWithMatch = useMemo(() => {
    const byId = new Map(commissions.map((c) => [c.id, c]));
    return lines.map((line) => {
      const matched = line.matched_commission_id ? byId.get(line.matched_commission_id) : null;
      const isMatched = !!matched;
      return { line, matched, isMatched };
    });
  }, [lines, commissions]);

  const { matchedCount, unmatchedCount, variance } = useMemo(() => {
    let m = 0;
    let u = 0;
    let v = 0;
    for (const { line, matched, isMatched } of rowsWithMatch) {
      const stmtAmt = Number(line.statement_amount) || 0;
      if (isMatched && matched) {
        m++;
        const net = Number(matched.net_amount) || 0;
        v += Math.abs(stmtAmt - net);
      } else {
        u++;
        v += Math.abs(stmtAmt);
      }
    }
    return { matchedCount: m, unmatchedCount: u, variance: v };
  }, [rowsWithMatch]);

  async function runAutoMatchForStatement(statementId: string, lineRows: LineRow[]) {
    const { data: commData } = await supabase.from('commissions').select('*').eq('firm_id', firmId);
    const comms = (commData as CommissionRecord[]) || [];
    const used = new Set<string>();
    for (const line of lineRows) {
      if (line.manual_override) continue;
      const best = findBestMatch(line, comms, used);
      if (best) {
        used.add(best.id);
        await supabase
          .from('aggregator_statement_lines')
          .update({ matched_commission_id: best.id })
          .eq('id', line.id);
      }
    }
    await loadLines(statementId);
    await loadCommissions();
  }

  async function processFile(file: File) {
    if (!firmId) return;
    const aggName = aggregator === 'Custom' ? customAggregator.trim() || 'Custom' : aggregator;
    if (aggregator === 'Custom' && !customAggregator.trim()) {
      alert('Enter a name for the custom aggregator.');
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${firmId}/aggregator-statements/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
    if (upErr) {
      alert(upErr.message);
      setUploading(false);
      return;
    }

    const { data: ins, error: insErr } = await supabase
      .from('aggregator_statements')
      .insert({
        firm_id: firmId,
        aggregator_name: aggName,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        storage_path: path,
        file_name: file.name,
        parse_status: 'parsing',
      })
      .select('id')
      .single();

    if (insErr || !ins?.id) {
      alert(insErr?.message || 'Could not create statement');
      setUploading(false);
      return;
    }

    const statementId = ins.id as string;
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';

    if (isCsv) {
      try {
        const text = await file.text();
        const parsed = parseCsvToLines(text);
        if (parsed.length === 0) {
          await supabase
            .from('aggregator_statements')
            .update({ parse_status: 'failed', parse_error: 'No data rows found in CSV.' })
            .eq('id', statementId);
        } else {
          const lineIns = parsed.map((p, idx) => ({
            statement_id: statementId,
            line_index: idx,
            lender_name: p.lender_name,
            loan_amount: p.loan_amount,
            statement_amount: p.statement_amount,
          }));
          await supabase.from('aggregator_statement_lines').insert(lineIns);
          await supabase
            .from('aggregator_statements')
            .update({ parse_status: 'parsed', parse_error: null })
            .eq('id', statementId);
        }
      } catch (e) {
        await supabase
          .from('aggregator_statements')
          .update({
            parse_status: 'failed',
            parse_error: e instanceof Error ? e.message : 'CSV parse failed',
          })
          .eq('id', statementId);
      }
    } else {
      await supabase
        .from('aggregator_statements')
        .update({
          parse_status: 'parsed',
          parse_error:
            'PDF stored. Add lines manually or re-upload as CSV for automatic import.',
        })
        .eq('id', statementId);
    }

    await loadCommissions();
    await loadStatements();
    setSelectedId(statementId);

    const { data: lineData } = await supabase
      .from('aggregator_statement_lines')
      .select('*')
      .eq('statement_id', statementId)
      .order('line_index', { ascending: true });

    const lr = (lineData as LineRow[]) || [];
    if (lr.length > 0) {
      await runAutoMatchForStatement(statementId, lr);
    }

    setUploading(false);
  }

  async function linkLine(lineId: string, commissionId: string | null) {
    await supabase
      .from('aggregator_statement_lines')
      .update({
        matched_commission_id: commissionId,
        manual_override: true,
      })
      .eq('id', lineId);
    if (selectedId) await loadLines(selectedId);
  }

  async function createCommissionForLine(line: LineRow) {
    if (!firmId) return;
    const { data, error } = await supabase
      .from('commissions')
      .insert({
        firm_id: firmId,
        lender: line.lender_name,
        loan_amount: line.loan_amount,
        net_amount: line.statement_amount,
        commission_type: 'trail',
        status: 'received',
        client_name: 'Aggregator statement',
      })
      .select('id')
      .single();
    if (error || !data?.id) {
      alert(error?.message || 'Could not create commission');
      return;
    }
    await supabase
      .from('aggregator_statement_lines')
      .update({ matched_commission_id: data.id, manual_override: true })
      .eq('id', line.id);
    await loadCommissions();
    if (selectedId) await loadLines(selectedId);
  }

  async function completeReconciliation() {
    if (!selectedId || !selectedStatement) return;
    setCompleting(true);
    const { error } = await supabase
      .from('aggregator_statements')
      .update({ reconciled: true, updated_at: new Date().toISOString() })
      .eq('id', selectedId);
    setCompleting(false);
    if (error) alert(error.message);
    else await loadStatements();
  }

  function parseStatusLabel(s: StatementRow | null) {
    if (!s) return '';
    switch (s.parse_status) {
      case 'pending':
        return 'Pending';
      case 'parsing':
        return 'Parsing…';
      case 'parsed':
        return 'Parsed';
      case 'failed':
        return 'Failed';
      default:
        return s.parse_status;
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void processFile(f);
  };

  const showReconciliation =
    selectedStatement &&
    (selectedStatement.parse_status === 'parsed' || selectedStatement.parse_status === 'failed');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Aggregator statements</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Upload PDF or CSV commission statements from your aggregator and reconcile to AdvisorFlow commissions.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Aggregator</label>
            <select
              value={aggregator}
              onChange={(e) => setAggregator(e.target.value as AggregatorName)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-gray-900 dark:text-white"
            >
              {AGGREGATORS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          {aggregator === 'Custom' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Custom name</label>
              <input
                value={customAggregator}
                onChange={(e) => setCustomAggregator(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-gray-900 dark:text-white"
                placeholder="e.g. My network"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Period from</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Period to</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragOver
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
              : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50'
          }`}
        >
          <Icon name="Upload" className="h-10 w-10 text-gray-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Drag and drop PDF or CSV here, or{' '}
            <label className="text-primary-600 dark:text-primary-400 cursor-pointer hover:underline">
              browse
              <input
                type="file"
                accept=".pdf,.csv,text/csv,application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void processFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Files are stored under your firm folder in the documents bucket.
          </p>
          {uploading && (
            <p className="text-sm text-primary-600 dark:text-primary-400 mt-3 flex items-center justify-center gap-2">
              <Icon name="Loader" className="h-4 w-4 animate-spin" /> Uploading…
            </p>
          )}
        </div>
      </div>

      {statements.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Statement</label>
          <select
            value={selectedId || ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-gray-900 dark:text-white min-w-[240px]"
          >
            {statements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.aggregator_name} · {s.file_name || s.id.slice(0, 8)}{' '}
                {s.reconciled ? '(reconciled)' : ''}
              </option>
            ))}
          </select>
          {selectedStatement && (
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-md ${
                selectedStatement.parse_status === 'parsed'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : selectedStatement.parse_status === 'failed'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                    : selectedStatement.parse_status === 'parsing'
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
              }`}
            >
              {parseStatusLabel(selectedStatement)}
            </span>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading statements…</p>}

      {selectedStatement?.parse_error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {selectedStatement.parse_error}
        </div>
      )}

      {showReconciliation && selectedStatement && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reconciliation</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {matchedCount} matched · {unmatchedCount} unmatched · variance {fmtMoney(variance)}
              </p>
            </div>
            <button
              type="button"
              disabled={!!selectedStatement.reconciled || completing}
              onClick={() => void completeReconciliation()}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {selectedStatement.reconciled ? 'Reconciled' : completing ? 'Saving…' : 'Complete reconciliation'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <th className="px-3 py-2">Statement line</th>
                  <th className="px-3 py-2 text-right">Loan</th>
                  <th className="px-3 py-2 text-right">Statement $</th>
                  <th className="px-3 py-2">Matched commission</th>
                  <th className="px-3 py-2 text-right">Commission net</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No lines — CSV files import automatically; for PDF add rows manually (coming soon) or use CSV export
                      from your aggregator.
                    </td>
                  </tr>
                ) : (
                  rowsWithMatch.map(({ line, matched, isMatched }) => (
                    <tr
                      key={line.id}
                      className={
                        isMatched
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-b border-gray-100 dark:border-gray-700'
                          : 'bg-red-50/80 dark:bg-red-950/20 border-b border-gray-100 dark:border-gray-700'
                      }
                    >
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                        {line.lender_name || '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(line.loan_amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(line.statement_amount)}</td>
                      <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                        {matched ? (
                          <span>
                            {matched.client_name || '—'} · {matched.lender}{' '}
                            <span className="text-gray-400 text-xs">({matched.id.slice(0, 8)}…)</span>
                          </span>
                        ) : (
                          <span className="text-red-700 dark:text-red-300">Unmatched</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(matched?.net_amount)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                          <select
                            value={line.matched_commission_id || ''}
                            onChange={(e) => void linkLine(line.id, e.target.value || null)}
                            className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 max-w-[200px]"
                          >
                            <option value="">Link to commission…</option>
                            {commissions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {(c.client_name || '').slice(0, 24)} · {c.lender} · {fmtMoney(c.net_amount)}
                              </option>
                            ))}
                          </select>
                          {!isMatched && (
                            <button
                              type="button"
                              onClick={() => void createCommissionForLine(line)}
                              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 whitespace-nowrap"
                            >
                              Create new
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
