import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import type {
  ActionButton,
  AttachedFileMeta,
  ChecklistItem,
  DocumentFilingProposal,
  FlowIntelligenceChatProps,
  Message,
  PendingConfirmation,
} from './flowIntelligenceChatTypes';
import {
  buildWelcomeMessage,
  fetchFiConversationsForAdvisor,
  fetchFiMessagesForConversation,
} from './flowIntelligenceChatApi';
import { commitDocumentProposalsMutation } from './commitDocumentProposalsMutation';
import { sendFlowIntelligenceAgentMessage } from './sendFlowIntelligenceAgentMessage';
import { confirmFlowIntelligenceAgentAction } from './confirmFlowIntelligenceAgentAction';

export function useFlowIntelligenceChat({
  advisor,
  firmId,
  contextApplicationId = null,
  compact = false,
  initialConversationId = null,
  onInitialConversationConsumed,
}: Pick<
  FlowIntelligenceChatProps,
  | 'advisor'
  | 'firmId'
  | 'contextApplicationId'
  | 'compact'
  | 'initialConversationId'
  | 'onInitialConversationConsumed'
>) {
  const [messages, setMessages] = useState<Message[]>(() => [buildWelcomeMessage(advisor)]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<
    import('./flowIntelligenceChatTypes').FiConversationListItem[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyThreadLoading, setHistoryThreadLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [filingCommittingId, setFilingCommittingId] = useState<string | null>(null);
  const [latestAssistantId, setLatestAssistantId] = useState<string | null>(null);
  const dragDepthRef = useRef(0);

  const [selectedTheme, setSelectedTheme] = useState<string>(() => localStorage.getItem('fi_theme') || 'default');

  /** Updates theme state and persists `fi_theme` in localStorage. */
  const saveTheme = useCallback((id: string) => {
    setSelectedTheme(id);
    localStorage.setItem('fi_theme', id);
  }, []);

  const advisorId = advisor?.id;

  const loadConversationList = useCallback(async () => {
    if (!advisorId || !firmId) return;
    setHistoryLoading(true);
    try {
      const rows = await fetchFiConversationsForAdvisor(advisorId, firmId);
      setConversations(rows);
    } finally {
      setHistoryLoading(false);
    }
  }, [advisorId, firmId]);

  useEffect(() => {
    void loadConversationList();
  }, [loadConversationList]);

  const startNewChat = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([buildWelcomeMessage(advisor)]);
    setLatestAssistantId(null);
    setPendingConfirmation(null);
    setSuggestions([]);
    setExpandedSteps({});
    setInput('');
    setPendingFiles([]);
    setIsDragging(false);
  }, [advisor]);

  const selectConversation = useCallback(
    async (id: string) => {
      if (!id) return;
      if (id === currentConversationId) return;
      setHistoryThreadLoading(true);
      setPendingConfirmation(null);
      setSuggestions([]);
      setExpandedSteps({});
      setPendingFiles([]);
      try {
        const rows = await fetchFiMessagesForConversation(id);
        setCurrentConversationId(id);
        setLatestAssistantId(null);
        setMessages(rows.length === 0 ? [buildWelcomeMessage(advisor)] : rows);
      } finally {
        setHistoryThreadLoading(false);
      }
    },
    [advisor, currentConversationId],
  );

  useEffect(() => {
    if (!initialConversationId) return;
    let cancelled = false;
    void (async () => {
      await selectConversation(initialConversationId);
      if (!cancelled) onInitialConversationConsumed?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [initialConversationId, selectConversation, onInitialConversationConsumed]);

  const toggleSteps = (msgId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleFilesSelected = useCallback((files: File[]) => {
    const allowedExt = /\.(pdf|csv|jpe?g|png|doc|docx)$/i;
    const next = files.filter((f) => allowedExt.test(f.name));
    if (next.length < files.length) {
      logger.warn('Some files were skipped (unsupported type)');
    }
    if (next.length === 0) return;
    setPendingFiles((prev) => [...prev, ...next]);
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const commitDocumentProposals = useCallback(
    async (messageId: string, proposals: DocumentFilingProposal[]) => {
      if (!firmId || !advisorId) return;
      setFilingCommittingId(messageId);
      try {
        await commitDocumentProposalsMutation({
          supabase,
          firmId,
          advisorId,
          messageId,
          proposals,
          setMessages,
        });
      } finally {
        setFilingCommittingId(null);
      }
    },
    [firmId, advisorId],
  );

  const sendMessage = async (text: string, opts?: { attached_files?: AttachedFileMeta[] }) => {
    if (!firmId || !advisorId) {
      logger.warn('sendMessage: missing firmId or advisorId');
      return;
    }
    await sendFlowIntelligenceAgentMessage(text, opts, {
      loading,
      messages,
      pendingFiles,
      firmId,
      advisorId,
      advisor,
      currentConversationId,
      contextApplicationId,
      setMessages,
      setInput,
      setPendingFiles,
      setLoading,
      setIsThinking,
      setLoadingMessage,
      setCurrentConversationId,
      setPendingConfirmation,
      setLatestAssistantId,
      setSuggestions,
      loadConversationList,
    });
  };

  const toggleChecklistItem = (msgId: string, itemId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.interactive) return msg;
        return {
          ...msg,
          interactive: msg.interactive.map((block) => {
            if (block.type !== 'checklist' || !block.checklist) return block;
            return {
              ...block,
              checklist: block.checklist.map((item) =>
                item.id === itemId ? { ...item, checked: !item.checked } : item,
              ),
            };
          }),
        };
      }),
    );
  };

  const handleChecklistExecute = (items: ChecklistItem[]) => {
    const itemList = items.map((i) => i.label).join(', ');
    void sendMessage(
      `Handle these items for me: ${itemList}. For each one, take the appropriate action — draft emails, create tasks, update records. Show me what you did.`,
    );
  };

  const handleActionButton = (msgId: string, btn: ActionButton) => {
    if (btn.action === 'confirm') {
      void sendMessage('Yes, proceed with all the suggested actions.');
    } else if (btn.action === 'skip') {
      void sendMessage('Skip that for now. What else needs my attention?');
    } else {
      void sendMessage(`Execute: ${btn.label}`);
    }
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.interactive) return msg;
        return {
          ...msg,
          interactive: msg.interactive.map((block) => {
            if (block.type !== 'action_buttons' || !block.buttons) return block;
            return {
              ...block,
              buttons: block.buttons.map((b) => (b.id === btn.id ? { ...b, completed: true } : b)),
            };
          }),
        };
      }),
    );
  };

  const handleConfirmAction = async () => {
    await confirmFlowIntelligenceAgentAction({
      pendingConfirmation,
      currentConversationId,
      setMessages,
      setLoading,
      setLoadingMessage,
      setCurrentConversationId,
      setLatestAssistantId,
      setSuggestions,
      setPendingConfirmation,
      loadConversationList,
    });
  };

  const showHome = !compact && messages.length <= 1;

  return {
    messages,
    input,
    setInput,
    loading,
    isThinking,
    loadingMessage,
    suggestions,
    pendingConfirmation,
    setPendingConfirmation,
    pendingFiles,
    isDragging,
    setIsDragging,
    dragDepthRef,
    historyOpen,
    setHistoryOpen,
    historyLoading,
    historyThreadLoading,
    conversations,
    currentConversationId,
    expandedSteps,
    latestAssistantId,
    showHome,
    messagesEndRef,
    sendMessage,
    handleConfirmAction,
    selectConversation,
    startNewChat,
    toggleSteps,
    toggleChecklistItem,
    handleChecklistExecute,
    handleActionButton,
    handleFilesSelected,
    removePendingFile,
    commitDocumentProposals,
    filingCommittingId,
    selectedTheme,
    saveTheme,
  };
}
