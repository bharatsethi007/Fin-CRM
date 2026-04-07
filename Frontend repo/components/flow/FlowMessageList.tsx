import React from 'react';
import { FlowAssistantMessage } from './FlowAssistantMessage';
import { STATUS_MESSAGES } from './flowIntelligenceChatApi';
import type { ActionButton, ChecklistItem, DocumentFilingProposal, Message } from './flowIntelligenceChatTypes';

export interface FlowMessageListProps {
  messages: Message[];
  loading: boolean;
  loadingMessage: string;
  isThinking: boolean;
  latestAssistantId: string | null;
  expandedSteps: Record<string, boolean>;
  advisor: any;
  setCurrentView: (view: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  toggleSteps: (id: string) => void;
  toggleChecklistItem: (msgId: string, itemId: string) => void;
  handleChecklistExecute: (items: ChecklistItem[]) => void;
  handleActionButton: (msgId: string, btn: ActionButton) => void;
  sendMessage: (text: string) => void;
  commitDocumentProposals: (msgId: string, proposals: DocumentFilingProposal[]) => void;
  filingCommittingId: string | null;
  compact?: boolean;
}

export const FlowMessageList: React.FC<FlowMessageListProps> = ({
  messages,
  loading,
  loadingMessage,
  isThinking,
  latestAssistantId,
  expandedSteps,
  advisor,
  setCurrentView,
  messagesEndRef,
  toggleSteps,
  toggleChecklistItem,
  handleChecklistExecute,
  handleActionButton,
  sendMessage,
  commitDocumentProposals,
  filingCommittingId,
  compact = false,
}) => {
  return (
    <>
      <style>{`
        @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spinFast { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: compact ? '16px 12px' : '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxSizing: 'border-box',
        }}
      >
      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            gap: 12,
            width: '100%',
          }}
        >
          {msg.role === 'assistant' && (
            <FlowAssistantMessage
              msg={msg}
              isThinking={isThinking}
              latestAssistantId={latestAssistantId}
              expandedSteps={expandedSteps}
              filingCommittingId={filingCommittingId}
              setCurrentView={setCurrentView}
              toggleSteps={toggleSteps}
              toggleChecklistItem={toggleChecklistItem}
              handleChecklistExecute={handleChecklistExecute}
              handleActionButton={handleActionButton}
              sendMessage={sendMessage}
              commitDocumentProposals={commitDocumentProposals}
            />
          )}
          {msg.role === 'user' && (
            <>
              <div
                style={{
                  maxWidth: '75%',
                  padding: '12px 16px',
                  borderRadius: '18px 18px 4px 18px',
                  background: '#2563eb',
                  color: 'white',
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                  {msg.timestamp.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#6366f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 4,
                  fontSize: 12,
                  color: 'white',
                  fontWeight: 600,
                }}
              >
                {advisor?.name?.charAt(0) || 'A'}
              </div>
            </>
          )}
        </div>
      ))}
      {loading && (
        <div className="flex items-start gap-3 w-full">
          <div
            style={{
              position: 'relative',
              width: 36,
              height: 36,
              flexShrink: 0,
              marginTop: 4,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background:
                  'conic-gradient(from 0deg, #6366f1, #8b5cf6, #3b82f6, #06b6d4, #6366f1)',
                animation: isThinking ? 'spinFast 0.8s linear infinite' : 'spinSlow 3s linear infinite',
              }}
            />
            <div
              style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: 'white' }}
              className="dark:bg-gray-900"
            />
            <svg
              style={{
                position: 'absolute',
                zIndex: 10,
                width: 20,
                height: 16,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
              viewBox="0 0 56 40"
              fill="#4f46e5"
            >
              <path d="M4 2 L4 38 L12 38 L12 24 L28 24 L28 17 L12 17 L12 10 L32 10 L32 2 Z" />
              <path d="M38 2 L50 2 L50 16 Z" />
              <path d="M38 24 L50 16 L50 38 L38 38 Z" />
            </svg>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 pt-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
            <span className="animate-pulse">{loadingMessage || STATUS_MESSAGES[0]}</span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
      </div>
    </>
  );
};
