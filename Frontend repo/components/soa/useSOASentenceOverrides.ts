import { useCallback, useEffect, useState } from 'react';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useToast } from '../../hooks/useToast';
import type { SOAPreviewRow } from './soaAgentTypes';
import { layerText } from './soaAgentUtils';
import type { LayerFormValues, SentencePick } from './soaLayerFormTypes';
import { soaLenderCodeToName } from './soaLenderCatalog';

type Args = {
  firmId: string;
  soaId: string;
  soa: SOAPreviewRow | null | undefined;
  setValue: UseFormSetValue<LayerFormValues>;
  getValues: UseFormGetValues<LayerFormValues>;
};

/** Composes Layer 5 text from optional lender label and reason sentence. */
function composeRecommendation(lenderDisplay: string, reasonSentence: string, fallbackForm: string): string {
  const r = reasonSentence.trim();
  const l = lenderDisplay.trim();
  if (r && l) return `${l} — ${r}`;
  if (r) return r;
  if (l) return `${l} —`;
  return fallbackForm;
}

/** Sentence bank rows and handlers that update SOA + audit log; includes recommended-lender override. */
export function useSOASentenceOverrides({ firmId, soaId, soa, setValue, getValues }: Args) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reasonKey, setReasonKey] = useState('');
  const [riskKeys, setRiskKeys] = useState<string[]>([]);
  const [structureKey, setStructureKey] = useState('');
  /** Empty = follow agent `adviser_lender_name`; otherwise explicit catalogue code. */
  const [lenderOverrideCode, setLenderOverrideCode] = useState('');

  const { data: reasons = [] } = useQuery({
    queryKey: ['sentences-reason', firmId],
    enabled: Boolean(firmId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentence_bank')
        .select('sentence_key, sentence')
        .eq('firm_id', firmId)
        .eq('category', 'reason')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as SentencePick[];
    },
  });

  const { data: risks = [] } = useQuery({
    queryKey: ['sentences-risk', firmId],
    enabled: Boolean(firmId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentence_bank')
        .select('sentence_key, sentence')
        .eq('firm_id', firmId)
        .eq('category', 'risk')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as SentencePick[];
    },
  });

  const { data: structures = [] } = useQuery({
    queryKey: ['sentences-structure', firmId],
    enabled: Boolean(firmId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentence_bank')
        .select('sentence_key, sentence')
        .eq('firm_id', firmId)
        .eq('category', 'structure')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as SentencePick[];
    },
  });

  useEffect(() => {
    if (!soa) return;
    setReasonKey(soa.adviser_reason_keys?.[0] ?? '');
    const rk = soa.adviser_risk_keys;
    setRiskKeys(Array.isArray(rk) ? rk.filter((k): k is string => Boolean(k)) : []);
    setStructureKey(soa.adviser_structure_key ?? '');
    setLenderOverrideCode('');
  }, [soa?.id, soa?.adviser_reason_keys, soa?.adviser_risk_keys, soa?.adviser_structure_key]);

  /** Resolves lender label for Layer 5 (override code or agent name on SOA row). */
  const lenderDisplayForLayer5 = useCallback(() => {
    if (lenderOverrideCode) return soaLenderCodeToName(lenderOverrideCode);
    return (soa?.adviser_lender_name ?? '').trim();
  }, [lenderOverrideCode, soa?.adviser_lender_name]);

  const handleRecommendedLenderSelect = useCallback(
    async (raw: string) => {
      if (!firmId) return;
      const useAgent = raw === '__agent__' || raw === '';
      const code = useAgent ? '' : raw;
      setLenderOverrideCode(code);
      const lenderName = code ? soaLenderCodeToName(code) : (soa?.adviser_lender_name ?? '').trim();
      const match = reasons.find((r) => r.sentence_key === reasonKey);
      const reasonSentence = match?.sentence ?? '';
      const body = composeRecommendation(lenderName, reasonSentence, getValues('layer5'));
      setValue('layer5', body);
      const patch: Record<string, unknown> = {
        layer_recommendation: { text: body },
        updated_at: new Date().toISOString(),
      };
      if (!useAgent) patch.adviser_lender_name = lenderName;
      const { error } = await supabase.from('soas').update(patch).eq('id', soaId);
      if (error) {
        toast.error(error.message);
        return;
      }
      await supabase.from('audit_logs').insert({
        firm_id: firmId,
        entity_type: 'soa',
        entity_id: soaId,
        action: 'dropdown_changed',
        old_values: {},
        new_values: { field: 'recommended_lender', code: code || '__agent__', lenderName },
      });
      await queryClient.invalidateQueries({ queryKey: ['soa-popup', soaId] });
    },
    [firmId, getValues, queryClient, reasonKey, reasons, setValue, soa?.adviser_lender_name, soaId, toast],
  );

  const handleReasonSelect = useCallback(
    async (key: string) => {
      if (!firmId) return;
      const match = reasons.find((r) => r.sentence_key === key);
      if (!match) return;
      setReasonKey(key);
      const lenderName = lenderDisplayForLayer5();
      const body = composeRecommendation(lenderName, match.sentence, getValues('layer5'));
      setValue('layer5', body);
      const { error } = await supabase
        .from('soas')
        .update({
          adviser_reason_keys: [key],
          layer_recommendation: { text: body },
          updated_at: new Date().toISOString(),
        })
        .eq('id', soaId);
      if (error) {
        toast.error(error.message);
        return;
      }
      await supabase.from('audit_logs').insert({
        firm_id: firmId,
        entity_type: 'soa',
        entity_id: soaId,
        action: 'dropdown_changed',
        old_values: {},
        new_values: { field: 'reason', key, sentence: match.sentence },
      });
      await queryClient.invalidateQueries({ queryKey: ['soa-popup', soaId] });
    },
    [firmId, getValues, lenderDisplayForLayer5, queryClient, reasons, setValue, soaId, toast],
  );

  /** Builds Layer 7 text from selected risk sentence keys (or agent baseline when empty). */
  const riskLayerBody = useCallback(
    (keys: string[]) => {
      if (keys.length === 0) {
        return (soa?.assembled_risk_text ?? '').trim() || layerText(soa?.layer_risks) || '';
      }
      return keys
        .map((k) => risks.find((r) => r.sentence_key === k)?.sentence)
        .filter((t): t is string => Boolean(t))
        .join('\n\n');
    },
    [risks, soa?.assembled_risk_text, soa?.layer_risks],
  );

  const persistRiskKeys = useCallback(
    async (next: string[]) => {
      if (!firmId) return;
      const body = riskLayerBody(next);
      setRiskKeys(next);
      setValue('layer7', body);
      const { error } = await supabase
        .from('soas')
        .update({
          adviser_risk_keys: next,
          layer_risks: { text: body },
          updated_at: new Date().toISOString(),
        })
        .eq('id', soaId);
      if (error) {
        toast.error(error.message);
        return;
      }
      await supabase.from('audit_logs').insert({
        firm_id: firmId,
        entity_type: 'soa',
        entity_id: soaId,
        action: 'dropdown_changed',
        old_values: {},
        new_values: { field: 'risk_keys', keys: next },
      });
      await queryClient.invalidateQueries({ queryKey: ['soa-popup', soaId] });
    },
    [firmId, queryClient, riskLayerBody, setValue, soaId, toast],
  );

  const toggleRiskKey = useCallback(
    async (key: string) => {
      if (!firmId) return;
      const next = riskKeys.includes(key) ? riskKeys.filter((k) => k !== key) : [...riskKeys, key];
      await persistRiskKeys(next);
    },
    [firmId, persistRiskKeys, riskKeys],
  );

  const clearRiskKeys = useCallback(async () => {
    await persistRiskKeys([]);
  }, [persistRiskKeys]);

  const handleStructureSelect = useCallback(
    async (key: string) => {
      if (!firmId) return;
      const match = structures.find((r) => r.sentence_key === key);
      if (!match) return;
      setStructureKey(key);
      const { error } = await supabase
        .from('soas')
        .update({
          adviser_structure_key: key,
          assembled_structure_text: match.sentence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', soaId);
      if (error) {
        toast.error(error.message);
        return;
      }
      await supabase.from('audit_logs').insert({
        firm_id: firmId,
        entity_type: 'soa',
        entity_id: soaId,
        action: 'dropdown_changed',
        old_values: {},
        new_values: { field: 'structure', key, sentence: match.sentence },
      });
      await queryClient.invalidateQueries({ queryKey: ['soa-popup', soaId] });
    },
    [firmId, queryClient, soaId, structures, toast],
  );

  return {
    reasons,
    risks,
    structures,
    reasonKey,
    riskKeys,
    structureKey,
    lenderOverrideCode,
    handleRecommendedLenderSelect,
    handleReasonSelect,
    toggleRiskKey,
    clearRiskKeys,
    handleStructureSelect,
  };
}
