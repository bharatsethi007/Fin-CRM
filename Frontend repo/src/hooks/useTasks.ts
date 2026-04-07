import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useTasks(advisorId: string) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!advisorId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', advisorId)
      .order('due_date', { ascending: true });
    if (error) throw new Error(error.message);
    setTasks(data || []);
    setLoading(false);
  }, [advisorId]);

  useEffect(() => {
    void load();
  }, [advisorId, load]);

  return { tasks, loading, reload: load };
}
