import { useState } from 'react';
import { Badge } from '../ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Button } from '../ui/button';

type Props = {
  lenderName: string | null;
  reasonText: string;
  riskText: string;
  structureText: string;
  headerText?: string;
  footerText?: string;
  status: string;
  aiConfidence?: string;
  selectionRationale?: string;
};

/** Renders client-facing SOA preview with adviser-only AI rationale. */
export function SOAPreview({
  lenderName,
  reasonText,
  riskText,
  structureText,
  headerText,
  footerText,
  status,
  aiConfidence,
  selectionRationale,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900">
      {headerText && <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">{headerText}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold">{lenderName || 'Recommended lender'}</h2>
        <Badge variant="secondary">{status}</Badge>
        {aiConfidence && <Badge>{aiConfidence}</Badge>}
      </div>
      <section className="mb-4"><h3 className="mb-2 font-semibold">Why we recommend this lender</h3><p className="text-sm text-gray-700 dark:text-gray-300">{reasonText || '—'}</p></section>
      <section className="mb-4"><h3 className="mb-2 font-semibold">Loan structure</h3><p className="text-sm text-gray-700 dark:text-gray-300">{structureText || '—'}</p></section>
      <section className="mb-4"><h3 className="mb-2 font-semibold">Risks to consider</h3><p className="text-sm text-gray-700 dark:text-gray-300">{riskText || '—'}</p></section>
      {footerText && <p className="mb-4 text-xs text-gray-500">{footerText}</p>}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild><Button variant="outline" size="sm">{open ? 'Hide' : 'Show'} AI Reasoning (adviser only)</Button></CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded border p-3 text-sm text-gray-700 dark:text-gray-300">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Hidden from client view</p>
          {selectionRationale || 'No rationale available.'}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
