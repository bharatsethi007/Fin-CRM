/** Fallback when `ai_skill_presets` is empty or unavailable */
export const FALLBACK_AI_SKILL_PRESETS: Array<{
  skill_type: string;
  skill_name: string;
  description: string;
  icon_emoji: string;
}> = [
  {
    skill_type: 'soa_style',
    skill_name: 'Statement of Advice style',
    description: 'Tone, structure, and disclosures for SOAs.',
    icon_emoji: '📋',
  },
  {
    skill_type: 'disclosure_template',
    skill_name: 'Disclosure templates',
    description: 'Regulatory disclosure wording and layout.',
    icon_emoji: '🛡️',
  },
  {
    skill_type: 'needs_objectives_style',
    skill_name: 'Needs & objectives',
    description: 'How you document client goals and needs.',
    icon_emoji: '🎯',
  },
  {
    skill_type: 'client_email_tone',
    skill_name: 'Client emails',
    description: 'Email tone, greetings, and sign-offs.',
    icon_emoji: '✉️',
  },
  {
    skill_type: 'lender_knowledge',
    skill_name: 'Lender knowledge',
    description: 'Policies, criteria, and lender-specific notes.',
    icon_emoji: '🏦',
  },
  {
    skill_type: 'cover_letter_style',
    skill_name: 'Cover letters',
    description: 'Intro letters to lenders or third parties.',
    icon_emoji: '📝',
  },
  {
    skill_type: 'compliance_notes',
    skill_name: 'Compliance notes',
    description: 'Mandatory statements and prohibited language.',
    icon_emoji: '⚖️',
  },
];

export type AiDefaultTone = 'Professional' | 'Friendly' | 'Formal' | 'Conversational' | 'Technical';

export const AI_DEFAULT_TONES: AiDefaultTone[] = [
  'Professional',
  'Friendly',
  'Formal',
  'Conversational',
  'Technical',
];
