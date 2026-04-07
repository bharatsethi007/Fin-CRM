import type { SupabaseClient } from '@supabase/supabase-js';
import { invokeFunction } from '../src/lib/api';

/**
 * After a documents row is inserted, the DB trigger may enqueue `document_parse_queue`.
 * If a queue row exists, start the edge function (fire-and-forget). UI can poll queue status.
 */
export function fireDocumentParseIfQueued(
  supabase: SupabaseClient,
  insertedDocumentId: string,
  applicationId: string,
  firmIdHint?: string | null,
): void {
  void (async () => {
    let firmId = firmIdHint ?? null;
    if (!firmId) {
      const { data: appRow } = await supabase
        .from('applications')
        .select('firm_id')
        .eq('id', applicationId)
        .maybeSingle();
      firmId = appRow?.firm_id ?? null;
    }
    if (!firmId) return;

    const { data: queueRow } = await supabase
      .from('document_parse_queue')
      .select('id')
      .eq('document_id', insertedDocumentId)
      .maybeSingle();

    if (!queueRow?.id) return;

    invokeFunction('parse-bank-statement', {
      parse_queue_id: queueRow.id,
      document_id: insertedDocumentId,
      application_id: applicationId,
      firm_id: firmId,
    }).catch(console.error);
  })();
}
