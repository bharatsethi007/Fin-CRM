import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { AISkillDetailPanel } from './AISkillDetailPanel';
import { FALLBACK_AI_SKILL_PRESETS } from './aiSkillPresets';
import type { Advisor } from '../../types';

interface PresetRow {
  skill_type: string;
  skill_name: string;
  description: string;
  icon_emoji?: string | null;
}

interface LibraryRow {
  id: string;
  skill_type: string;
  skill_name: string;
  is_active: boolean | null;
  updated_at: string | null;
  last_processed_at: string | null;
}

interface Props {
  advisor: Advisor;
}

function monthStartIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function maxIso(...dates: (string | null | undefined)[]): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const s of dates) {
    if (!s) continue;
    const t = new Date(s).getTime();
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) {
      best = t;
      bestIso = s;
    }
  }
  return bestIso;
}

export const AISkillsSettings: React.FC<Props> = ({ advisor }) => {
  const toast = useToast();
  const firmId = advisor.firmId;
  const advisorId = advisor.id;

  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [libraryByType, setLibraryByType] = useState<Map<string, LibraryRow>>(new Map());
  const [docCompletedBySkillId, setDocCompletedBySkillId] = useState<Record<string, number>>({});
  const [lastActivityBySkillId, setLastActivityBySkillId] = useState<Record<string, string | null>>({});
  const [stats, setStats] = useState({ activeSkills: 0, docsCompleted: 0, usageMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PresetRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firmId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const nextPresets: PresetRow[] = [];
    const { data: fromDb, error: presetErr } = await supabase.from('ai_skill_presets').select('*');
    if (!presetErr && fromDb?.length) {
      for (const row of fromDb as Record<string, unknown>[]) {
        nextPresets.push({
          skill_type: String(row.skill_type ?? ''),
          skill_name: String(row.skill_name ?? ''),
          description: String(row.description ?? ''),
          icon_emoji: row.icon_emoji != null ? String(row.icon_emoji) : undefined,
        });
      }
    } else {
      nextPresets.push(...FALLBACK_AI_SKILL_PRESETS);
    }
    setPresets(nextPresets);

    const ms = monthStartIso();

    const [{ count: activeSkills }, { count: usageMonth }] = await Promise.all([
      supabase
        .from('ai_skill_library')
        .select('*', { count: 'exact', head: true })
        .eq('firm_id', firmId)
        .eq('is_active', true),
      supabase
        .from('ai_skill_usage_log')
        .select('*', { count: 'exact', head: true })
        .eq('firm_id', firmId)
        .gte('created_at', ms),
    ]);

    const { data: libs } = await supabase
      .from('ai_skill_library')
      .select('id, skill_type, skill_name, is_active, updated_at, last_processed_at')
      .eq('firm_id', firmId);

    const libMap = new Map<string, LibraryRow>();
    for (const l of (libs || []) as LibraryRow[]) {
      libMap.set(l.skill_type, l);
    }
    setLibraryByType(libMap);

    const skillIds = (libs || []).map((l) => l.id);
    let docsCompleted = 0;
    const completedBySkill: Record<string, number> = {};
    const lastBySkill: Record<string, string | null> = {};

    if (skillIds.length > 0) {
      const { data: docRows } = await supabase
        .from('ai_skill_documents')
        .select('skill_id, processing_status, updated_at, created_at')
        .in('skill_id', skillIds);

      for (const d of docRows || []) {
        const sid = d.skill_id as string;
        const st = (d.processing_status || '').toLowerCase();
        const ts = maxIso(d.updated_at as string | undefined, d.created_at as string | undefined);
        if (st === 'completed') {
          docsCompleted += 1;
          completedBySkill[sid] = (completedBySkill[sid] || 0) + 1;
        }
        if (ts) {
          const prev = lastBySkill[sid];
          if (!prev || new Date(ts) > new Date(prev)) lastBySkill[sid] = ts;
        }
      }
    }

    setDocCompletedBySkillId(completedBySkill);
    setLastActivityBySkillId(lastBySkill);
    setStats({
      activeSkills: typeof activeSkills === 'number' ? activeSkills : 0,
      docsCompleted,
      usageMonth: typeof usageMonth === 'number' ? usageMonth : 0,
    });

    setLoading(false);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const presetRows = useMemo(() => {
    return presets.map((p) => {
      const lib = libraryByType.get(p.skill_type);
      const n = lib ? docCompletedBySkillId[lib.id] ?? 0 : 0;
      const lastDoc = lib ? lastActivityBySkillId[lib.id] : null;
      const lastIso = lib
        ? maxIso(lib.updated_at, lib.last_processed_at, lastDoc)
        : null;
      return { preset: p, lib, nCompleted: n, lastIso };
    });
  }, [presets, libraryByType, docCompletedBySkillId, lastActivityBySkillId]);

  async function setSkillActive(skillId: string, isActive: boolean) {
    setTogglingId(skillId);
    const { error } = await supabase.from('ai_skill_library').update({ is_active: isActive }).eq('id', skillId);
    setTogglingId(null);
    if (error) {
      logger.error(error);
      toast.error('Failed to update skill: ' + error.message);
      return;
    }
    await load();
    toast.success(isActive ? 'Skill activated' : 'Skill deactivated');
  }

  if (loading) {
    return (
      <div className="flex items-center gap-4 text-gray-600 dark:text-gray-300">
        <div
          className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
        Loading AI skills…
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">AI Skills &amp; Style Library</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-2xl">
          Teach the AI your writing style and knowledge. The AI references these when generating documents, emails, and advice.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Skills configured</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white tabular-nums mt-1">{stats.activeSkills}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">active in library</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Documents uploaded</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white tabular-nums mt-1">{stats.docsCompleted}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">processing completed</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Times used this month</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white tabular-nums mt-1">{stats.usageMonth}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">from usage log</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presetRows.map(({ preset: p, lib, nCompleted, lastIso }) => (
          <div
            key={p.skill_type}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-5 shadow-sm flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0" aria-hidden>
                {p.icon_emoji || '✨'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white">{p.skill_name}</p>
                  {lib && (
                    <label className="flex items-center gap-2 shrink-0 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                      <span className="text-gray-500 dark:text-gray-400">Active</span>
                      <input
                        type="checkbox"
                        checked={!!lib.is_active}
                        disabled={togglingId === lib.id}
                        onChange={(e) => void setSkillActive(lib.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{p.description}</p>
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              {nCompleted === 0 ? (
                <span>No documents yet</span>
              ) : (
                <span>
                  {nCompleted} document{nCompleted === 1 ? '' : 's'} · Last updated {daysAgoLabel(lastIso) || '—'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDetail(p)}
              className="mt-auto w-full flex items-center justify-center gap-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 text-sm font-medium py-2.5 px-4 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
              Configure
              <span aria-hidden>→</span>
            </button>
          </div>
        ))}
      </div>

      {detail && (
        <AISkillDetailPanel
          skillType={detail.skill_type}
          skillName={detail.skill_name}
          description={detail.description}
          firmId={firmId}
          advisorId={advisorId}
          onClose={() => setDetail(null)}
          onSaved={load}
        />
      )}
    </div>
  );
};
