import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../../utils/logger';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  format,
  isToday,
  isPast,
  isSameDay,
} from 'date-fns';
import { supabase } from '../../services/supabaseClient';
import { Icon } from '../common/Icon';

export interface CalendarWidgetProps {
  userId: string;
  firmId: string;
  setCurrentView: (view: string) => void;
}

type ClientRow = { first_name: string | null; last_name: string | null } | null;

export interface CalendarTaskRow {
  id: string;
  title: string;
  due_date: string;
  priority: string | null;
  status: string;
  auto_generated: boolean | null;
  clients: ClientRow;
}

function normalizeClient(raw: unknown): ClientRow {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as ClientRow) || null;
  return raw as ClientRow;
}

function clientName(c: ClientRow): string {
  if (!c) return '—';
  const a = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return a || '—';
}

function priorityBorderColor(t: CalendarTaskRow): string {
  const p = (t.priority || '').toLowerCase();
  if (p === 'urgent') return '#DC2626';
  if (p === 'high') return '#F59E0B';
  if (p === 'medium') return '#3B82F6';
  return '#94A3B8';
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 16,
  padding: 20,
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--border-color)',
};

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const MAX_VISIBLE_TASKS = 3;

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({ userId, firmId, setCurrentView }) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [tasks, setTasks] = useState<CalendarTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  const goNext = () => setCurrentWeek((prev) => addWeeks(prev, 1));
  const goPrev = () => setCurrentWeek((prev) => subWeeks(prev, 1));
  const goToday = () => setCurrentWeek(new Date());

  const weekStart = useMemo(() => startOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekEnd = useMemo(() => endOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);

  const weekLabel = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`;

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));
    return days;
  }, [weekStart]);

  const loadTasks = useCallback(async () => {
    if (!userId || !firmId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, due_date, priority, status, auto_generated, clients(first_name, last_name)')
      .eq('assigned_to', userId)
      .neq('status', 'completed')
      .gte('due_date', format(weekStart, 'yyyy-MM-dd'))
      .lte('due_date', format(weekEnd, 'yyyy-MM-dd'))
      .order('priority', { ascending: false });

    if (error) {
      logger.error('CalendarWidget week tasks', error);
      setTasks([]);
    } else {
      setTasks(
        (data || []).map((row: CalendarTaskRow) => ({
          ...row,
          clients: normalizeClient(row.clients as unknown),
        })),
      );
    }
    setLoading(false);
  }, [userId, firmId, weekStart, weekEnd]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const tasksByDate = useMemo(() => {
    const m = new Map<string, CalendarTaskRow[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      const arr = m.get(key) || [];
      arr.push(t);
      m.set(key, arr);
    }
    return m;
  }, [tasks]);

  return (
    <div style={CARD_STYLE}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={goPrev}
            className="p-1.5 rounded-lg border-none cursor-pointer bg-transparent hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Previous week"
          >
            <Icon name="ArrowLeft" className="h-4 w-4" />
          </button>
          <h2
            className="m-0 text-[14px] font-semibold truncate flex-1 text-center"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
          >
            {weekLabel}
          </h2>
          <button
            type="button"
            onClick={goNext}
            className="p-1.5 rounded-lg border-none cursor-pointer bg-transparent hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Next week"
          >
            <Icon name="ArrowRight" className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer shrink-0"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          Today
        </button>
      </div>

      {/* Week grid */}
      <div className="relative" style={{ minHeight: 280 }}>
        {loading && (
          <div
            className="absolute inset-0 rounded-xl animate-pulse z-[1]"
            style={{ background: 'var(--border-color)', opacity: 0.35 }}
          />
        )}
        <div
          className={`grid grid-cols-7 gap-1 ${loading ? 'opacity-40 pointer-events-none' : ''}`}
          style={{ minHeight: 280 }}
        >
          {weekDays.map((day, i) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const today = isToday(day);
            const past = isPast(day) && !today;
            const dayTasks = tasksByDate.get(dateKey) || [];
            const visible = dayTasks.slice(0, MAX_VISIBLE_TASKS);
            const overflow = dayTasks.length - MAX_VISIBLE_TASKS;
            const isHovered = hoveredDay === dateKey;

            return (
              <div
                key={dateKey}
                className="flex flex-col rounded-lg p-1.5"
                style={{
                  background: today ? 'rgba(99,102,241,0.06)' : 'transparent',
                  opacity: past ? 0.4 : 1,
                  minHeight: 260,
                }}
                onMouseEnter={() => setHoveredDay(dateKey)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* Day header */}
                <div className="flex flex-col items-center mb-2">
                  <span
                    className="font-medium"
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {DAY_NAMES[i]}
                  </span>
                  <span
                    className="flex items-center justify-center font-bold"
                    style={{
                      fontSize: 18,
                      width: 32,
                      height: 32,
                      borderRadius: 9999,
                      color: today ? '#fff' : 'var(--text-primary)',
                      background: today ? '#6366F1' : 'transparent',
                    }}
                  >
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Task cards */}
                <div className="flex-1 flex flex-col gap-1">
                  {visible.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCurrentView('tasks')}
                      className="text-left border-none cursor-pointer p-0 m-0 bg-transparent w-full"
                      style={{ outline: 'none' }}
                    >
                      <div
                        className="rounded-md transition-shadow"
                        style={{
                          background: 'var(--bg-primary)',
                          borderRadius: 6,
                          padding: '6px 8px',
                          borderLeft: `3px solid ${priorityBorderColor(t)}`,
                          marginBottom: 0,
                        }}
                      >
                        <p
                          className="m-0 font-medium"
                          style={{
                            fontSize: 11,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: '1.35',
                          }}
                        >
                          {t.auto_generated ? '⚡ ' : ''}
                          {t.title}
                        </p>
                        <p
                          className="m-0"
                          style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}
                        >
                          {clientName(normalizeClient(t.clients))}
                        </p>
                      </div>
                    </button>
                  ))}

                  {overflow > 0 && (
                    <button
                      type="button"
                      onClick={() => setCurrentView('tasks')}
                      className="border-none bg-transparent cursor-pointer p-0 text-left hover:underline"
                      style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}
                    >
                      + {overflow} more
                    </button>
                  )}

                  {dayTasks.length === 0 && !past && (
                    <>
                      <p
                        className="m-0 text-center"
                        style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}
                      >
                        No tasks
                      </p>
                      {isHovered && (
                        <button
                          type="button"
                          onClick={() => setCurrentView('tasks')}
                          className="mx-auto mt-1 flex items-center justify-center rounded-md border-none cursor-pointer"
                          style={{
                            width: 24,
                            height: 24,
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                            fontSize: 16,
                            fontWeight: 700,
                            opacity: 0.7,
                          }}
                          aria-label={`Add task for ${format(day, 'EEE d MMM')}`}
                        >
                          +
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer link */}
      <button
        type="button"
        onClick={() => setCurrentView('tasks')}
        className="mt-4 text-[13px] font-semibold w-full text-left bg-transparent border-none cursor-pointer hover:underline p-0"
        style={{ color: 'var(--accent)' }}
      >
        View all tasks →
      </button>
    </div>
  );
};
