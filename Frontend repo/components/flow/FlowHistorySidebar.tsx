import React from 'react';
import type { FiConversationListItem } from './flowIntelligenceChatTypes';
import { formatRelativeTime } from './flowIntelligenceChatApi';

export interface FlowHistorySidebarProps {
  historyOpen: boolean;
  sidebarWidthPx: number;
  historyLoading: boolean;
  conversations: FiConversationListItem[];
  currentConversationId: string | null;
  startNewChat: () => void;
  selectConversation: (id: string) => void | Promise<void>;
}

/** Left conversation list panel (Claude-style fixed width or collapsed to 0). */
export function FlowHistorySidebar({
  historyOpen,
  sidebarWidthPx,
  historyLoading,
  conversations,
  currentConversationId,
  startNewChat,
  selectConversation,
}: FlowHistorySidebarProps) {
  return (
    <aside
      style={{
        width: historyOpen ? sidebarWidthPx : 0,
        flexShrink: 0,
        overflow: 'hidden',
        background: '#f9fafb',
        borderRight: historyOpen ? '1px solid #e5e7eb' : 'none',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.15s ease',
      }}
      className="dark:bg-gray-900/80 dark:border-gray-800"
      aria-hidden={!historyOpen}
    >
      {historyOpen && (
        <>
          <div
            style={{
              padding: 12,
              borderBottom: '1px solid #e5e7eb',
              flexShrink: 0,
            }}
            className="dark:border-gray-800"
          >
            <button
              type="button"
              onClick={startNewChat}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
              }}
              className="hover:bg-blue-700"
            >
              + New Chat
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 10px',
              minHeight: 0,
            }}
          >
            {historyLoading && <p className="text-[10px] text-gray-400 px-1 py-2">Loading…</p>}
            {!historyLoading &&
              conversations.map((c: FiConversationListItem) => {
                const active = c.id === currentConversationId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void selectConversation(c.id)}
                    className={`w-full text-left rounded-lg px-2 py-1.5 mb-0.5 transition-colors ${
                      active
                        ? 'bg-primary-100 dark:bg-primary-900/50 ring-1 ring-primary-300 dark:ring-primary-700'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">
                      {(c.title || 'Chat').slice(0, 80)}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {formatRelativeTime(c.last_message_at)}
                    </p>
                  </button>
                );
              })}
            {!historyLoading && conversations.length === 0 && (
              <p className="text-[10px] text-gray-400 px-1 py-2">No past chats yet.</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
