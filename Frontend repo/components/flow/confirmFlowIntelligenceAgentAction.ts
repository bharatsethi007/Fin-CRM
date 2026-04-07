import type { Dispatch, SetStateAction } from 'react';
import { logger } from '../../utils/logger';
import { invokeFunction } from '../../src/lib/api';
import type { Message, PendingConfirmation } from './flowIntelligenceChatTypes';
import { raceWithTimeout, startLoadingStatusCycle } from './flowIntelligenceChatApi';
import { generateInteractiveBlocks, parseActionsTaken } from './flowIntelligenceChatLib';

export type ConfirmFlowAgentCtx = {
  pendingConfirmation: PendingConfirmation | null;
  currentConversationId: string | null;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setLoading: (v: boolean) => void;
  setLoadingMessage: Dispatch<SetStateAction<string>>;
  setCurrentConversationId: Dispatch<SetStateAction<string | null>>;
  setLatestAssistantId: Dispatch<SetStateAction<string | null>>;
  setSuggestions: Dispatch<SetStateAction<string[]>>;
  setPendingConfirmation: Dispatch<SetStateAction<PendingConfirmation | null>>;
  loadConversationList: () => void | Promise<void>;
};

/** Confirms a pending CRM action via flow-intelligence-agent. */
export async function confirmFlowIntelligenceAgentAction(ctx: ConfirmFlowAgentCtx): Promise<void> {
  logger.log('Confirm clicked, pendingConfirmation:', ctx.pendingConfirmation);
  if (!ctx.pendingConfirmation?.message_id) {
    logger.error('No message_id on pendingConfirmation:', ctx.pendingConfirmation);
    return;
  }

  ctx.setLoading(true);
  const clearLoadingStatus = startLoadingStatusCycle(ctx.setLoadingMessage);
  try {
    const invokeResult = await raceWithTimeout(
      invokeFunction<Record<string, unknown>>('flow-intelligence-agent', {
        confirm_action: {
          message_id: ctx.pendingConfirmation.message_id,
        },
        conversation_id: ctx.currentConversationId,
      }),
    );
    const { data, error } = invokeResult;

    if (error) {
      logger.error('Confirm error:', error);
      ctx.setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'assistant',
          content: 'Failed to execute action. Please try again.',
          timestamp: new Date(),
          responseType: 'general',
        },
      ]);
    } else {
      const d = data as Record<string, unknown>;
      if (typeof d.conversation_id === 'string') ctx.setCurrentConversationId(d.conversation_id);
      const confirmActions = parseActionsTaken(d.actions_taken);
      const confirmInteractive = generateInteractiveBlocks(
        typeof d.message === 'string' ? d.message : '',
        confirmActions,
      );
      const assistantMsg: Message = {
        id: typeof d.message_id === 'string' ? d.message_id : String(Date.now()),
        role: 'assistant',
        content: typeof d.message === 'string' ? d.message : '',
        timestamp: new Date(),
        responseType: 'general',
        agentData: d,
        actions_taken: confirmActions,
        interactive: confirmInteractive.length > 0 ? confirmInteractive : undefined,
      };
      ctx.setMessages((prev) => [...prev, assistantMsg]);
      ctx.setLatestAssistantId(assistantMsg.id);
      ctx.setSuggestions(Array.isArray(d.suggestions) ? (d.suggestions as string[]) : []);
      void ctx.loadConversationList();
    }

    ctx.setPendingConfirmation(null);
  } catch (e: unknown) {
    logger.error('FlowIntelligence confirm error', e);
    const isTimeout = e instanceof Error && e.message === 'timeout';
    ctx.setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'assistant',
        content: isTimeout
          ? 'Flow Intelligence is taking longer than expected. Please try again.'
          : 'Something went wrong. Please try again.',
        timestamp: new Date(),
        responseType: 'general',
      },
    ]);
    ctx.setPendingConfirmation(null);
  } finally {
    clearLoadingStatus();
    ctx.setLoading(false);
  }
}
