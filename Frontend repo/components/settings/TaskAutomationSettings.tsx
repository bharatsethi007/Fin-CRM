import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { Icon } from '../common/Icon';
import type { Advisor } from '../../types';

type RuleRow = {
  id: string;
  firm_id: string;
  trigger_type: string;
  name: string;
  description: string | null;
  is_active: boolean;
  task_title_template: string;
  priority: string;
  due_days_offset: number;
  dedup_window_days: number;
  assign_to: string | null;
  times_fired: number;
  last_fired_at: string | null;
};

type AdvisorOption = { id: string; first_name: string | null; last_name: string | null };

const PRIORITIES = ['low', 'medium', 'high'] as const;

const TRIGGER_LABELS: Record<string, string> = {
  application_created: 'Application created',
  submitted: 'Application submitted',
  approved: 'Application approved',
  conditionally_approved: 'Conditionally approved',
  declined: 'Application declined',
  settled: 'Application settled',
  stale: 'Application stale',
  anomaly_detected: 'Anomaly detected',
  credit_check_expiring: 'Credit check expiring',
  disclosure_not_signed: 'Disclosure not signed',
  serviceability_fails: 'Serviceability fails',
  rate_expiry_approaching: 'Rate expiry approaching',
  anniversary_approaching: 'Anniversary approaching',
  client_review_due: 'Client review due',
  scheduled_weekly: 'Scheduled (weekly)',
  scheduled_monthly: 'Scheduled (monthly)',
  scheduled_daily: 'Scheduled (daily)',
};

const LIFECYCLE = [
  'application_created',
  'submitted',
  'approved',
  'conditionally_approved',
  'declined',
  'settled',
  'stale',
] as const;
const RISK = ['anomaly_detected', 'credit_check_expiring', 'disclosure_not_signed', 'serviceability_fails'] as const;
const TRAIL = ['rate_expiry_approaching', 'anniversary_approaching', 'client_review_due'] as const;
const SCHED = ['scheduled_weekly', 'scheduled_monthly', 'scheduled_daily'] as const;

function categoryTitle(triggerType: string): string {
  if ((LIFECYCLE as readonly string[]).includes(triggerType)) return '📋 Application Lifecycle';
  if ((RISK as readonly string[]).includes(triggerType)) return '⚠️ Risk & Compliance';
  if ((TRAIL as readonly string[]).includes(triggerType)) return '🔄 Trail Book';
  if ((SCHED as readonly string[]).includes(triggerType)) return '📅 Scheduled';
  return 'Other';
}

const CATEGORY_ORDER = [
  '📋 Application Lifecycle',
  '⚠️ Risk & Compliance',
  '🔄 Trail Book',
  '📅 Scheduled',
  'Other',
];

const ALL_TRIGGERS = [...LIFECYCLE, ...RISK, ...TRAIL, ...SCHED];

function monthStartIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NZ');
}

function humanTrigger(triggerType: string): string {
  return TRIGGER_LABELS[triggerType] || triggerType.replace(/_/g, ' ');
}

type Props = { advisor: Advisor };

export const TaskAutomationSettings: React.FC<Props> = ({ advisor }) => {
  const toast = useToast();
  const firmId = advisor.firmId;
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<RuleRow> | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [advisors, setAdvisors] = useState<AdvisorOption[]>([]);
  const [tasksCreatedMonth, setTasksCreatedMonth] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [modal, setModal] = useState({
    trigger_type: ALL_TRIGGERS[0],
    name: '',
    description: '',
    task_title_template: '',
    priority: 'medium' as string,
    due_days_offset: 3,
    dedup_window_days: 7,
    assign_to: '' as string,
  });

  const load = useCallback(async () => {
    if (!firmId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ms = monthStartIso();

    const [{ data: ruleData, error: ruleErr }, { count: logCount }, { data: advData }] = await Promise.all([
      supabase.from('task_automation_rules').select('*').eq('firm_id', firmId).order('trigger_type'),
      supabase
        .from('task_automation_log')
        .select('*', { count: 'exact', head: true })
        .eq('firm_id', firmId)
        .eq('task_created', true)
        .gte('created_at', ms),
      supabase.from('advisors').select('id, first_name, last_name').eq('firm_id', firmId).order('first_name'),
    ]);

    if (ruleErr) logger.error(ruleErr);
    setRules((ruleData as RuleRow[]) || []);
    setTasksCreatedMonth(typeof logCount === 'number' ? logCount : 0);
    setAdvisors((advData as AdvisorOption[]) || []);
    setLoading(false);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const m = new Map<string, RuleRow[]>();
    for (const r of rules) {
      const cat = categoryTitle(r.trigger_type);
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(r);
    }
    const ordered: { title: string; items: RuleRow[] }[] = [];
    for (const title of CATEGORY_ORDER) {
      const items = m.get(title);
      if (items?.length) ordered.push({ title, items });
      m.delete(title);
    }
    for (const [title, items] of m.entries()) {
      if (items.length) ordered.push({ title, items });
    }
    return ordered;
  }, [rules]);

  const activeCount = useMemo(() => rules.filter((r) => r.is_active).length, [rules]);

  async function toggleActive(rule: RuleRow, next: boolean) {
    setTogglingId(rule.id);
    const { error } = await supabase.from('task_automation_rules').update({ is_active: next }).eq('id', rule.id);
    setTogglingId(null);
    if (error) {
      logger.error(error);
      return;
    }
    await load();
  }

  function openEdit(rule: RuleRow) {
    setEditingId(rule.id);
    setEditDraft({
      task_title_template: rule.task_title_template,
      priority: rule.priority,
      due_days_offset: rule.due_days_offset,
      dedup_window_days: rule.dedup_window_days,
    });
  }

  async function saveEdit(ruleId: string) {
    if (!editDraft) return;
    setSaving(true);
    const { error } = await supabase
      .from('task_automation_rules')
      .update({
        task_title_template: editDraft.task_title_template ?? '',
        priority: editDraft.priority ?? 'medium',
        due_days_offset: Number(editDraft.due_days_offset) || 0,
        dedup_window_days: Number(editDraft.dedup_window_days) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ruleId);
    setSaving(false);
    if (error) {
      logger.error(error);
      toast.error('Failed to save rule: ' + error.message);
      return;
    }
    setEditingId(null);
    setEditDraft(null);
    await load();
    toast.success('Rule updated');
  }

  async function deleteRule(id: string) {
    if (!window.confirm('Delete this automation rule?')) return;
    const { error } = await supabase.from('task_automation_rules').delete().eq('id', id);
    if (error) {
      logger.error(error);
      toast.error('Failed to delete rule: ' + error.message);
      return;
    }
    if (editingId === id) {
      setEditingId(null);
      setEditDraft(null);
    }
    await load();
    toast.success('Rule deleted');
  }

  async function createRule() {
    if (!firmId) return;
    setSaving(true);
    const { error } = await supabase.from('task_automation_rules').insert({
      firm_id: firmId,
      trigger_type: modal.trigger_type,
      name: modal.name.trim() || humanTrigger(modal.trigger_type),
      description: modal.description.trim() || null,
      task_title_template: modal.task_title_template.trim(),
      priority: modal.priority,
      due_days_offset: modal.due_days_offset,
      dedup_window_days: modal.dedup_window_days,
      assign_to: modal.assign_to || null,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      logger.error(error);
      toast.error('Failed to create rule: ' + error.message);
      return;
    }
    setModalOpen(false);
    setModal({
      trigger_type: ALL_TRIGGERS[0],
      name: '',
      description: '',
      task_title_template: '',
      priority: 'medium',
      due_days_offset: 3,
      dedup_window_days: 7,
      assign_to: '',
    });
    await load();
    toast.success('Rule created');
  }

  function advisorLabel(a: AdvisorOption): string {
    const n = [a.first_name, a.last_name].filter(Boolean).join(' ').trim();
    return n || a.id.slice(0, 8);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
        <Icon name="Loader" className="h-5 w-5 animate-spin" />
        Loading automation rules…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Task Automation</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Automatically create tasks when key events happen in your pipeline.
        </p>
      </header>

      <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/80 dark:bg-indigo-950/30 px-4 py-3 text-sm text-indigo-900 dark:text-indigo-100">
        <strong className="font-semibold">{activeCount}</strong> rules active ·{' '}
        <strong className="font-semibold">{tasksCreatedMonth}</strong> tasks auto-created this month
      </div>

      <div className="space-y-8">
        {grouped.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No rules yet. Add a custom rule to get started.</p>
        ) : (
          grouped.map((group) => (
            <section key={group.title}>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{group.title}</h3>
              <div className="space-y-4">
                {group.items.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-sm overflow-hidden"
                  >
                    <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start gap-3">
                          <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.is_active}
                              disabled={togglingId === rule.id}
                              onChange={(e) => void toggleActive(rule, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="sr-only">Active</span>
                          </label>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white">{rule.name}</p>
                            {rule.description && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{rule.description}</p>
                            )}
                          </div>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200">
                          When: {humanTrigger(rule.trigger_type)}
                        </span>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          → Creates:{' '}
                          <span className="font-medium text-gray-900 dark:text-white">{rule.task_title_template}</span> · +
                          {rule.due_days_offset} days · {rule.priority}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Fired {rule.times_fired ?? 0} times · Last: {relativeDate(rule.last_fired_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => (editingId === rule.id ? (setEditingId(null), setEditDraft(null)) : openEdit(rule))}
                          className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          title="Edit"
                        >
                          <Icon name="Pencil" className="h-4 w-4" />
                        </button>
                        {(rule.times_fired ?? 0) === 0 && (
                          <button
                            type="button"
                            onClick={() => void deleteRule(rule.id)}
                            className="p-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                            title="Delete"
                          >
                            <Icon name="Trash2" className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {editingId === rule.id && editDraft && (
                      <div className="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Task title template
                          </label>
                          <input
                            value={editDraft.task_title_template ?? ''}
                            onChange={(e) => setEditDraft({ ...editDraft, task_title_template: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                          />
                          <p className="text-xs text-gray-400 mt-1">{'Use {{client_name}}, {{lender}} in titles'}</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                            <select
                              value={editDraft.priority ?? 'medium'}
                              onChange={(e) => setEditDraft({ ...editDraft, priority: e.target.value })}
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                            >
                              {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Due days offset</label>
                            <input
                              type="number"
                              min={0}
                              value={editDraft.due_days_offset ?? 0}
                              onChange={(e) => setEditDraft({ ...editDraft, due_days_offset: Number(e.target.value) })}
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Dedup window (days)</label>
                            <input
                              type="number"
                              min={0}
                              value={editDraft.dedup_window_days ?? 0}
                              onChange={(e) => setEditDraft({ ...editDraft, dedup_window_days: Number(e.target.value) })}
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveEdit(rule.id)}
                            disabled={saving}
                            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
      >
        <Icon name="Plus" className="h-4 w-4" />
        Add custom rule
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New automation rule</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Icon name="X" className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Trigger</label>
              <select
                value={modal.trigger_type}
                onChange={(e) => setModal({ ...modal, trigger_type: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              >
                {ALL_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {humanTrigger(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rule name</label>
              <input
                value={modal.name}
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                placeholder="e.g. Follow up after submission"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description (optional)</label>
              <textarea
                value={modal.description}
                onChange={(e) => setModal({ ...modal, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Task title template</label>
              <input
                value={modal.task_title_template}
                onChange={(e) => setModal({ ...modal, task_title_template: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                placeholder="Follow up: {{client_name}} — {{lender}}"
              />
              <p className="text-xs text-gray-400 mt-1">{'Use {{client_name}}, {{lender}} in titles'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                <select
                  value={modal.priority}
                  onChange={(e) => setModal({ ...modal, priority: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Assign to</label>
                <select
                  value={modal.assign_to}
                  onChange={(e) => setModal({ ...modal, assign_to: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                >
                  <option value="">— Default —</option>
                  {advisors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {advisorLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Due offset (days)</label>
                <input
                  type="number"
                  min={0}
                  value={modal.due_days_offset}
                  onChange={(e) => setModal({ ...modal, due_days_offset: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Dedup window (days)</label>
                <input
                  type="number"
                  min={0}
                  value={modal.dedup_window_days}
                  onChange={(e) => setModal({ ...modal, dedup_window_days: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createRule()}
                disabled={saving || !modal.task_title_template.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Create rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
