import type { SoaClientDnaView } from './soaClientDnaTypes';
import { agentLenderNameToCode, SOA_LENDER_CATALOG, type SoaLenderCatalogEntry } from './soaLenderCatalog';

/** Normalised property fields for Step 1 eligibility heuristics. */
export type SoaPropertyForFilter = {
  floor_area_sqm: number | null;
  title_type: string | null;
  property_type: string | null;
  year_built: number | null;
};

/** Maps OneRoof / manual JSON into fields used by `passesProperty`. */
export function normalizePropertyForSoaFilter(raw: unknown): SoaPropertyForFilter {
  if (!raw || typeof raw !== 'object') {
    return { floor_area_sqm: null, title_type: null, property_type: null, year_built: null };
  }
  const o = raw as Record<string, unknown>;
  const floor =
    typeof o.floor_area_sqm === 'number'
      ? o.floor_area_sqm
      : typeof o.floorArea === 'number'
        ? o.floorArea
        : null;
  const titleRaw =
    typeof o.title_type === 'string' ? o.title_type : typeof o.typeOfTitle === 'string' ? o.typeOfTitle : null;
  const ptype =
    typeof o.property_type === 'string'
      ? o.property_type
      : typeof o.type === 'string'
        ? o.type
        : null;

  let yearBuilt: number | null = typeof o.year_built === 'number' ? o.year_built : null;
  if (yearBuilt == null && typeof o.decadeOfConstruction === 'string') {
    const m = o.decadeOfConstruction.match(/(\d{4})/);
    if (m) yearBuilt = parseInt(m[1], 10) + 5;
  }

  return {
    floor_area_sqm: floor,
    title_type: titleRaw ? titleRaw.toLowerCase() : null,
    property_type: ptype ? ptype.toLowerCase() : null,
    year_built: yearBuilt,
  };
}

function isCrossLease(title: string | null): boolean {
  if (!title) return false;
  const t = title.replace(/_/g, ' ');
  return t.includes('cross') && t.includes('lease');
}

function isLeaseholdTitle(title: string | null): boolean {
  if (!title) return false;
  return title.includes('leasehold') || title.includes('lease-hold');
}

/** Property + policy gates (sqm, title, leaky era, leasehold). */
export function passesProperty(
  lender: SoaLenderCatalogEntry,
  property: SoaPropertyForFilter,
  _dna: SoaClientDnaView | null,
): boolean {
  const sqm = property.floor_area_sqm;
  if (sqm != null && sqm > 0 && sqm < 50 && lender.minApartmentSize > sqm) return false;
  if (isCrossLease(property.title_type) && lender.excludesCrossLease) return false;
  const aptLike =
    Boolean(property.property_type?.includes('apartment')) ||
    property.property_type === 'unit' ||
    property.property_type?.includes('unit title');
  if (
    aptLike &&
    property.year_built != null &&
    property.year_built >= 1990 &&
    property.year_built <= 2005 &&
    lender.excludesLeakyEra
  ) {
    return false;
  }
  if (isLeaseholdTitle(property.title_type) && !lender.acceptsLeasehold) return false;
  return true;
}

/** Catalogue row always eligible unless extended rules are added later. */
export function passesBasic(_lender: SoaLenderCatalogEntry): boolean {
  return true;
}

/** Drops lenders listed in DNA exclusions (name or code match). */
export function passesDNA(lender: SoaLenderCatalogEntry, dna: SoaClientDnaView | null): boolean {
  const list = dna?.lender_exclusions;
  if (!list?.length) return true;
  const name = lender.name.toLowerCase();
  for (const ex of list) {
    const el = String(ex.lender ?? '').toLowerCase().trim();
    if (!el) continue;
    const code = agentLenderNameToCode(el);
    if (code === lender.code) return false;
    if (name.includes(el) || el.includes(name)) return false;
  }
  return true;
}

/** Applies property + DNA filters; falls back to full catalog if nothing passes. */
export function filterStep1Lenders(
  all: SoaLenderCatalogEntry[],
  property: SoaPropertyForFilter,
  dna: SoaClientDnaView | null,
): SoaLenderCatalogEntry[] {
  const filtered = all.filter((l) => passesBasic(l) && passesProperty(l, property, dna) && passesDNA(l, dna));
  return filtered.length > 0 ? filtered : all;
}

/** Keeps agent-shortlisted lenders visible even when property rules would remove them from the filtered set. */
export function mergeCatalogWithAgentShortlist(
  filtered: SoaLenderCatalogEntry[],
  agentCodes: string[],
  fullCatalog: SoaLenderCatalogEntry[] = SOA_LENDER_CATALOG,
): SoaLenderCatalogEntry[] {
  const byCode = new Map(filtered.map((l) => [l.code, l]));
  for (const c of agentCodes) {
    if (!byCode.has(c)) {
      const row = fullCatalog.find((x) => x.code === c);
      if (row) byCode.set(c, row);
    }
  }
  return fullCatalog.filter((l) => byCode.has(l.code));
}
