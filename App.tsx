import React, { useState, useMemo } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import Dashboard from './components/pages/Dashboard';
import ClientList from './components/pages/ClientList';
import LeadPipeline from './components/pages/LeadPipeline';
import ApplicationTracker from './components/pages/DealTracker';
import TaskList from './components/pages/TaskList';
import { useDarkMode } from './hooks/useDarkMode';
import { NAV_ITEMS } from './constants';
import AIAssistant from './components/AIAssistant';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [initialClientId, setInitialClientId] = useState<string | null>(null);

  const navigateToClient = (clientId: string) => {
    setCurrentView('clients');
    setInitialClientId(clientId);
  };

  const currentViewTitle = useMemo(() => {
    return NAV_ITEMS.find(item => item.view === currentView)?.name || 'Dashboard';
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
      default:
        return <Dashboard setCurrentView={setCurrentView} navigateToClient={navigateToClient} />;
    }
  };

  return (
    <div className={`flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans`}>
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView}
        isSidebarOpen={isSidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title={currentViewTitle} 
          isDarkMode={isDarkMode} 
          toggleDarkMode={toggleDarkMode}
          toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
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