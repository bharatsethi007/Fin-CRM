
import React from 'react';
import { Icon } from '../common/Icon';

interface HeaderProps {
  title: string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, isDarkMode, toggleDarkMode, toggleSidebar }) => {
  return (
    <header className="flex items-center justify-between h-20 bg-white dark:bg-gray-800 px-6 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center">
        <button onClick={toggleSidebar} className="text-gray-500 dark:text-gray-400 focus:outline-none mr-4">
            <Icon name="Menu" className="h-6 w-6"/>
        </button>
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

        <button className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none">
          <Icon name="Bell" className="h-6 w-6" />
        </button>

        <div className="flex items-center">
            <img 
                className="h-10 w-10 rounded-full object-cover" 
                src="https://picsum.photos/id/237/200/200" 
                alt="Advisor Avatar"
            />
            <div className="ml-3 hidden md:block">
                <p className="text-sm font-medium text-gray-800 dark:text-white">Liam Wilson</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Advisor</p>
            </div>
        </div>
      </div>
    </header>
  );
};