import { useEffect, useState } from 'react';

import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { notifyApplicationPropertyUpdated } from '@/components/deals/PropertyInformationSection';

import { logger } from '../../utils/logger';
import { supabase } from '../../src/lib/supabase';

/** One editable property line in the lending form (backed by `application_properties` when saved). */
export type LendingPropertyRow = {
  id?: string;
  address: string;
  isPrimary: boolean;
};

type ToastLike = { success: (m: string) => void; error: (m: string) => void };

type Props = {
  dealId: string;
  properties: LendingPropertyRow[];
  onPropertiesChange: (rows: LendingPropertyRow[]) => void;
  toast: ToastLike;
};

/**
 * Loads property rows for an application from `application_properties`.
 */
export async function loadApplicationPropertyRows(
  applicationId: string,
  fallbackAddress?: string,
): Promise<LendingPropertyRow[]> {
  const { data, error } = await supabase
    .from('application_properties')
    .select('id, address_full, is_primary, created_at')
    .eq('application_id', applicationId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    logger.log('LendingDetailsForm: load application_properties', error.message);
    if (fallbackAddress?.trim()) {
      return [{ address: fallbackAddress.trim(), isPrimary: true }];
    }
    return [{ address: '', isPrimary: true }];
  }

  const rows = (data ?? []) as {
    id: string;
    address_full: string | null;
    is_primary: boolean | null;
  }[];
  if (rows.length > 0) {
    return rows.map((r, idx) => ({
      id: r.id,
      address: r.address_full ?? '',
      isPrimary: Boolean(r.is_primary) || idx === 0,
    }));
  }
  if (fallbackAddress?.trim()) {
    return [{ address: fallbackAddress.trim(), isPrimary: true }];
  }
  return [{ address: '', isPrimary: true }];
}

/**
 * Writes non-empty property lines to `application_properties` and a single primary flag (first row).
 * Sets `applications.property_address` to the primary line for legacy integrations.
 */
export async function persistApplicationProperties(dealId: string, rows: LendingPropertyRow[]): Promise<LendingPropertyRow[]> {
  const applicationId = dealId.trim();
  if (!applicationId) return rows;

  const nonEmpty = rows
    .map((r) => ({ ...r, address: r.address.trim() }))
    .filter((r) => r.address.length > 0)
    .map((r, i) => ({ ...r, isPrimary: i === 0 }));

  const { data: existing, error: loadErr } = await supabase
    .from('application_properties')
    .select('id')
    .eq('application_id', applicationId);

  if (loadErr) throw new Error(loadErr.message);

  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const keptIds = new Set(nonEmpty.map((r) => r.id).filter(Boolean) as string[]);

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from('application_properties').delete().in('id', toDelete);
    if (delErr) throw new Error(delErr.message);
  }

  const out: LendingPropertyRow[] = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    const row = { ...nonEmpty[i] };
    const isPrimary = i === 0;
    if (row.id && existingIds.has(row.id)) {
      const { error: upErr } = await supabase
        .from('application_properties')
        .update({
          address_full: row.address,
          is_primary: isPrimary,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (upErr) throw new Error(upErr.message);
      out.push(row);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('application_properties')
        .insert({
          application_id: applicationId,
          address_full: row.address,
          is_primary: isPrimary,
        })
        .select('id')
        .single();
      if (insErr) throw new Error(insErr.message);
      row.id = inserted?.id as string;
      out.push(row);
    }
  }

  const primary = out[0]?.address ?? null;
  const { error: appErr } = await supabase
    .from('applications')
    .update({ property_address: primary, updated_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (appErr) throw new Error(appErr.message);

  return out.length > 0 ? out : [{ address: '', isPrimary: true }];
}

/**
 * Inserts or updates an `application_properties` row for this deal (prefers `is_primary`, else latest row).
 * Clears LINZ fields so re-enrichment is not stale after an address change.
 */
export async function upsertPrimaryPropertyRow(
  applicationId: string,
  address: string,
): Promise<{ id: string }> {
  const { data: primary, error: primaryErr } = await supabase
    .from('application_properties')
    .select('id')
    .eq('application_id', applicationId)
    .eq('is_primary', true)
    .maybeSingle();

  if (primaryErr) throw new Error(primaryErr.message);

  let rowId = primary?.id as string | undefined;

  if (!rowId) {
    const { data: latest, error: latestErr } = await supabase
      .from('application_properties')
      .select('id')
      .eq('application_id', applicationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) throw new Error(latestErr.message);
    rowId = latest?.id as string | undefined;
  }

  const clearedEnrichment = {
    title_number: null as string | null,
    legal_description: null as string | null,
    estate_type: null as string | null,
    land_area_m2: null as number | null,
    linz_parcel_id: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
    enriched_at: null as string | null,
    data_sources: {} as Record<string, unknown>,
  };

  if (rowId) {
    const { error: upErr } = await supabase
      .from('application_properties')
      .update({
        address_full: address,
        address_normalized: address,
        is_primary: true,
        ...clearedEnrichment,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rowId);
    if (upErr) throw new Error(upErr.message);
    return { id: rowId };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('application_properties')
    .insert({
      application_id: applicationId,
      address_full: address,
      address_normalized: address,
      is_primary: true,
    })
    .select('id')
    .single();

  if (insErr) throw new Error(insErr.message);
  if (!inserted?.id) throw new Error('Insert failed');
  return { id: inserted.id as string };
}

/**
 * Primary property address + LINZ enrichment via `enrich-property`.
 * UI is a single row; parent `properties[0]` stays the source of truth for the address.
 */
export function LendingDetailsForm({ dealId, properties, onPropertiesChange, toast }: Props) {
  const [propertyId, setPropertyId] = useState<string | null>(properties[0]?.id ?? null);
  const row0 = properties[0] ?? { address: '', isPrimary: true };

  useEffect(() => {
    setPropertyId(properties[0]?.id ?? null);
  }, [properties[0]?.id]);

  const setPrimaryAddress = (address: string) => {
    const tail = properties.slice(1);
    onPropertiesChange([{ ...row0, address, isPrimary: true }, ...tail]);
  };

  const handleAutocompleteSelect = async (address: string) => {
    if (!dealId.trim()) {
      toast.error('Missing application');
      return;
    }
    try {
      const { id } = await upsertPrimaryPropertyRow(dealId, address);
      setPropertyId(id);
      const tail = properties.slice(1);
      onPropertiesChange([{ id, address, isPrimary: true }, ...tail]);
      const { error } = await supabase.functions.invoke('enrich-property', {
        body: { propertyId: id, address },
      });
      if (error) {
        toast.error(error.message || 'Enrichment request failed');
      } else {
        toast.success('Enriching property from LINZ…');
      }
      notifyApplicationPropertyUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save or enrich property';
      logger.error('LendingDetailsForm autocomplete', { msg });
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-3" data-saved-property-id={propertyId ?? undefined}>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="property-address">
        Property address
      </label>
      <div className="flex flex-wrap gap-2">
        <AddressAutocomplete
          id="property-address"
          value={row0.address}
          onValueChange={(v) => setPrimaryAddress(v)}
          onSelect={(addr) => {
            void handleAutocompleteSelect(addr);
          }}
          placeholder="12 Main Street, Weston, Otago"
          className="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-gray-100 placeholder:text-slate-500 dark:bg-slate-800"
        />
        <button
          type="button"
          onClick={async () => {
            const address = (document.getElementById('property-address') as HTMLInputElement | null)?.value?.trim() ?? '';
            if (!address) {
              toast.error('Enter an address first');
              return;
            }
            if (!dealId.trim()) {
              toast.error('Missing application');
              return;
            }
            try {
              const { id } = await upsertPrimaryPropertyRow(dealId, address);
              setPropertyId(id);
              const tail = properties.slice(1);
              onPropertiesChange([{ id, address, isPrimary: true }, ...tail]);

              const { error } = await supabase.functions.invoke('enrich-property', {
                body: { propertyId: id, address },
              });
              if (error) {
                toast.error(error.message || 'Enrichment request failed');
              } else {
                toast.success('Enriching property from LINZ…');
              }
              notifyApplicationPropertyUpdated();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Could not save or enrich property';
              logger.error('LendingDetailsForm verify LINZ', { msg });
              toast.error(msg);
            }
          }}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Verify with LINZ
        </button>
      </div>
    </div>
  );
}
