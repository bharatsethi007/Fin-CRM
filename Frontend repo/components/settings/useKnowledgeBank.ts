import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../services/supabaseClient';
import { logger } from '../../utils/logger';

const IncomeShadingSchema = z.object({
  self_employed: z.number().nullable(),
  rental: z.number().nullable(),
  boarder: z.number().nullable(),
});

export const LenderPolicySchema = z.object({
  lender_name: z.string().nullable(),
  min_deposit_owner_pct: z.number().nullable(),
  min_deposit_investor_pct: z.number().nullable(),
  new_build_deposit_pct: z.number().nullable(),
  max_dti: z.number().nullable(),
  test_rate: z.number().nullable(),
  income_shading: IncomeShadingSchema,
  accepts_boarder_income: z.boolean(),
  accepts_gifted_deposit: z.boolean(),
  max_term_years: z.number().nullable(),
  construction_policy: z.string().nullable(),
  cashback_available: z.boolean(),
  clawback_months: z.number().nullable(),
  commission_upfront_pct: z.number().nullable(),
  commission_trail_pct: z.number().nullable(),
  adviser_notes: z.string().nullable(),
});

export type LenderPolicyFormValues = z.infer<typeof LenderPolicySchema>;
type StoredPolicy = LenderPolicyFormValues & {
  id: string;
  version: string | null;
  is_current: boolean | null;
  firm_id: string;
};

/** Fetches current lender policy packs for a firm. */
export function useLenderPolicies(firmId?: string) {
  return useQuery({
    queryKey: ['lender-policies', firmId],
    enabled: Boolean(firmId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lender_policy_packs')
        .select('*')
        .eq('firm_id', firmId as string)
        .eq('is_current', true)
        .order('lender_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StoredPolicy[];
    },
  });
}

/** Adds a lender policy row scoped to a firm. */
export function useAddLenderPolicy(firmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: LenderPolicyFormValues) => {
      const payload = { ...values, firm_id: firmId, is_current: true, version: 'v1', source: 'manual' };
      const { data, error } = await supabase.from('lender_policy_packs').insert(payload).select('*').single();
      if (error) throw error;
      return data as StoredPolicy;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lender-policies', firmId] }),
  });
}

/** Updates a lender policy row by id. */
export function useUpdateLenderPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values, firmId }: { id: string; values: Partial<LenderPolicyFormValues>; firmId: string }) => {
      const { data, error } = await supabase.from('lender_policy_packs').update(values).eq('id', id).select('*').single();
      if (error) throw error;
      return { data: data as StoredPolicy, firmId };
    },
    onSuccess: ({ firmId }) => void queryClient.invalidateQueries({ queryKey: ['lender-policies', firmId] }),
  });
}

/** Deletes a lender policy row by id. */
export function useDeleteLenderPolicy(firmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lender_policy_packs').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lender-policies', firmId] }),
  });
}

/** Uploads PDF and calls extract-policy function for pre-fill data. */
export function useExtractPolicy(firmId: string) {
  return useMutation({
    mutationFn: async ({ file, lenderName }: { file: File; lenderName: string }) => {
      const safeLenderName = lenderName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filePath = `${firmId}/${safeLenderName || 'unknown-lender'}/${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from('policy-docs').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('policy-docs').getPublicUrl(filePath);
      const fileUrl = publicData.publicUrl;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-policy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ file_url: fileUrl, firm_id: firmId, lender_name: lenderName }),
      });
      const result = (await response.json()) as { success?: boolean; extracted?: LenderPolicyFormValues; error?: string };
      if (!response.ok || !result.success || !result.extracted) {
        throw new Error(result.error || 'Failed to extract lender policy');
      }
      return result.extracted;
    },
    onError: (error) => logger.error('Policy extraction failed:', error),
  });
}
