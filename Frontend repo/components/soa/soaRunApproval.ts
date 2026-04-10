import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import type { LayerFormValues } from './soaLayerFormTypes';

/** Adviser UI selections stored on the approval snapshot for audit. */
export type SoaAdviserOverrideSnapshot = {
  lenderCode?: string;
  reasonKey?: string;
  /** @deprecated Use `riskKeys` */
  riskKey?: string;
  riskKeys?: string[];
  structureKey?: string;
  selectedLenderCodes?: string[];
};

type Args = {
  soaId: string;
  values: LayerFormValues;
  queryClient: QueryClient;
  adviserOverrides?: SoaAdviserOverrideSnapshot;
};

/** Persists approved layers, inserts `soa_versions` snapshot, and audit row. */
export async function runSoaApproval({ soaId, values, queryClient, adviserOverrides }: Args): Promise<void> {
  const { data: currentSoa, error: fetchErr } = await supabase.from('soas').select('*').eq('id', soaId).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!currentSoa) throw new Error('SOA not found');

  const { count, error: countErr } = await supabase
    .from('soa_versions')
    .select('*', { count: 'exact', head: true })
    .eq('soa_id', soaId);
  if (countErr) throw countErr;
  const nextVersion = (count ?? 0) + 1;

  const { error: updateErr } = await supabase
    .from('soas')
    .update({
      status: 'adviser_review',
      approved_at: new Date().toISOString(),
      layer_client_situation: { text: values.layer1 },
      layer_recommendation: { text: values.layer5 },
      layer_sensitivity: { text: values.layer6 },
      layer_risks: { text: values.layer7 },
      layer_commission: { text: values.layer8 },
      updated_at: new Date().toISOString(),
    })
    .eq('id', soaId);
  if (updateErr) throw updateErr;

  const { error: versionErr } = await supabase.from('soa_versions').insert({
    soa_id: soaId,
    firm_id: currentSoa.firm_id as string,
    version_number: nextVersion,
    snapshot: {
      ...currentSoa,
      layer1: values.layer1,
      layer5: values.layer5,
      layer6: values.layer6,
      layer7: values.layer7,
      layer8: values.layer8,
      approved_at: new Date().toISOString(),
      _overrides: adviserOverrides ?? {},
    },
    change_reason: 'Adviser approved SOA',
  });
  if (versionErr) throw versionErr;

  await supabase.from('audit_logs').insert({
    firm_id: currentSoa.firm_id as string,
    entity_type: 'soa',
    entity_id: soaId,
    action: 'approved',
    old_values: {},
    new_values: { version: nextVersion, status: 'adviser_review' },
  });

  await queryClient.invalidateQueries({ queryKey: ['soa-popup', soaId] });
  await queryClient.invalidateQueries({ queryKey: ['soa-steps-preview', soaId] });
}
