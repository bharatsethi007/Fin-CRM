import { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import type { MorningBriefing } from './flowIntelligenceChatTypes';

export type { MorningBriefing } from './flowIntelligenceChatTypes';

/** Loads today’s pre-generated morning briefing thread from `fi_conversations` / `fi_messages`. */
export function useMorningBriefing(advisorId: string | undefined, firmId: string) {
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!advisorId || !firmId) {
      setBriefing(null);
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data: conv, error: convErr } = await supabase
          .from('fi_conversations')
          .select('id, title')
          .eq('firm_id', firmId)
          .eq('advisor_id', advisorId)
          .ilike('title', `Morning Briefing%${today}%`)
          .maybeSingle();

        if (convErr) {
          logger.warn('useMorningBriefing: fi_conversations query failed', convErr);
          if (!cancelled) setBriefing(null);
          return;
        }

        if (!conv) {
          if (!cancelled) setBriefing(null);
          return;
        }

        const { data: msg, error: msgErr } = await supabase
          .from('fi_messages')
          .select('content')
          .eq('conversation_id', conv.id)
          .eq('role', 'assistant')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (msgErr) {
          logger.warn('useMorningBriefing: fi_messages query failed', msgErr);
          if (!cancelled) setBriefing(null);
          return;
        }

        if (msg?.content && !cancelled) {
          setBriefing({
            conversation_id: conv.id,
            content: msg.content,
            title: conv.title ?? 'Morning Briefing',
          });
        } else if (!cancelled) {
          setBriefing(null);
        }
      } catch (e) {
        logger.error(e);
        if (!cancelled) setBriefing(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [advisorId, firmId]);

  return { briefing, loading };
}
