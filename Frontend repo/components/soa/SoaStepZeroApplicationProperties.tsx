import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

/** Row shape for Step 0 property table (matches `application_properties`). */
export type SoaApplicationPropertyRow = {
  id: string;
  address_full?: string | null;
  address_normalized?: string | null;
  title_number?: string | null;
  legal_description?: string | null;
  estate_type?: string | null;
  land_area_m2?: number | null;
};

type Props = {
  properties: SoaApplicationPropertyRow[];
};

/** Step 0 table of application properties (replaces card layout). */
export function SoaStepZeroApplicationProperties({ properties }: Props) {
  if (!properties?.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No properties added
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-200 bg-slate-50 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
            <TableHead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Address
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Title No.
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Legal Description
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Estate</TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Land Area
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((p) => {
            const land =
              p.land_area_m2 != null && Number.isFinite(p.land_area_m2)
                ? `${p.land_area_m2.toLocaleString()} m²`
                : '—';
            const feeTone = p.estate_type?.toLowerCase().includes('fee');
            return (
              <TableRow
                key={p.id}
                className="border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/30"
              >
                <TableCell className="max-w-[14rem] truncate font-medium text-gray-900 dark:text-slate-200">
                  {p.address_normalized || p.address_full || '—'}
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                  {p.title_number || '—'}
                </TableCell>
                <TableCell className="max-w-[12rem] truncate text-slate-600 dark:text-slate-300">
                  {p.legal_description || '—'}
                </TableCell>
                <TableCell>
                  <span
                    className={`text-xs ${feeTone ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
                  >
                    {p.estate_type || '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm text-slate-600 dark:text-slate-300">{land}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
