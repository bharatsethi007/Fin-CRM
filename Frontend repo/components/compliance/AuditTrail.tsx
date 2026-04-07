import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { Icon } from '../common/Icon';

interface Props {
  applicationId?: string;
  clientId?: string;
  title?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'KYC': 'bg-blue-100 text-blue-700',
  'CCCFA': 'bg-purple-100 text-purple-700',
  'Disclosure': 'bg-green-100 text-green-700',
  'Advice': 'bg-yellow-100 text-yellow-700',
  'Submission': 'bg-orange-100 text-orange-700',
  'Settlement': 'bg-pink-100 text-pink-700',
  'System': 'bg-gray-100 text-gray-600',
  'General': 'bg-gray-100 text-gray-600',
  'Application': 'bg-indigo-100 text-indigo-700',
  'Document': 'bg-teal-100 text-teal-700',
  'Note': 'bg-cyan-100 text-cyan-700',
};

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
};

const getDisplayUserName = (event: { user_name?: string; advisor_id?: string }) => {
  if (event.user_name && event.user_name !== 'System') return event.user_name;
  return event.advisor_id ? 'System (automated)' : 'System';
};

export const AuditTrail: React.FC<Props> = ({ applicationId, clientId, title = 'Audit Trail' }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  const load = async () => {
    logger.log('AuditTrail loading for applicationId:', applicationId);
    setLoading(true);
    let query = supabase
      .from('audit_trail')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (applicationId) {
      query = query.eq('application_id', applicationId);
    } else if (clientId) {
      query = query.eq('client_id', clientId).is('application_id', null);
    }

    const { data } = await query;
    logger.log('Events loaded:', data?.length, data);
    setEvents(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [applicationId, clientId]);

  const categories = ['All', ...Array.from(new Set(events.map(e => e.action_category || 'General')))];
  const filtered = filter === 'All' ? events : events.filter(e => (e.action_category || 'General') === filter);

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{filtered.length} events</span>
          <button type="button" onClick={() => load()} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Category filter */}
      {categories.length > 2 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${filter === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No audit events recorded yet.</p>
          <p className="text-xs mt-1">Events are logged automatically as actions are taken.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100 dark:bg-gray-700" />

          <div className="space-y-4">
            {filtered.map((event, i) => (
              <div key={event.id || i} className="flex gap-4 relative">
                {/* Dot */}
                <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-700 flex items-center justify-center flex-shrink-0 z-10">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{event.action}</p>
                      {event.recommendation_summary && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{event.recommendation_summary}</p>
                      )}
                      {event.action_detail && typeof event.action_detail === 'object' && Object.keys(event.action_detail).length > 0 && (
                        <div className="mt-1 pl-2 border-l-2 border-gray-200 dark:border-gray-600 space-y-0.5">
                          {Object.entries(event.action_detail).map(([key, val]) => (
                            <div key={key} className="text-xs text-gray-400">
                              {key}: {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[event.action_category || 'General']}`}>
                        {event.action_category || 'General'}
                      </span>
                      <span className="text-xs text-gray-400">{timeAgo(event.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {event.user_avatar_url ? (
                      <img src={event.user_avatar_url} alt={event.user_name} className="w-4 h-4 rounded-full" />
                    ) : event.user_name && event.user_name !== 'System' ? (
                      <Icon name="Contact" className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : null}
                    <span className="text-xs text-gray-400">{getDisplayUserName(event)}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{new Date(event.created_at).toLocaleString('en-NZ')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
