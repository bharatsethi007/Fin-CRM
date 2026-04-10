import { cn } from '../../src/lib/utils';
import { safeArray } from './soaAgentUtils';

type PolicyChunk = { text?: string; page?: number; citation?: string; similarity?: number; is_baseline?: boolean };

type Props = { policyEvidence: Record<string, unknown>; tone?: 'canvas' | 'panel' };

/** Renders Step 2 policy RAG chunks per lender (Agent Canvas dark or middle panel light). */
export function SoaStepTwoPolicyEvidence({ policyEvidence, tone = 'canvas' }: Props) {
  const entries = Object.entries(policyEvidence) as [string, unknown][];
  const isPanel = tone === 'panel';

  if (entries.length === 0) {
    return (
      <p className={cn('text-xs', isPanel ? 'text-gray-500 dark:text-gray-400' : 'text-gray-500')}>No policy evidence yet.</p>
    );
  }

  return (
    <div
      className={cn(
        'space-y-3',
        isPanel ? 'pt-3' : 'mt-2 space-y-3 border-t border-gray-700 pt-2',
      )}
    >
      <p
        className={cn(
          'text-xs font-semibold uppercase tracking-wide',
          isPanel ? 'text-violet-700 dark:text-violet-300' : 'text-violet-300',
        )}
      >
        Policy evidence
      </p>
      {entries.map(([lenderName, chunksRaw]) => {
        const chunks = safeArray<PolicyChunk>(chunksRaw);
        return (
          <div
            key={lenderName}
            className={cn(
              'rounded border p-2',
              isPanel ? 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/50' : 'border-gray-700/80 bg-black/20',
            )}
          >
            <strong className={cn('text-xs', isPanel ? 'text-gray-900 dark:text-gray-100' : 'text-gray-100')}>
              {lenderName}
            </strong>
            {chunks.map((chunk, i) => (
              <div key={i} className="mt-2 text-xs">
                <p
                  className={cn(
                    'flex flex-wrap items-center gap-2',
                    isPanel ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400',
                  )}
                >
                  {chunk.similarity != null ? <span>{String(chunk.similarity)}% match</span> : null}
                  {chunk.is_baseline ? (
                    <span
                      className={cn(
                        'font-medium',
                        isPanel ? 'text-amber-700 dark:text-amber-400' : 'text-amber-400',
                      )}
                    >
                      BASELINE
                    </span>
                  ) : null}
                  {chunk.page != null ? <span>p.{chunk.page}</span> : null}
                </p>
                <p
                  className={cn(
                    'mt-1 leading-snug',
                    isPanel ? 'text-gray-800 dark:text-gray-200' : 'text-gray-200',
                  )}
                >
                  {chunk.text?.slice(0, 280) ?? '—'}
                </p>
                <p className={cn('mt-1 text-[11px]', isPanel ? 'text-gray-500 dark:text-gray-400' : 'text-gray-500')}>
                  {String(chunk.citation ?? '')}
                </p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
