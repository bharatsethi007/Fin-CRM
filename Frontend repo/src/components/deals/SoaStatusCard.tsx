import { CheckCircle2, Clock, FileText, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';

/** SOA row shape from the overview card (`useMemo` + Supabase). */
export type SoaStatusCardSoa = {
  status?: string;
  version?: number;
  updated_at?: string | null;
  created_at?: string | null;
  recommended_lender?: string;
  content?: unknown;
  id?: string;
} | null;

export interface SoaStatusCardProps {
  soa: SoaStatusCardSoa;
  onView: () => void;
  onExportPdf: () => void;
  onRegenerate: () => void;
  onGenerate: () => void;
}

/** Kiwi Mortgages SOA status: empty, draft, or approved with distinct View / Export / Regenerate actions. */
export function SoaStatusCard({ soa, onView, onExportPdf, onRegenerate, onGenerate }: SoaStatusCardProps) {
  const hasSoa = Boolean(soa && (soa.id || soa.content || soa.status));

  if (!hasSoa) {
    return (
      <Card className="border-2 border-dashed border-gray-300 bg-white shadow-none dark:border-gray-600 dark:bg-gray-900">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-violet-50 p-2.5 dark:bg-violet-950/40">
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold leading-snug text-gray-900 dark:text-white">Statement of Advice</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">FMA-compliant recommendation</p>
              <Button type="button" onClick={onGenerate} size="sm" className="mt-3">
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                Generate SOA
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isApproved = soa!.status === 'final' || soa!.status === 'adviser_review';
  const lender = soa!.recommended_lender?.trim() || 'Lender TBC';
  const version = typeof soa!.version === 'number' ? soa!.version : 1;
  const rawDate = soa!.updated_at || soa!.created_at;
  const date =
    rawDate != null && rawDate !== ''
      ? new Date(rawDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

  return (
    <Card
      className={`border border-gray-200 bg-white shadow-none dark:border-gray-700 dark:bg-gray-900 ${
        isApproved ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-amber-500'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div
              className={`shrink-0 rounded-xl p-2.5 ${isApproved ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-amber-50 dark:bg-amber-950/40'}`}
            >
              {isApproved ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-tight text-gray-900 dark:text-white">Statement of Advice</h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">FMA-compliant recommendation</p>
            </div>
          </div>
          <span
            className={
              isApproved
                ? 'inline-flex shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                : 'inline-flex shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
            }
          >
            {isApproved ? 'Approved' : 'Draft'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-medium text-slate-900 dark:text-white">{lender}</span> recommended • v{version} • {date}
        </div>
        <div className="no-print mt-3.5 flex flex-wrap gap-2">
          <Button type="button" size="sm" className="h-8" onClick={onView}>
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            View
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={onExportPdf}>
            Export PDF
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onRegenerate}>
            Regenerate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
