import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import type { AgentStepRow } from './soaAgentTypes';
import { safeArray } from './soaAgentUtils';
import { shortlistNamesToCodes, soaLenderCodeToName } from './soaLenderCatalog';

type Args = {
  soaId: string;
  steps: AgentStepRow[];
  queryClient: QueryClient;
  toast: { error: (m: string) => void; success: (m: string) => void };
};

/** Step 1 lender checklist state, seeding from agent shortlist, and persist + recalc affordance. */
export function useSoaLenderSelection({ soaId, steps, queryClient, toast }: Args) {
  const step1Row = steps.find((s) => s.step_number === 1);
  const agentShortlistNames = useMemo(
    () => safeArray<string>(step1Row?.output_json?.shortlisted),
    [step1Row?.output_json],
  );
  const agentShortlistCodes = useMemo(() => shortlistNamesToCodes(agentShortlistNames), [agentShortlistNames]);

  const [selectedLenderCodes, setSelectedLenderCodes] = useState<string[]>([]);
  const [needsLenderRecalc, setNeedsLenderRecalc] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [lenderGridSeeded, setLenderGridSeeded] = useState(false);

  useEffect(() => {
    setLenderGridSeeded(false);
    setSelectedLenderCodes([]);
    setNeedsLenderRecalc(false);
  }, [soaId]);

  useEffect(() => {
    if (!step1Row?.id || lenderGridSeeded) return;
    const codes = shortlistNamesToCodes(safeArray<string>(step1Row.output_json?.shortlisted));
    if (codes.length > 0) {
      setSelectedLenderCodes(codes);
      setLenderGridSeeded(true);
    }
  }, [step1Row?.id, step1Row?.output_json, lenderGridSeeded]);

  /** Writes shortlisted lender display names onto step 1 `output_json` and refreshes queries. */
  const handleRecalcCosts = useCallback(async () => {
    const s1 = steps.find((s) => s.step_number === 1);
    if (!soaId || !s1?.id) {
      toast.error('Step 1 data not ready');
      return;
    }
    setRecalcBusy(true);
    try {
      const names = selectedLenderCodes.map((c) => soaLenderCodeToName(c));
      const nextOut = {
        ...(s1.output_json ?? {}),
        shortlisted: names,
        adviser_selected_codes: selectedLenderCodes,
      };
      const { error } = await supabase.from('soa_agent_steps').update({ output_json: nextOut }).eq('id', s1.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['soa-steps-preview', soaId] });
      setNeedsLenderRecalc(false);
      toast.success('Lender selection saved. Refresh comparison when step 3 completes, or use Regenerate for a full rerun.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save lenders';
      toast.error(message);
    } finally {
      setRecalcBusy(false);
    }
  }, [queryClient, selectedLenderCodes, soaId, steps, toast]);

  return {
    agentShortlistCodes,
    selectedLenderCodes,
    setSelectedLenderCodes,
    needsLenderRecalc,
    setNeedsLenderRecalc,
    handleRecalcCosts,
    recalcBusy,
  };
}
