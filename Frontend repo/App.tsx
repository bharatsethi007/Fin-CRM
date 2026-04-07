import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { logger } from './utils/logger';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import Dashboard from './components/pages/Dashboard';
import FlowIntelligencePage from './components/pages/FlowIntelligencePage';
import ClientList from './components/pages/ClientList';
import LeadPipeline from './components/pages/LeadPipeline';
import ApplicationsPage from './components/pages/ApplicationsPage';
import TaskList from './components/pages/TaskList';
import EmailPage from './components/pages/EmailPage';
import { SIDEBAR_NAV_ITEMS } from './constants';
import type { Advisor, Firm } from './types';
import LoginScreen from './components/pages/LoginScreen';
import { authService } from './services/api';
import type { LoginSuccess } from './services/api';
import { MFAVerify } from './components/auth/MFAVerify';
import SettingsPage from './components/pages/SettingsPage';
import NotesPage from './components/pages/NotesPage';
import CallsPage from './components/pages/CallsPage';
import { TrailBookPage } from './components/trailbook/TrailBookPage';
import { CommissionPage } from './components/commission/CommissionPage';
import { RatesPage } from './components/rates/RatesPage';
import { Icon } from './components/common/Icon';
import { ToastProvider } from './hooks/useToast';
import { useAuth } from './src/contexts/AuthContext';
import { AffordabilityCalculatorProvider } from './components/common/AffordabilityCalculator';

// ---------------------------------------------------------------------------
// Error boundary — catches render crashes and shows a fallback UI
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: string }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: '' };
    }

    static getDerivedStateFromError(error: unknown): { hasError: boolean; error: string } {
        return {
            hasError: true,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: unknown, info: React.ErrorInfo) {
        logger.error('App error:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, textAlign: 'center' }}>
                    <h2 style={{ color: '#dc2626' }}>Something went wrong</h2>
                    <p style={{ color: '#64748b' }}>{this.state.error}</p>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false, error: '' })}
                        style={{
                            padding: '10px 20px',
                            background: '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            marginTop: 16,
                        }}
                    >
                        Try again
                    </button>
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
const replaceAppPath = (path: string) => {
    window.history.replaceState(null, '', path);
};

const SessionLoader: React.FC = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
            <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-600" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Restoring session…</p>
        </div>
    </div>
);

const App: React.FC = () => {
    const { loading: authBootstrapLoading } = useAuth();
    const [currentView, setCurrentView] = useState<string>('dashboard');
    const [initialClientId, setInitialClientId] = useState<string | null>(null);
    const [initialApplicationId, setInitialApplicationId] = useState<string | null>(null);

    // Auth state
    const [currentAdvisor, setCurrentAdvisor] = useState<Advisor | null>(null);
    const [currentFirm, setCurrentFirm] = useState<Firm | null>(null);
    // true while we check for an existing session on first load
    const [isRestoringSession, setIsRestoringSession] = useState(true);

    /** Non-null while the user must complete TOTP before accessing the app (AAL2). */
    const [pendingMfaFactorId, setPendingMfaFactorId] = useState<string | null>(null);
    /** After successful MFA verify, ignore stale mfaPending from auth events until AAL catches up. */
    const mfaJustVerifiedRef = React.useRef(false);
    const [showMfaSetupBanner, setShowMfaSetupBanner] = useState(false);
    const [mfaBannerDismissed, setMfaBannerDismissed] = useState(false);

    // -----------------------------------------------------------------------
    // On mount: restore any existing Supabase session, then subscribe to
    // future auth state changes (logout, token refresh, etc.)
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (authBootstrapLoading) return;

        let unsubscribe: (() => void) | undefined;

        const init = async () => {
            try {
                // 1. Try to restore an existing session from storage
                const existing = await authService.restoreSession();
                logger.log('Restored session firm:', existing?.firm);
                if (existing) {
                    setCurrentAdvisor(existing.advisor);
                    setCurrentFirm(existing.firm);
                    if (existing.mfaPending) {
                        setPendingMfaFactorId(existing.totpFactorId);
                        replaceAppPath('/auth/mfa-verify');
                    } else {
                        setShowMfaSetupBanner(!!existing.showMfaSetupBanner);
                        if (window.location.pathname === '/auth/mfa-verify') {
                            replaceAppPath('/');
                        }
                    }
                }
            } catch (e) {
                logger.error('Session restore error:', e);
            } finally {
                // Always leave the loading gate — otherwise the UI hangs on "Restoring session…"
                setIsRestoringSession(false);
            }

            // 2. Subscribe to future auth events (login, token refresh, etc.)
            try {
                unsubscribe = authService.onAuthStateChange((_event, profile) => {
                    if (profile) {
                        setCurrentAdvisor(profile.advisor);
                        setCurrentFirm(profile.firm);
                        const effectiveProfile =
                            mfaJustVerifiedRef.current ? { ...profile, mfaPending: false } : profile;
                        if (effectiveProfile.mfaPending) {
                            setPendingMfaFactorId(effectiveProfile.totpFactorId);
                            replaceAppPath('/auth/mfa-verify');
                        } else {
                            setPendingMfaFactorId(null);
                            setShowMfaSetupBanner(!!effectiveProfile?.showMfaSetupBanner);
                        }
                    } else {
                        setCurrentAdvisor(null);
                        setCurrentFirm(null);
                        setPendingMfaFactorId(null);
                        setShowMfaSetupBanner(false);
                        setMfaBannerDismissed(false);
                        setCurrentView('dashboard');
                        replaceAppPath('/');
                    }
                });
            } catch (e) {
                logger.error('Auth subscription error:', e);
            }
        };

        void init();

        return () => {
            unsubscribe?.();
        };
    }, [authBootstrapLoading]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------
    const handleLogin = (result: LoginSuccess) => {
        setCurrentAdvisor(result.advisor);
        setCurrentFirm(result.firm);
        setMfaBannerDismissed(false);
        if (result.mfaPending) {
            setPendingMfaFactorId(result.totpFactorId);
            replaceAppPath('/auth/mfa-verify');
        } else {
            setPendingMfaFactorId(null);
            setShowMfaSetupBanner(!!result?.showMfaSetupBanner);
            replaceAppPath('/');
        }
    };

    const handleMfaVerified = () => {
        mfaJustVerifiedRef.current = true;
        setTimeout(() => {
            mfaJustVerifiedRef.current = false;
        }, 5000);
        setPendingMfaFactorId(null);
        setShowMfaSetupBanner(false);
        replaceAppPath('/');
        setCurrentView('dashboard');
    };

    const navigateToSecuritySettings = () => {
        setCurrentView('settings:mfa');
        replaceAppPath('/settings/mfa');
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

    // Deep link: MFA / security settings (path, query, or client navigate event)
    const syncSettingsFromUrl = useCallback(() => {
        if (isRestoringSession || !currentAdvisor || pendingMfaFactorId) return;
        try {
            const u = new URL(window.location.href);
            const section = u.searchParams.get('section');
            if (u.pathname === '/settings' && section === 'mfa') {
                setCurrentView('settings:mfa');
                return;
            }
            const path = u.pathname;
            if (path === '/settings/mfa') {
                setCurrentView('settings:mfa');
            } else if (path === '/settings/security') {
                setCurrentView('settings:security');
            }
        } catch {
            /* ignore */
        }
    }, [isRestoringSession, currentAdvisor, pendingMfaFactorId]);

    useEffect(() => {
        syncSettingsFromUrl();
    }, [syncSettingsFromUrl]);

    useEffect(() => {
        const onNav = () => syncSettingsFromUrl();
        window.addEventListener('popstate', onNav);
        window.addEventListener('advflow:navigate', onNav as EventListener);
        return () => {
            window.removeEventListener('popstate', onNav);
            window.removeEventListener('advflow:navigate', onNav as EventListener);
        };
    }, [syncSettingsFromUrl]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    // Spinner while Supabase auth bootstraps (getSession / timeout) or advisor profile is restored
    if (authBootstrapLoading || isRestoringSession) return <SessionLoader />;

    // Show login screen if not authenticated
    if (!currentAdvisor || !currentFirm) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    // TOTP required: password sign-in succeeded but AAL is not yet aal2
    if (pendingMfaFactorId) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
                <MFAVerify factorId={pendingMfaFactorId} onVerified={handleMfaVerified} />
            </div>
        );
    }

    const renderView = () => {
        switch (currentView) {
            case 'flow-intelligence':
                return <FlowIntelligencePage advisor={currentAdvisor} firmId={currentFirm?.id || ''} setCurrentView={setCurrentView} />;
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
                return (
                    <ClientList
                        initialClientId={initialClientId}
                        clearInitialClientId={() => setInitialClientId(null)}
                        navigateToApplication={navigateToApplication}
                    />
                );
            case 'leads':
                return (
                    <LeadPipeline
                        navigateToApplication={navigateToApplication}
                        navigateToClient={navigateToClient}
                    />
                );
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
            case 'trail-book':
                return <TrailBookPage />;
            case 'commission':
                return <CommissionPage />;
            case 'rates':
                return <RatesPage />;
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

    const showBanner = showMfaSetupBanner && !mfaBannerDismissed;
    const settingsSection = currentView.split(':')[1] || 'profile';

    return (
        <ToastProvider>
            <AffordabilityCalculatorProvider navigateToApplication={navigateToApplication}>
            {currentView.startsWith('settings') ? (
                <div className="h-screen bg-gray-100 dark:bg-gray-900 p-4">
                    <SettingsPage
                        advisor={currentAdvisor}
                        onBack={() => {
                            setCurrentView('dashboard');
                            replaceAppPath('/');
                        }}
                        initialSection={settingsSection}
                    />
                </div>
            ) : (
                <div className="flex h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                    <Sidebar
                        currentView={currentView}
                        setCurrentView={setCurrentView}
                        firm={currentFirm}
                    />
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {showBanner && (
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100"
                                role="status"
                            >
                                <div className="flex items-start gap-2 min-w-0">
                                    <Icon name="ShieldCheck" className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
                                    <p className="text-sm">
                                        Secure your account — set up two-factor authentication.{' '}
                                        <button
                                            type="button"
                                            onClick={navigateToSecuritySettings}
                                            className="font-semibold text-primary-700 dark:text-primary-400 underline hover:no-underline"
                                        >
                                            Open Security settings
                                        </button>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setMfaBannerDismissed(true)}
                                    className="text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline flex-shrink-0"
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}
                        <Header
                            title={currentViewTitle}
                            advisor={currentAdvisor}
                            setCurrentView={setCurrentView}
                        />
                        <main
                            key={currentView}
                            className={
                                currentView === 'flow-intelligence'
                                    ? 'flex-1 overflow-x-hidden overflow-y-auto p-0'
                                    : 'flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-8'
                            }
                        >
                            <ErrorBoundary>
                                {renderView()}
                            </ErrorBoundary>
                        </main>
                    </div>
                </div>
            )}
            </AffordabilityCalculatorProvider>
        </ToastProvider>
    );
};

export default App;
