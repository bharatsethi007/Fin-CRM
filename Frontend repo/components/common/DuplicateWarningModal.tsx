import React, { useEffect, useMemo, useState } from 'react';
import type { DuplicateCheckResult, DuplicateWarning } from '../../hooks/useDuplicateDetection';
import { Icon } from './Icon';

export interface DuplicateWarningModalProps {
  result: DuplicateCheckResult;
  onProceed: () => void;
  onCancel: () => void;
  actionLabel: string;
  /** Optional summary shown above duplicate cards (e.g. Akahu re-import period warning). */
  infoBanner?: string;
}

function severityIcon(severity: DuplicateWarning['severity']): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟡';
    case 'medium':
      return '🟠';
    case 'low':
      return '🔵';
    default:
      return '🟠';
  }
}

function hasOnlyMediumOrLow(duplicates: DuplicateWarning[]): boolean {
  if (duplicates.length === 0) return false;
  return duplicates.every((d) => d.severity === 'medium' || d.severity === 'low');
}

export const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  result,
  onProceed,
  onCancel,
  actionLabel,
  infoBanner,
}) => {
  const [entered, setEntered] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hasCritical = useMemo(
    () => result.duplicates.some((d) => d.severity === 'critical'),
    [result.duplicates],
  );

  const hasHigh = useMemo(
    () => result.duplicates.some((d) => d.severity === 'high'),
    [result.duplicates],
  );

  const requireReviewCheckbox = hasOnlyMediumOrLow(result.duplicates);
  const showAckCheckbox =
    !hasCritical && (requireReviewCheckbox || Boolean(infoBanner));

  const useAmberPrimary = hasHigh || hasCritical;

  useEffect(() => {
    setReviewed(false);
  }, [result]);

  const canProceedAck = showAckCheckbox ? reviewed : true;
  const proceedDisabled = hasCritical || !canProceedAck;

  if (!infoBanner && !result.duplicates?.length) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="duplicate-warning-title"
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${
          entered ? 'bg-opacity-50' : 'bg-opacity-0'
        }`}
        aria-label="Close overlay"
        onClick={onCancel}
      />
      <div
        className={`relative w-full max-w-lg sm:max-w-xl bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-amber-200/80 dark:border-amber-900/50 max-h-[min(90vh,720px)] flex flex-col transition-all duration-300 ease-out ${
          entered ? 'translate-y-0 opacity-100' : 'translate-y-full sm:translate-y-4 opacity-0'
        }`}
      >

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-amber-100 dark:border-amber-900/40 flex-shrink-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex-shrink-0">
            <Icon name="ShieldAlert" className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="duplicate-warning-title"
              className="text-lg font-semibold text-gray-900 dark:text-white leading-tight"
            >
              Potential Duplicate Detected
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Review the items below before continuing.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0"
            aria-label="Close"
          >
            <Icon name="X" className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {infoBanner && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              {infoBanner}
            </div>
          )}
          {hasCritical && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 px-4 py-3 text-sm text-red-900 dark:text-red-100">
              This action cannot proceed — exact duplicate file detected. Please remove the existing
              document first.
            </div>
          )}

          {result.duplicates.map((dup, idx) => (
            <div
              key={`${dup.type}-${idx}-${dup.duplicate_document_id ?? idx}`}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 p-4"
            >
              <div className="flex gap-3">
                <span className="text-xl leading-none flex-shrink-0" aria-hidden>
                  {severityIcon(dup.severity)}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                    {dup.message}
                  </p>
                  {dup.duplicate_file_name && (
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Previously uploaded as:{' '}
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {dup.duplicate_file_name}
                      </span>
                    </p>
                  )}
                  {(dup.overlap_from || dup.overlap_to) && (
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Overlapping period: {dup.overlap_from ?? '—'} to {dup.overlap_to ?? '—'}
                    </p>
                  )}
                  {dup.recommendation && (
                    <p className="text-xs italic text-gray-500 dark:text-gray-400 leading-relaxed">
                      {dup.recommendation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-900 rounded-b-2xl">
          {showAckCheckbox && !hasCritical && (
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                I have reviewed this and want to proceed
              </span>
            </label>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            {hasCritical ? (
              <button
                type="button"
                onClick={onCancel}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={proceedDisabled}
                  onClick={onProceed}
                  className={`w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                    useAmberPrimary
                      ? 'bg-amber-600 hover:bg-amber-700 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900'
                      : 'bg-primary-600 hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900'
                  }`}
                >
                  Proceed anyway — {actionLabel}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
