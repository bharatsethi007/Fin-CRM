import React, { useCallback, useEffect, useRef, useState } from 'react';
import FlowIntelligenceChat from '../flow/FlowIntelligenceChat';
import { useMorningBriefing } from '../flow/useMorningBriefing';

const FI_PREFILL_KEY = 'fi_prefill_message';

interface Props {
  advisor: any;
  firmId: string;
  setCurrentView: (view: string) => void;
}

const FlowIntelligencePage: React.FC<Props> = ({ advisor, firmId, setCurrentView }) => {
  const sendRef = useRef<((text: string) => void) | null>(null);
  const prefillHandled = useRef(false);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);

  const { briefing, loading: morningBriefingLoading } = useMorningBriefing(advisor?.id, firmId);

  const handleInitialConversationConsumed = useCallback(() => {
    setInitialConversationId(null);
  }, []);

  useEffect(() => {
    if (prefillHandled.current) return;
    const prefill = sessionStorage.getItem(FI_PREFILL_KEY);
    if (prefill && sendRef.current) {
      prefillHandled.current = true;
      sessionStorage.removeItem(FI_PREFILL_KEY);
      sendRef.current(prefill);
    }
  });

  return (
    <FlowIntelligenceChat
      advisor={advisor}
      firmId={firmId}
      setCurrentView={setCurrentView}
      compact={false}
      initialConversationId={initialConversationId}
      onInitialConversationConsumed={handleInitialConversationConsumed}
      morningBriefing={briefing}
      morningBriefingLoading={morningBriefingLoading}
      onOpenMorningBriefingChat={(id) => setInitialConversationId(id)}
      onSendReady={(send) => {
        sendRef.current = send;
      }}
    />
  );
};

export default FlowIntelligencePage;
