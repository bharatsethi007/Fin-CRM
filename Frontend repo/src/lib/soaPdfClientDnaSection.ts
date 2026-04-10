/**
 * Client DNA block for SOA PDF — parsed from `soa_client_dna.analysis` jsonb.
 */

/** Payload attached to `SOAData` for PDF rendering (`null` = no row / show pending). */
export type SoaPdfClientDnaPayload = { analysis: unknown } | null;

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/** Formats NZD for leverage grid (compact thousands when large). */
const formatCashPdf = (v: unknown): string => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`;
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
};

/** Parses loose `analysis` json from DB into fields used in the PDF. */
export function parseSoaClientDnaAnalysis(raw: unknown): {
  riskTier: string;
  incomeStabilityScore: number;
  underwritingSummary: string;
  keyRisksTop5: string[];
  leverageMetrics: Record<string, unknown>;
  strengths: string[];
  protectionGaps: string[];
} | null {
  if (raw == null || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const risksRaw = a.key_risks_top5;
  const keyRisksTop5 = Array.isArray(risksRaw)
    ? (risksRaw as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : [];
  const strengthsRaw = a.strengths;
  const strengths = Array.isArray(strengthsRaw)
    ? (strengthsRaw as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        .map((x) => x.trim())
    : [];
  const gapsRaw = a.protection_gaps;
  const protectionGaps = Array.isArray(gapsRaw)
    ? (gapsRaw as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        .map((x) => x.trim())
    : [];
  const lmRaw = a.leverage_metrics;
  const leverageMetrics =
    lmRaw != null && typeof lmRaw === 'object' && !Array.isArray(lmRaw) ? (lmRaw as Record<string, unknown>) : {};

  return {
    riskTier: String(a.risk_tier ?? '').trim().toLowerCase(),
    incomeStabilityScore: Number(a.income_stability_score),
    underwritingSummary: typeof a.underwriting_summary === 'string' ? a.underwriting_summary.trim() : '',
    keyRisksTop5,
    leverageMetrics,
    strengths,
    protectionGaps,
  };
}

/** Warning triangle icon for key risks rows (print-safe SVG). */
function warnIconSvg(): string {
  return `<svg class="dna-warn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 1.5L14.5 13H1.5L8 1.5Z" stroke="#d97706" stroke-width="1.2" fill="#fffbeb"/>
    <path d="M8 6v3.5M8 11.2h.01" stroke="#b45309" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`;
}

/** Returns CSS snippet for Client DNA section (injected into main template once). */
export function soaPdfClientDnaStyles(): string {
  return `
    .dna-section-block { page-break-after: always; margin-bottom: 22pt; }
    .dna-section-block h2.dna-h2 { margin-bottom: 4pt; }
    .dna-subtitle { font-size: 9pt; color: #64748b; margin-bottom: 10pt; }
    .dna-risk-row { display: flex; align-items: center; gap: 10pt; flex-wrap: wrap; margin-bottom: 10pt; }
    .dna-risk-badge {
      display: inline-block; font-size: 9pt; font-weight: 700; letter-spacing: 0.04em;
      padding: 4pt 10pt; border-radius: 6px; border: 1px solid #e2e8f0;
    }
    .dna-risk-badge--high { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
    .dna-risk-badge--medium { background: #fffbeb; color: #92400e; border-color: #fde68a; }
    .dna-risk-badge--low { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
    .dna-risk-badge--unknown { background: #f8fafc; color: #475569; }
    .dna-stability { font-size: 9.5pt; color: #334155; }
    .dna-summary { font-size: 9.5pt; color: #475569; font-style: italic; margin: 8pt 0 12pt; line-height: 1.5; }
    .dna-risks-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8pt 0 12pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .dna-risks-table th { background: #f8fafc; text-align: left; padding: 6pt 10pt; font-size: 8.5pt; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0; }
    .dna-risks-table td { padding: 8pt 10pt; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .dna-risks-table tr:last-child td { border-bottom: none; }
    .dna-risk-cell { display: flex; gap: 8pt; align-items: flex-start; }
    .dna-warn-icon { flex-shrink: 0; margin-top: 2pt; }
    .dna-metrics-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8pt 0 12pt; }
    .dna-metrics-table th, .dna-metrics-table td { border: 1px solid #e2e8f0; padding: 8pt 10pt; text-align: center; }
    .dna-metrics-table th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 8.5pt; }
    .dna-bullets { margin: 6pt 0 12pt 16pt; padding: 0; }
    .dna-bullets li { margin-bottom: 4pt; font-size: 9.5pt; color: #334155; }
    .dna-pending { font-size: 9.5pt; color: #64748b; font-style: italic; padding: 10pt; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; }
    .dna-gaps-note { font-size: 8.5pt; color: #64748b; font-style: italic; margin-top: 6pt; }
  `;
}

function riskBadgeClass(tier: string): string {
  if (tier === 'high') return 'dna-risk-badge dna-risk-badge--high';
  if (tier === 'medium' || tier === 'moderate') return 'dna-risk-badge dna-risk-badge--medium';
  if (tier === 'low') return 'dna-risk-badge dna-risk-badge--low';
  return 'dna-risk-badge dna-risk-badge--unknown';
}

function fmtLvr(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

function fmtRatio(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n}x`;
}

/**
 * Builds HTML for Client Risk Profile (DNA) — after market analysis, before lender comparison.
 */
export function renderSoaClientDnaSectionHtml(clientDna: SoaPdfClientDnaPayload): string {
  if (clientDna == null || clientDna.analysis == null) {
    return `
      <section class="soa-section dna-section-block">
        <h2 class="dna-h2">Client Risk Assessment</h2>
        <p class="dna-subtitle">Client Risk Profile (DNA Analysis)</p>
        <p class="dna-pending">Client DNA analysis pending — run analysis in Agent Canvas</p>
      </section>
    `;
  }

  const parsed = parseSoaClientDnaAnalysis(clientDna.analysis) ?? {
    riskTier: '',
    incomeStabilityScore: NaN,
    underwritingSummary: '',
    keyRisksTop5: [],
    leverageMetrics: {},
    strengths: [],
    protectionGaps: [],
  };

  const lm = parsed.leverageMetrics;
  const lvr = fmtLvr(lm.lvr_percent);
  const dti = fmtRatio(lm.dti_ratio);
  const lti = fmtRatio(lm.lti_ratio);
  const cash = formatCashPdf(lm.cash_post_settlement);

  const rawScore = parsed.incomeStabilityScore;
  const stabilityPct = Number.isFinite(rawScore) ? Math.round(rawScore * 100) : 0;

  const tierUpper = (parsed.riskTier || 'UNKNOWN').toUpperCase();
  const risks = parsed.keyRisksTop5.slice(0, 5);
  const riskRows =
    risks.length > 0
      ? risks
          .map(
            (text, i) => `
    <tr>
      <td style="width:36pt; font-weight:600; color:#64748b;">${i + 1}.</td>
      <td>
        <div class="dna-risk-cell">
          ${warnIconSvg()}
          <span>${escapeHtml(text)}</span>
        </div>
      </td>
    </tr>`,
          )
          .join('')
      : `<tr><td colspan="2" style="padding:10pt;color:#64748b;font-size:9.5pt;">No key risks listed</td></tr>`;

  const strengthsHtml =
    parsed.strengths.length > 0
      ? `<h3 style="font-size:11pt; margin:10pt 0 4pt;">Strengths</h3>
         <ul class="dna-bullets">${parsed.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
      : '';

  const gapsHtml =
    parsed.protectionGaps.length > 0
      ? `<h3 style="font-size:11pt; margin:10pt 0 4pt;">Protection gaps</h3>
         <ul class="dna-bullets">${parsed.protectionGaps.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>
         <p class="dna-gaps-note">We recommend reviewing these gaps with your adviser.</p>`
      : '';

  return `
    <section class="soa-section dna-section-block">
      <h2 class="dna-h2">Client Risk Assessment</h2>
      <p class="dna-subtitle">Client Risk Profile (DNA Analysis)</p>
      <div class="dna-risk-row">
        <span class="${riskBadgeClass(parsed.riskTier)}">${escapeHtml(tierUpper)}</span>
        <span class="dna-stability">Income stability: ${
          Number.isFinite(rawScore) ? `<strong>${stabilityPct}%</strong>` : '<strong>—</strong>'
        }</span>
      </div>
      ${
        parsed.underwritingSummary
          ? `<div class="dna-summary">${escapeHtml(parsed.underwritingSummary)}</div>`
          : ''
      }
      <h3 style="font-size:11pt; margin:10pt 0 4pt;">Key risks</h3>
      <table class="dna-risks-table">
        <thead><tr><th style="width:40pt;">#</th><th>Risk</th></tr></thead>
        <tbody>${riskRows}</tbody>
      </table>
      <h3 style="font-size:11pt; margin:10pt 0 4pt;">Leverage metrics</h3>
      <table class="dna-metrics-table">
        <thead>
          <tr>
            <th>LVR</th><th>DTI</th><th>LTI</th><th>Cash post-settlement</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${lvr}</td><td>${dti}</td><td>${lti}</td><td>${cash}</td>
          </tr>
        </tbody>
      </table>
      ${strengthsHtml}
      ${gapsHtml}
    </section>
  `;
}
