import { useCallback, useEffect, useState } from 'react';
import { ExpensesService } from '../services/expenses.service';

export function useExpenses(applicationId: string) {
  const [expenses, setExpenses] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!applicationId) {
      setExpenses(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await ExpensesService.get(applicationId);
    setExpenses(data ?? null);
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [applicationId, load]);

  return { expenses, loading, reload: load };
}
