import { useCallback, useEffect, useState } from 'react';
import { DocumentsService } from '../services/documents.service';

export function useDocuments(applicationId: string) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!applicationId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const docs = await DocumentsService.list(applicationId);
    setDocuments(docs);
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [applicationId, load]);

  return { documents, loading, reload: load };
}
