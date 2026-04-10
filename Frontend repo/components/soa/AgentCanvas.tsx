import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import type { SoaClientDnaView } from './soaClientDnaTypes';
import type { AgentStepRow } from './soaAgentTypes';
import { formatValue, humanizeStepName, safeArray, stepElapsedSecondsLabel } from './soaAgentUtils';
import { SoaAgentCanvasStepZero } from './SoaAgentCanvasStepZero';
import { SoaStepTwoPolicyEvidence } from './SoaStepTwoPolicyEvidence';

type Props = {
  soaId: string;
  firmId: string;
  clientDna?: SoaClientDnaView | null;
  dnaUpdatedAt?: string | null;
  dnaLoading?: boolean;
};

type CitationItem = { source?: string; note?: string; page?: number };

/** Renders live agent step timeline using `output_json`, `title`, and `citations`. */
export function AgentCanvas({
  soaId,
  firmId: _firmId,
  clientDna = null,
  dnaUpdatedAt = null,
  dnaLoading = false,
}: Props) {
  const [steps, setSteps] = useState<AgentStepRow[]>([]);

  /** Merges realtime payload into the existing step row (payload may be partial). */
  function mergeStep(next: Partial<AgentStepRow> & { id: string }) {
    setSteps((prev) => {
      const existing = prev.find((s) => s.id === next.id);
      const merged = existing ? { ...existing, ...next } : ({ ...next } as AgentStepRow);
      const others = prev.filter((s) => s.id !== next.id);
      return [...others, merged].sort((a, b) => a.step_number - b.step_number);
    });
  }

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('soa_agent_steps')
        .select('*')
        .eq('soa_id', soaId)
        .order('step_number', { ascending: true });
      if (!error) setSteps((data as AgentStepRow[]) ?? []);
    };
    void load();

    const channel = supabase
      .channel(`soa-steps-${soaId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'soa_agent_steps', filter: `soa_id=eq.${soaId}` },
        (payload) => {
          const next = payload.new as Partial<AgentStepRow> & { id?: string };
          if (next?.id) mergeStep(next as Partial<AgentStepRow> & { id: string });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [soaId]);

  const ordered = useMemo(() => [...steps].sort((a, b) => a.step_number - b.step_number), [steps]);

  const allCitations = useMemo(
    () =>
      ordered.flatMap((s) => {
        const c = s.citations;
        return safeArray<CitationItem>(c);
      }),
    [ordered],
  );

  return (
    <div className="h-full overflow-y-auto bg-[#0f1117] p-4 text-gray-100">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">Agent Canvas</h3>
      <SoaAgentCanvasStepZero dna={clientDna} dnaUpdatedAt={dnaUpdatedAt} dnaLoading={dnaLoading} />
      <div className="space-y-3">
        {ordered.map((step) => {
          const statusIcon =
            step.status === 'done'
              ? '✅'
              : step.status === 'error'
                ? '❌'
                : step.status === 'running'
                  ? '🔄'
                  : '⏳';
          const heading = (step.title && step.title.trim()) || humanizeStepName(step.step_name, step.step_number);
          const elapsed = stepElapsedSecondsLabel(step.started_at, step.completed_at);
          const out = step.output_json ?? {};
          const policyEvidence =
            step.step_number === 2
              ? ((out.policy_evidence as Record<string, unknown> | undefined) ?? {})
              : {};
          const stepCitations = safeArray<CitationItem>(step.citations);
          return (
            <div key={step.id} className="rounded border border-gray-700 bg-[#161a22] p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{heading}</p>
                {step.is_baseline ? (
                  <span className="rounded bg-amber-600/30 px-2 py-0.5 text-xs font-medium text-amber-200">BASELINE</span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                <span className={step.status === 'running' ? 'inline-block animate-spin' : ''}>{statusIcon}</span>
                <span className="capitalize">{step.status}</span>
                {elapsed ? <span>{elapsed}</span> : null}
              </div>
              {step.input_summary ? <p className="mt-2 text-xs text-gray-400">{step.input_summary}</p> : null}
              {step.status === 'error' && step.error_message ? (
                <p className="mt-2 rounded bg-red-900/40 p-2 text-xs text-red-200">{step.error_message}</p>
              ) : null}
              {stepCitations.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs text-gray-400">
                  {stepCitations.map((c, i) => (
                    <li key={i}>
                      {c.source ?? '—'}
                      {c.page != null ? ` (p.${c.page})` : ''}
                      {c.note ? ` — ${c.note}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
              {step.step_number === 2 ? <SoaStepTwoPolicyEvidence policyEvidence={policyEvidence} /> : null}
              <Collapsible>
                <CollapsibleTrigger className="mt-2 text-xs font-medium text-blue-300 underline">Details</CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1 rounded bg-black/20 p-2 text-xs">
                  {Object.keys(out).length === 0 ? (
                    <p className="text-gray-500">No output yet.</p>
                  ) : (
                    Object.entries(out).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="min-w-28 shrink-0 text-gray-400">{key}</span>
                        <span className="break-words text-gray-200">{formatValue(value)}</span>
                      </div>
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}
        {ordered.length === 0 ? <p className="text-sm text-gray-400">Waiting for agent steps...</p> : null}
      </div>
      {allCitations.length > 0 ? (
        <div className="mt-4 rounded border border-gray-700 bg-[#161a22] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">All citations</p>
          <ul className="list-inside list-disc text-xs text-gray-300">
            {allCitations.map((c, i) => (
              <li key={i}>
                {c.source ?? '—'}
                {c.page != null ? ` (p.${c.page})` : ''}
                {c.note ? ` — ${c.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
