
import React from 'react';
import { NAV_ITEMS } from '../../constants';
import { Icon } from '../common/Icon';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, isSidebarOpen }) => {
  return (
    <aside className={`relative bg-white dark:bg-gray-800 text-gray-900 dark:text-white flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
      <div className={`flex items-center justify-center h-20 border-b border-gray-200 dark:border-gray-700 ${isSidebarOpen ? 'px-6' : 'px-0'}`}>
        <Icon name="Building" className="h-8 w-8 text-primary-600" />
        {isSidebarOpen && <h1 className="text-xl font-bold ml-3">AdvisorFlow</h1>}
      </div>
      <nav className="flex-1 px-3 py-4">
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.name} className="mb-2">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentView(item.view);
                }}
                className={`flex items-center p-3 rounded-lg transition-colors duration-200 ${
                  currentView === item.view
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${!isSidebarOpen && 'justify-center'}`}
              >
                <Icon name={item.icon} className="h-6 w-6" />
                {isSidebarOpen && <span className="ml-4 font-medium">{item.name}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
       <div className="p-4 border-t border-gray-200 dark:border-gray-700">
         {/* User profile could go here */}
      </div>
    </aside>
  );
};
