import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useApplications(firmId: string) {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!firmId) {
      setApplications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('firm_id', firmId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    setApplications(data || []);
    setLoading(false);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [firmId, load]);

  return { applications, loading, reload: load };
}
