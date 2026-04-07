import React from 'react';

interface Props {
  /** sm/md/lg/xl — xl ≈ 64px mark height for hero home. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
}

export const FlowIntelligenceLogo: React.FC<Props> = ({ size = 'md', showWordmark = true }) => {
  const scale = size === 'sm' ? 0.5 : size === 'lg' ? 1.5 : size === 'xl' ? 1.6 : 1;
  const h = 40 * scale;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 * scale }}>
      {/* FI Mark — bold F with slashed I */}
      <svg width={h * 1.4} height={h} viewBox="0 0 56 40" fill="none">
        {/* F */}
        <path d="M4 2 L4 38 L12 38 L12 24 L28 24 L28 17 L12 17 L12 10 L32 10 L32 2 Z" fill="currentColor" />
        {/* I with diagonal slash — two segments */}
        <path d="M38 2 L46 2 L46 14 Z" fill="currentColor" />
        <path d="M38 26 L46 14 L46 38 L38 38 Z" fill="currentColor" />
      </svg>
      {showWordmark && (
        <span
          style={{
            fontFamily: 'var(--font-sans, sans-serif)',
            fontWeight: 700,
            fontSize: 18 * scale,
            letterSpacing: '-0.02em',
            color: 'currentColor',
          }}
        >
          Flow Intelligence
        </span>
      )}
    </div>
  );
};

