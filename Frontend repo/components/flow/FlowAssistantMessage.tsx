import React from 'react';
import { Icon } from '../common/Icon';
import { StreamingMessage } from './StreamingMessage';
import {
  ActionButtonsBlock,
  ChecklistBlock,
  DocumentFilingBlock,
  EmailReviewBlock,
} from './FlowChatBlocks';
import { renderToolResult } from './FlowChatToolResults';
import {
  formatArgValue,
  formatToolName,
  getDraftEmailFields,
  renderMarkdown,
  toolResultHasError,
} from './flowIntelligenceChatLib';
import type {
  ActionButton,
  ChecklistItem,
  DocumentFilingProposal,
  Message,
} from './flowIntelligenceChatTypes';

type FlowAssistantMessageProps = {
  msg: Message;
  isThinking: boolean;
  latestAssistantId: string | null;
  expandedSteps: Record<string, boolean>;
  filingCommittingId: string | null;
  setCurrentView: (view: string) => void;
  toggleSteps: (id: string) => void;
  toggleChecklistItem: (msgId: string, itemId: string) => void;
  handleChecklistExecute: (items: ChecklistItem[]) => void;
  handleActionButton: (msgId: string, btn: ActionButton) => void;
  sendMessage: (text: string) => void;
  commitDocumentProposals: (msgId: string, proposals: DocumentFilingProposal[]) => void;
};

export function FlowAssistantMessage({
  msg,
  isThinking,
  latestAssistantId,
  expandedSteps,
  filingCommittingId,
  setCurrentView,
  toggleSteps,
  toggleChecklistItem,
  handleChecklistExecute,
  handleActionButton,
  sendMessage,
  commitDocumentProposals,
}: FlowAssistantMessageProps) {
  return (
    <div style={{ display: 'flex', gap: 12, maxWidth: '100%', minWidth: 0, flex: 1 }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          flexShrink: 0,
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
        <div style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: 'white' }} />
        <svg style={{ position: 'relative', zIndex: 10, width: 20, height: 16 }} viewBox="0 0 56 40" fill="#4f46e5">
          <path d="M4 2 L4 38 L12 38 L12 24 L28 24 L28 17 L12 17 L12 10 L32 10 L32 2 Z" />
          <path d="M38 2 L50 2 L50 16 Z" />
          <path d="M38 24 L50 16 L50 38 L38 38 Z" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {msg.summary && (
          <div className="flex items-center gap-2 flex-wrap pb-3 mb-2 border-b border-gray-100 dark:border-gray-800">
            <span style={{ fontSize: 14 }} aria-hidden>
              ✨
            </span>
            <p className="text-[13px] text-indigo-900 dark:text-indigo-200 font-medium m-0 flex-1 min-w-0">
              {msg.summary}
            </p>
            {msg.badge ? (
              <span
                className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white bg-indigo-600"
              >
                {msg.badge}
              </span>
            ) : null}
          </div>
        )}
        {msg.items && msg.items.length > 0 && (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {msg.items.map((item: any, idx: number) => (
              <div
                key={item.id || idx}
                style={{
                  padding: '12px 16px',
                  borderBottom: idx < msg.items!.length - 1 ? '1px solid #f3f4f6' : 'none',
                  borderLeft: `4px solid ${
                    item.priority === 'urgent' ? '#ef4444' : item.priority === 'high' ? '#f59e0b' : '#6366f1'
                  }`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 2px 0' }}>{item.title}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{item.detail}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {item.actionLabel && (
                    <button
                      type="button"
                      onClick={() => item.actionTarget && setCurrentView(item.actionTarget)}
                      style={{
                        fontSize: 11,
                        color: '#6366f1',
                        fontWeight: 600,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {item.actionLabel} →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {msg.actions_taken && msg.actions_taken.length > 0 && (
          <div className="mb-3 px-4 pt-3">
            <button
              type="button"
              onClick={() => toggleSteps(msg.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <Icon
                name={expandedSteps[msg.id] ? 'ChevronDown' : 'ChevronRight'}
                className="h-3.5 w-3.5"
              />
              <span>
                {msg.actions_taken.length} step{msg.actions_taken.length > 1 ? 's' : ''} taken
              </span>
            </button>
            {expandedSteps[msg.id] && (
              <div className="mt-2 ml-2 border-l-2 border-blue-200 dark:border-blue-800 pl-3 space-y-2">
                {msg.actions_taken.map((action, i) => (
                  <div key={i} className="text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                      <span className="w-4 h-4 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-600 dark:text-green-400 text-[10px]">
                        ✓
                      </span>
                      {formatToolName(action.tool)}
                    </div>
                    {action.args && Object.keys(action.args).length > 0 && (
                      <div className="mt-0.5 text-gray-400 dark:text-gray-500 ml-6">
                        {Object.entries(action.args)
                          .map(([k, v]) => `${k}: ${formatArgValue(v)}`)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {msg.actions_taken?.some((a) => toolResultHasError(a.result)) && (
          <div className="mx-4 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg my-2 text-sm text-amber-700 dark:text-amber-300">
            <span aria-hidden>⚠</span>
            <span>Some actions couldn&apos;t complete. The AI will explain what went wrong above.</span>
          </div>
        )}
        {msg.actions_taken?.map((action, i) => {
          const card = renderToolResult(action.tool, action.result);
          return card ? (
            <div key={`result-${msg.id}-${i}`} className="mx-4">
              {card}
            </div>
          ) : null;
        })}
        {msg.interactive?.map((block, i) => {
          if (block.type === 'checklist' && block.checklist) {
            return (
              <div key={`ib-${msg.id}-${i}`} className="mx-4">
                <ChecklistBlock
                  checklist={block.checklist}
                  title={block.title}
                  onToggle={(id) => toggleChecklistItem(msg.id, id)}
                  onExecute={handleChecklistExecute}
                />
              </div>
            );
          }
          if (block.type === 'action_buttons' && block.buttons) {
            return (
              <div key={`ib-${msg.id}-${i}`} className="mx-4">
                <ActionButtonsBlock
                  buttons={block.buttons}
                  onAction={(b) => handleActionButton(msg.id, b)}
                />
              </div>
            );
          }
          if (block.type === 'email_review' && block.email) {
            return (
              <div key={`ib-${msg.id}-${i}`} className="mx-4">
                <EmailReviewBlock
                  email={block.email}
                  onDiscuss={() =>
                    void sendMessage(
                      `Please refine this email (subject: "${block.email?.subject ?? ''}"). Improve tone, clarity, or content as needed.`,
                    )
                  }
                />
              </div>
            );
          }
          if (block.type === 'document_filing' && block.documentFiling?.proposals) {
            return (
              <div key={`ib-${msg.id}-${i}`} className="mx-4">
                <DocumentFilingBlock
                  proposals={block.documentFiling.proposals}
                  committed={block.documentFiling.committed}
                  commitSummary={block.documentFiling.commitSummary}
                  confirming={filingCommittingId === msg.id}
                  onConfirm={() =>
                    void commitDocumentProposals(msg.id, block.documentFiling!.proposals!)
                  }
                  onEdit={() =>
                    void sendMessage(
                      `Please revise the document filing suggestions for: ${block
                        .documentFiling!.proposals!.map((p) => p.file_name)
                        .join(', ')}. Ask me for the correct client, application, or category.`,
                    )
                  }
                />
              </div>
            );
          }
          return null;
        })}
        {msg.actions_taken?.some((a) => a.tool === 'draft_email') &&
          !msg.interactive?.some((b) => b.type === 'email_review') && (
          <div className="mt-3 mx-4 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <Icon name="Mail" className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Email Draft</span>
            </div>
            {msg.actions_taken
              .filter((a) => a.tool === 'draft_email')
              .map((a, i) => {
                const draft = getDraftEmailFields(a);
                return (
                  <div key={i} className="px-4 py-3 space-y-1 border-t border-gray-100 dark:border-gray-700 first:border-t-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      To: {draft.to_name || '—'}{' '}
                      {draft.to_email ? (
                        <>
                          {'<'}
                          {draft.to_email}
                          {'>'}
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      Subject: {draft.subject || '—'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mt-2">
                      {draft.body || '—'}
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(draft.body || '')}
                        className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        Copy to clipboard
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `mailto:${encodeURIComponent(draft.to_email || '')}?subject=${encodeURIComponent(draft.subject || '')}&body=${encodeURIComponent(draft.body || '')}`,
                          )
                        }
                        className="text-xs px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        Open in email client
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        {msg.content && (
          <StreamingMessage
            content={msg.content}
            isNew={msg.id === latestAssistantId}
            renderMarkdown={renderMarkdown}
          />
        )}
        <div
          className="mt-2 text-[11px] text-gray-400 dark:text-gray-500"
          style={{ padding: 0 }}
        >
          {msg.timestamp.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
