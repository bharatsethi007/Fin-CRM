import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../common/Icon';
import { crmService } from '../../services/api';
import { supabase } from '../../services/supabaseClient';
import type { Advisor, Notification } from '../../types';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useToast } from '../../hooks/useToast';

interface HeaderProps {
  title: string;
  advisor: Advisor;
  setCurrentView: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ title, advisor, setCurrentView }) => {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isNotificationsOpen) {
      crmService.getNotifications().then(setNotifications);
    }
  }, [isNotificationsOpen]);

  const handleMarkRead = async (id: string) => {
    await crmService.markNotificationRead(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <header
      className="flex items-center justify-between h-16 px-6 border-b"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      {/* LEFT — page title */}
      <div className="flex items-center shrink-0">
        <h1
          className="m-0 font-bold"
          style={{ fontSize: 16, color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
      </div>

      {/* RIGHT — search, theme, notifications, avatar */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          className="p-2 rounded-lg border-none cursor-pointer bg-transparent hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Search"
        >
          <Icon name="Search" className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-lg border-none cursor-pointer bg-transparent hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="text-lg leading-none" aria-hidden>
            {theme === 'dark' ? '☀️' : '🌙'}
          </span>
        </button>

        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative p-2 rounded-lg border-none cursor-pointer bg-transparent hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Icon name="Bell" className="h-5 w-5" />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
          {isNotificationsOpen && (
            <div
              className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg shadow-lg py-2 z-30"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Notifications
                </h3>
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No notifications
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleMarkRead(n.id)}
                        className="w-full text-left px-4 py-3 transition-colors hover:opacity-90"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <p className="font-medium text-sm">{n.title}</p>
                        {n.message && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {n.message}
                          </p>
                        )}
                        {n.dueDate && (
                          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            Due: {new Date(n.dueDate).toLocaleDateString('en-NZ')}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 p-1 rounded-full border-none bg-transparent cursor-pointer focus:outline-none"
          >
            <img
              className="h-8 w-8 rounded-full object-cover"
              src={advisor.avatarUrl}
              alt="Advisor Avatar"
            />
            <span
              className="hidden md:inline text-[13px] font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {advisor.name}
            </span>
            <Icon name="ChevronDown" className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
          </button>
          {isDropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute right-0 mt-2 w-48 rounded-md shadow-lg z-20 py-1"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentView('settings:profile');
                  setIsDropdownOpen(false);
                }}
                className="flex items-center px-4 py-2 text-sm hover:opacity-90"
                style={{ color: 'var(--text-primary)' }}
              >
                <Icon name="Settings" className="mr-3 h-5 w-5" />
                Settings
              </a>
              <button
                type="button"
                disabled={loggingOut}
                onClick={async () => {
                  setLoggingOut(true);
                  try {
                    await supabase.auth.signOut();
                    toast.info('Logged out');
                    window.location.href = '/login';
                  } finally {
                    setLoggingOut(false);
                  }
                }}
                className="w-full text-left flex items-center px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                style={{ color: 'var(--text-primary)' }}
              >
                <Icon name="ArrowLeft" className="mr-3 h-5 w-5" />
                {loggingOut ? 'Logging out...' : 'Logout'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
