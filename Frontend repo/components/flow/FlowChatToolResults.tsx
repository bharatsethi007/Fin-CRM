import React from 'react';
import { getToolResultRecord } from './flowIntelligenceChatLib';

export function renderToolResult(tool: string, result: unknown): React.ReactNode | null {
  const r = getToolResultRecord(result);
  if (!r || r.error != null) return null;

  if (tool === 'calculate_serviceability') {
    const monthlyIncome = Number(r.monthly_income) || 0;
    const monthlyExpenses = Number(r.monthly_expenses) || 0;
    const maxBorrow = Number(r.max_borrowing_capacity ?? r.max_borrowing_indicative) || 0;
    const dti = r.dti_ratio;
    const dtiStr = dti != null && dti !== '' ? `${dti}x` : '—';
    const pass = Boolean(r.serviceability_pass);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 my-3">
        <h4 className="text-xs font-bold uppercase text-gray-400 mb-3">Serviceability Analysis</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Monthly Income</p>
            <p className="text-lg font-bold text-green-600">${monthlyIncome.toLocaleString()}</p>
          </div>
          <div className="text-center p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Monthly Expenses</p>
            <p className="text-lg font-bold text-orange-500">${monthlyExpenses.toLocaleString()}</p>
          </div>
          <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Max Borrowing</p>
            <p className="text-lg font-bold text-blue-600">${maxBorrow.toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            DTI Ratio: <strong>{dtiStr}</strong>
          </span>
          <span
            className={`text-sm font-bold px-3 py-1 rounded-full ${
              pass ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}
          >
            {pass ? '✓ PASS' : '✗ FAIL'}
          </span>
        </div>
      </div>
    );
  }

  if (tool === 'get_pipeline_summary') {
    const totalApps = Number(r.total_applications) || 0;
    const pipeVal = Number(r.total_pipeline_value) || 0;
    const byStage = r.by_stage as Record<string, { count: number; value: number }> | undefined;
    const overdue = Number(r.overdue_tasks) || 0;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 my-3">
        <h4 className="text-xs font-bold uppercase text-gray-400 mb-3">Pipeline Summary</h4>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalApps}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Applications</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              ${(pipeVal / 1_000_000).toFixed(1)}M
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Pipeline Value</p>
          </div>
        </div>
        {byStage &&
          Object.entries(byStage).map(([stage, data]) => (
            <div
              key={stage}
              className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <span className="text-sm capitalize text-gray-600 dark:text-gray-300">{stage}</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {data.count} · ${(Number(data.value) / 1000).toFixed(0)}k
              </span>
            </div>
          ))}
        {overdue > 0 && (
          <div className="mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400 font-medium">
            ⚠ {overdue} overdue tasks
          </div>
        )}
      </div>
    );
  }

  if (tool === 'check_compliance') {
    const checklist = r.checklist as Array<{ status?: string; requirement?: string }> | undefined;
    const completed = Number(r.completed) || 0;
    const totalReq = Number(r.total_requirements) || checklist?.length || 0;
    const ready = Boolean(r.ready_to_submit);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 my-3">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h4 className="text-xs font-bold uppercase text-gray-400">Compliance Checklist</h4>
          <span
            className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
              ready
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
            }`}
          >
            {completed}/{totalReq} complete
          </span>
        </div>
        {checklist?.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700 last:border-0"
          >
            <span
              className={`text-sm ${item.status === 'complete' ? 'text-green-500' : 'text-red-400'}`}
            >
              {item.status === 'complete' ? '✓' : '✗'}
            </span>
            <span
              className={`text-sm ${item.status === 'complete' ? 'text-gray-600 dark:text-gray-300' : 'text-red-600 dark:text-red-400 font-medium'}`}
            >
              {item.requirement ?? '—'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (tool === 'calculate_lvr') {
    const lvr = Number(r.lvr_percentage) || 0;
    const deposit = Number(r.deposit_amount) || 0;
    const depPct = r.deposit_percentage;
    const depPctStr = depPct != null && depPct !== '' ? String(depPct) : '—';
    const needsLmi = Boolean(r.requires_lmi);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 my-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase font-bold">Loan-to-Value Ratio</p>
          <p
            className={`text-3xl font-bold ${lvr <= 80 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {lvr}%
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{String(r.rbnz_category ?? '')}</p>
        </div>
        <div className="text-right text-sm text-gray-600 dark:text-gray-300">
          <p>
            Deposit: ${deposit.toLocaleString()} ({depPctStr}%)
          </p>
          <p>{needsLmi ? '⚠ LMI Required' : '✓ No LMI needed'}</p>
        </div>
      </div>
    );
  }

  return null;
}
