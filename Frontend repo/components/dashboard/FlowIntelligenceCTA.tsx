import React from 'react';

export interface FlowIntelligenceCTAProps {
  onNavigate: () => void;
}

/**
 * Full-width banner CTA that navigates to Flow Intelligence chat.
 */
export const FlowIntelligenceCTA: React.FC<FlowIntelligenceCTAProps> = ({ onNavigate }) => (
  <>
    <style>{`
      @keyframes swoosh {
        0%   { transform: translateX(-100%) skewX(-15deg); opacity: 0; }
        20%  { opacity: 0.4; }
        80%  { opacity: 0.4; }
        100% { transform: translateX(400%) skewX(-15deg); opacity: 0; }
      }
    `}</style>
    <button
      type="button"
      onClick={onNavigate}
      className="w-full text-left border-none cursor-pointer transition-all duration-200 ease-in-out hover:scale-[1.005] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1117]"
      style={{
        position: 'relative',
        overflow: 'hidden',
        height: 56,
        borderRadius: 14,
        background: 'linear-gradient(135deg, #0F1117 0%, #1a1040 50%, #0F1117 100%)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: '30%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
          animation: 'swoosh 3s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      <div
        className="flex items-center gap-2 min-w-0 relative z-[1]"
        style={{
          color: '#ffffff',
          fontWeight: 500,
          fontSize: 14,
          opacity: 0.85,
        }}
      >
        <span aria-hidden className="flex-shrink-0">
          ✨
        </span>
        <span className="truncate">Ask Flow Intelligence anything...</span>
      </div>
      <span
        className="relative z-[1] flex-shrink-0 whitespace-nowrap rounded-full font-semibold text-white"
        style={{
          background: '#6366F1',
          fontSize: 13,
          padding: '6px 14px',
        }}
      >
        Ask now →
      </span>
    </button>
  </>
);
