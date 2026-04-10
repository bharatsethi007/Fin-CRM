import { useEffect } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { PreferredLenderSortable } from './PreferredLenderSortable';

const PreferencesSchema = z.object({
  preferred_lender_order: z.array(z.string()),
  default_structure_key: z.string().nullable(),
  default_reason_key: z.string().nullable(),
  commission_disclosure_template: z.string().nullable(),
  require_three_options_minimum: z.boolean(),
  soa_header_text: z.string().nullable(),
  soa_footer_text: z.string().nullable(),
});

type PreferencesValues = z.infer<typeof PreferencesSchema>;
type SentenceOption = { sentence_key: string; category: 'reason' | 'structure' };

const defaults: PreferencesValues = {
  preferred_lender_order: [],
  default_structure_key: null,
  default_reason_key: null,
  commission_disclosure_template: null,
  require_three_options_minimum: true,
  soa_header_text: null,
  soa_footer_text: null,
};

type Props = { firmId: string };

/** Renders firm-level SOA preferences form. */
export function SettingsPreferences({ firmId }: Props) {
  const toast = useToast();
  const form = useForm<PreferencesValues>({ resolver: zodResolver(PreferencesSchema), defaultValues: defaults });
  const lenders = useQuery({
    queryKey: ['pref-lenders', firmId],
    queryFn: async () => (await supabase.from('lender_policy_packs').select('lender_name').eq('firm_id', firmId).eq('is_current', true)).data ?? [],
  });
  const options = useQuery({
    queryKey: ['pref-sentence-options', firmId],
    queryFn: async () => (await supabase.from('sentence_bank').select('sentence_key,category').eq('firm_id', firmId).eq('is_active', true)).data as SentenceOption[] | null,
  });
  const existing = useQuery({
    queryKey: ['tenant-preferences', firmId],
    queryFn: async () => (await supabase.from('tenant_preferences').select('*').eq('firm_id', firmId).maybeSingle()).data,
  });
  const saveMutation = useMutation({
    mutationFn: async (values: PreferencesValues) =>
      supabase.from('tenant_preferences').upsert({ firm_id: firmId, ...values }, { onConflict: 'firm_id' }),
  });

  useEffect(() => {
    if (!existing.data) return;
    form.reset({ ...defaults, ...existing.data });
  }, [existing.data, form]);

  const lenderNames = (lenders.data ?? []).map((row: { lender_name: string }) => row.lender_name).filter(Boolean);
  const reasonOptions = (options.data ?? []).filter((row) => row.category === 'reason');
  const structureOptions = (options.data ?? []).filter((row) => row.category === 'structure');

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await saveMutation.mutateAsync(values);
        if (result.error) toast.error(result.error.message);
        else toast.success('Preferences saved');
      })}
    >
      <h2 className="text-2xl font-semibold">SOA Preferences</h2>
      <div className="space-y-2">
        <Label>Preferred lender order</Label>
        <PreferredLenderSortable items={form.watch('preferred_lender_order').length ? form.watch('preferred_lender_order') : lenderNames} onChange={(next) => form.setValue('preferred_lender_order', next)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Default structure key</Label>
          <Select value={form.watch('default_structure_key') ?? undefined} onValueChange={(v) => form.setValue('default_structure_key', v)}>
            <SelectTrigger><SelectValue placeholder="Select structure" /></SelectTrigger>
            <SelectContent>{structureOptions.map((o) => <SelectItem key={o.sentence_key} value={o.sentence_key}>{o.sentence_key}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Default reason key</Label>
          <Select value={form.watch('default_reason_key') ?? undefined} onValueChange={(v) => form.setValue('default_reason_key', v)}>
            <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
            <SelectContent>{reasonOptions.map((o) => <SelectItem key={o.sentence_key} value={o.sentence_key}>{o.sentence_key}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Commission disclosure template</Label>
        <Textarea {...form.register('commission_disclosure_template')} />
        <p className="text-xs text-gray-500">{'Placeholders: {{client_name}}, {{loan_amount}}, {{lender_name}}, {{upfront_commission}}, {{trail_commission}}'}</p>
      </div>
      <div className="flex items-center justify-between rounded border p-3">
        <Label>Require at least three options</Label>
        <Switch checked={form.watch('require_three_options_minimum')} onCheckedChange={(checked) => form.setValue('require_three_options_minimum', checked)} />
      </div>
      <div className="space-y-2"><Label>SOA header text</Label><Textarea {...form.register('soa_header_text')} /></div>
      <div className="space-y-2"><Label>SOA footer text</Label><Textarea {...form.register('soa_footer_text')} /></div>
      <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : 'Save Preferences'}</Button>
    </form>
  );
}
