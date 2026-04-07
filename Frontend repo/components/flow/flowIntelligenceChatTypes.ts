/** Shared types for Flow Intelligence chat (extracted from FlowIntelligenceChat). */

export type AttachedFileMeta = {
  name: string;
  type: string;
  size: number;
  storage_path: string;
  url: string;
  file_hash?: string;
};

export type DocumentFilingProposal = {
  file_name: string;
  storage_path: string;
  public_url?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  file_hash?: string | null;
  client_id?: string;
  application_id?: string | null;
  suggested_client?: string;
  suggested_application?: string | null;
  suggested_category?: string;
  detected_type?: string;
  confidence_note?: string | null;
  error?: string;
};

export interface ActionButton {
  id: string;
  label: string;
  action: string;
  args: Record<string, unknown>;
  variant: 'primary' | 'secondary' | 'danger';
  icon?: string;
  completed?: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  action?: string;
  args?: Record<string, unknown>;
}

export interface InteractiveBlock {
  type: 'action_buttons' | 'checklist' | 'confirmation' | 'email_review' | 'document_filing';
  title?: string;
  buttons?: ActionButton[];
  checklist?: ChecklistItem[];
  email?: { to: string; subject: string; body: string };
  documentFiling?: {
    proposals: DocumentFilingProposal[];
    committed?: boolean;
    commitSummary?: string;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions_taken?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  interactive?: InteractiveBlock[];
  isThinking?: boolean;
  responseType?: 'tasks' | 'applications' | 'compliance' | 'news' | 'email' | 'general';
  items?: any[];
  summary?: string;
  badge?: number;
  agentData?: Record<string, unknown>;
}

export interface PendingConfirmation {
  message_id: string;
  action?: string | null;
  description?: string;
}

export interface FiConversationListItem {
  id: string;
  title: string | null;
  last_message_at: string | null;
}

/** Pre-generated morning briefing row for the FI home card. */
export interface MorningBriefing {
  conversation_id: string;
  content: string;
  title: string;
}

export interface FlowIntelligenceChatProps {
  advisor: any;
  firmId: string;
  setCurrentView: (view: string) => void;
  contextApplicationId?: string | null;
  compact?: boolean;
  /** Called with `sendMessage` so parents can prefill (e.g. sessionStorage). */
  onSendReady?: (send: (text: string) => void) => void;
  /** When set, chat opens this conversation once then parent should clear via `onInitialConversationConsumed`. */
  initialConversationId?: string | null;
  onInitialConversationConsumed?: () => void;
  /** Today’s cached briefing for the home screen (full page only). */
  morningBriefing?: MorningBriefing | null;
  morningBriefingLoading?: boolean;
  onOpenMorningBriefingChat?: (conversationId: string) => void;
}
