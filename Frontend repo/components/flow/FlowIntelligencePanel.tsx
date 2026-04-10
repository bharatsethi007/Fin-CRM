import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, GitCompare, MessageSquare, Sparkles, X } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';
import FlowIntelligenceChat from './FlowIntelligenceChat';

/** Payload from `window.dispatchEvent(new CustomEvent('flow:open', { detail }))`. */
export type FlowOpenDetail = {
  prompt?: string;
  context?: { applicationId?: string; score?: number; grade?: string };
};

export interface FlowIntelligencePanelProps {
  applicationId: string;
  onClose?: () => void;
}

type AdvisorRow = Record<string, unknown> & { name: string };

const QUICK_ACTIONS: { icon: typeof MessageSquare; label: string; prompt: string }[] = [
  {
    icon: MessageSquare,
    label: 'Explain issue',
    prompt: 'Explain the current blocking issues in plain English',
  },
  {
    icon: FileText,
    label: 'Draft email',
    prompt: 'Draft an email to the client explaining what we need',
  },
  {
    icon: GitCompare,
    label: 'Compare lenders',
    prompt: 'Which lenders will approve this deal and why',
  },
  {
    icon: Sparkles,
    label: 'Next steps',
    prompt: 'What is the fastest path to approval',
  },
];

/** Slide-out Flow Intelligence: FAB, `flow:open` events, quick actions, embedded chat. */
export const FlowIntelligencePanel: React.FC<FlowIntelligencePanelProps> = ({ applicationId, onClose }) => {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<FlowOpenDetail['context'] | null>(null);
  const [advisor, setAdvisor] = useState<AdvisorRow>({ name: 'Adviser' });
  const [firmId, setFirmId] = useState('');
  const sendRef = useRef<((text: string) => void) | null>(null);
  const pendingPromptRef = useRef<string | null>(null);

  const effectiveApplicationId = context?.applicationId ?? applicationId;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: row } = await supabase
        .from('advisors')
        .select('id, first_name, last_name, firm_id')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled || !row) return;
      const name =
        [row.first_name, row.last_name].filter(Boolean).join(' ') || user.email || 'Adviser';
      setAdvisor({ ...row, name });
      setFirmId(row.firm_id || '');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<FlowOpenDetail>;
      setOpen(true);
      if (ce.detail?.context != null) setContext(ce.detail.context);
      const prompt = ce.detail?.prompt?.trim();
      if (prompt) pendingPromptRef.current = prompt;
    };
    window.addEventListener('flow:open', handler as EventListener);
    return () => window.removeEventListener('flow:open', handler as EventListener);
  }, []);

  const handleSendReady = useCallback(
    (send: (text: string) => void) => {
      sendRef.current = send;
      const p = pendingPromptRef.current?.trim();
      if (p) {
        send(p);
        pendingPromptRef.current = null;
      }
    },
    [],
  );

  const runQuickAction = (prompt: string) => {
    const p = prompt.trim();
    if (!p) return;
    const send = sendRef.current;
    if (send) send(p);
    else pendingPromptRef.current = p;
  };

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 rounded-2xl bg-slate-900 p-3.5 text-white shadow-xl shadow-slate-900/20 transition-transform hover:scale-105 dark:bg-slate-100 dark:text-slate-900"
        aria-label="Open Flow Intelligence"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[2000] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/10 backdrop-blur-sm"
            aria-label="Close panel"
            onClick={close}
          />
          <aside className="relative flex h-full w-full max-w-[440px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 pointer-events-auto">
            <div className="border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/50 px-5 py-4 dark:from-gray-900 dark:to-gray-900/80 dark:border-gray-700">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="rounded-lg bg-violet-100 p-1.5 dark:bg-violet-950/60">
                    <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      Flow Intelligence
                    </h3>
                    {context != null && (context.score != null || context.grade != null) && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {context.score != null && <>Score {context.score}</>}
                        {context.score != null && context.grade != null && ' · '}
                        {context.grade != null && <>Grade {context.grade}</>}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-gray-800"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>
            </div>

            <div className="border-b border-slate-100 px-4 py-3 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => runQuickAction(action.prompt)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-left transition-colors hover:bg-slate-50 dark:border-gray-600 dark:hover:bg-gray-800/80"
                  >
                    <action.icon className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {firmId ? (
                <FlowIntelligenceChat
                  advisor={advisor}
                  firmId={firmId}
                  setCurrentView={() => {}}
                  contextApplicationId={effectiveApplicationId}
                  compact
                  onSendReady={handleSendReady}
                />
              ) : (
                <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
