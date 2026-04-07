import type {
  DocumentFilingProposal,
  InteractiveBlock,
  Message,
} from './flowIntelligenceChatTypes';

export function formatToolName(tool: string): string {
  const names: Record<string, string> = {
    search_clients: '🔍 Searched clients',
    search_applications: '🔍 Searched applications',
    get_client_details: '📋 Retrieved client details',
    draft_email: '✉️ Drafted email',
    create_task: '✅ Created task',
    create_client: '👤 Created client',
    create_application: '📄 Created application',
    process_document: '📎 Proposed document filing',
  };
  return names[tool] || `⚡ ${tool.replace(/_/g, ' ')}`;
}

/** Normalises Edge Function `actions_taken`; always returns an array (empty if missing). */
export function parseActionsTaken(raw: unknown): NonNullable<Message['actions_taken']> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<Message['actions_taken']> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.tool !== 'string') continue;
    const args = o.args;
    const argsRecord =
      args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};
    out.push({ tool: o.tool, args: argsRecord, result: o.result });
  }
  return out;
}

type DraftEmailFields = {
  to_name?: string;
  to_email?: string;
  subject?: string;
  body?: string;
};

/** Tool args and/or `result.draft` from executeBuiltInTool (draft_email). */
export function getDraftEmailFields(action: {
  args: Record<string, unknown>;
  result: unknown;
}): DraftEmailFields {
  const a = action.args;
  const fromArgs: DraftEmailFields = {
    to_name: typeof a.to_name === 'string' ? a.to_name : undefined,
    to_email: typeof a.to_email === 'string' ? a.to_email : undefined,
    subject: typeof a.subject === 'string' ? a.subject : undefined,
    body: typeof a.body === 'string' ? a.body : undefined,
  };
  const r = action.result;
  if (r && typeof r === 'object' && r !== null && 'draft' in r) {
    const d = (r as { draft?: Record<string, unknown> }).draft;
    if (d && typeof d === 'object') {
      return {
        to_name: (typeof d.to_name === 'string' ? d.to_name : fromArgs.to_name) ?? fromArgs.to_name,
        to_email: (typeof d.to_email === 'string' ? d.to_email : fromArgs.to_email) ?? fromArgs.to_email,
        subject: (typeof d.subject === 'string' ? d.subject : fromArgs.subject) ?? fromArgs.subject,
        body: (typeof d.body === 'string' ? d.body : fromArgs.body) ?? fromArgs.body,
      };
    }
  }
  return fromArgs;
}

function draftActionToReviewEmail(action: {
  args: Record<string, unknown>;
  result: unknown;
}): { to: string; subject: string; body: string } {
  const d = getDraftEmailFields(action);
  const to =
    d.to_name && d.to_email
      ? `${d.to_name} <${d.to_email}>`
      : d.to_email || d.to_name || '—';
  return {
    to,
    subject: d.subject || '—',
    body: d.body || '',
  };
}

export function buildDocumentFilingInteractiveBlock(
  actionsTaken: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> | undefined,
): InteractiveBlock | null {
  const safeActions = actionsTaken ?? [];
  const pd = safeActions.find((a) => a.tool === 'process_document');
  if (!pd) return null;
  const r = pd.result;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const rec = r as Record<string, unknown>;
  if (rec.mode !== 'propose' || !Array.isArray(rec.proposals)) return null;
  const proposals = rec.proposals as DocumentFilingProposal[];
  if (proposals.length === 0) return null;
  return {
    type: 'document_filing',
    documentFiling: { proposals },
  };
}

export function generateInteractiveBlocks(
  message: string,
  actionsTaken: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> | undefined,
): InteractiveBlock[] {
  const blocks: InteractiveBlock[] = [];
  const safeActions = actionsTaken ?? [];

  const taskMatches = message.match(/\d+\.\s+(.+?)(?:\(Due:|$)/gm);
  if (taskMatches && taskMatches.length >= 2) {
    blocks.push({
      type: 'checklist',
      title: 'Action Items',
      checklist: taskMatches.map((t, i) => ({
        id: `task-${i}`,
        label: t.replace(/^\d+\.\s+/, '').replace(/\(Due:.*$/m, '').trim(),
        checked: false,
      })),
    });
  }

  const emailActions = safeActions.filter((a) => a.tool === 'draft_email');
  for (const ea of emailActions) {
    blocks.push({
      type: 'email_review',
      email: draftActionToReviewEmail(ea),
    });
  }

  if (message.includes('Would you like me to') || message.includes('Shall I')) {
    blocks.push({
      type: 'action_buttons',
      buttons: [
        {
          id: 'proceed',
          label: 'Yes, proceed',
          action: 'confirm',
          args: {},
          variant: 'primary',
          icon: '✓',
        },
        {
          id: 'skip',
          label: 'Skip for now',
          action: 'skip',
          args: {},
          variant: 'secondary',
          icon: '→',
        },
      ],
    });
  }

  return blocks;
}

export function formatArgValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Escape raw HTML before markdown so echoed `<tags>` cannot execute. */
function escapeHtmlForMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(text: string): string {
  const t = escapeHtmlForMarkdown(text);
  return t
    .replace(/### (.*?)$/gm, '<h3 class="text-sm font-bold mt-3 mb-1">$1</h3>')
    .replace(/## (.*?)$/gm, '<h3 class="text-sm font-bold mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*?)$/gm, '<li class="ml-4 text-sm">$1</li>')
    .replace(/^(\d+)\. (.*?)$/gm, '<li class="ml-4 text-sm">$1. $2</li>')
    .replace(/(<li.*?<\/li>\n?)+/g, '<ul class="list-disc space-y-0.5 my-1">$&</ul>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

export function getToolResultRecord(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  return result as Record<string, unknown>;
}

export function toolResultHasError(result: unknown): boolean {
  const r = getToolResultRecord(result);
  return r != null && r.error != null && String(r.error).length > 0;
}
