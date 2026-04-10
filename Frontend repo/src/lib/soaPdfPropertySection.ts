/**
 * Property security block for SOA PDF — sourced from `application_properties`.
 */

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/** Minimal row shape for PDF rendering (matches enriched columns). */
export type SoaPdfApplicationPropertyRow = {
  id?: string;
  address_full?: string | null;
  legal_description?: string | null;
  title_number?: string | null;
  estate_type?: string | null;
  land_area_m2?: number | null;
  capital_value?: number | null;
  valuation_date?: string | null;
  zoning?: string | null;
  flood_risk?: string | null;
  liquefaction_risk?: string | null;
  unconsented_works?: boolean | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

/** Parses numeric DB / string coordinates for static map URLs. */
function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Formats valuation date for PDF prose. */
function formatValuationDate(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso.trim());
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Builds Google Static Maps image URL when key and coordinates exist. */
function staticMapUrl(lat: number, lng: number, apiKey: string): string {
  const base = 'https://maps.googleapis.com/maps/api/staticmap';
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: '16',
    size: '400x200',
    markers: `${lat},${lng}`,
    key: apiKey,
  });
  return `${base}?${params.toString()}`;
}

/** Styles for property security section. */
export function soaPdfPropertySecurityStyles(): string {
  return `
    .property-security-section { margin-bottom: 22pt; page-break-inside: avoid; }
    .property-security-section h2 { margin-bottom: 8pt; }
    .property-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12pt;
      margin-bottom: 12pt;
      background: #fafbfc;
    }
    .property-card h3 { font-size: 11pt; margin-bottom: 6pt; color: #0f172a; }
    .property-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6pt 12pt;
      font-size: 9.5pt;
      margin: 8pt 0;
    }
    .property-grid dt { color: #64748b; font-size: 8.5pt; }
    .property-grid dd { margin: 0; font-weight: 500; color: #0f172a; }
    .property-risk-block {
      font-size: 9pt;
      margin-top: 8pt;
      padding-top: 8pt;
      border-top: 1px solid #e2e8f0;
    }
    .property-risk-block ul { margin: 4pt 0 0 14pt; }
    .property-risk-block li { margin-bottom: 3pt; }
    .property-static-map {
      display: block;
      max-width: 100%;
      height: auto;
      margin-top: 8pt;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .property-map-caption { font-size: 8pt; color: #64748b; margin-top: 4pt; }
  `;
}

/**
 * Renders "Property Security Details" HTML after Client DNA (before lender comparison).
 */
export function renderSoaPropertySecuritySectionHtml(
  properties: SoaPdfApplicationPropertyRow[],
  staticMapsApiKey?: string | null,
): string {
  const key = staticMapsApiKey?.trim() || '';

  const cards =
    properties.length > 0
      ? properties
          .map((prop) => {
            const addr = prop.address_full?.trim() || '—';
            const legal = prop.legal_description?.trim() || '—';
            const titleNo = prop.title_number?.trim() || '—';
            const estate = prop.estate_type?.trim() || '';
            const estateLower = estate.toLowerCase();
            const land = prop.land_area_m2 != null ? `${prop.land_area_m2}m²` : '—';
            const cv =
              prop.capital_value != null && Number.isFinite(Number(prop.capital_value))
                ? `$${Number(prop.capital_value).toLocaleString('en-NZ')}`
                : '—';
            const valDate = formatValuationDate(prop.valuation_date ?? undefined);
            const zoning = prop.zoning?.trim() || '—';
            const titleRisk = estateLower.includes('cross')
              ? 'Cross-lease requires other owner consent'
              : 'Standard';
            const floodParts = [prop.flood_risk, prop.liquefaction_risk]
              .map((x) => (typeof x === 'string' ? x.trim() : ''))
              .filter(Boolean);
            const floodLine = floodParts.length > 0 ? floodParts.join(' · ') : 'Not assessed';
            const consents = prop.unconsented_works
              ? 'UNCONSENTED WORKS FLAGGED'
              : 'No issues identified';

            const lat = numOrNull(prop.latitude);
            const lng = numOrNull(prop.longitude);
            const mapUrl = key && lat != null && lng != null ? staticMapUrl(lat, lng, key) : null;

            return `
    <div class="property-card">
      <h3>${escapeHtml(addr)}</h3>
      <dl class="property-grid">
        <div><dt>Legal description</dt><dd>${escapeHtml(legal)}</dd></div>
        <div><dt>Title</dt><dd>${escapeHtml(titleNo)}${estate ? ` (${escapeHtml(estate)})` : ''}</dd></div>
        <div><dt>Land area</dt><dd>${escapeHtml(land)}</dd></div>
        <div><dt>Capital valuation</dt><dd>${escapeHtml(cv)} (dated ${valDate})</dd></div>
        <div><dt>Zoning</dt><dd>${escapeHtml(zoning)}</dd></div>
      </dl>
      <div class="property-risk-block">
        <strong>Property risk assessment</strong>
        <ul>
          <li><strong>Title type risk:</strong> ${escapeHtml(titleRisk)}</li>
          <li><strong>Flood / liquefaction:</strong> ${escapeHtml(floodLine)}</li>
          <li><strong>Consents:</strong> ${escapeHtml(consents)}</li>
        </ul>
      </div>
      ${
        mapUrl
          ? `<img class="property-static-map" src="${mapUrl}" width="400" height="200" alt="Property location map" />
             <p class="property-map-caption">Location approximate — refer to legal survey.</p>`
          : '<p class="property-map-caption">Map not shown (coordinates or API key missing).</p>'
      }
    </div>`;
          })
          .join('')
      : `<p class="section-intro">No property security records on file.</p>`;

  return `
    <section class="soa-section property-security-section">
      <h2>Property Security Details</h2>
      ${cards}
    </section>
  `;
}
