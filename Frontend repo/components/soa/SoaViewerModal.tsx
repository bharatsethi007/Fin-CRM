import { Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

type SoaContent = {
  layer1_client_situation?: unknown;
  layer2_regulatory_gate?: unknown;
  layer3_market_scan?: unknown;
  layer4_quantitative?: unknown;
  layer5_recommendation?: unknown;
  layer6_sensitivity?: unknown;
  layer7_risks?: unknown;
  layer8_commission?: unknown;
};

export type SoaViewerSoa = {
  status?: string;
  version?: number;
  updated_at?: string | null;
  recommended_lender?: string;
  content?: SoaContent | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  soa: SoaViewerSoa | null;
  client: Record<string, unknown> | null | undefined;
  adviser: { name?: string; fsp_number?: string | null } | null | undefined;
  /** Shown in header; e.g. AF-20260329-0017 */
  dealReference?: string;
};

type CompRow = Record<string, unknown>;

/** Normalises layer field to plain text for display. */
function layerText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'text' in value) {
    const t = (value as { text?: unknown }).text;
    if (typeof t === 'string') return t;
  }
  return '';
}

/** Parses comparison rows from layer4 jsonb (array, comparison[], or rows[]). */
function parseComparisonRows(layer4: unknown): CompRow[] {
  if (Array.isArray(layer4)) return layer4 as CompRow[];
  if (layer4 && typeof layer4 === 'object') {
    const o = layer4 as Record<string, unknown>;
    if (Array.isArray(o.comparison)) return o.comparison as CompRow[];
    if (Array.isArray(o.rows)) return o.rows as CompRow[];
  }
  return [];
}

/** Formats scalar for table cells. */
function cellStr(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—';
  if (typeof v === 'string') return v;
  return String(v);
}

/** Splits risk text into bullet lines. */
function riskBulletLines(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);
}

/** Resolves client display name from common shapes. */
function clientDisplayName(client: Record<string, unknown> | null | undefined): string {
  if (!client) return 'Client';
  const name = client.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const fn = client.first_name;
  const ln = client.last_name;
  const parts = [typeof fn === 'string' ? fn : '', typeof ln === 'string' ? ln : ''].map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : 'Client';
}

/** Client-ready printable SOA (Kiwi Mortgages). */
export function SoaViewerModal({ open, onOpenChange, soa, client, adviser, dealReference }: Props) {
  const content = soa?.content ?? {};
  const v = typeof soa?.version === 'number' ? soa.version : 1;
  const issued =
    soa?.updated_at != null
      ? new Date(soa.updated_at).toLocaleDateString('en-NZ', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });

  const rows = parseComparisonRows(content.layer4_quantitative);
  const riskText = layerText(content.layer7_risks);
  const riskItems = riskBulletLines(riskText);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="soa-viewer-print-root max-h-[92vh] max-w-4xl overflow-y-auto border-0 bg-white p-0 shadow-xl print:max-h-none print:overflow-visible print:shadow-none dark:bg-white [&>button]:print:hidden">
        <div className="border-b border-gray-200 px-6 pb-4 pt-6 print:border-gray-300">
          <div className="no-print mb-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" aria-hidden />
              Print / Save PDF
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
          <DialogHeader className="space-y-3 text-left">
            <p className="font-serif text-xl font-semibold tracking-tight text-gray-900">Kiwi Mortgages</p>
            <DialogTitle className="font-serif text-2xl font-bold text-gray-900">Statement of Advice</DialogTitle>
            <div className="space-y-1 text-sm text-gray-700">
              <p>
                <span className="font-medium text-gray-900">Client:</span> {clientDisplayName(client)}
              </p>
              {dealReference ? (
                <p>
                  <span className="font-medium text-gray-900">Deal reference:</span> {dealReference}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-gray-900">Date:</span> {issued}
              </p>
              <div className="pt-1">
                <Badge variant="secondary" className="font-normal">
                  Version {v}
                </Badge>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div
          className="soa-viewer-body space-y-10 px-6 py-8 text-[14px] leading-relaxed text-gray-800 print:text-black"
          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          <section className="border-b border-gray-100 pb-8 print:border-gray-200">
            <h2 className="mb-3 font-serif text-lg font-semibold text-gray-900">1. Client situation</h2>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
              {layerText(content.layer1_client_situation) || '—'}
            </div>
          </section>

          <section className="border-b border-gray-100 pb-8 print:border-gray-200">
            <h2 className="mb-3 font-serif text-lg font-semibold text-gray-900">2. Regulatory assessment</h2>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
              {layerText(content.layer2_regulatory_gate) || '—'}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Reference: Reserve Bank of New Zealand (RBNZ) prudential standards and applicable NZ lending rules.
            </p>
          </section>

          <section className="border-b border-gray-100 pb-8 print:border-gray-200">
            <h2 className="mb-3 font-serif text-lg font-semibold text-gray-900">3. Market analysis</h2>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
              {layerText(content.layer3_market_scan) || '—'}
            </div>
          </section>

          <section className="border-b border-gray-100 pb-8 print:border-gray-200">
            <h2 className="mb-3 font-serif text-lg font-semibold text-gray-900">4. Comparison of options</h2>
            {rows.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Lender</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>5yr cost</TableHead>
                      <TableHead>Cashback</TableHead>
                      <TableHead>Rank</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => {
                      const rec = Boolean(row.recommended) || row.rank === 1 || row.rank === '1';
                      const five =
                        row.five_yr_cost ?? row.five_year_cost ?? row['5yr_cost'] ?? row.net_cost;
                      const cb = row.cashback ?? row.cashback_amount;
                      return (
                        <TableRow
                          key={`${String(row.lender)}-${i}`}
                          className={rec ? 'bg-green-50 print:bg-green-50' : ''}
                        >
                          <TableCell className="font-medium">{cellStr(row.lender)}</TableCell>
                          <TableCell>{cellStr(row.rate)}</TableCell>
                          <TableCell>{cellStr(five)}</TableCell>
                          <TableCell>{cellStr(cb)}</TableCell>
                          <TableCell>{cellStr(row.rank)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
                {layerText(content.layer4_quantitative) || '—'}
              </div>
            )}
          </section>

          <section className="border-b border-gray-100 pb-8 print:border-gray-200">
            <h2 className="mb-3 font-serif text-lg font-semibold text-gray-900">5. Our recommendation</h2>
            <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-5 text-gray-900 print:border-blue-300 print:bg-blue-50">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                {layerText(content.layer5_recommendation) || '—'}
              </div>
            </div>
          </section>

          <section className="border-b border-gray-100 pb-8 print:border-gray-200">
            <h2 className="mb-3 font-serif text-lg font-semibold text-gray-900">6. Sensitivity analysis</h2>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
              {layerText(content.layer6_sensitivity) || '—'}
            </div>
          </section>

          <section className="border-b border-gray-100 pb-8 print:border-gray-200">
            <h2 className="mb-3 font-serif text-lg font-semibold text-gray-900">7. Risks to consider</h2>
            {riskItems.length > 0 ? (
              <ul className="list-disc space-y-2 pl-5 text-gray-800">
                {riskItems.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            ) : (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">{riskText || '—'}</div>
            )}
          </section>

          <section className="pb-4">
            <h2 className="mb-3 font-serif text-lg font-semibold text-gray-900">8. Commission disclosure</h2>
            <div className="rounded-lg bg-gray-100 p-5 text-gray-800 print:bg-gray-100">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                {layerText(content.layer8_commission) || '—'}
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="flex-col items-stretch gap-3 border-t border-gray-200 bg-gray-50 px-6 py-5 text-sm text-gray-700 print:border-gray-300 print:bg-white sm:flex-col">
          <p>
            <span className="font-medium text-gray-900">Adviser:</span> {adviser?.name?.trim() || '—'}
            {adviser?.fsp_number ? (
              <>
                {' '}
                · FSP {adviser.fsp_number}
              </>
            ) : null}
          </p>
          <p className="text-xs text-gray-600">
            This advice prioritises your interests under the FMA Code of Conduct.
          </p>
          <p className="text-xs text-gray-500">Issued {issued}</p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
