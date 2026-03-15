import type { Advisor, Firm } from '../../types';
import { supabase } from '../supabaseClient';

const fetchAdvisorProfile = async (userId: string): Promise<{ advisor: Advisor; firm: Firm }> => {
    const { data, error } = await supabase
        .from('advisors')
        .select('id, email, first_name, last_name, role, avatar_url, preferred_timezone, start_week_on, firm_id')
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

    const firm: Firm = {
        id: data.firm_id,
        name: 'Kiwi Mortgages',
    };

    return { advisor, firm };
};

let cachedAdvisor: Advisor | null = null;
let cachedFirm: Firm | null = null;

function setCache(profile: { advisor: Advisor; firm: Firm } | null) {
    cachedAdvisor = profile?.advisor ?? null;
    cachedFirm = profile?.firm ?? null;
}

export const authService = {
    login: async (email: string, password: string): Promise<{ advisor: Advisor; firm: Firm }> => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
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

    logout: async (): Promise<void> => {
        setCache(null);
        await supabase.auth.signOut();
    },

    getSession: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session;
    },

    restoreSession: async (): Promise<{ advisor: Advisor; firm: Firm } | null> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return null;
        try {
            const profile = await fetchAdvisorProfile(session.user.id);
            setCache(profile);
            return profile;
        } catch {
            return null;
        }
    },

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

    sendPasswordReset: async (email: string): Promise<void> => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw new Error(error.message);
    },

    getAdvisor: async (): Promise<Advisor> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');
        const { advisor } = await fetchAdvisorProfile(user.id);
        return advisor;
    },

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

    getCurrentFirm: (): Firm | null => cachedFirm,
    getCurrentUser: (): Advisor | null => cachedAdvisor,

    getFirms: async (): Promise<Firm[]> => {
        const { data, error } = await supabase.from('firms').select('id, name');
        if (error || !data) return [];
        return data.map(f => ({ id: f.id, name: f.name }));
    },
};