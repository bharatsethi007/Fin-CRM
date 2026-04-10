import { useCallback, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { logger } from '../../utils/logger';
import { buildAnalyzeClientDnaBody } from './soaClientDnaPayload';

type Toast = { error: (m: string) => void; success: (m: string) => void };

/** Builds invoke body: `applicationId` plus fact/property from optional tables or application payload. */
async function buildAnalyzeClientDnaInvokeBody(applicationId: string): Promise<Record<string, unknown>> {
  const built = await buildAnalyzeClientDnaBody(applicationId);

  const [ff, prop] = await Promise.all([
    supabase.from('fact_finds').select('*').eq('application_id', applicationId).maybeSingle(),
    supabase.from('properties').select('*').eq('application_id', applicationId).maybeSingle(),
  ]);

  if (ff.error) {
    logger.log('DNA: fact_finds not used', ff.error.message);
  }
  if (prop.error) {
    logger.log('DNA: properties not used', prop.error.message);
  }

  const factFind = !ff.error && ff.data ? ff.data : built.factFind;
  const property = !prop.error && prop.data ? prop.data : built.property;

  return {
    applicationId,
    dealId: applicationId,
    deal: built.deal,
    factFind,
    property,
  };
}

/** Invokes `analyze-client-dna` with `applicationId` and refreshes DNA queries. */
export function useSoaClientDnaInvoke(
  applicationId: string | undefined,
  queryClient: QueryClient,
  toast: Toast,
  selectedSituations: string[],
  /** Called after a successful save so popup/UI can reload `analysis` + `updated_at`. */
  afterSuccess?: () => void | Promise<void>,
) {
  const [runningDna, setRunningDna] = useState(false);

  const handleRunDna = useCallback(async () => {
    const appId = applicationId?.trim();
    if (!appId) {
      toast.error('Missing application');
      return;
    }
    setRunningDna(true);
    try {
      logger.log('DNA: calling analyze-client-dna', { applicationId: appId });
      const built = await buildAnalyzeClientDnaInvokeBody(appId);
      const factFind = (built.factFind as Record<string, unknown> | undefined) ?? {};
      const property = (built.property as Record<string, unknown> | undefined) ?? {};
      const body = {
        ...built,
        applicationId: appId,
        dealId: appId,
        factFind,
        property,
        situations: selectedSituations,
      };

      const { data, error } = await supabase.functions.invoke('analyze-client-dna', { body });

      if (error) {
        logger.error('DNA function invoke error', { message: error.message });
        throw new Error(error.message || 'Edge function invoke failed');
      }

      const payload = data as Record<string, unknown> | null;
      if (payload?.error && typeof payload.error === 'string') {
        throw new Error(payload.error);
      }

      await queryClient.invalidateQueries({ queryKey: ['soa-client-dna', appId] });
      await afterSuccess?.();
      const tier = typeof payload?.risk_tier === 'string' ? payload.risk_tier : 'updated';
      toast.success(`DNA analysis complete — ${tier} risk`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'DNA analysis failed';
      logger.error('Client DNA analysis failed', { message });
      toast.error(`Analysis failed: ${message}`);
    } finally {
      setRunningDna(false);
    }
  }, [afterSuccess, applicationId, queryClient, selectedSituations, toast]);

  return { runningDna, handleRunDna };
}
