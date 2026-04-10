/** NZ retail lenders available for SOA comparison selection (codes stable for UI state). */
export type SoaLenderOption = {
  code: string;
  name: string;
  reason?: string;
};

/** Heuristic credit-policy flags for Step 1 DNA/property filtering (not lender advice). */
export type SoaLenderPolicyFields = {
  minApartmentSize: number;
  excludesCrossLease: boolean;
  excludesLeakyEra: boolean;
  acceptsLeasehold: boolean;
};

export type SoaLenderCatalogEntry = SoaLenderOption & SoaLenderPolicyFields;

export const SOA_LENDER_CATALOG: SoaLenderCatalogEntry[] = [
  { code: 'anz', name: 'ANZ', minApartmentSize: 50, excludesCrossLease: true, excludesLeakyEra: true, acceptsLeasehold: false },
  { code: 'asb', name: 'ASB', minApartmentSize: 50, excludesCrossLease: false, excludesLeakyEra: true, acceptsLeasehold: true },
  { code: 'bnz', name: 'BNZ', minApartmentSize: 50, excludesCrossLease: true, excludesLeakyEra: true, acceptsLeasehold: false },
  { code: 'westpac', name: 'Westpac', minApartmentSize: 50, excludesCrossLease: true, excludesLeakyEra: true, acceptsLeasehold: false },
  { code: 'kiwibank', name: 'Kiwibank', minApartmentSize: 45, excludesCrossLease: false, excludesLeakyEra: true, acceptsLeasehold: true },
  { code: 'tsb', name: 'TSB', minApartmentSize: 45, excludesCrossLease: false, excludesLeakyEra: false, acceptsLeasehold: true },
  { code: 'sbs', name: 'SBS Bank', minApartmentSize: 45, excludesCrossLease: false, excludesLeakyEra: false, acceptsLeasehold: true },
  { code: 'coop', name: 'The Co-operative Bank', minApartmentSize: 45, excludesCrossLease: false, excludesLeakyEra: false, acceptsLeasehold: true },
  { code: 'heartland', name: 'Heartland Bank', minApartmentSize: 40, excludesCrossLease: false, excludesLeakyEra: false, acceptsLeasehold: true },
];

/** Normalises agent shortlist label to catalog code (case-insensitive). */
export function agentLenderNameToCode(agentName: string): string | null {
  const t = agentName.trim().toLowerCase();
  if (!t) return null;
  const direct = SOA_LENDER_CATALOG.find((l) => l.name.toLowerCase() === t);
  if (direct) return direct.code;
  const partial = SOA_LENDER_CATALOG.find((l) => t.includes(l.name.toLowerCase()) || l.name.toLowerCase().includes(t));
  return partial?.code ?? null;
}

/** Returns display name for a lender code. */
export function soaLenderCodeToName(code: string): string {
  const hit = SOA_LENDER_CATALOG.find((l) => l.code === code);
  return hit?.name ?? code;
}

/** Maps agent shortlist strings to catalog codes (deduped, order preserved). */
export function shortlistNamesToCodes(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const c = agentLenderNameToCode(String(n));
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}
