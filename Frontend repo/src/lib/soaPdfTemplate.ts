import {
  renderSoaClientDnaSectionHtml,
  soaPdfClientDnaStyles,
  type SoaPdfClientDnaPayload,
} from './soaPdfClientDnaSection';
import {
  renderSoaPropertySecuritySectionHtml,
  soaPdfPropertySecurityStyles,
  type SoaPdfApplicationPropertyRow,
} from './soaPdfPropertySection';

/**
 * Kiwi Mortgages - Statement of Advice PDF Generator
 * Production-grade HTML template for FMA-compliant SOA documents
 * 
 * Design system: Manus AI / Linear / Stripe editorial
 * - Typography: Inter (body), Fraunces (headings)
 * - Spacing: 8px grid, 24px section rhythm
 * - Colors: Slate palette, emerald accents for recommendations
 * 
 * @version 1.0.0
 * @scale Enterprise SaaS - multi-tenant ready
 */

export interface SOAClient {
  name: string
  email?: string
  phone?: string
}

export interface SOAComparisonRow {
  lender: string
  rate: number
  fiveYrCost: number
  cashback: number
  flexibility: 'low' | 'medium' | 'high'
  isRecommended?: boolean
}

export interface SOALayers {
  layer1_client_situation?: string
  layer2_regulatory_gate?: string
  layer3_market_scan?: string
  /** Structured lender comparison rows (preferred for print). */
  layer4_quantitative?: SOAComparisonRow[]
  /** Fallback narrative when no structured comparison exists. */
  layer4_narrative?: string
  layer5_recommendation?: string
  layer6_sensitivity?: string
  layer7_risks?: string[]
  layer8_commission?: string
}

export interface SOAData {
  id: string
  version: number
  status: 'draft' | 'final'
  client: SOAClient
  dealRef: string
  date: string
  adviserName: string
  adviserFSP?: string
  recommendedLender?: string
  content: SOALayers
  /** Optional `soa_client_dna.analysis` jsonb for Client Risk Assessment section. */
  clientDna?: SoaPdfClientDnaPayload
  /** Enriched security properties (`application_properties`) — after DNA, before comparison. */
  applicationProperties?: SoaPdfApplicationPropertyRow[]
  /** Browser `VITE_GOOGLE_MAPS_KEY` for Static Maps thumbnails (optional). */
  staticMapsApiKey?: string
  tenantBrand?: {
    name: string
    logoUrl?: string
    primaryColor?: string
  }
}

export type { SoaPdfClientDnaPayload } from './soaPdfClientDnaSection';
export type { SoaPdfApplicationPropertyRow } from './soaPdfPropertySection';

/**
 * Format currency in NZD
 */
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format date for NZ
 */
const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format percentage
 */
const formatPercent = (value: number): string => {
  return `${value.toFixed(2)}%`
}

/**
 * Escape HTML to prevent injection
 */
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Escapes plain text and preserves paragraphs / line breaks for HTML prose blocks. */
const proseFromPlain = (text: string): string => {
  const t = text.trim()
  if (!t) return ''
  return t
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

/** Coerces agent/jsonb risk field to a string list. */
const parseRisksFromUnknown = (v: unknown): string[] | undefined => {
  if (v == null) return undefined
  if (Array.isArray(v)) {
    const out = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    return out.length ? out : undefined
  }
  if (typeof v === 'string') {
    const out = v
      .split(/\n+/)
      .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean)
    return out.length ? out : undefined
  }
  return undefined
}

/** Parses loose comparison rows from DB / agent output into `SOAComparisonRow`. */
const toNumber = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Normalizes comparison rows from `soas` / step output for the PDF table. */
export const normalizeComparisonRows = (rows: Record<string, unknown>[]): SOAComparisonRow[] => {
  return rows.map((row) => {
    let rate = toNumber(row.rate)
    if (rate > 0 && rate < 1) rate *= 100
    const fiveYr = toNumber(row.five_yr_cost ?? row.five_year_cost ?? row.fiveYrCost ?? row.net_cost)
    const cashback = toNumber(row.cashback)
    const lender = String(row.lender ?? '').trim() || 'Lender'
    const isRecommended =
      Boolean(row.recommended ?? row.is_recommended ?? row.isRecommended) ||
      row.rank === 1 ||
      row.rank === '1'
    const flexRaw = String(row.flexibility ?? row.flex ?? '').toLowerCase()
    const flexibility: 'low' | 'medium' | 'high' =
      flexRaw === 'low' || flexRaw === 'high' ? (flexRaw as 'low' | 'high') : 'medium'
    return { lender, rate, fiveYrCost: fiveYr, cashback, flexibility, isRecommended }
  })
}

export type SoaCardContent = Record<string, unknown>

/** Shape produced by the application overview SOA card (`useMemo` + Supabase row). */
export type SoaRowForPdf = {
  id: string
  version: number
  status: string
  updated_at?: string | null
  created_at?: string | null
  recommended_lender?: string
  content: SoaCardContent
}

export type SoaPdfContext = {
  clientName: string
  dealRef: string
  adviserName: string
  adviserFSP?: string | null
  tenantBrand?: SOAData['tenantBrand']
  /** `soa_client_dna.analysis` when building PDF from server/context. */
  clientDna?: SoaPdfClientDnaPayload
  applicationProperties?: SoaPdfApplicationPropertyRow[]
  staticMapsApiKey?: string
}

/** Builds `SOAData` for `generateSoaHtml` from the overview card payload and adviser context. */
export function buildSOADataForPdf(row: SoaRowForPdf, ctx: SoaPdfContext): SOAData {
  const c = row.content
  const pickStr = (key: string): string | undefined => {
    const v = c[key]
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
  }
  const comparisonRaw = Array.isArray(c.comparison) ? (c.comparison as Record<string, unknown>[]) : []
  const comparisonRows = normalizeComparisonRows(comparisonRaw)
  const l4Text = pickStr('layer4_quantitative')
  const risks = parseRisksFromUnknown(c.layer7_risks)

  const content: SOALayers = {
    layer1_client_situation: pickStr('layer1_client_situation'),
    layer2_regulatory_gate: pickStr('layer2_regulatory_gate'),
    layer3_market_scan: pickStr('layer3_market_scan'),
    layer5_recommendation: pickStr('layer5_recommendation'),
    layer6_sensitivity: pickStr('layer6_sensitivity'),
    layer7_risks: risks,
    layer8_commission: pickStr('layer8_commission'),
  }
  if (comparisonRows.length > 0) content.layer4_quantitative = comparisonRows
  else if (l4Text) content.layer4_narrative = l4Text

  const dateIso = row.updated_at || row.created_at || new Date().toISOString()
  const status: 'draft' | 'final' =
    row.status === 'final' || row.status === 'adviser_review' ? 'final' : 'draft'

  return {
    id: row.id,
    version: row.version,
    status,
    client: { name: ctx.clientName },
    dealRef: ctx.dealRef.trim() || '—',
    date: dateIso,
    adviserName: ctx.adviserName,
    adviserFSP: ctx.adviserFSP ?? undefined,
    recommendedLender: row.recommended_lender?.trim() || undefined,
    content,
    clientDna: ctx.clientDna ?? null,
    applicationProperties: ctx.applicationProperties,
    staticMapsApiKey: ctx.staticMapsApiKey,
    tenantBrand: ctx.tenantBrand,
  }
}

/**
 * Render comparison table
 */
const renderComparisonTable = (rows: SOAComparisonRow[]): string => {
  if (!rows || rows.length === 0) return ''

  const sortedRows = [...rows].sort((a, b) => a.fiveYrCost - b.fiveYrCost)
  const cheapest = sortedRows[0]?.fiveYrCost || 0

  return `
    <table class="comparison-table">
      <thead>
        <tr>
          <th>Lender</th>
          <th class="num">Rate</th>
          <th class="num">5-Year Cost</th>
          <th class="num">Cashback</th>
          <th>Flexibility</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => {
          const savings = row.fiveYrCost - cheapest
          const isRec = row.isRecommended
          return `
            <tr class="${isRec ? 'recommended' : ''}">
              <td class="lender-cell">
                <strong>${escapeHtml(row.lender)}</strong>
              </td>
              <td class="num">${formatPercent(row.rate)}</td>
              <td class="num">
                ${formatCurrency(row.fiveYrCost)}
                ${savings > 0 && !isRec ? `<span class="savings">+${formatCurrency(savings)}</span>` : ''}
              </td>
              <td class="num">${row.cashback > 0 ? formatCurrency(row.cashback) : ''}</td>
              <td>
                <span class="flex-badge flex-${row.flexibility}">${row.flexibility}</span>
              </td>
              <td class="rec-cell">
                ${isRec ? '<span class="rec-pill">Recommended</span>' : ''}
              </td>
            </tr>
          `
        }).join('')}
      </tbody>
    </table>
  `
}

/**
 * Render risks as list
 */
const renderRisks = (risks: string[]): string => {
  if (!risks || risks.length === 0) return ''
  
  return `
    <ul class="risks-list">
      ${risks.map(risk => `
        <li>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#f59e0b" stroke-width="1.5"/>
            <path d="M8 5v3M8 11h.01" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>${escapeHtml(risk)}</span>
        </li>
      `).join('')}
    </ul>
  `
}

/**
 * Generate complete SOA HTML document
 */
export function generateSoaHtml(soa: SOAData): string {
  const brand = soa.tenantBrand || { name: 'Kiwi Mortgages', primaryColor: '#2563eb' }
  const content = soa.content

  /** Layers 1–3 — narrative before Client DNA / lender comparison. */
  const preDnaSections: string[] = []
  /** Layers 4–8 — comparison and remainder. */
  const postDnaSections: string[] = []

  // Layer 1: Client Situation
  if (content.layer1_client_situation) {
    preDnaSections.push(`
      <section class="soa-section">
        <h2>1. Client Situation</h2>
        <div class="prose">
          ${proseFromPlain(content.layer1_client_situation)}
        </div>
      </section>
    `)
  }

  // Layer 2: Regulatory Assessment
  if (content.layer2_regulatory_gate) {
    preDnaSections.push(`
      <section class="soa-section">
        <h2>2. Regulatory Assessment</h2>
        <div class="prose">
          ${proseFromPlain(content.layer2_regulatory_gate)}
        </div>
        <div class="reg-note">
          <strong>Reference:</strong> Reserve Bank of New Zealand (RBNZ) prudential standards, 
          Financial Markets Authority (FMA) Code of Conduct
        </div>
      </section>
    `)
  }

  // Layer 3: Market Analysis
  if (content.layer3_market_scan) {
    preDnaSections.push(`
      <section class="soa-section">
        <h2>3. Market Analysis</h2>
        <div class="prose">
          ${proseFromPlain(content.layer3_market_scan)}
        </div>
      </section>
    `)
  }

  const dnaSectionHtml = renderSoaClientDnaSectionHtml(soa.clientDna ?? null)
  const propertySecurityHtml = renderSoaPropertySecuritySectionHtml(
    soa.applicationProperties ?? [],
    soa.staticMapsApiKey,
  )

  // Layer 4: Comparison (structured table or narrative fallback)
  if (content.layer4_quantitative && content.layer4_quantitative.length > 0) {
    postDnaSections.push(`
      <section class="soa-section">
        <h2>4. Comparison of Options</h2>
        <p class="section-intro">Analysis based on 5-year total cost of ownership, including interest, fees, and cashback incentives.</p>
        ${renderComparisonTable(content.layer4_quantitative)}
      </section>
    `)
  } else if (content.layer4_narrative?.trim()) {
    postDnaSections.push(`
      <section class="soa-section">
        <h2>4. Comparison of Options</h2>
        <div class="prose">
          ${proseFromPlain(content.layer4_narrative)}
        </div>
      </section>
    `)
  }

  // Layer 5: Recommendation
  if (content.layer5_recommendation) {
    postDnaSections.push(`
      <section class="soa-section">
        <h2>5. Our Recommendation</h2>
        <div class="recommendation-callout">
          <div class="callout-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="callout-content prose">
            ${proseFromPlain(content.layer5_recommendation)}
          </div>
        </div>
      </section>
    `)
  }

  // Layer 6: Sensitivity
  if (content.layer6_sensitivity) {
    postDnaSections.push(`
      <section class="soa-section">
        <h2>6. Sensitivity Analysis</h2>
        <div class="prose">
          ${proseFromPlain(content.layer6_sensitivity)}
        </div>
        <div class="sensitivity-note">
          Stress testing performed at +2% above current rates, consistent with RBNZ guidance on serviceability.
        </div>
      </section>
    `)
  }

  // Layer 7: Risks
  if (content.layer7_risks && content.layer7_risks.length > 0) {
    postDnaSections.push(`
      <section class="soa-section">
        <h2>7. Risks to Consider</h2>
        ${renderRisks(content.layer7_risks)}
      </section>
    `)
  }

  // Layer 8: Commission
  if (content.layer8_commission) {
    postDnaSections.push(`
      <section class="soa-section">
        <h2>8. Commission Disclosure</h2>
        <div class="commission-box prose">
          ${proseFromPlain(content.layer8_commission)}
        </div>
        <p class="commission-note">
          We are required to disclose all commissions under the Financial Markets Conduct Act 2013. 
          This commission does not increase your interest rate or fees.
        </p>
      </section>
    `)
  }

  const sections = [...preDnaSections, dnaSectionHtml, propertySecurityHtml, ...postDnaSections]

  return `<!DOCTYPE html>
<html lang="en-NZ">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statement of Advice - ${escapeHtml(soa.client.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* Reset & Base */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    @page {
      size: A4;
      margin: 18mm 15mm;
      @bottom-right {
        content: counter(page);
        font-family: 'Inter', sans-serif;
        font-size: 9pt;
        color: #64748b;
      }
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 10.5pt;
      line-height: 1.6;
      color: #0f172a;
      background: white;
      -webkit-font-smoothing: antialiased;
    }
    
    .document {
      max-width: 170mm;
      margin: 0 auto;
    }
    
    /* Header */
    .doc-header {
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 16pt;
      margin-bottom: 24pt;
    }
    
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 16pt;
    }
    
    .brand {
      font-weight: 600;
      font-size: 11pt;
      color: ${brand.primaryColor};
      letter-spacing: -0.01em;
    }
    
    .doc-type {
      font-size: 9pt;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 500;
    }
    
    h1 {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 24pt;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 8pt;
      letter-spacing: -0.02em;
    }
    
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12pt;
      font-size: 9.5pt;
      color: #475569;
    }
    
    .meta-item strong {
      display: block;
      font-weight: 500;
      color: #0f172a;
      margin-bottom: 2pt;
    }
    
    /* Sections */
    .soa-section {
      margin-bottom: 22pt;
      page-break-inside: avoid;
    }
    
    h2 {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 14pt;
      font-weight: 600;
      margin-bottom: 8pt;
      color: #0f172a;
      letter-spacing: -0.01em;
    }
    
    .section-intro {
      font-size: 9.5pt;
      color: #64748b;
      margin-bottom: 10pt;
    }
    
    .prose p {
      margin-bottom: 8pt;
    }
    
    .prose p:last-child {
      margin-bottom: 0;
    }
    
    /* Comparison Table */
    .comparison-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 9.5pt;
      margin-top: 8pt;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    
    .comparison-table th {
      background: #f8fafc;
      padding: 8pt 10pt;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    
    .comparison-table th.num,
    .comparison-table td.num {
      text-align: right;
    }
    
    .comparison-table td {
      padding: 9pt 10pt;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    
    .comparison-table tr:last-child td {
      border-bottom: none;
    }
    
    .comparison-table tr.recommended {
      background: #f0fdf4;
    }
    
    .comparison-table tr.recommended td:first-child {
      border-left: 3px solid #16a34a;
      padding-left: 7pt;
    }
    
    .lender-cell strong {
      font-weight: 600;
      color: #0f172a;
    }
    
    .savings {
      display: block;
      font-size: 8pt;
      color: #dc2626;
      margin-top: 1pt;
    }
    
    .flex-badge {
      display: inline-block;
      padding: 2pt 6pt;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 500;
      text-transform: capitalize;
    }
    
    .flex-low { background: #fef2f2; color: #991b1b; }
    .flex-medium { background: #fffbeb; color: #92400e; }
    .flex-high { background: #f0fdf4; color: #166534; }
    
    .rec-pill {
      display: inline-block;
      background: #16a34a;
      color: white;
      padding: 3pt 8pt;
      border-radius: 12px;
      font-size: 8pt;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    
    /* Recommendation Callout */
    .recommendation-callout {
      display: flex;
      gap: 10pt;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 3px solid ${brand.primaryColor};
      border-radius: 8px;
      padding: 12pt;
      margin-top: 8pt;
    }
    
    .callout-icon {
      flex-shrink: 0;
      width: 24pt;
      height: 24pt;
      background: ${brand.primaryColor};
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    
    .callout-content.prose p {
      font-weight: 500;
      color: #1e3a8a;
      margin: 0 0 8pt 0;
    }
    .callout-content.prose p:last-child {
      margin-bottom: 0;
    }
    
    /* Risks */
    .risks-list {
      list-style: none;
      margin-top: 8pt;
    }
    
    .risks-list li {
      display: flex;
      gap: 8pt;
      margin-bottom: 8pt;
      align-items: flex-start;
    }
    
    .risks-list li svg {
      flex-shrink: 0;
      margin-top: 2pt;
    }
    
    /* Commission */
    .commission-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12pt;
      margin: 8pt 0;
    }
    
    .commission-box.prose p {
      margin: 0 0 8pt 0;
      font-weight: 500;
    }
    .commission-box.prose p:last-child {
      margin-bottom: 0;
    }
    
    .commission-note,
    .reg-note,
    .sensitivity-note {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 6pt;
      font-style: italic;
    }
    
    /* Footer */
    .doc-footer {
      margin-top: 32pt;
      padding-top: 12pt;
      border-top: 1px solid #e2e8f0;
      font-size: 8.5pt;
      color: #64748b;
    }
    
    .footer-grid {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    
    .adviser-info strong {
      color: #0f172a;
      font-weight: 600;
    }
    
    ${soaPdfClientDnaStyles()}
    ${soaPdfPropertySecurityStyles()}
    
    /* Print optimizations */
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .soa-section { page-break-inside: avoid; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="document">
    <header class="doc-header">
      <div class="header-top">
        <div class="brand">${escapeHtml(brand.name)}</div>
        <div class="doc-type">Statement of Advice · Version ${soa.version}</div>
      </div>
      <h1>Statement of Advice for ${escapeHtml(soa.client.name)}</h1>
      <div class="meta-grid">
        <div class="meta-item">
          <strong>Deal Reference</strong>
          ${escapeHtml(soa.dealRef)}
        </div>
        <div class="meta-item">
          <strong>Date Prepared</strong>
          ${formatDate(soa.date)}
        </div>
        <div class="meta-item">
          <strong>Adviser</strong>
          ${escapeHtml(soa.adviserName)}${soa.adviserFSP ? ` · FSP ${escapeHtml(soa.adviserFSP)}` : ''}
        </div>
      </div>
    </header>

    <main>
      ${sections.join('')}
    </main>

    <footer class="doc-footer">
      <div class="footer-grid">
        <div class="adviser-info">
          <strong>${escapeHtml(soa.adviserName)}</strong><br>
          This advice prioritises your interests under the FMA Code of Conduct for Financial Advice Services.
        </div>
        <div>
          Issued ${formatDate(soa.date)}
        </div>
      </div>
    </footer>
  </div>
</body>
</html>`
}