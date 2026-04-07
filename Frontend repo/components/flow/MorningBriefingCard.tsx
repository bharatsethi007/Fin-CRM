import React, { useState } from 'react';
import type { MorningBriefing } from './flowIntelligenceChatTypes';

export interface MorningBriefingCardProps {
  briefing: MorningBriefing;
  onOpenConversation: (conversationId: string) => void;
}

/** Pre-generated morning briefing preview with expand and “continue in chat”. */
export const MorningBriefingCard: React.FC<MorningBriefingCardProps> = ({
  briefing,
  onOpenConversation,
}) => {
  const [expanded, setExpanded] = useState(false);

  const preview = briefing.content.slice(0, 300);
  const isLong = briefing.content.length > 300;
  const displayText = expanded ? briefing.content : preview + (isLong ? '...' : '');

  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto 24px',
        background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
        border: '1px solid #c7d2fe',
        borderRadius: 16,
        overflow: 'hidden',
      }}
      className="dark:border-indigo-800"
    >
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid #c7d2fe',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        className="dark:border-indigo-800"
      >
        <span style={{ fontSize: 16 }} aria-hidden>
          ☀️
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#4338ca' }} className="dark:text-indigo-200">
          Morning Briefing
        </span>
        <span style={{ fontSize: 11, color: '#6366f1', marginLeft: 'auto' }} className="dark:text-indigo-300">
          {new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div style={{ padding: '16px 20px' }}>
        <p
          style={{
            fontSize: 13,
            color: '#374151',
            lineHeight: 1.7,
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}
          className="dark:text-gray-200"
        >
          {displayText}
        </p>

        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              marginTop: 8,
              fontSize: 12,
              color: '#6366f1',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontWeight: 600,
            }}
            className="dark:text-indigo-300"
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid #c7d2fe',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
        className="dark:border-indigo-800"
      >
        <button
          type="button"
          onClick={() => onOpenConversation(briefing.conversation_id)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'white',
            background: '#6366f1',
            border: 'none',
            borderRadius: 8,
            padding: '6px 14px',
            cursor: 'pointer',
          }}
          className="dark:bg-indigo-600"
        >
          Continue in chat →
        </button>
        <span style={{ fontSize: 11, color: '#6b7280' }} className="dark:text-gray-400">
          AI-generated · Updates daily at 7am
        </span>
      </div>
    </div>
  );
};
