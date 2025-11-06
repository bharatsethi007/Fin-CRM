
import React, { useState, useMemo } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import Dashboard from './components/pages/Dashboard';
import ClientList from './components/pages/ClientList';
import LeadPipeline from './components/pages/LeadPipeline';
import ApplicationTracker from './components/pages/DealTracker';
import TaskList from './components/pages/TaskList';
import EmailPage from './components/pages/EmailPage';
import { useDarkMode } from './hooks/useDarkMode';
import { SIDEBAR_NAV_ITEMS } from './constants';
import AIAssistant from './components/AIAssistant';
import type { Advisor, Firm } from './types';
import LoginScreen from './components/pages/LoginScreen';
import { crmService } from './services/crmService';
import SettingsPage from './components/pages/SettingsPage';

const findViewName = (view: string): string => {
    for (const section of SIDEBAR_NAV_ITEMS) {
        if (section.items) {
            for (const item of section.items) {
                if (item.view === view) {
                    return item.name;
                }
            }
        }
    }
    return 'Dashboard'; // Default
};


const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [initialClientId, setInitialClientId] = useState<string | null>(null);

  const [currentAdvisor, setCurrentAdvisor] = useState<Advisor | null>(null);
  const [currentFirm, setCurrentFirm] = useState<Firm | null>(null);

  const handleLogin = (advisor: Advisor, firm: Firm) => {
    // The crmService login is now handled within the LoginScreen, 
    // we just need to set the app state here.
    setCurrentAdvisor(advisor);
    setCurrentFirm(firm);
  };

  const handleLogout = () => {
    crmService.logout();
    setCurrentAdvisor(null);
    setCurrentFirm(null);
    setCurrentView('dashboard');
  };

  const navigateToClient = (clientId: string) => {
    setCurrentView('clients');
    setInitialClientId(clientId);
  };

  const currentViewTitle = useMemo(() => {
    const viewId = currentView.split(':')[0];
    return findViewName(viewId)
  }, [currentView]);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard setCurrentView={setCurrentView} navigateToClient={navigateToClient} />;
      case 'clients':
        return <ClientList initialClientId={initialClientId} clearInitialClientId={() => setInitialClientId(null)} />;
      case 'leads':
        return <LeadPipeline />;
      case 'applications':
        return <ApplicationTracker />;
      case 'tasks':
        return <TaskList />;
      case 'emails':
        return <EmailPage setCurrentView={setCurrentView} />;
      default:
        return <Dashboard setCurrentView={setCurrentView} navigateToClient={navigateToClient} />;
    }
  };
  
  if (!currentAdvisor || !currentFirm) {
    return <LoginScreen onLogin={handleLogin} />;
  }
  
  if (currentView.startsWith('settings')) {
    const section = currentView.split(':')[1] || 'profile';
    return (
        <div className="h-screen bg-gray-100 dark:bg-gray-900 p-4">
             <SettingsPage 
                advisor={currentAdvisor} 
                onBack={() => setCurrentView('dashboard')}
                initialSection={section}
            />
        </div>
    );
  }

  return (
    <div className={`flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200`}>
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView}
        firm={currentFirm}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title={currentViewTitle} 
          isDarkMode={isDarkMode} 
          toggleDarkMode={toggleDarkMode}
          advisor={currentAdvisor}
          onLogout={handleLogout}
          setCurrentView={setCurrentView}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-8">
          {renderView()}
        </main>
      </div>
      <AIAssistant />
    </div>
  );
};

export default App;