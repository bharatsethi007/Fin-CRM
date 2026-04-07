import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useIncome(applicantIds: string[]) {
  const [income, setIncome] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const idsKey = applicantIds.join(',');

  const load = useCallback(async () => {
    if (applicantIds.length === 0) {
      setIncome([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('income')
      .select('*, applicants(first_name,last_name)')
      .in('applicant_id', applicantIds);
    if (error) throw new Error(error.message);
    setIncome(data || []);
    setLoading(false);
  }, [idsKey]);

  useEffect(() => {
    void load();
  }, [idsKey, load]);

  return { income, loading, reload: load };
}
