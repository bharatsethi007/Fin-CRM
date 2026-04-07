import React from 'react';
import { FlowIntelligenceLogo } from '../common/FlowIntelligenceLogo';
import { MorningBriefingCard } from './MorningBriefingCard';
import { FI_THEMES, type FiTheme } from './fiThemes';
import type { MorningBriefing } from './flowIntelligenceChatTypes';

const HOME_CHIPS: { icon: string; label: string; prompt: string }[] = [
  { icon: '📋', label: 'Review pipeline', prompt: 'What applications need my attention today?' },
  { icon: '⚠️', label: 'Check compliance', prompt: 'Which applications have missing compliance items?' },
  { icon: '📊', label: 'Morning briefing', prompt: 'Give me my morning briefing' },
];

export interface FlowHomeScreenProps {
  firstName: string;
  selectedThemeId: string;
  onSelectTheme: (id: string) => void;
  inputSlot: React.ReactNode;
  sendMessage: (text: string) => void;
  morningBriefing?: MorningBriefing | null;
  morningBriefingLoading?: boolean;
  onOpenMorningBriefingChat?: (conversationId: string) => void;
}

/** Centered Flow Intelligence landing (logo, hero input, chips, theme picker). */
export function FlowHomeScreen({
  firstName,
  selectedThemeId,
  onSelectTheme,
  inputSlot,
  sendMessage,
  morningBriefing = null,
  morningBriefingLoading = false,
  onOpenMorningBriefingChat,
}: FlowHomeScreenProps) {
  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 720,
        margin: '0 auto',
        paddingBottom: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 32, width: '100%' }}>
        <div className="flex justify-center text-gray-900 dark:text-gray-100">
          <FlowIntelligenceLogo size="xl" showWordmark={false} />
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#111827',
            marginTop: 16,
            marginBottom: 0,
          }}
          className="dark:text-gray-100"
        >
          Hi {firstName}, how can I help?
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8, marginBottom: 0 }} className="dark:text-gray-400">
          Your AI mortgage workflow assistant
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 640, margin: '0 auto' }}>{inputSlot}</div>

      {morningBriefingLoading && !morningBriefing && (
        <div
          style={{
            maxWidth: 640,
            width: '100%',
            margin: '0 auto 16px',
            padding: '12px 16px',
            fontSize: 12,
            color: '#9ca3af',
            textAlign: 'center',
          }}
          className="dark:text-gray-500"
          aria-busy
        >
          Loading briefing…
        </div>
      )}

      {morningBriefing && onOpenMorningBriefingChat && (
        <MorningBriefingCard briefing={morningBriefing} onOpenConversation={onOpenMorningBriefingChat} />
      )}

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginTop: 20,
          maxWidth: 640,
          width: '100%',
          marginLeft: 'auto',
          marginRight: 'auto',
          justifyContent: 'center',
        }}
      >
        {HOME_CHIPS.map((chip) => (
          <button
            key={chip.prompt}
            type="button"
            onClick={() => void sendMessage(chip.prompt)}
            style={{
              flex: '1 1 160px',
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.8)',
              borderRadius: 12,
              padding: 14,
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
            className="dark:bg-white/10 dark:border-white/20"
          >
            <span style={{ fontSize: 18 }} aria-hidden>
              {chip.icon}
            </span>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 6, marginBottom: 0 }} className="dark:text-gray-200">
              {chip.label}
            </p>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 32, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 4 }} className="dark:text-gray-500">
          Background:
        </span>
        {FI_THEMES.map((t: FiTheme) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTheme(t.id)}
            title={t.name}
            aria-label={`Theme: ${t.name}`}
            aria-pressed={selectedThemeId === t.id}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: (t.gradient ?? '#f3f4f6') as string,
              border: selectedThemeId === t.id ? '2px solid #6366f1' : '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
              outline: 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}
