import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

/** Tooltip payload for the amber pulse dot on fields flagged by `anomaly_flags` or similar. */
export type FieldAnomalyHint = {
  title: string;
  description: string;
};

export interface FieldWithAnomalyProps {
  label: string;
  children: ReactNode;
  anomaly?: FieldAnomalyHint | null;
  helperText?: string;
}

/** Labels a control and shows an inline anomaly ring + hover tooltip when `anomaly` is set. */
export function FieldWithAnomaly({ label, children, anomaly, helperText }: FieldWithAnomalyProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-600">
        {label}
      </label>
      <div className="relative">
        <div className={anomaly ? 'rounded-xl ring-1 ring-amber-300' : ''}>{children}</div>
        {anomaly && (
          <div className="group absolute -right-1.5 -top-1.5 z-10">
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 shadow-lg shadow-amber-500/30 animate-pulse"
              role="img"
              aria-label={`${anomaly.title}. ${anomaly.description}`}
            >
              <AlertTriangle className="h-3 w-3 text-white" strokeWidth={2.5} />
            </div>
            <div className="pointer-events-none absolute right-0 top-7 z-50 w-64 rounded-xl bg-slate-900 p-3 text-xs text-white opacity-0 shadow-2xl transition-opacity duration-200 group-hover:opacity-100">
              <p className="font-medium text-amber-300">{anomaly.title}</p>
              <p className="mt-1 opacity-80">{anomaly.description}</p>
            </div>
          </div>
        )}
      </div>
      {helperText && (
        <p className={`mt-1.5 text-xs ${anomaly ? 'text-amber-700 dark:text-amber-400/90' : 'text-slate-500'}`}>
          {helperText}
        </p>
      )}
    </div>
  );
}
