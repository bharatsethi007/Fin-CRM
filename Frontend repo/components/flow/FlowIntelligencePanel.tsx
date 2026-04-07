import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import FlowIntelligenceChat from './FlowIntelligenceChat';

export interface FlowIntelligencePanelProps {
  applicationId: string;
  onClose: () => void;
}

/**
 * Slide-out panel: Flow Intelligence scoped to one application (passes application_id to the edge agent).
 */
export const FlowIntelligencePanel: React.FC<FlowIntelligencePanelProps> = ({ applicationId, onClose }) => {
  const [advisor, setAdvisor] = useState<any>({ name: 'Adviser' });
  const [firmId, setFirmId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: row } = await supabase
        .from('advisors')
        .select('id, first_name, last_name, firm_id')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled || !row) return;
      const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || user.email || 'Adviser';
      setAdvisor({ ...row, name });
      setFirmId(row.firm_id || '');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className="relative w-full max-w-[440px] h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
              Flow Intelligence
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Application context</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-2 py-1"
          >
            Close
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {firmId ? (
            <FlowIntelligenceChat
              advisor={advisor}
              firmId={firmId}
              setCurrentView={() => {}}
              contextApplicationId={applicationId}
              compact
            />
          ) : (
            <p className="p-4 text-sm text-gray-500">Loading…</p>
          )}
        </div>
      </aside>
    </div>
  );
};
