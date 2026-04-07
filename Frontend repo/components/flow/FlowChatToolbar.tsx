import React from 'react';
import { Icon } from '../common/Icon';

export interface FlowChatToolbarProps {
  compact: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
}

/** Top bar with menu control for conversation history (Claude-style). */
export function FlowChatToolbar({ compact, historyOpen, onToggleHistory }: FlowChatToolbarProps) {
  return (
    <div
      style={{
        flexShrink: 0,
        height: compact ? 44 : 48,
        display: 'flex',
        alignItems: 'center',
        padding: compact ? '0 4px 0 8px' : '0 12px 0 16px',
        borderBottom: '1px solid #e5e7eb',
        background: compact ? '#ffffff' : 'rgba(255,255,255,0.88)',
        backdropFilter: compact ? undefined : 'blur(10px)',
        WebkitBackdropFilter: compact ? undefined : 'blur(10px)',
      }}
      className="dark:border-gray-800 dark:bg-gray-950/90"
    >
      <button
        type="button"
        onClick={onToggleHistory}
        aria-label={historyOpen ? 'Close conversation history' : 'Open conversation history'}
        title={historyOpen ? 'Hide chats' : 'Show chats'}
        style={{
          padding: 8,
          marginLeft: compact ? 0 : -4,
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: '#374151',
        }}
        className="hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-300"
      >
        <Icon name="Menu" className="h-5 w-5" />
      </button>
    </div>
  );
}
