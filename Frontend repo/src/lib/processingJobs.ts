import type { SupabaseClient } from '@supabase/supabase-js';

/** Row shape for `processing_jobs` (async parse-bank-statement progress). */
export type ProcessingJobRow = {
  id: string;
  firm_id: string | null;
  application_id: string | null;
  document_id: string | null;
  status: string;
  progress_pct: number | null;
  current_step: string | null;
  result_json: unknown;
  tier_used: string | null;
  cost_usd: number | null;
};

/** Normalises `result_json` whether the DB returns an object or a JSON string. */
export function parseResultJson(row: ProcessingJobRow): Record<string, unknown> | null {
  const r = row.result_json;
  if (r == null) return null;
  if (typeof r === 'object' && !Array.isArray(r)) return r as Record<string, unknown>;
  if (typeof r === 'string') {
    try {
      return JSON.parse(r) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** Subscribes to Realtime updates for a single `processing_jobs` row. */
export function subscribeToProcessingJob(
  client: SupabaseClient,
  jobId: string,
  onRow: (row: ProcessingJobRow) => void,
): () => void {
  const channel = client
    .channel(`processing_job:${jobId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'processing_jobs',
        filter: `id=eq.${jobId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as ProcessingJobRow | undefined;
        if (row && String(row.id) === jobId) onRow(row);
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

/** Resolves when the job reaches `complete` or `failed` (Realtime + polling fallback). */
export async function waitForProcessingJob(
  client: SupabaseClient,
  jobId: string,
  onProgress?: (row: ProcessingJobRow) => void,
): Promise<ProcessingJobRow> {
  const terminal = (s: string) => s === 'complete' || s === 'failed';

  const fetchRow = async (): Promise<ProcessingJobRow | null> => {
    const { data, error } = await client.from('processing_jobs').select('*').eq('id', jobId).maybeSingle();
    if (error) return null;
    return data as ProcessingJobRow;
  };

  const initial = await fetchRow();
  if (initial) {
    onProgress?.(initial);
    if (terminal(initial.status)) {
      if (initial.status === 'failed') {
        const parsed = parseResultJson(initial);
        const msg =
          (typeof parsed?.error === 'string' && parsed.error) ||
          initial.current_step ||
          'Document processing failed';
        throw new Error(msg);
      }
      return initial;
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanups: Array<() => void> = [];

    const cleanup = () => {
      cleanups.forEach((fn) => fn());
    };

    const finishOk = (row: ProcessingJobRow) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(row);
    };

    const finishErr = (row: ProcessingJobRow, fallback: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      const parsed = parseResultJson(row);
      const msg =
        (typeof parsed?.error === 'string' && parsed.error) || row.current_step || fallback;
      reject(new Error(msg));
    };

    const handle = (row: ProcessingJobRow | null) => {
      if (!row) return;
      onProgress?.(row);
      if (row.status === 'failed') finishErr(row, 'Document processing failed');
      else if (row.status === 'complete') finishOk(row);
    };

    cleanups.push(subscribeToProcessingJob(client, jobId, (row) => handle(row)));

    void fetchRow().then((row) => handle(row));

    const poll = globalThis.setInterval(() => {
      void fetchRow().then((row) => handle(row));
    }, 2500);
    cleanups.push(() => globalThis.clearInterval(poll));

    const timeout = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Processing timed out'));
    }, 15 * 60 * 1000);
    cleanups.push(() => globalThis.clearTimeout(timeout));
  });
}
