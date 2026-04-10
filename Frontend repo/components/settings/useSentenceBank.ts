import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';

export type SentenceCategory = 'reason' | 'risk' | 'structure';
export type SentenceRow = {
  id: string;
  firm_id: string;
  sentence_key: string;
  category: SentenceCategory;
  sentence: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number | null;
};

/** Builds a short snake-case key from sentence text. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 5)
    .join('_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Fetches active sentences for a category. */
export function useSentences(firmId?: string, category?: SentenceCategory) {
  return useQuery({
    queryKey: ['sentence-bank', firmId, category],
    enabled: Boolean(firmId && category),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentence_bank')
        .select('*')
        .eq('firm_id', firmId as string)
        .eq('category', category as SentenceCategory)
        .eq('is_active', true)
        .order('sort_order', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as SentenceRow[];
    },
  });
}

/** Updates sentence text or active status by id. */
export function useUpdateSentence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
      firmId,
      category,
    }: {
      id: string;
      values: Partial<Pick<SentenceRow, 'sentence' | 'is_active'>>;
      firmId: string;
      category: SentenceCategory;
    }) => {
      const { error } = await supabase.from('sentence_bank').update(values).eq('id', id);
      if (error) throw error;
      return { firmId, category };
    },
    onSuccess: ({ firmId, category }) => void queryClient.invalidateQueries({ queryKey: ['sentence-bank', firmId, category] }),
  });
}

/** Inserts a new sentence row into the bank. */
export function useAddSentence(firmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Pick<SentenceRow, 'sentence_key' | 'category' | 'sentence'>) => {
      const { error } = await supabase.from('sentence_bank').insert({ ...values, firm_id: firmId, is_active: true, is_default: false });
      if (error) throw error;
      return values.category;
    },
    onSuccess: (category) => void queryClient.invalidateQueries({ queryKey: ['sentence-bank', firmId, category] }),
  });
}

/** Deletes a non-default sentence row by id. */
export function useDeleteSentence(firmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isDefault, category }: { id: string; isDefault: boolean; category: SentenceCategory }) => {
      if (isDefault) throw new Error('Default sentences cannot be deleted');
      const { error } = await supabase.from('sentence_bank').delete().eq('id', id).eq('is_default', false);
      if (error) throw error;
      return category;
    },
    onSuccess: (category) => void queryClient.invalidateQueries({ queryKey: ['sentence-bank', firmId, category] }),
  });
}
