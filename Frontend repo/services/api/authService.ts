import type { Advisor, Firm } from '../../types';
import { supabase } from '../supabaseClient';

// ---------------------------------------------------------------------------
// Advisor profile helper
// Reads from public.advisors (linked to auth.users via same UUID)
// ---------------------------------------------------------------------------
const fetchAdvisorProfile = async (userId: string): Promise<{ advisor: Advisor; firm: Firm }> => {
    const { data, error } = await supabase
        .from('advisors')
        .select('id, email, first_name, last_name, role, avatar_url, preferred_timezone, start_week_on, firm_id, firms(id, name)')
        .eq('id', userId)
        .single();

    if (error || !data) {
        throw new Error('Could not load your advisor profile. Please contact your administrator.');
    }

    const advisor: Advisor = {
        id: data.id,
        firmId: data.firm_id,
        name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.email,
        email: data.email,
        avatarUrl: data.avatar_url || `https://i.pravatar.cc/150?u=${data.id}`,
        role: (data.role as 'admin' | 'broker') || 'broker',
        preferredTimezone: data.preferred_timezone || 'Pacific/Auckland',
        startWeekOn: (data.start_week_on as 'Sunday' | 'Monday') || 'Monday',
    };

    const firmsRelation = (data as { firms?: { id: string; name: string } | { id: string; name: string }[] }).firms;
    const firmData = Array.isArray(firmsRelation) ? firmsRelation[0] : firmsRelation;
    const firmName = firmData?.name || 'Unknown Firm';

    const firm: Firm = {
        id: data.firm_id,
        name: firmName,
    };

    return { advisor, firm };
};

// In-memory cache so getCurrentFirm() / getCurrentUser() can return sync values
// (set on login/restore/onAuthStateChange, cleared on logout).
let cachedAdvisor: Advisor | null = null;
let cachedFirm: Firm | null = null;

function setCache(profile: { advisor: Advisor; firm: Firm } | null) {
    cachedAdvisor = profile?.advisor ?? null;
    cachedFirm = profile?.firm ?? null;
}

// ---------------------------------------------------------------------------
// Auth Service
// ---------------------------------------------------------------------------
export const authService = {
    /**
     * Sign in with email + password via Supabase Auth.
     * Returns the advisor profile and firm after successful login.
     */
    login: async (email: string, password: string): Promise<{ advisor: Advisor; firm: Firm }> => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            // Surface a clean message; don't leak Supabase internals
            if (error.message.toLowerCase().includes('invalid login')) {
                throw new Error('Invalid email or password.');
            }
            throw new Error(error.message);
        }

        if (!data.user) throw new Error('Login failed. Please try again.');

        const profile = await fetchAdvisorProfile(data.user.id);
        setCache(profile);
        return profile;
    },

    /**
     * Sign out the current user.
     */
    logout: async (): Promise<void> => {
        setCache(null);
        await supabase.auth.signOut();
    },

    /**
     * Get the current session (for callers that need the raw Supabase session).
     */
    getSession: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session;
    },

    /**
     * Restore session from storage on app load.
     * Returns null if no active session.
     */
    restoreSession: async (): Promise<{ advisor: Advisor; firm: Firm } | null> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return null;
        try {
            const profile = await fetchAdvisorProfile(session.user.id);
            setCache(profile);
            return profile;
        } catch {
            // Session exists but profile fetch failed (e.g. advisor not set up yet)
            return null;
        }
    },

    /**
     * Subscribe to auth state changes (login / logout / token refresh).
     * Returns the unsubscribe function — call it on component unmount.
     */
    onAuthStateChange: (
        callback: (event: string, session: { advisor: Advisor; firm: Firm } | null) => void
    ) => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                try {
                    const profile = await fetchAdvisorProfile(session.user.id);
                    setCache(profile);
                    callback(event, profile);
                } catch {
                    setCache(null);
                    callback(event, null);
                }
            } else {
                setCache(null);
                callback(event, null);
            }
        });
        return () => subscription.unsubscribe();
    },

    /**
     * Send a password reset email.
     */
    sendPasswordReset: async (email: string): Promise<void> => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw new Error(error.message);
    },

    /**
     * Get the currently authenticated advisor's profile.
     * Throws if not logged in.
     */
    getAdvisor: async (): Promise<Advisor> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');
        const { advisor } = await fetchAdvisorProfile(user.id);
        return advisor;
    },

    /**
     * Get all advisors in the same firm as the current user.
     * Relies on RLS to filter by firm automatically.
     */
    getAdvisors: async (): Promise<Advisor[]> => {
        const { data, error } = await supabase
            .from('advisors')
            .select('id, firm_id, first_name, last_name, email, role, avatar_url');

        if (error || !data) return [];

        return data.map(a => ({
            id: a.id,
            firmId: a.firm_id,
            name: `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email,
            email: a.email,
            avatarUrl: a.avatar_url || `https://i.pravatar.cc/150?u=${a.id}`,
            role: (a.role as 'admin' | 'broker') || 'broker',
        }));
    },

    /**
     * Get the current logged-in user's firm (from in-memory cache set on login/restore).
     */
    getCurrentFirm: (): Firm | null => cachedFirm,

    getCurrentUser: (): Advisor | null => cachedAdvisor,

    getFirms: async (): Promise<Firm[]> => {
        const { data, error } = await supabase.from('firms').select('id, name');
        if (error || !data) return [];
        return data.map(f => ({ id: f.id, name: f.name }));
    },
};
