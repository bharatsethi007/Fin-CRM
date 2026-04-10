import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

export interface FieldAnomaly {
  message: string;
  detail: string;
}

export interface FieldWithAnomalyProps {
  label: string;
  children: ReactNode;
  anomaly?: FieldAnomaly;
  helperText?: string;
}

/** Wraps a form control with a label, optional anomaly ring + tooltip, and helper copy. */
export function FieldWithAnomaly({ label, children, anomaly, helperText }: FieldWithAnomalyProps) {
  return (
    <div>
      <div className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div className="relative">
        <div className={anomaly ? 'rounded-md ring-1 ring-amber-300' : ''}>{children}</div>
        {anomaly && (
          <div className="group absolute -right-1.5 -top-1.5 z-10">
            <div
              className="flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-amber-500 shadow-lg shadow-amber-500/30 animate-pulse"
              role="img"
              aria-label={`${anomaly.message}. ${anomaly.detail}`}
            >
              <AlertTriangle className="h-3 w-3 text-white" strokeWidth={2.5} />
            </div>
            <div className="pointer-events-none absolute right-0 top-6 z-50 w-64 translate-y-1 rounded-xl bg-slate-900 p-3 text-xs text-white opacity-0 shadow-2xl transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              <p className="font-medium text-amber-300">{anomaly.message}</p>
              <p className="mt-1 leading-snug opacity-80">{anomaly.detail}</p>
            </div>
          </div>
        )}
      </div>
      {helperText && (
        <p className={`mt-1.5 text-xs ${anomaly ? 'text-amber-700' : 'text-slate-500'}`}>{helperText}</p>
      )}
    </div>
  );
}
