import React from 'react';
import { Icon } from '../common/Icon';
import type { ActionButton, ChecklistItem, DocumentFilingProposal } from './flowIntelligenceChatTypes';

export function ActionButtonsBlock({
  buttons,
  onAction,
}: {
  buttons: ActionButton[];
  onAction: (b: ActionButton) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 my-3">
      {buttons.map((btn) => (
        <button
          key={btn.id}
          type="button"
          onClick={() => onAction(btn)}
          disabled={btn.completed}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            btn.completed
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default'
              : btn.variant === 'primary'
                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
                : btn.variant === 'danger'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
          }`}
        >
          <span>{btn.completed ? '✓' : btn.icon || '⚡'}</span>
          {btn.label}
        </button>
      ))}
    </div>
  );
}

export function ChecklistBlock({
  checklist,
  title,
  onToggle,
  onExecute,
}: {
  checklist: ChecklistItem[];
  title?: string;
  onToggle: (id: string) => void;
  onExecute: (items: ChecklistItem[]) => void;
}) {
  const checkedCount = checklist.filter((c) => c.checked).length;
  return (
    <div className="my-3 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {title && (
        <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{title}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {checkedCount}/{checklist.length} selected
          </span>
        </div>
      )}
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {checklist.map((item) => (
          <label
            key={item.id}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => onToggle(item.id)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span
              className={`text-sm ${
                item.checked ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              {item.label}
            </span>
          </label>
        ))}
      </div>
      {checkedCount > 0 && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {checkedCount} item{checkedCount > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onExecute(checklist.filter((c) => c.checked))}
              className="px-4 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700"
            >
              Handle selected ({checkedCount})
            </button>
            <button
              type="button"
              onClick={() => onExecute(checklist)}
              className="px-4 py-1.5 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Handle all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentFilingBlock({
  proposals,
  committed,
  commitSummary,
  onConfirm,
  onEdit,
  confirming,
}: {
  proposals: DocumentFilingProposal[];
  committed?: boolean;
  commitSummary?: string;
  onConfirm: () => void;
  onEdit: () => void;
  confirming?: boolean;
}) {
  const ok = proposals.filter((p) => !p.error);
  const errCount = proposals.filter((p) => p.error).length;
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden my-3 mx-4">
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <Icon name="FileText" className="h-4 w-4 text-gray-500" />
        <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Document Filing</span>
      </div>
      {committed && commitSummary ? (
        <div className="px-4 py-3 text-sm text-green-700 dark:text-green-300 bg-green-50/80 dark:bg-green-900/20 whitespace-pre-wrap">
          {commitSummary}
        </div>
      ) : (
        <>
          {proposals.map((file, i) => (
            <div
              key={`${file.storage_path}-${i}`}
              className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{file.file_name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 shrink-0">
                  {file.detected_type || 'other'}
                </span>
              </div>
              {file.error ? (
                <p className="text-xs text-red-600 dark:text-red-400">{file.error}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <div>
                    Client: <strong className="text-gray-700 dark:text-gray-200">{file.suggested_client || '—'}</strong>
                  </div>
                  <div>
                    Application:{' '}
                    <strong className="text-gray-700 dark:text-gray-200">
                      {file.suggested_application || 'General'}
                    </strong>
                  </div>
                  <div>
                    Category:{' '}
                    <strong className="text-gray-700 dark:text-gray-200">{file.suggested_category || '—'}</strong>
                  </div>
                  <div>
                    Type: <strong className="text-gray-700 dark:text-gray-200">{file.detected_type || '—'}</strong>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {ok.length} document{ok.length !== 1 ? 's' : ''} ready to file
              {errCount > 0 ? ` · ${errCount} need attention` : ''}
            </span>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={onEdit}
                disabled={!!confirming || committed}
                className="px-3 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Edit assignments
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!!confirming || committed || ok.length === 0}
                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50"
              >
                {confirming ? 'Saving…' : '✓ Confirm & Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function EmailReviewBlock({
  email,
  onDiscuss,
}: {
  email: { to: string; subject: string; body: string };
  onDiscuss: () => void;
}) {
  return (
    <div className="my-3 mx-4 border border-indigo-200 dark:border-indigo-800 rounded-xl overflow-hidden bg-indigo-50/50 dark:bg-indigo-950/20">
      <div className="px-3 py-2 border-b border-indigo-100 dark:border-indigo-900 flex items-center gap-2">
        <Icon name="Mail" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">Email review</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 space-y-1">
        <p>
          <span className="text-gray-500">To:</span> {email.to}
        </p>
        <p>
          <span className="text-gray-500">Subject:</span> {email.subject}
        </p>
      </div>
      <div className="px-3 pb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(email.body)}
          className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Copy body
        </button>
        <button
          type="button"
          onClick={() =>
            window.open(
              `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`,
            )
          }
          className="text-xs px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Open in email client
        </button>
        <button
          type="button"
          onClick={onDiscuss}
          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Refine with AI
        </button>
      </div>
    </div>
  );
}
