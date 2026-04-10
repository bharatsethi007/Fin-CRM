import { safeArray } from './soaAgentUtils';
import { soaLenderCodeToName } from './soaLenderCatalog';

type PolicyChunk = { text?: string; page?: number; citation?: string; source?: string; excerpt?: string; similarity?: number };

/** Returns whether any lender bucket in `policy_evidence` contains chunks. */
export function policyEvidenceHasData(policyEvidence: Record<string, unknown>): boolean {
  for (const v of Object.values(policyEvidence)) {
    if (safeArray(v).length > 0) return true;
  }
  return false;
}

/** Maps stored policy chunks to `{ source, page, excerpt }` for one lender (code or display name). */
export function chunksForPolicyLender(
  policyEvidence: Record<string, unknown>,
  codeOrName: string,
  displayLabel: string,
): { source: string; page: number | string; excerpt: string }[] {
  const candidates = [displayLabel, codeOrName, displayLabel.trim(), codeOrName.trim()].filter(Boolean);
  let raw: unknown;
  for (const k of candidates) {
    if (policyEvidence[k as string] != null) {
      raw = policyEvidence[k as string];
      break;
    }
  }
  if (raw == null) {
    const lower = displayLabel.toLowerCase();
    const hitKey = Object.keys(policyEvidence).find((k) => k.toLowerCase() === lower);
    if (hitKey) raw = policyEvidence[hitKey];
  }
  const chunks = safeArray<PolicyChunk>(raw);
  return chunks.map((c) => ({
    source: String(c.citation ?? c.source ?? 'Policy'),
    page: c.page ?? '—',
    excerpt: String(c.excerpt ?? (c.text != null ? String(c.text).slice(0, 220) : '—')),
  }));
}

/** Builds lender rows from Step 1 selection codes, else shortlisted names. */
export function policyStepLenderRows(selectedCodes: string[], shortlistedNames: string[]): { code: string; label: string }[] {
  if (selectedCodes.length > 0) {
    return selectedCodes.map((code) => ({ code, label: soaLenderCodeToName(code) }));
  }
  return shortlistedNames.filter(Boolean).map((name) => ({ code: name, label: name }));
}
