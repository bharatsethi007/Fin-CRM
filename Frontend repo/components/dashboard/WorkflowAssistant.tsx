import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { geminiService } from '../../services/geminiService';

interface ActionItem {
  id: string;
  priority: 'urgent' | 'high' | 'normal';
  category: 'compliance' | 'task' | 'pipeline' | 'document';
  title: string;
  detail: string;
  applicationId?: string;
  clientName?: string;
  actionLabel: string;
  onAction?: () => void;
}

interface Props {
  advisorId: string;
  firmId: string;
  viewMode: 'my' | 'firm';
  setCurrentView: (view: string) => void;
}

export const WorkflowAssistant: React.FC<Props> = ({ advisorId, firmId, viewMode, setCurrentView }) => {
  const [loading, setLoading] = useState(true);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const buildActionItems = async (forceRefresh = false) => {
    setLoading(true);
    const items: ActionItem[] = [];

    const CACHE_KEY = `flow_intelligence_cache_${firmId}`;
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached && !forceRefresh) {
      const { timestamp, items, suggestion } = JSON.parse(cached);
      const ageHours = (Date.now() - timestamp) / 3600000;
      if (ageHours < 24) {
        setActionItems(items);
        setAiSuggestion(suggestion || '');
        setLastUpdated(new Date(timestamp));
        setLoading(false);
        return;
      }
    }

    // 1. Overdue tasks
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, title, due_date, client_id, clients(first_name, last_name)')
      .in('status', ['pending', 'in_progress'])
      .lte('due_date', new Date().toISOString().split('T')[0])
      .eq('firm_id', firmId)
      .limit(5);

    overdueTasks?.forEach((task: any) => {
      const daysOverdue = Math.floor((Date.now() - new Date(task.due_date).getTime()) / 86400000);
      const client = task.clients as any;
      items.push({
        id: 'task-' + task.id,
        priority: daysOverdue > 7 ? 'urgent' : 'high',
        category: 'task',
        title: `Overdue task: ${task.title}`,
        detail: `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue${client ? ` — ${client.first_name} ${client.last_name}` : ''}`,
        clientName: client ? `${client.first_name} ${client.last_name}` : undefined,
        actionLabel: 'View Task',
        onAction: () => setCurrentView('tasks'),
      });
    });

    // 2. Applications missing needs & objectives
    const { data: missingNeeds } = await supabase
      .from('compliance_checklists')
      .select('application_id, applications(reference_number, clients(first_name, last_name))')
      .eq('needs_objectives_completed', false)
      .eq('firm_id', firmId)
      .limit(5);

    missingNeeds?.forEach((item: any) => {
      const app = item.applications as any;
      const client = app?.clients;
      items.push({
        id: 'needs-' + item.application_id,
        priority: 'high',
        category: 'compliance',
        title: 'Needs & Objectives incomplete',
        detail: `${client?.first_name} ${client?.last_name} — required before submission`,
        clientName: client ? `${client.first_name} ${client.last_name}` : undefined,
        applicationId: item.application_id,
        actionLabel: 'Complete Now',
        onAction: () => setCurrentView('applications'),
      });
    });

    // 3. Applications missing disclosure
    const { data: missingDisclosure } = await supabase
      .from('compliance_checklists')
      .select('application_id, applications(reference_number, clients(first_name, last_name))')
      .eq('disclosure_statement_provided', false)
      .eq('firm_id', firmId)
      .limit(5);

    missingDisclosure?.forEach((item: any) => {
      const app = item.applications as any;
      const client = app?.clients;
      items.push({
        id: 'disclosure-' + item.application_id,
        priority: 'high',
        category: 'compliance',
        title: 'Disclosure not provided',
        detail: `${client?.first_name} ${client?.last_name} — FMC Act requirement`,
        clientName: client ? `${client.first_name} ${client.last_name}` : undefined,
        applicationId: item.application_id,
        actionLabel: 'Mark Complete',
        onAction: () => setCurrentView('applications'),
      });
    });

    // 4. Stale draft applications (7+ days no activity)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: staleApps } = await supabase
      .from('applications')
      .select('id, reference_number, created_at, updated_at, clients(first_name, last_name)')
      .eq('workflow_stage', 'draft')
      .eq('firm_id', firmId)
      .lt('updated_at', sevenDaysAgo)
      .limit(5);

    staleApps?.forEach((app: any) => {
      const client = app.clients as any;
      const daysStale = Math.floor((Date.now() - new Date(app.updated_at || app.created_at).getTime()) / 86400000);
      items.push({
        id: 'stale-' + app.id,
        priority: 'normal',
        category: 'pipeline',
        title: 'Stale draft application',
        detail: `${client?.first_name} ${client?.last_name} — no activity for ${daysStale} days`,
        clientName: client ? `${client.first_name} ${client.last_name}` : undefined,
        applicationId: app.id,
        actionLabel: 'Review',
        onAction: () => setCurrentView('applications'),
      });
    });

    // 5. Expiring documents (if documents table has expiry_date and firm_id)
    try {
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: expiringDocs } = await supabase
        .from('documents')
        .select('id, name, expiry_date, client_id, clients(first_name, last_name)')
        .eq('firm_id', firmId)
        .lte('expiry_date', thirtyDaysFromNow)
        .gte('expiry_date', todayStr)
        .limit(5);

      expiringDocs?.forEach((doc: any) => {
        const client = doc.clients as any;
        const daysUntil = Math.ceil((new Date(doc.expiry_date).getTime() - Date.now()) / 86400000);
        items.push({
          id: 'doc-' + doc.id,
          priority: daysUntil <= 7 ? 'urgent' : 'high',
          category: 'document',
          title: `Document expiring: ${doc.name}`,
          detail: `${client?.first_name} ${client?.last_name} — expires in ${daysUntil} days`,
          clientName: client ? `${client.first_name} ${client.last_name}` : undefined,
          actionLabel: 'Update Document',
          onAction: () => setCurrentView('clients'),
        });
      });
    } catch (_) {
      // documents table or columns may not exist
    }

    // Sort by priority
    const priorityOrder = { urgent: 0, high: 1, normal: 2 };
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    setActionItems(items);
    setLastUpdated(new Date());

    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), items, suggestion: '' }));
    setLoading(false);

    if (items.length > 0) {
      generateAISuggestion(items);
    }
  };

  const generateAISuggestion = async (items: ActionItem[]) => {
    setAiLoading(true);
    try {
      const summary = items.slice(0, 5).map(i => `${i.priority.toUpperCase()}: ${i.title} — ${i.detail}`).join('\n');
      const prompt = `You are an AI assistant for a NZ mortgage broker. Based on these specific pending items, give ONE concise actionable suggestion in 2 sentences max. Focus on what to prioritise first and why. Be specific, not generic.\n\nPending items:\n${summary}`;
      const result = await geminiService.generateContent(prompt);
      setAiSuggestion(result);
    } catch {
      setAiSuggestion('');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    buildActionItems();
  }, [advisorId, firmId, viewMode]);

  const PRIORITY_STYLES = {
    urgent: 'border-l-4 border-red-500 bg-red-50 dark:bg-red-900/10',
    high: 'border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10',
    normal: 'border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/10',
  };

  const CATEGORY_ICONS: Record<string, string> = {
    compliance: '⚖️',
    task: '✓',
    pipeline: '📋',
    document: '📄',
  };

  const PRIORITY_LABELS = {
    urgent: { text: 'Urgent', cls: 'bg-red-100 text-red-700' },
    high: { text: 'Action needed', cls: 'bg-yellow-100 text-yellow-700' },
    normal: { text: 'Follow up', cls: 'bg-blue-100 text-blue-700' },
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">✨ Flow Intelligence Assistant</h3>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-gray-400">Updated {lastUpdated.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button type="button" onClick={() => buildActionItems(true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">↻ Refresh</button>
        </div>
      </div>

      {(aiSuggestion || aiLoading) && (
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b border-blue-100 dark:border-blue-800">
          {aiLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-blue-600">AI analysing your pipeline...</span>
            </div>
          ) : (
            <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">{aiSuggestion}</p>
          )}
        </div>
      )}

      <div className="divide-y divide-gray-50 dark:divide-gray-700 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : actionItems.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All caught up!</p>
            <p className="text-xs text-gray-400 mt-1">No pending actions at this time.</p>
          </div>
        ) : (
          actionItems.map(item => (
            <div key={item.id} className={`flex items-start gap-3 p-4 ${PRIORITY_STYLES[item.priority]}`}>
              <span className="text-base flex-shrink-0 mt-0.5">{CATEGORY_ICONS[item.category]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.detail}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${PRIORITY_LABELS[item.priority].cls}`}>
                    {PRIORITY_LABELS[item.priority].text}
                  </span>
                </div>
                <button type="button" onClick={item.onAction}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline">
                  {item.actionLabel} →
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {actionItems.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-400">{actionItems.filter(i => i.priority === 'urgent').length} urgent · {actionItems.filter(i => i.priority === 'high').length} action needed · {actionItems.filter(i => i.priority === 'normal').length} follow up</p>
        </div>
      )}
    </div>
  );
};
