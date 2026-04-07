import React, { useState } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

export type EditExtent = 'None' | 'Minor' | 'Moderate' | 'Major';

export interface AIFeedbackRatingProps {
  firmId: string;
  advisorId: string;
  applicationId: string;
  feature: string;
  /** Called after feedback is saved (or skipped). */
  onSubmitted?: () => void;
  className?: string;
}

export const AIFeedbackRating: React.FC<AIFeedbackRatingProps> = ({
  firmId,
  advisorId,
  applicationId,
  feature,
  onSubmitted,
  className = '',
}) => {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [wasEdited, setWasEdited] = useState(false);
  const [editExtent, setEditExtent] = useState<EditExtent>('None');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('ai_skill_usage_log').insert({
        firm_id: firmId,
        advisor_id: advisorId,
        application_id: applicationId,
        feature,
        quality_rating: rating || null,
        was_edited: wasEdited,
        edit_extent: wasEdited ? editExtent : null,
        skill_id: null,
      });
      if (error) throw error;
      toast.success('Feedback submitted');
      setDone(true);
      onSubmitted?.();
    } catch (e: any) {
      logger.error('ai_skill_usage_log insert:', e);
      toast.error('Error: ' + (e?.message || 'Failed to submit feedback'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className={`text-xs text-emerald-600 dark:text-emerald-400 ${className}`}>
        Thanks — feedback saved.
      </p>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-3 ${className}`}>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">How was this AI output?</p>
      <div className="flex gap-1" role="group" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className="text-2xl leading-none text-amber-400 hover:scale-110 transition-transform"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            {n <= rating ? '★' : '☆'}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={wasEdited}
          onChange={(e) => setWasEdited(e.target.checked)}
        />
        Was it edited?
      </label>
      {wasEdited && (
        <select
          value={editExtent}
          onChange={(e) => setEditExtent(e.target.value as EditExtent)}
          className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
        >
          <option value="None">None</option>
          <option value="Minor">Minor</option>
          <option value="Moderate">Moderate</option>
          <option value="Major">Major</option>
        </select>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5"
        >
          {submitting ? 'Saving…' : 'Submit feedback'}
        </button>
      </div>
    </div>
  );
};
