import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';

/** AI metadata from generate-soa-draft (e.g. freeform when Knowledge Bank is empty). */
export type SOAAISelection = {
  draft_mode?: string;
  setup_prompt?: string | null;
};

export type SOARow = {
  id: string;
  application_id: string;
  firm_id: string;
  status: string;
  ai_selection?: SOAAISelection | null;
  selected_reason_keys: string[] | null;
  selected_risk_keys: string[] | null;
  selected_structure_key: string | null;
  adviser_reason_keys: string[] | null;
  adviser_risk_keys: string[] | null;
  adviser_structure_key: string | null;
  adviser_lender_name: string | null;
  assembled_reason_text: string | null;
  assembled_risk_text: string | null;
  assembled_structure_text: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
};

type SentenceMapRow = { sentence_key: string; sentence: string };

/** Joins sentences for selected keys into display text. */
export function assembleText(keys: string[], sentenceMap: Record<string, string>): string {
  return keys.map((key) => sentenceMap[key]).filter(Boolean).join(' ');
}

/** Fetches one SOA row by id. */
export const useSOA = (soaId: string | undefined) =>
  useQuery<SOARow>({
    queryKey: ['soa', soaId],
    queryFn: async () => {
      if (!soaId) throw new Error('No SOA ID');
      const { data, error } = await supabase.from('soas').select('*').eq('id', soaId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!soaId,
  });

/** Fetches active sentence map keyed by sentence_key. */
export function useSentenceMap(firmId?: string) {
  return useQuery({
    queryKey: ['soa-sentence-map', firmId],
    enabled: Boolean(firmId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentence_bank')
        .select('sentence_key,sentence')
        .eq('firm_id', firmId as string)
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []).reduce<Record<string, string>>((acc, row) => {
        const typed = row as SentenceMapRow;
        acc[typed.sentence_key] = typed.sentence;
        return acc;
      }, {});
    },
  });
}

/** Updates SOA fields by id. */
export function useUpdateSOA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ soaId, values }: { soaId: string; values: Partial<SOARow> }) => {
      const { error } = await supabase.from('soas').update(values).eq('id', soaId);
      if (error) throw error;
      return soaId;
    },
    onSuccess: (soaId) => void queryClient.invalidateQueries({ queryKey: ['soa', soaId] }),
  });
}

/** Writes an audit log row for SOA changes. */
export function useWriteAuditLog() {
  return useMutation({
    mutationFn: async ({
      firm_id,
      entity_id,
      action,
      old_values,
      new_values,
    }: {
      firm_id: string;
      entity_id: string;
      action: string;
      old_values: Record<string, unknown>;
      new_values: Record<string, unknown>;
    }) => {
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await supabase.from('audit_logs').insert({
        firm_id,
        entity_type: 'soa',
        entity_id,
        action,
        actor_id: authData.user?.id ?? null,
        old_values,
        new_values,
      });
      if (error) throw error;
      return true;
    },
  });
}
