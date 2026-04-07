import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { sha256HexFromFile } from '../../utils/fileHash';
import { authService, crmService } from '../../services/api';
import type { AttachedFileMeta, FiConversationListItem, Message } from './flowIntelligenceChatTypes';

/** Edge Functions ~60s max; 45s leaves room for cold starts */
export const FLOW_INTELLIGENCE_AGENT_TIMEOUT_MS = 45_000;

export const MAX_FI_MESSAGES = 48;
export const MAX_FI_MSG_CHARS = 8000;

export const FI_ACCEPT =
  '.pdf,.csv,.jpg,.jpeg,.png,.doc,.docx,application/pdf,text/csv,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const STATUS_MESSAGES = ['Thinking...', 'Analysing your request...', 'Almost there...'] as const;

export async function uploadFileToFlowStaging(
  file: File,
  firmId: string,
  advisorId: string,
): Promise<AttachedFileMeta> {
  const file_hash = await sha256HexFromFile(file);
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storage_path = `${firmId}/flow-intelligence/${advisorId}/${Date.now()}_${safe}`;
  const { error: uploadError } = await supabase.storage.from('documents').upload(storage_path, file);
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storage_path);
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    storage_path,
    url: urlData.publicUrl,
    file_hash,
  };
}

export function summarizeCrmForFlowIntelligence(
  data: Awaited<ReturnType<typeof crmService.getAllDataForAI>>,
  brokerName: string,
  firmName: string,
): string {
  const leads = data.leads ?? [];
  const applications = data.applications ?? [];
  const tasks = data.tasks ?? [];
  const lines: string[] = [
    `Broker: ${brokerName}`,
    `Firm: ${firmName}`,
    `Counts — clients/leads: ${leads.length}, applications: ${applications.length}, tasks: ${tasks.length}`,
    '',
    'Clients (name | email | phone):',
  ];
  for (const l of leads.slice(0, 45)) {
    const row = l as { name?: string; email?: string; phone?: string };
    lines.push(`- ${row.name || 'Unnamed'} | ${row.email || '—'} | ${row.phone || '—'}`);
  }
  lines.push('', 'Applications (ref | client | status | loan | lender):');
  for (const a of applications.slice(0, 45)) {
    const app = a as {
      referenceNumber?: string;
      id?: string;
      clientName?: string;
      status?: string;
      loanAmount?: number;
      lender?: string;
    };
    lines.push(
      `- ${app.referenceNumber || app.id || '—'} | ${app.clientName || '—'} | ${String(app.status ?? '—')} | $${
        app.loanAmount ?? 0
      } | ${app.lender || '—'}`,
    );
  }
  lines.push('', 'Tasks (sample):');
  for (const t of tasks.slice(0, 30)) {
    const task = t as { title?: string; dueDate?: string; isCompleted?: boolean };
    lines.push(`- ${task.title || 'Task'} | due ${task.dueDate || '—'} | ${task.isCompleted ? 'done' : 'open'}`);
  }
  return lines.join('\n').slice(0, 28_000);
}

export function messagesToAgentPayload(
  thread: Message[],
): { role: 'user' | 'assistant'; content: string }[] {
  return thread
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: (m.content || '').slice(0, MAX_FI_MSG_CHARS),
    }))
    .slice(-MAX_FI_MESSAGES);
}

export function raceWithTimeout<T>(promise: Promise<T>): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), FLOW_INTELLIGENCE_AGENT_TIMEOUT_MS),
  );
  return Promise.race([promise, timeout]);
}

/** Cycles status text every 5s; call returned cleanup in finally */
export function startLoadingStatusCycle(setLoadingMessage: (msg: string) => void): () => void {
  let statusIndex = 0;
  setLoadingMessage(STATUS_MESSAGES[0]);
  const statusInterval = setInterval(() => {
    statusIndex = (statusIndex + 1) % STATUS_MESSAGES.length;
    setLoadingMessage(STATUS_MESSAGES[statusIndex]);
  }, 5000);
  return () => {
    clearInterval(statusInterval);
    setLoadingMessage('');
  };
}

export function buildWelcomeMessage(advisor: { name?: string } | null | undefined): Message {
  const hour = new Date().getHours();
  const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const first = advisor?.name?.split(' ')?.[0] || 'there';
  return {
    id: `welcome-${Date.now()}`,
    role: 'assistant',
    content: `Good ${tod}, ${first}. I am Flow Intelligence — your AI-powered mortgage workflow assistant. I can help you manage applications, stay compliant, and know what to focus on. What would you like to know?`,
    timestamp: new Date(),
  };
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const sec = Math.floor((now - d.getTime()) / 1000);
  if (sec < 45) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 7200) return '1 hour ago';
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (d >= startOfToday) {
    return d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
  }
  if (d >= startOfYesterday) return 'Yesterday';
  const days = Math.floor(sec / 86400);
  if (days < 7) return `${days} days ago`;
  const y = d.getFullYear();
  const cy = new Date().getFullYear();
  return d.toLocaleDateString('en-NZ', {
    month: 'short',
    day: 'numeric',
    ...(y !== cy ? { year: 'numeric' } : {}),
  });
}

export async function fetchFiConversationsForAdvisor(
  advisorId: string,
  firmId: string,
): Promise<FiConversationListItem[]> {
  const { data, error } = await supabase
    .from('fi_conversations')
    .select('id, title, last_message_at')
    .eq('advisor_id', advisorId)
    .eq('firm_id', firmId)
    .order('last_message_at', { ascending: false })
    .limit(20);

  if (error) {
    logger.warn('fi_conversations load failed', error);
    return [];
  }
  return (data ?? []) as FiConversationListItem[];
}

export async function fetchFiMessagesForConversation(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('fi_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true });

  if (error) {
    logger.warn('fi_messages load failed', error);
    return [];
  }
  return (data ?? []).map(
    (row: { id: string; role: string; content: string | null; created_at: string | null }) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content ?? '',
      timestamp: new Date(row.created_at ?? Date.now()),
    }),
  );
}
