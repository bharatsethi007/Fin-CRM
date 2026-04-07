import React, { useEffect, useRef } from 'react';
import { Icon } from '../common/Icon';
import { FI_ACCEPT } from './flowIntelligenceChatApi';
import type { Message, PendingConfirmation } from './flowIntelligenceChatTypes';

const DEFAULT_MAX_INNER = 720;

export interface FlowInputBarProps {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  pendingFiles: File[];
  pendingConfirmation: PendingConfirmation | null;
  suggestions: string[];
  compact: boolean;
  messages: Message[];
  setPendingConfirmation: (v: PendingConfirmation | null) => void;
  sendMessage: (text: string) => void;
  handleFilesSelected: (files: File[]) => void;
  removePendingFile: (index: number) => void;
  handleConfirmAction: () => void;
  /** Hero home: larger textarea padding/font; use with `embeddedInHome`. */
  showHome?: boolean;
  /** Home hero: no sticky / no bottom fade (input sits in scroll area). */
  embeddedInHome?: boolean;
  /** Inner column max width (default 720; home uses 640). */
  maxWidthInner?: number;
}

export const FlowInputBar: React.FC<FlowInputBarProps> = ({
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
  showHome = false,
  embeddedInHome = false,
  maxWidthInner = DEFAULT_MAX_INNER,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const innerMax = maxWidthInner ?? DEFAULT_MAX_INNER;

  return (
    <div
      style={{
        position: embeddedInHome ? 'relative' : 'sticky',
        bottom: embeddedInHome ? undefined : 0,
        width: '100%',
        boxSizing: 'border-box',
        flexShrink: 0,
        paddingTop: embeddedInHome ? 0 : 16,
      }}
      className={
        embeddedInHome
          ? ''
          : 'bg-[linear-gradient(to_bottom,transparent,white_35%)] dark:bg-[linear-gradient(to_bottom,transparent,rgb(3,7,18)_35%)]'
      }
    >
      <style>{`
        @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spinFast { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .fi-stream-cursor { animation: blink 1s step-end infinite; }
      `}</style>
      <div
        style={{
          maxWidth: innerMax,
          margin: '0 auto',
          paddingBottom: embeddedInHome ? 0 : compact ? 12 : 24,
          paddingLeft: 16,
          paddingRight: 16,
          boxSizing: 'border-box',
        }}
      >
        {pendingConfirmation && (
          <div
            style={{
              padding: '12px 16px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              margin: '8px 0',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 2px' }}>
                ⚠ Confirm Action: {(pendingConfirmation.action || 'action').replace(/_/g, ' ')}
              </p>
              <p style={{ fontSize: 11, color: '#78350f', margin: 0 }}>{pendingConfirmation.description}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPendingConfirmation(null)}
                style={{
                  fontSize: 11,
                  padding: '6px 14px',
                  borderRadius: 6,
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmAction()}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '6px 14px',
                  borderRadius: 6,
                  background: '#6366f1',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ✓ Confirm
              </button>
            </div>
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div className="px-1 py-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs"
              >
                <Icon name="FileText" className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-gray-600 dark:text-gray-300 max-w-[150px] truncate">{f.name}</span>
                <span className="text-gray-400">{(f.size / 1024).toFixed(0)}KB</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="text-gray-400 hover:text-red-500 p-0.5"
                  aria-label={`Remove ${f.name}`}
                >
                  <Icon name="X" className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end',
            border: '1.5px solid #e5e7eb',
            borderRadius: 16,
            padding: showHome ? '10px 12px 10px 16px' : '8px 8px 8px 16px',
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
          className="dark:bg-gray-900 dark:border-gray-700"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(input);
              }
            }}
            placeholder={compact ? 'Ask about this application…' : 'Ask me anything about your workdesk...'}
            rows={1}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              resize: 'none',
              fontSize: showHome ? 15 : 14,
              color: '#111827',
              fontFamily: 'system-ui, sans-serif',
              lineHeight: 1.5,
              minHeight: 44,
              maxHeight: 200,
              overflowY: 'auto',
              padding: showHome ? '14px 16px' : '6px 0',
              boxSizing: 'border-box',
            }}
            className="dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <label className="cursor-pointer p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors shrink-0 self-end mb-0.5">
            <input
              type="file"
              multiple
              accept={FI_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                if (list?.length) handleFilesSelected(Array.from(list));
                e.target.value = '';
              }}
            />
            <Icon name="Paperclip" className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </label>
          <button
            type="button"
            onClick={() => void sendMessage(input)}
            disabled={loading || (!input.trim() && pendingFiles.length === 0)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: input.trim() && !loading ? '#2563eb' : '#f3f4f6',
              border: 'none',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              flexShrink: 0,
              alignSelf: 'flex-end',
              marginBottom: showHome ? 4 : 0,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={input.trim() && !loading ? 'white' : '#9ca3af'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>

        {suggestions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0' }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void sendMessage(s)}
                style={{
                  fontSize: 11,
                  color: '#6366f1',
                  background: '#eef2ff',
                  border: '1px solid #c7d2fe',
                  borderRadius: 20,
                  padding: '5px 12px',
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {!compact && messages.length <= 1 && !embeddedInHome && (
          <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
            Flow Intelligence can make mistakes. Please check information.
          </p>
        )}
      </div>
    </div>
  );
};
