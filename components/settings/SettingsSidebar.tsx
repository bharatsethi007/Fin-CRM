import React, { useMemo } from 'react';
import { Icon } from '../common/Icon';
import { SETTINGS_NAV_ITEMS } from './settingsConstants';


interface SettingsSidebarProps {
    activeSection: string;
    setActiveSection: (section: string) => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ activeSection, setActiveSection, searchTerm, setSearchTerm }) => {
    
    const filteredNavItems = useMemo(() => {
        if (!searchTerm) {
            return SETTINGS_NAV_ITEMS;
        }
        return SETTINGS_NAV_ITEMS.map(group => ({
            ...group,
            items: group.items.filter(item =>
                item.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
        })).filter(group => group.items.length > 0);
    }, [searchTerm]);

    return (
        <aside className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="relative">
                    <Icon name="Search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search settings..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 w-full text-sm bg-gray-100 dark:bg-gray-700 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
                {filteredNavItems.map(group => (
                    <div key={group.title} className="mb-6">
                        <h3 className="px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{group.title}</h3>
                        <ul>
                            {group.items.map(item => (
                                <li key={item.id}>
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setActiveSection(item.id);
                                        }}
                                        className={`flex items-center px-3 py-2 rounded-md transition-colors duration-200 text-sm font-medium ${
                                            activeSection === item.id
                                                ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <Icon name={item.icon} className="h-5 w-5 mr-3" />
                                        <span>{item.name}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                 {filteredNavItems.length === 0 && (
                    <div className="text-center text-sm text-gray-500 p-4">
                        No settings found.
                    </div>
                )}
            </nav>
        </aside>
    );
};