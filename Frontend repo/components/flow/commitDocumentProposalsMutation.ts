import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger';
import { fireDocumentParseIfQueued } from '../../services/documentParsePipeline';
import type { DocumentFilingProposal, Message } from './flowIntelligenceChatTypes';

/** Persists document filing proposals and updates the message interactive block. */
export async function commitDocumentProposalsMutation(params: {
  supabase: SupabaseClient;
  firmId: string;
  advisorId: string;
  messageId: string;
  proposals: DocumentFilingProposal[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
}): Promise<void> {
  const { supabase, firmId, advisorId, messageId, proposals, setMessages } = params;
  const lines: string[] = [];
  try {
    const okRows = proposals.filter((p) => !p.error && p.client_id && p.public_url);
    for (const p of proposals) {
      if (p.error) continue;
      if (!p.client_id || !p.public_url) {
        lines.push(`✗ ${p.file_name}: could not file (missing client or URL).`);
        continue;
      }
      const { data, error } = await supabase
        .from('documents')
        .insert({
          firm_id: firmId,
          client_id: p.client_id,
          application_id: p.application_id || null,
          name: p.file_name,
          category: p.suggested_category || '02 Financial Evidence',
          url: p.public_url,
          file_type: p.mime_type || null,
          file_size_bytes: p.size_bytes ?? null,
          upload_date: new Date().toISOString().split('T')[0],
          status: 'Valid',
          detected_type: p.detected_type || 'other',
          uploaded_by: advisorId,
          file_hash: p.file_hash || null,
        })
        .select('id')
        .single();
      if (error) {
        lines.push(`✗ ${p.file_name}: ${error.message}`);
        continue;
      }
      const docId = data?.id as string | undefined;
      const dt = String(p.detected_type || '');
      const shouldParse = (dt === 'bank_statement' || dt === 'payslip') && docId && p.application_id;
      if (shouldParse) {
        fireDocumentParseIfQueued(supabase, docId, p.application_id as string, firmId);
        lines.push(
          `✓ Filed ${p.file_name} under ${p.suggested_client ?? 'client'} → ${p.suggested_category ?? 'folder'}. Parsing started for this application.`,
        );
      } else {
        lines.push(
          `✓ Filed ${p.file_name} under ${p.suggested_client ?? 'client'} → ${p.suggested_category ?? 'folder'}.`,
        );
        if ((dt === 'bank_statement' || dt === 'payslip') && !p.application_id) {
          lines.push(
            `  (Link this document to an application to run bank statement / payslip parsing automatically.)`,
          );
        }
      }
    }
    if (okRows.length === 0 && lines.length === 0) {
      lines.push('No documents could be filed. Fix errors above or ask the AI to propose filing again.');
    }
    const summary = lines.join('\n');
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.interactive) return m;
        return {
          ...m,
          interactive: m.interactive.map((block) =>
            block.type === 'document_filing' && block.documentFiling
              ? {
                  ...block,
                  documentFiling: {
                    ...block.documentFiling,
                    committed: true,
                    commitSummary: summary,
                  },
                }
              : block,
          ),
        };
      }),
    );
  } catch (e: unknown) {
    logger.error('Document filing commit failed', e);
    const err = e instanceof Error ? e.message : 'Unknown error';
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.interactive) return m;
        return {
          ...m,
          interactive: m.interactive.map((block) =>
            block.type === 'document_filing' && block.documentFiling
              ? {
                  ...block,
                  documentFiling: {
                    ...block.documentFiling,
                    committed: true,
                    commitSummary: `Filing failed: ${err}`,
                  },
                }
              : block,
          ),
        };
      }),
    );
  }
}
