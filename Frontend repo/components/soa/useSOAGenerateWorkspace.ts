import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useToast } from '../../hooks/useToast';
import { logger } from '../../utils/logger';
import type { AgentStepRow, SOAPreviewRow } from './soaAgentTypes';
import { buildLayerDefaults, EMPTY_LAYERS, LAYER_SAVE_MAP, type LayerFormValues } from './soaLayerFormTypes';
import { buildApprovalLayersWithDna } from './soaApprovalLayerMerge';
import { runSoaApproval } from './soaRunApproval';
import { SOA_LENDER_CATALOG } from './soaLenderCatalog';
import type { SoaClientDnaView } from './soaClientDnaTypes';
import { filterStep1Lenders, mergeCatalogWithAgentShortlist, normalizePropertyForSoaFilter } from './soaStep1LenderFilter';
import { useSoaClientDnaAndStep1Lenders } from './useSoaClientDnaAndStep1Lenders';
import { useSoaClientDnaInvoke } from './useSoaClientDnaInvoke';
import { useSoaLenderSelection } from './useSoaLenderSelection';
import { useSOASentenceOverrides } from './useSOASentenceOverrides';

export type { LayerFormValues } from './soaLayerFormTypes';

type UseArgs = {
  soaId: string;
  firmId: string;
  applicationId?: string;
  onClose: () => void;
  selectedSituations: string[];
  /** Popup-fetched `analysis` json; takes precedence over React Query row until aligned. */
  persistedDnaAnalysis: SoaClientDnaView | null;
  persistedDnaUpdatedAt: string | null;
  onClientDnaRefresh: () => void | Promise<void>;
};

/** Fetches SOA + steps, layer form state, debounced jsonb saves, sentence overrides, approve. */
export function useSOAGenerateWorkspace({
  soaId,
  firmId,
  applicationId,
  onClose,
  selectedSituations,
  persistedDnaAnalysis,
  persistedDnaUpdatedAt,
  onClientDnaRefresh,
}: UseArgs) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [approving, setApproving] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);

  const { register, getValues, setValue, reset } = useForm<LayerFormValues>({
    defaultValues: EMPTY_LAYERS,
  });

  const { data: soa } = useQuery({
    queryKey: ['soa-popup', soaId],
    enabled: Boolean(soaId),
    queryFn: async () => {
      const { data, error } = await supabase.from('soas').select('*').eq('id', soaId).maybeSingle();
      if (error) throw error;
      return data as SOAPreviewRow | null;
    },
    refetchInterval: (q) => (q.state.data?.agent_completed_at ? false : 3000),
  });

  const soaRef = useRef(soa);
  soaRef.current = soa ?? null;

  const { data: steps = [] } = useQuery({
    queryKey: ['soa-steps-preview', soaId],
    enabled: Boolean(soaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('soa_agent_steps')
        .select('*')
        .eq('soa_id', soaId)
        .order('step_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentStepRow[];
    },
    refetchInterval: (q) => {
      const list = q.state.data;
      if (!list?.length) return 3000;
      const settled = list.every((s) => s.status === 'done' || s.status === 'error');
      return settled ? false : 3000;
    },
  });

  const sentence = useSOASentenceOverrides({ firmId, soaId, soa: soa ?? undefined, setValue, getValues });

  const step4 = steps.find((s) => s.step_number === 4);
  const step5 = steps.find((s) => s.step_number === 5);
  const outputJsonSig = JSON.stringify(step4?.output_json ?? null);

  const dnaBlock = useSoaClientDnaAndStep1Lenders(applicationId?.trim() || undefined);
  const clientDnaUpdatedAt = persistedDnaUpdatedAt ?? dnaBlock.dnaRow?.updated_at ?? null;

  const lenderSel = useSoaLenderSelection({ soaId, steps, queryClient, toast });

  const dnaViewResolved = persistedDnaAnalysis ?? dnaBlock.dnaView;

  const soaLenderCatalogForGrid = useMemo(
    () =>
      mergeCatalogWithAgentShortlist(
        filterStep1Lenders(
          SOA_LENDER_CATALOG,
          normalizePropertyForSoaFilter(dnaBlock.propertyDetailsForFilter),
          dnaViewResolved,
        ),
        lenderSel.agentShortlistCodes,
      ),
    [dnaBlock.propertyDetailsForFilter, dnaViewResolved, lenderSel.agentShortlistCodes],
  );

  const { runningDna, handleRunDna } = useSoaClientDnaInvoke(
    applicationId,
    queryClient,
    toast,
    selectedSituations,
    onClientDnaRefresh,
  );

  useEffect(() => {
    const L = (step4?.output_json ?? {}) as Record<string, unknown>;
    reset(buildLayerDefaults(L, soaRef.current ?? undefined));
  }, [outputJsonSig, soa?.id, reset, step4?.output_json]);

  const persistLayer = useCallback(
    async (field: keyof LayerFormValues, value: string) => {
      const col = LAYER_SAVE_MAP[field];
      if (!col) return;
      const { error } = await supabase
        .from('soas')
        .update({
          [col]: { text: value },
          updated_at: new Date().toISOString(),
        })
        .eq('id', soaId);
      if (error) {
        logger.error('SOA layer save failed', { field, message: error.message });
        toast.error(error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['soa-popup', soaId] });
    },
    [queryClient, soaId, toast],
  );

  const blurTimersRef = useRef<Partial<Record<keyof LayerFormValues, number>>>({});

  const onLayerBlur = useCallback(
    (field: keyof LayerFormValues) => {
      if (!LAYER_SAVE_MAP[field]) return;
      const value = getValues(field);
      const prev = blurTimersRef.current[field];
      if (typeof prev === 'number') window.clearTimeout(prev);
      blurTimersRef.current[field] = setTimeout(() => {
        delete blurTimersRef.current[field];
        void persistLayer(field, value);
      }, 500);
    },
    [getValues, persistLayer],
  );

  useEffect(
    () => () => {
      Object.values(blurTimersRef.current).forEach((t) => {
        if (typeof t === 'number') window.clearTimeout(t);
      });
    },
    [],
  );

  const compliancePctRaw = (step5?.output_json as Record<string, unknown> | null)?.compliance_pct;
  const compliancePct =
    typeof compliancePctRaw === 'number' && Number.isFinite(compliancePctRaw) ? compliancePctRaw : 0;

  const handleApprove = useCallback(async () => {
    if (!soaId || !firmId) return;
    setApproving(true);
    try {
      const raw = getValues();
      const values = buildApprovalLayersWithDna(raw, dnaViewResolved, sentence.riskKeys, sentence.risks);
      await runSoaApproval({
        soaId,
        values,
        queryClient,
        adviserOverrides: {
          lenderCode: sentence.lenderOverrideCode,
          reasonKey: sentence.reasonKey,
          riskKeys: sentence.riskKeys,
          structureKey: sentence.structureKey,
          selectedLenderCodes: lenderSel.selectedLenderCodes,
        },
      });
      toast.success('SOA approved and saved');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve SOA';
      logger.error('SOA approve failed', { message });
      toast.error(message);
    } finally {
      setApproving(false);
    }
  }, [
    firmId,
    getValues,
    onClose,
    queryClient,
    dnaViewResolved,
    lenderSel.selectedLenderCodes,
    sentence.lenderOverrideCode,
    sentence.reasonKey,
    sentence.riskKeys,
    sentence.risks,
    sentence.structureKey,
    soaId,
    toast,
  ]);

  /** Persists all eight layers to `soas` and inserts a new `soa_versions` snapshot row. */
  const saveSoaVersionSnapshot = useCallback(async () => {
    if (!soaId || !firmId) return;
    setSavingVersion(true);
    try {
      const v = getValues();
      const jsonText = (s: string) => ({ text: s });
      const { error: uErr } = await supabase
        .from('soas')
        .update({
          layer_client_situation: jsonText(v.layer1),
          layer_regulatory_gate: jsonText(v.layer2),
          layer_market_scan: jsonText(v.layer3),
          layer_quant_matrix: jsonText(v.layer4),
          layer_recommendation: jsonText(v.layer5),
          layer_sensitivity: jsonText(v.layer6),
          layer_risks: jsonText(v.layer7),
          layer_commission: jsonText(v.layer8),
          updated_at: new Date().toISOString(),
        })
        .eq('id', soaId);
      if (uErr) throw uErr;

      const { data: currentSoa, error: fErr } = await supabase.from('soas').select('*').eq('id', soaId).maybeSingle();
      if (fErr) throw fErr;
      if (!currentSoa) throw new Error('SOA not found');

      const { count, error: cErr } = await supabase
        .from('soa_versions')
        .select('*', { count: 'exact', head: true })
        .eq('soa_id', soaId);
      if (cErr) throw cErr;
      const nextNum = (count ?? 0) + 1;

      const { error: iErr } = await supabase.from('soa_versions').insert({
        soa_id: soaId,
        firm_id: (currentSoa as { firm_id: string }).firm_id,
        version_number: nextNum,
        snapshot: {
          ...(currentSoa as Record<string, unknown>),
          layer_form: v,
          saved_at: new Date().toISOString(),
        },
        change_reason: 'Saved from SOA editor',
      });
      if (iErr) throw iErr;

      toast.success(`Version ${nextNum} saved`);
      await queryClient.invalidateQueries({ queryKey: ['soa-popup', soaId] });
      await queryClient.invalidateQueries({ queryKey: ['approved-soa'] });
      await queryClient.invalidateQueries({ queryKey: ['existing-soa'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save version';
      logger.error('SOA version save failed', { message });
      toast.error(message);
    } finally {
      setSavingVersion(false);
    }
  }, [firmId, getValues, queryClient, soaId, toast]);

  return {
    soa,
    steps,
    register,
    getValues,
    setValue,
    reset,
    onLayerBlur,
    handleApprove,
    approving,
    compliancePct,
    reasons: sentence.reasons,
    risks: sentence.risks,
    structures: sentence.structures,
    reasonKey: sentence.reasonKey,
    riskKeys: sentence.riskKeys,
    structureKey: sentence.structureKey,
    handleReasonSelect: sentence.handleReasonSelect,
    toggleRiskKey: sentence.toggleRiskKey,
    clearRiskKeys: sentence.clearRiskKeys,
    handleStructureSelect: sentence.handleStructureSelect,
    handleRecommendedLenderSelect: sentence.handleRecommendedLenderSelect,
    lenderOverrideCode: sentence.lenderOverrideCode,
    agentShortlistCodes: lenderSel.agentShortlistCodes,
    selectedLenderCodes: lenderSel.selectedLenderCodes,
    setSelectedLenderCodes: lenderSel.setSelectedLenderCodes,
    needsLenderRecalc: lenderSel.needsLenderRecalc,
    setNeedsLenderRecalc: lenderSel.setNeedsLenderRecalc,
    handleRecalcCosts: lenderSel.handleRecalcCosts,
    recalcBusy: lenderSel.recalcBusy,
    soaLenderCatalog: soaLenderCatalogForGrid,
    clientDnaView: dnaViewResolved,
    clientDnaUpdatedAt,
    handleRunDna,
    runningDna,
    saveSoaVersionSnapshot,
    savingVersion,
  };
}
