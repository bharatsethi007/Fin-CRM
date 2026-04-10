import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import type { SoaClientDnaView } from './soaClientDnaTypes';
import { SOA_LENDER_CATALOG, type SoaLenderCatalogEntry } from './soaLenderCatalog';
import { filterStep1Lenders, normalizePropertyForSoaFilter } from './soaStep1LenderFilter';

type SoaClientDnaRow = {
  deal_id: string;
  firm_id: string;
  analysis: unknown;
  risk_tier?: string | null;
  income_stability?: number | null;
  lvr?: number | null;
  dti?: number | null;
  property_risk_count?: number | null;
  updated_at?: string;
};

/** Loads `soa_client_dna` and returns a Step 1 lender list filtered by property + DNA exclusions. */
export function useSoaClientDnaAndStep1Lenders(applicationId: string | undefined) {
  const { data: appRow } = useQuery({
    queryKey: ['soa-app-property', applicationId],
    enabled: Boolean(applicationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('property_details')
        .eq('id', applicationId as string)
        .maybeSingle();
      if (error) throw error;
      return data as { property_details: unknown } | null;
    },
  });

  const { data: dnaRow } = useQuery({
    queryKey: ['soa-client-dna', applicationId],
    enabled: Boolean(applicationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('soa_client_dna')
        .select('*')
        .eq('deal_id', applicationId as string)
        .maybeSingle();
      if (error) throw error;
      return data as SoaClientDnaRow | null;
    },
  });

  const dnaView = useMemo((): SoaClientDnaView | null => {
    if (!dnaRow) return null;
    const a = (dnaRow.analysis ?? {}) as SoaClientDnaView;
    return {
      ...a,
      risk_tier: a.risk_tier ?? dnaRow.risk_tier ?? undefined,
      leverage_metrics: a.leverage_metrics ?? {},
    };
  }, [dnaRow]);

  const soaLenderCatalogForStep1 = useMemo((): SoaLenderCatalogEntry[] => {
    const prop = normalizePropertyForSoaFilter(appRow?.property_details);
    return filterStep1Lenders(SOA_LENDER_CATALOG, prop, dnaView);
  }, [appRow?.property_details, dnaView]);

  return {
    dnaRow,
    dnaView,
    soaLenderCatalogForStep1,
    /** Application `property_details` for Step 1 lender filter (with DNA view override). */
    propertyDetailsForFilter: appRow?.property_details ?? null,
  };
}
