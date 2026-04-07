import { useState, type Dispatch, type SetStateAction } from 'react';
import { logger } from '../utils/logger';
import { supabase } from '../services/supabaseClient';

export interface DuplicateWarning {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  duplicate_document_id?: string;
  duplicate_file_name?: string;
  overlap_from?: string;
  overlap_to?: string;
  existing_count?: number;
  recommendation?: string;
}

export interface DuplicateCheckResult {
  has_duplicates: boolean;
  can_proceed: boolean;
  requires_confirmation: boolean;
  duplicates: DuplicateWarning[];
  duplicate_count: number;
}

const emptyResult = (): DuplicateCheckResult => ({
  has_duplicates: false,
  can_proceed: true,
  requires_confirmation: false,
  duplicates: [],
  duplicate_count: 0,
});

function normalizeDuplicateResult(data: unknown): DuplicateCheckResult {
  if (data == null || typeof data !== 'object') {
    return emptyResult();
  }
  const d = data as Record<string, unknown>;
  const rawList = d.duplicates;
  const duplicates: DuplicateWarning[] = Array.isArray(rawList)
    ? rawList.map((item) => {
        const w = item as Record<string, unknown>;
        return {
          type: String(w.type ?? ''),
          severity: (['critical', 'high', 'medium', 'low'].includes(String(w.severity))
            ? w.severity
            : 'medium') as DuplicateWarning['severity'],
          message: String(w.message ?? ''),
          duplicate_document_id: w.duplicate_document_id != null ? String(w.duplicate_document_id) : undefined,
          duplicate_file_name: w.duplicate_file_name != null ? String(w.duplicate_file_name) : undefined,
          overlap_from: w.overlap_from != null ? String(w.overlap_from) : undefined,
          overlap_to: w.overlap_to != null ? String(w.overlap_to) : undefined,
          existing_count: typeof w.existing_count === 'number' ? w.existing_count : undefined,
          recommendation: w.recommendation != null ? String(w.recommendation) : undefined,
        };
      })
    : [];

  const duplicate_count =
    typeof d.duplicate_count === 'number' ? d.duplicate_count : duplicates.length;

  return {
    has_duplicates: Boolean(d.has_duplicates),
    can_proceed: d.can_proceed !== false,
    requires_confirmation: Boolean(d.requires_confirmation),
    duplicates,
    duplicate_count,
  };
}

/**
 * Duplicate checking before document parsing (RPC must exist in Supabase).
 */
export async function checkDocumentDuplicates(documentId: string): Promise<DuplicateCheckResult> {
  const { data, error } = await supabase.rpc('check_document_duplicates', {
    p_document_id: documentId,
  });
  if (error) {
    logger.error('check_document_duplicates:', error);
    return emptyResult();
  }
  return normalizeDuplicateResult(data);
}

/**
 * Duplicate checking before Akahu syncing (RPC must exist in Supabase).
 */
export async function checkAkahuDuplicates(
  applicationId: string,
  periodStart: string,
  periodEnd: string,
): Promise<DuplicateCheckResult> {
  const { data, error } = await supabase.rpc('check_akahu_duplicates', {
    p_application_id: applicationId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) {
    logger.error('check_akahu_duplicates:', error);
    return emptyResult();
  }
  return normalizeDuplicateResult(data);
}

export type PendingDuplicateAction = (() => void | Promise<void>) | null;

export function useDuplicateDetection(): {
  checkResult: DuplicateCheckResult | null;
  setCheckResult: Dispatch<SetStateAction<DuplicateCheckResult | null>>;
  showModal: boolean;
  setShowModal: Dispatch<SetStateAction<boolean>>;
  pendingAction: PendingDuplicateAction;
  setPendingAction: Dispatch<SetStateAction<PendingDuplicateAction>>;
} {
  const [checkResult, setCheckResult] = useState<DuplicateCheckResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingDuplicateAction>(null);

  return {
    checkResult,
    setCheckResult,
    showModal,
    setShowModal,
    pendingAction,
    setPendingAction,
  };
}
