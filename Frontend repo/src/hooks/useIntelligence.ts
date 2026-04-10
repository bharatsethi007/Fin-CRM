import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/** Runs `calculate_readiness_score`, `detect_anomalies`, and `calculate_serviceability`, then loads latest rows. */
export function useIntelligence(applicationId: string) {
  const id = applicationId?.trim() ?? '';
  return useQuery({
    queryKey: ['intelligence', id],
    queryFn: async () => {
      const [rReadiness, rAnomaly, rSvc] = await Promise.all([
        supabase.rpc('calculate_readiness_score', { p_application_id: id }),
        supabase.rpc('detect_anomalies', { p_application_id: id }),
        supabase.rpc('calculate_serviceability', { p_application_id: id }),
      ]);

      const rpcErr = rReadiness.error || rAnomaly.error || rSvc.error;
      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      const [readiness, anomalies, serviceability] = await Promise.all([
        supabase
          .from('application_readiness_scores')
          .select('*')
          .eq('application_id', id)
          .order('scored_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('anomaly_flags')
          .select('*')
          .eq('application_id', id)
          .eq('status', 'open')
          .order('severity', { ascending: true }),
        supabase
          .from('serviceability_assessments')
          .select('*')
          .eq('application_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (readiness.error) throw new Error(readiness.error.message);
      if (anomalies.error) throw new Error(anomalies.error.message);
      if (serviceability.error) throw new Error(serviceability.error.message);

      return {
        readiness: readiness.data,
        anomalies: anomalies.data ?? [],
        serviceability: serviceability.data,
      };
    },
    enabled: !!id,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}
