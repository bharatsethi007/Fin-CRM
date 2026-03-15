import React, { useState, useMemo, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import Dashboard from './components/pages/Dashboard';
import ClientList from './components/pages/ClientList';
import LeadPipeline from './components/pages/LeadPipeline';
import ApplicationsPage from './components/pages/ApplicationsPage';
import TaskList from './components/pages/TaskList';
import EmailPage from './components/pages/EmailPage';
import { useDarkMode } from './hooks/useDarkMode';
import { SIDEBAR_NAV_ITEMS } from './constants';
import AIAssistant from './components/AIAssistant';
import type { Advisor, Firm } from './types';
import LoginScreen from './components/pages/LoginScreen';
import { authService } from './services/api';
import SettingsPage from './components/pages/SettingsPage';
import NotesPage from './components/pages/NotesPage';
import CallsPage from './components/pages/CallsPage';
import { Icon } from './components/common/Icon';

// ---------------------------------------------------------------------------
// Error boundary — catches render crashes and shows a fallback UI
// ---------------------------------------------------------------------------
interface ErrorBoundaryState { hasError: boolean; message: string }
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    declare state: ErrorBoundaryState;

    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, message: '' };
    }

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return { hasError: true, message: error instanceof Error ? error.message : String(error) };
    }
    componentDidCatch(error: unknown, info: React.ErrorInfo) {
        console.error('Unhandled render error:', error, info.componentStack);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center h-full p-8">
                    <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 text-center">
                        <Icon name="AlertTriangle" className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Something went wrong</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{this.state.message || 'An unexpected error occurred.'}</p>
                        <button
                            onClick={() => this.setState({ hasError: false, message: '' })}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const findViewName = (view: string): string => {
    for (const section of SIDEBAR_NAV_ITEMS) {
        if (section.items) {
            for (const item of section.items) {
                if (item.view === view) return item.name;
            }
        }
    }
    return 'Dashboard';
};

// ---------------------------------------------------------------------------
// Full-screen loading spinner shown while we restore the session
// ---------------------------------------------------------------------------
const SessionLoader: React.FC = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
            <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-600" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Restoring session…</p>
        </div>
    </div>
);

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<string>('dashboard');
    const { isDarkMode, toggleDarkMode } = useDarkMode();
    const [initialClientId, setInitialClientId] = useState<string | null>(null);
    const [initialApplicationId, setInitialApplicationId] = useState<string | null>(null);

    // Auth state
    const [currentAdvisor, setCurrentAdvisor] = useState<Advisor | null>(null);
    const [currentFirm, setCurrentFirm] = useState<Firm | null>(null);
    // true while we check for an existing session on first load
    const [isRestoringSession, setIsRestoringSession] = useState(true);

    // -----------------------------------------------------------------------
    // On mount: restore any existing Supabase session, then subscribe to
    // future auth state changes (logout, token refresh, etc.)
    // -----------------------------------------------------------------------
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        const init = async () => {
            // 1. Try to restore an existing session from storage
            const existing = await authService.restoreSession();
            console.log('Restored session firm:', existing?.firm);
            if (existing) {
                setCurrentAdvisor(existing.advisor);
                // Must set the firm object from profile, not the whole profile
                setCurrentFirm(existing.firm);
            }
            setIsRestoringSession(false);

            // 2. Subscribe to future auth events (login, token refresh, etc.)
            unsubscribe = authService.onAuthStateChange((event, profile) => {
                if (profile) {
                    setCurrentAdvisor(profile.advisor);
                    // Must set the firm object from profile, not the whole profile
                    setCurrentFirm(profile.firm);
                } else {
                    // SIGNED_OUT or token expired
                    setCurrentAdvisor(null);
                    setCurrentFirm(null);
                    setCurrentView('dashboard'); // reset nav on logout
                }
            });
        };

        init();

        return () => {
            unsubscribe?.();
        };
    }, []);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------
    const handleLogin = (advisor: Advisor, firm: Firm) => {
        // authService.login() already called supabase.auth.signInWithPassword
        // and onAuthStateChange will fire — but we also set state directly
        // here to avoid any latency before the subscription fires.
        setCurrentAdvisor(advisor);
        // firm is the second argument from LoginScreen; pass it to state, not advisor
        setCurrentFirm(firm);
    };

    const handleLogout = async () => {
        await authService.logout();
        // onAuthStateChange fires "SIGNED_OUT" and clears state above
        // but set immediately too for instant UX response
        setCurrentAdvisor(null);
        setCurrentFirm(null);
        setCurrentView('dashboard');
    };

    const navigateToClient = (clientId: string) => {
        setCurrentView('clients');
        setInitialClientId(clientId);
    };

    const navigateToApplication = (applicationId: string) => {
        setInitialApplicationId(applicationId);
        setCurrentView('applications');
    };

    const currentViewTitle = useMemo(() => {
        const viewId = currentView.split(':')[0];
        return findViewName(viewId);
    }, [currentView]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    // Show spinner while we check storage for an existing session
    if (isRestoringSession) return <SessionLoader />;

    // Show login screen if not authenticated
    if (!currentAdvisor || !currentFirm) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    const renderView = () => {
        switch (currentView) {
            case 'dashboard':
                return (
                    <Dashboard
                        setCurrentView={setCurrentView}
                        navigateToClient={navigateToClient}
                        navigateToApplication={navigateToApplication}
                        advisor={currentAdvisor}
                    />
                );
            case 'clients':
                return <ClientList initialClientId={initialClientId} clearInitialClientId={() => setInitialClientId(null)} />;
            case 'leads':
                return <LeadPipeline />;
            case 'applications':
                return (
                    <ApplicationsPage
                        initialApplicationId={initialApplicationId}
                        onClearInitialApplicationId={() => setInitialApplicationId(null)}
                    />
                );
            case 'tasks':
                return <TaskList />;
            case 'emails':
                return <EmailPage setCurrentView={setCurrentView} />;
            case 'notes':
                return <NotesPage />;
            case 'calls':
                return <CallsPage />;
            default:
                return (
                    <Dashboard
                        setCurrentView={setCurrentView}
                        navigateToClient={navigateToClient}
                        navigateToApplication={navigateToApplication}
                        advisor={currentAdvisor}
                    />
                );
        }
    };

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
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
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
                <main key={currentView} className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-8">
                    <ErrorBoundary>
                        {renderView()}
                    </ErrorBoundary>
                </main>
            </div>
            <AIAssistant />
        </div>
    );
};

export default App;
