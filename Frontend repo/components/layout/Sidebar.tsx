
import React, { useState, useEffect } from 'react';
import { SIDEBAR_NAV_ITEMS } from '../../constants';
import { Icon } from '../common/Icon';
import type { NavItem } from '../../constants';
import type { Firm, Advisor } from '../../types';
import { crmService } from '../../services/api';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  firm: Firm;
}

const NavLink: React.FC<{ item: NavItem, isActive: boolean, onClick: () => void }> = ({ item, isActive, onClick }) => (
    <li>
        <a
            href="#"
            onClick={(e) => {
                e.preventDefault();
                if (item.view) onClick();
            }}
            className={`flex items-center p-2 rounded-md transition-colors duration-200 text-sm font-medium ${
                isActive
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
        >
            <Icon name={item.icon} className="h-5 w-5 mr-3 flex-shrink-0" />
            <span>{item.name}</span>
        </a>
    </li>
);

const CollapsibleSection: React.FC<{ title: string, children: React.ReactNode, itemCount: number, defaultOpen?: boolean }> = ({ title, children, itemCount, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="w-full flex justify-between items-center text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 py-2 hover:text-gray-700 dark:hover:text-gray-200"
            >
                <span>{title}</span>
                <Icon name="ChevronDown" className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                itemCount > 0 
                ? <ul className="mt-1 space-y-1">{children}</ul>
                : <p className="text-xs text-gray-500 dark:text-gray-400 p-2">No items</p>
            )}
        </div>
    );
};


export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, firm }) => {
    const [teamMembers, setTeamMembers] = useState<Advisor[]>([]);
    const [isLoadingTeam, setIsLoadingTeam] = useState(true);

    console.log('firm from context:', firm);

    useEffect(() => {
        setIsLoadingTeam(true);
        crmService.getAdvisors()
            .then(advisors => {
                setTeamMembers(advisors);
                setIsLoadingTeam(false);
            })
            .catch(err => {
                console.error("Failed to fetch team members:", err);
                setIsLoadingTeam(false);
            });
    }, [firm.id]);

    return (
        <aside className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white flex flex-col w-64 border-r dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center p-4 border-b dark:border-gray-700">
                <div className="p-2 bg-primary-100 dark:bg-primary-900/40 rounded-md">
                    <Icon name="Building" className="h-6 w-6 text-primary-600 dark:text-primary-300" />
                </div>
                <div className="ml-3">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-white">{firm?.name || 'Kiwi Mortgages'}</h2>
                </div>
            </div>
            
            <nav className="flex-1 space-y-4 overflow-y-auto p-3">
                {SIDEBAR_NAV_ITEMS.map((section, index) => {
                    if (section.type === 'main') {
                        return (
                            <ul key={index} className="space-y-1">
                                {section.items?.map(item => (
                                    <NavLink 
                                        key={item.id} 
                                        item={item} 
                                        isActive={currentView === 'dashboard' ? item.id === 'dashboard' : currentView === item.view}
                                        onClick={() => item.view && setCurrentView(item.view)} 
                                    />
                                ))}
                            </ul>
                        );
                    }
                    if (section.type === 'collapsible') {
                        return (
                            <CollapsibleSection key={index} title={section.title!} itemCount={section.items?.length || 0} defaultOpen={section.defaultOpen}>
                                {section.items?.map(item => (
                                    <NavLink 
                                        key={item.id} 
                                        item={item} 
                                        isActive={currentView === item.view} 
                                        onClick={() => item.view && setCurrentView(item.view)} 
                                    />
                                ))}
                            </CollapsibleSection>
                        );
                    }
                    return null;
                })}

                <CollapsibleSection title="Team" itemCount={teamMembers.length} defaultOpen={true}>
                    {isLoadingTeam ? (
                        <li className="flex items-center p-2 text-sm text-gray-500">
                           <Icon name="Loader" className="h-4 w-4 mr-3 animate-spin" />
                           <span>Loading...</span>
                        </li>
                    ) : (
                        teamMembers.map(member => (
                            <li key={member.id}>
                                <a
                                    href="#"
                                    onClick={(e) => e.preventDefault()}
                                    className="flex items-center p-2 rounded-md transition-colors duration-200 text-sm font-medium text-gray-600 dark:text-gray-300"
                                >
                                    <img src={member.avatarUrl} alt={member.name} className="h-5 w-5 mr-3 rounded-full flex-shrink-0" />
                                    <span>{member.name}</span>
                                </a>
                            </li>
                        ))
                    )}
                </CollapsibleSection>
            </nav>
        </aside>
    );
};
