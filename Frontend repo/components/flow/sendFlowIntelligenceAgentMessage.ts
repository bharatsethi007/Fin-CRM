import type { Dispatch, SetStateAction } from 'react';
import { logger } from '../../utils/logger';
import { invokeFunction } from '../../src/lib/api';
import { authService, crmService } from '../../services/api';
import type { AttachedFileMeta, Message, PendingConfirmation } from './flowIntelligenceChatTypes';
import {
  messagesToAgentPayload,
  raceWithTimeout,
  startLoadingStatusCycle,
  summarizeCrmForFlowIntelligence,
  uploadFileToFlowStaging,
} from './flowIntelligenceChatApi';
import {
  buildDocumentFilingInteractiveBlock,
  generateInteractiveBlocks,
  parseActionsTaken,
} from './flowIntelligenceChatLib';

export type SendFlowAgentCtx = {
  loading: boolean;
  messages: Message[];
  pendingFiles: File[];
  firmId: string;
  advisorId: string;
  advisor: { name?: string } | null | undefined;
  currentConversationId: string | null;
  contextApplicationId: string | null;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setPendingFiles: Dispatch<SetStateAction<File[]>>;
  setLoading: (v: boolean) => void;
  setIsThinking: (v: boolean) => void;
  setLoadingMessage: Dispatch<SetStateAction<string>>;
  setCurrentConversationId: Dispatch<SetStateAction<string | null>>;
  setPendingConfirmation: Dispatch<SetStateAction<PendingConfirmation | null>>;
  setLatestAssistantId: Dispatch<SetStateAction<string | null>>;
  setSuggestions: Dispatch<SetStateAction<string[]>>;
  loadConversationList: () => void | Promise<void>;
};

/** Sends user text (and optional pre-attached files) to flow-intelligence-agent. */
export async function sendFlowIntelligenceAgentMessage(
  text: string,
  opts: { attached_files?: AttachedFileMeta[] } | undefined,
  ctx: SendFlowAgentCtx,
): Promise<void> {
  const trimmed = text.trim();
  const preAttached = opts?.attached_files;
  const hasPreAttached = (preAttached?.length ?? 0) > 0;
  if (ctx.loading) return;
  if (!trimmed && !hasPreAttached && ctx.pendingFiles.length === 0) return;
  if (!ctx.firmId || !ctx.advisorId) {
    logger.warn('sendMessage: missing firmId or advisorId');
    return;
  }

  let attachedMeta = preAttached;
  if (!attachedMeta || attachedMeta.length === 0) {
    if (ctx.pendingFiles.length > 0) {
      try {
        const uploaded: AttachedFileMeta[] = [];
        for (const f of ctx.pendingFiles) {
          uploaded.push(await uploadFileToFlowStaging(f, ctx.firmId, ctx.advisorId));
        }
        attachedMeta = uploaded;
        ctx.setPendingFiles([]);
      } catch (e: unknown) {
        logger.error('Flow Intelligence file upload failed', e);
        const msg = e instanceof Error ? e.message : 'Upload failed';
        ctx.setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            role: 'assistant',
            content: `Could not upload files: ${msg}`,
            timestamp: new Date(),
            responseType: 'general',
          },
        ]);
        return;
      }
    }
  }

  const hasFiles = (attachedMeta?.length ?? 0) > 0;
  const bodyText =
    trimmed || (hasFiles ? 'I uploaded documents, please process them.' : '');
  const displayContent =
    trimmed +
    (hasFiles ? `${trimmed ? '\n' : ''}📎 ${(attachedMeta ?? []).map((a) => a.name).join(', ')}` : '');

  const userMsg: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: displayContent || bodyText,
    timestamp: new Date(),
  };
  ctx.setMessages((prev) => [...prev, userMsg]);
  ctx.setInput('');
  ctx.setLoading(true);
  ctx.setIsThinking(true);
  const clearLoadingStatus = startLoadingStatusCycle(ctx.setLoadingMessage);
  try {
    let crm_context = '';
    try {
      const crmData = await crmService.getAllDataForAI();
      const firm = authService.getCurrentFirm();
      const brokerName = ctx.advisor?.name || 'Adviser';
      const firmName = firm?.name || 'Unknown firm';
      crm_context = summarizeCrmForFlowIntelligence(crmData, brokerName, firmName);
    } catch (e) {
      logger.warn('FlowIntelligence CRM context load failed', e);
    }

    const conversationPayload = messagesToAgentPayload([...ctx.messages, userMsg]);

    const payload: Record<string, unknown> = {
      message: displayContent || bodyText,
      messages: conversationPayload,
      crm_context: crm_context || undefined,
      conversation_id: ctx.currentConversationId || null,
      application_id: ctx.contextApplicationId || null,
    };
    if (hasFiles && attachedMeta) {
      payload.attached_files = attachedMeta.map((f) => ({
        name: f.name,
        type: f.type,
        size: f.size,
        storage_path: f.storage_path,
        url: f.url,
        publicUrl: f.url,
        file_hash: f.file_hash,
      }));
    }

    const result = await raceWithTimeout(invokeFunction<Record<string, unknown>>('flow-intelligence-agent', payload));
    const { data, error } = result;

    if (error) {
      logger.error(error);
      ctx.setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'assistant',
          content: error || 'Flow Intelligence request failed.',
          timestamp: new Date(),
          responseType: 'general',
        },
      ]);
      return;
    }

    const agent = data as Record<string, unknown>;
    if (typeof agent.conversation_id === 'string') ctx.setCurrentConversationId(agent.conversation_id);

    if (agent.requires_confirmation && agent.message_id) {
      const intentAction = (agent.intent as { action?: string } | undefined)?.action ?? null;
      const ar = agent.action_result as { summary?: string; summaries?: string[] } | undefined;
      const summaryLine =
        typeof ar?.summary === 'string' && ar.summary.trim()
          ? ar.summary.trim()
          : Array.isArray(ar?.summaries)
            ? ar.summaries.join('\n')
            : '';
      ctx.setPendingConfirmation({
        message_id: String(agent.message_id),
        action: intentAction === 'built_in_execute' ? 'CRM update' : intentAction,
        description: [typeof agent.message === 'string' ? agent.message : '', summaryLine]
          .filter(Boolean)
          .join('\n\n'),
      });
    } else {
      ctx.setPendingConfirmation(null);
    }

    const actionsTakenParsed = parseActionsTaken(agent.actions_taken);
    const docBlock = buildDocumentFilingInteractiveBlock(actionsTakenParsed);
    const interactiveBlocks = [
      ...(docBlock ? [docBlock] : []),
      ...generateInteractiveBlocks(typeof agent.message === 'string' ? agent.message : '', actionsTakenParsed),
    ];
    const assistantMsg: Message = {
      id: typeof agent.message_id === 'string' ? agent.message_id : String(Date.now() + 1),
      role: 'assistant',
      content: typeof agent.message === 'string' ? agent.message : '',
      timestamp: new Date(),
      responseType: 'general',
      agentData: agent,
      actions_taken: actionsTakenParsed,
      interactive: interactiveBlocks.length > 0 ? interactiveBlocks : undefined,
    };
    ctx.setMessages((prev) => [...prev, assistantMsg]);
    ctx.setLatestAssistantId(assistantMsg.id);
    ctx.setSuggestions(Array.isArray(agent.suggestions) ? (agent.suggestions as string[]) : []);
    void ctx.loadConversationList();
  } catch (e: unknown) {
    logger.error('FlowIntelligence error', e);
    const isTimeout = e instanceof Error && e.message === 'timeout';
    ctx.setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: isTimeout
          ? 'Flow Intelligence is taking longer than expected. Please try again.'
          : 'Something went wrong. Please try again.',
        timestamp: new Date(),
        responseType: 'general',
      },
    ]);
  } finally {
    clearLoadingStatus();
    ctx.setLoading(false);
    ctx.setIsThinking(false);
  }
}
