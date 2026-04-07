
import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
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
        isActive ? '' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
      }`}
      style={
        isActive
          ? { background: 'var(--sidebar-active-bg)', color: 'var(--sidebar-active-text)' }
          : { color: 'var(--text-secondary)' }
      }
    >
      {item.id !== 'flow-intelligence' && (
        <div className="relative mr-3 flex-shrink-0">
          <Icon name={item.icon} className="h-5 w-5" />
        </div>
      )}
      {item.id === 'flow-intelligence' ? (
        <>
          <style>{`
            @keyframes gradientWave {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
            .flow-intel-wrapper {
              background: linear-gradient(90deg, #6366f1, #8b5cf6, #3b82f6, #06b6d4, #6366f1);
              background-size: 300% 300%;
              animation: gradientWave 3s ease infinite;
              border-radius: 6px;
              padding: 2px;
            }
            .flow-intel-inner {
              background: var(--color-background-primary);
              border-radius: 4px;
              padding: 1px 8px;
            }
            .flow-intel-text {
              background: linear-gradient(90deg, #6366f1, #8b5cf6, #3b82f6, #06b6d4, #6366f1);
              background-size: 300% 300%;
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              animation: gradientWave 3s ease infinite;
              font-weight: 700;
              display: block;
            }
          `}</style>
          <div className="flow-intel-wrapper">
            <div className="flow-intel-inner">
              <span className="flow-intel-text">Flow Intelligence</span>
            </div>
          </div>
        </>
      ) : (
        <span>{item.name}</span>
      )}
    </a>
  </li>
);

const CollapsibleSection: React.FC<{ title: string, children: React.ReactNode, itemCount: number, defaultOpen?: boolean }> = ({ title, children, itemCount, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="w-full flex justify-between items-center text-left text-xs font-semibold uppercase py-2 hover:opacity-90"
                style={{ color: 'var(--text-muted)' }}
            >
                <span>{title}</span>
                <Icon name="ChevronDown" className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                itemCount > 0 
                ? <ul className="mt-1 space-y-1">{children}</ul>
                : <p className="text-xs p-2" style={{ color: 'var(--text-secondary)' }}>No items</p>
            )}
        </div>
    );
};


export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, firm }) => {
    const [teamMembers, setTeamMembers] = useState<Advisor[]>([]);
    const [isLoadingTeam, setIsLoadingTeam] = useState(true);

    logger.log('firm from context:', firm);

    useEffect(() => {
        setIsLoadingTeam(true);
        crmService.getAdvisors()
            .then(advisors => {
                setTeamMembers(advisors);
                setIsLoadingTeam(false);
            })
            .catch(err => {
                logger.error("Failed to fetch team members:", err);
                setIsLoadingTeam(false);
            });
    }, [firm.id]);

    return (
        <aside
          className="flex flex-col w-64 flex-shrink-0 border-r"
          style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
        >
            <div className="flex items-center p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <div className="p-2 rounded-md" style={{ background: 'var(--accent-soft)' }}>
                    <Icon name="Building" className="h-6 w-6" style={{ color: 'var(--accent)' }} />
                </div>
                <div className="ml-3">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{firm?.name || 'AdvisorFlow'}</h2>
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
                        <li className="flex items-center p-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                           <Icon name="Loader" className="h-4 w-4 mr-3 animate-spin" />
                           <span>Loading...</span>
                        </li>
                    ) : (
                        teamMembers.map(member => (
                            <li key={member.id}>
                                <a
                                    href="#"
                                    onClick={(e) => e.preventDefault()}
                                    className="flex items-center p-2 rounded-md transition-colors duration-200 text-sm font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                                    style={{ color: 'var(--text-secondary)' }}
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
