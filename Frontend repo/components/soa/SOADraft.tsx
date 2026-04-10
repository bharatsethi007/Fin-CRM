import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../services/supabaseClient';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { SOAPreview } from './SOAPreview';
import { assembleText, useSOA, useSentenceMap, useUpdateSOA, useWriteAuditLog } from './useSOADraft';
import { useSentences } from '../settings/useSentenceBank';
import {
  AlertDialog,
  AlertDialogCancelButton,
  AlertDialogContent,
  AlertDialogDestructiveAction,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

export type SOADraftProps = {
  soaId: string;
  firmId: string;
  applicationId: string;
  onClose?: () => void;
};

/** Renders SOA draft controls with live preview and persistence. */
export function SOADraft({ soaId, firmId, applicationId, onClose }: SOADraftProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: soa, isLoading, error } = useSOA(soaId);
  const { data: sentenceMap = {} } = useSentenceMap(firmId);
  const { data: reasonOptions = [] } = useSentences(firmId, 'reason');
  const { data: riskOptions = [] } = useSentences(firmId, 'risk');
  const { data: structureOptions = [] } = useSentences(firmId, 'structure');
  const { data: preferences } = useQuery({
    queryKey: ['tenant-preferences', firmId],
    enabled: Boolean(firmId),
    queryFn: async () => (await supabase.from('tenant_preferences').select('*').eq('firm_id', firmId).maybeSingle()).data,
  });
  const updateSOA = useUpdateSOA();
  const writeAudit = useWriteAuditLog();

  const [lenderName, setLenderName] = useState('');
  const [reasonKeys, setReasonKeys] = useState<string[]>([]);
  const [riskKeys, setRiskKeys] = useState<string[]>([]);
  const [structureKey, setStructureKey] = useState('');

  useEffect(() => {
    if (!soa) return;
    setLenderName(soa.adviser_lender_name ?? '');
    setReasonKeys((soa.adviser_reason_keys?.length ? soa.adviser_reason_keys : soa.selected_reason_keys) ?? []);
    setRiskKeys((soa.adviser_risk_keys?.length ? soa.adviser_risk_keys : soa.selected_risk_keys) ?? []);
    setStructureKey(soa.adviser_structure_key || soa.selected_structure_key || '');
  }, [soa]);

  const reasonText = useMemo(() => assembleText(reasonKeys, sentenceMap), [reasonKeys, sentenceMap]);
  const riskText = useMemo(() => assembleText(riskKeys, sentenceMap), [riskKeys, sentenceMap]);
  const structureText = useMemo(() => sentenceMap[structureKey] ?? '', [sentenceMap, structureKey]);

  /** Persists SOA change and writes audit trail entry. */
  async function persistChange(oldValues: Record<string, unknown>, newValues: Record<string, unknown>) {
    if (!soa) return;
    await updateSOA.mutateAsync({
      soaId,
      values: {
        adviser_reason_keys: reasonKeys,
        adviser_risk_keys: riskKeys,
        adviser_structure_key: structureKey || null,
        adviser_lender_name: lenderName || null,
        assembled_reason_text: reasonText,
        assembled_risk_text: riskText,
        assembled_structure_text: structureText,
      },
    });
    await writeAudit.mutateAsync({
      firm_id: soa.firm_id,
      entity_id: soaId,
      action: 'dropdown_changed',
      old_values: oldValues,
      new_values: newValues,
    });
  }

  if (isLoading) return <div>Loading SOA draft...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!soa) return <div>SOA not found</div>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {soa.ai_selection?.draft_mode === 'freeform' && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ This draft was AI-generated without a configured Knowledge Bank or Sentence Library. All text is
          editable. {soa.ai_selection?.setup_prompt}
        </div>
      )}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-5">
      <div className="min-h-0 lg:col-span-3">
        <SOAPreview
          lenderName={lenderName || soa.adviser_lender_name}
          reasonText={reasonText}
          riskText={riskText}
          structureText={structureText}
          headerText={preferences?.soa_header_text ?? undefined}
          footerText={preferences?.soa_footer_text ?? undefined}
          status={soa.status}
        />
      </div>
      <div className="min-h-0 space-y-4 rounded-lg border bg-white p-4 dark:bg-gray-900 lg:col-span-2">
        <h3 className="text-lg font-semibold">SOA Controls</h3>
        <div className="space-y-2">
          <Label>Lender</Label>
          <Input
            value={lenderName}
            onChange={(e) => setLenderName(e.target.value)}
            onBlur={() => void persistChange({ adviser_lender_name: soa.adviser_lender_name }, { adviser_lender_name: lenderName })}
          />
        </div>
        <div className="space-y-2">
          <Label>Reason</Label>
          {reasonOptions.map((row) => (
            <label key={row.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reasonKeys.includes(row.sentence_key)}
                onChange={async (e) => {
                  const prev = reasonKeys;
                  const next = e.target.checked ? [...prev, row.sentence_key] : prev.filter((k) => k !== row.sentence_key);
                  setReasonKeys(next);
                  await persistChange({ adviser_reason_keys: prev }, { adviser_reason_keys: next });
                }}
              />
              {row.sentence}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label>Risk</Label>
          {riskOptions.map((row) => (
            <label key={row.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={riskKeys.includes(row.sentence_key)}
                onChange={async (e) => {
                  const prev = riskKeys;
                  const next = e.target.checked ? [...prev, row.sentence_key] : prev.filter((k) => k !== row.sentence_key);
                  setRiskKeys(next);
                  await persistChange({ adviser_risk_keys: prev }, { adviser_risk_keys: next });
                }}
              />
              {row.sentence}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label>Structure</Label>
          <Select
            value={structureKey || undefined}
            onValueChange={async (value) => {
              const prev = structureKey;
              setStructureKey(value);
              await persistChange({ adviser_structure_key: prev }, { adviser_structure_key: value });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select structure" />
            </SelectTrigger>
            <SelectContent>
              {structureOptions.map((row) => (
                <SelectItem key={row.id} value={row.sentence_key}>
                  {row.sentence_key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button">Approve SOA</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Submit this SOA for review?</AlertDialogTitle>
                <AlertDialogDescription>You can still regenerate a new draft later.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancelButton type="button">Cancel</AlertDialogCancelButton>
                <AlertDialogDestructiveAction
                  type="button"
                  onClick={async () => {
                    await updateSOA.mutateAsync({
                      soaId,
                      values: { status: 'adviser_review', approved_at: new Date().toISOString() },
                    });
                    toast.success('SOA submitted for review');
                    onClose?.();
                  }}
                >
                  Confirm
                </AlertDialogDestructiveAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="outline"
            type="button"
            onClick={async () => {
              try {
                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-soa-draft`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                  },
                  body: JSON.stringify({ application_id: applicationId, firm_id: firmId }),
                });
                if (!res.ok) throw new Error('Regeneration failed');
                await queryClient.invalidateQueries({ queryKey: ['soa', soaId] });
                await queryClient.invalidateQueries({ queryKey: ['existing-soa', applicationId] });
                toast.success('SOA regenerated');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Regeneration failed');
              }
            }}
          >
            Regenerate
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
