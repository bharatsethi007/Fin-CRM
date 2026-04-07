import React, { useEffect } from 'react';
import { Icon } from '../common/Icon';
import { FlowChatToolbar } from './FlowChatToolbar';
import { FlowHistorySidebar } from './FlowHistorySidebar';
import { FlowHomeScreen } from './FlowHomeScreen';
import { FlowInputBar } from './FlowInputBar';
import { FlowMessageList } from './FlowMessageList';
import { FI_NOISE_DATA_URL, getFiTheme } from './fiThemes';
import type { FlowIntelligenceChatProps } from './flowIntelligenceChatTypes';
import { useFlowIntelligenceChat } from './useFlowIntelligenceChat';

export type {
  AttachedFileMeta,
  DocumentFilingProposal,
  ActionButton,
  ChecklistItem,
  InteractiveBlock,
  Message,
  PendingConfirmation,
  FiConversationListItem,
  FlowIntelligenceChatProps,
} from './flowIntelligenceChatTypes';

const FlowIntelligenceChat: React.FC<FlowIntelligenceChatProps> = ({
  advisor,
  firmId,
  setCurrentView,
  contextApplicationId = null,
  compact = false,
  onSendReady,
  initialConversationId = null,
  onInitialConversationConsumed,
  morningBriefing = null,
  morningBriefingLoading = false,
  onOpenMorningBriefingChat,
}) => {
  const fi = useFlowIntelligenceChat({
    advisor,
    firmId,
    contextApplicationId,
    compact,
    initialConversationId,
    onInitialConversationConsumed,
  });
  const {
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
  } = fi;

  useEffect(() => {
    onSendReady?.(sendMessage);
  }, [onSendReady, sendMessage]);

  const activeTheme = getFiTheme(selectedTheme);
  const chatAreaBackground = compact ? '#ffffff' : (activeTheme.gradient ?? activeTheme.bg);

  const firstName =
    (typeof advisor?.first_name === 'string' && advisor.first_name.trim()) ||
    advisor?.name?.split(' ')[0]?.trim() ||
    'there';

  const sidebarWidthPx = compact ? 200 : 220;

  const inputBarProps = {
    input,
    setInput,
    loading,
    pendingFiles,
    pendingConfirmation,
    suggestions,
    compact,
    messages,
    setPendingConfirmation,
    sendMessage,
    handleFilesSelected,
    removePendingFile,
    handleConfirmAction,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: compact ? '100%' : 'calc(100vh - 64px)',
        width: '100%',
        margin: 0,
        padding: compact ? '0 8px' : 0,
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: '100%',
        }}
      >
        <FlowHistorySidebar
          historyOpen={historyOpen}
          sidebarWidthPx={sidebarWidthPx}
          historyLoading={historyLoading}
          conversations={conversations}
          currentConversationId={currentConversationId}
          startNewChat={startNewChat}
          selectConversation={selectConversation}
        />

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            minWidth: 0,
            position: 'relative',
            background: chatAreaBackground,
            paddingTop: 8,
          }}
          className={isDragging ? 'ring-2 ring-primary-400 ring-inset' : ''}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepthRef.current += 1;
            if (dragDepthRef.current === 1) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepthRef.current -= 1;
            if (dragDepthRef.current <= 0) {
              dragDepthRef.current = 0;
              setIsDragging(false);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepthRef.current = 0;
            setIsDragging(false);
            const files = Array.from(e.dataTransfer.files || []);
            handleFilesSelected(files);
          }}
        >
          {!compact && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                backgroundImage: `url("${FI_NOISE_DATA_URL}")`,
                zIndex: 0,
              }}
            />
          )}

          <div
            style={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              height: '100%',
            }}
          >
            <FlowChatToolbar
              compact={compact}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((o) => !o)}
            />

            {isDragging && (
              <div className="absolute inset-0 bg-primary-50/80 dark:bg-primary-900/30 z-50 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Icon name="Upload" className="h-10 w-10 text-primary-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-primary-700 dark:text-primary-200">Drop files here</p>
                  <p className="text-xs text-primary-500 dark:text-primary-400">AI will categorise and file them</p>
                </div>
              </div>
            )}
            {historyThreadLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-gray-900/60 text-sm text-gray-600 dark:text-gray-300">
                Loading conversation…
              </div>
            )}

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                width: '100%',
                minHeight: 0,
              }}
            >
              {!compact && showHome && (
                <div
                  style={{
                    maxWidth: 720,
                    margin: '0 auto',
                    padding: '24px 16px',
                    minHeight: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <FlowHomeScreen
                    firstName={firstName}
                    selectedThemeId={selectedTheme}
                    onSelectTheme={saveTheme}
                    sendMessage={sendMessage}
                    morningBriefing={morningBriefing}
                    morningBriefingLoading={morningBriefingLoading}
                    onOpenMorningBriefingChat={onOpenMorningBriefingChat}
                    inputSlot={
                      <FlowInputBar
                        {...inputBarProps}
                        showHome
                        embeddedInHome
                        maxWidthInner={640}
                      />
                    }
                  />
                </div>
              )}

              {(!showHome || compact) && (
                <FlowMessageList
                  compact={compact}
                  messages={messages}
                  loading={loading}
                  loadingMessage={loadingMessage}
                  isThinking={isThinking}
                  latestAssistantId={latestAssistantId}
                  expandedSteps={expandedSteps}
                  advisor={advisor}
                  setCurrentView={setCurrentView}
                  messagesEndRef={messagesEndRef}
                  toggleSteps={toggleSteps}
                  toggleChecklistItem={toggleChecklistItem}
                  handleChecklistExecute={handleChecklistExecute}
                  handleActionButton={handleActionButton}
                  sendMessage={sendMessage}
                  commitDocumentProposals={commitDocumentProposals}
                  filingCommittingId={filingCommittingId}
                />
              )}
            </div>

            {(!showHome || compact) && (
              <FlowInputBar {...inputBarProps} showHome={false} embeddedInHome={false} maxWidthInner={720} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowIntelligenceChat;
