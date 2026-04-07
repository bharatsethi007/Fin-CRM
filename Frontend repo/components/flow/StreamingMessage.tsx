import React from 'react';
import { useStreamingText } from './useStreamingText';

interface StreamingMessageProps {
  content: string;
  isNew: boolean;
  renderMarkdown: (text: string) => string;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({ content, isNew, renderMarkdown }) => {
  const { displayed, isComplete } = useStreamingText(content, isNew);

  return (
    <div className="px-4 py-3 text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed [&_ul]:pl-4 [&_a]:text-primary-600 [&_a]:underline flex gap-1 items-stretch">
      <div
        className="flex-1 min-w-0"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(displayed) }}
      />
      {isNew && !isComplete && (
        <span
          className="fi-stream-cursor mt-0.5 inline-block w-0.5 shrink-0 self-stretch min-h-[1em] rounded-sm bg-primary-600 dark:bg-primary-400"
          aria-hidden
        />
      )}
    </div>
  );
};
