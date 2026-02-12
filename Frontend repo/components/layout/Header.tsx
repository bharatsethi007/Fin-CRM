import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../common/Icon';
import { crmService } from '../../services/crmService';
import type { Advisor, Notification } from '../../types';

interface HeaderProps {
  title: string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  advisor: Advisor;
  onLogout: () => void;
  setCurrentView: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ title, isDarkMode, toggleDarkMode, advisor, onLogout, setCurrentView }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
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
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef, notificationsRef]);

  useEffect(() => {
    if (isNotificationsOpen) {
      crmService.getNotifications().then(setNotifications);
    }
  }, [isNotificationsOpen]);

  const handleMarkRead = async (id: string) => {
    await crmService.markNotificationRead(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <header className="flex items-center justify-between h-20 bg-white dark:bg-gray-800 px-6 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">{title}</h1>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative">
          <Icon name="Search" className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="pl-10 pr-4 py-2 w-full bg-gray-100 dark:bg-gray-700 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <button onClick={toggleDarkMode} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none">
          <Icon name={isDarkMode ? 'Sun' : 'Moon'} className="h-6 w-6" />
        </button>

        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
          >
            <Icon name="Bell" className="h-6 w-6" />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 py-2 z-30">
              <div className="px-4 py-2 border-b dark:border-gray-700">
                <h3 className="font-semibold text-sm">Notifications</h3>
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">No notifications</p>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {notifications.map(n => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleMarkRead(n.id)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <p className="font-medium text-sm">{n.title}</p>
                        {n.message && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>}
                        {n.dueDate && <p className="text-xs text-gray-500 mt-1">Due: {new Date(n.dueDate).toLocaleDateString('en-NZ')}</p>}
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
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 focus:ring-primary-500"
            >
                <img 
                    className="h-10 w-10 rounded-full object-cover" 
                    src={advisor.avatarUrl}
                    alt="Advisor Avatar"
                />
                <div className="ml-3 hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{advisor.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{advisor.role}</p>
                </div>
                <Icon name="ChevronDown" className="ml-1 h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
            {isDropdownOpen && (
                <div ref={dropdownRef} className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-20 border dark:border-gray-700 py-1">
                    <a href="#" onClick={(e) => { e.preventDefault(); setCurrentView('settings:profile'); setIsDropdownOpen(false); }} className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <Icon name="Settings" className="mr-3 h-5 w-5"/>
                        Settings
                    </a>
                    <button 
                        onClick={onLogout} 
                        className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <Icon name="ArrowLeft" className="mr-3 h-5 w-5"/>
                        Logout
                    </button>
                </div>
            )}
        </div>
      </div>
    </header>
  );
};