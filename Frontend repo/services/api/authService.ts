import type { Session } from '@supabase/supabase-js';
import type { Advisor, Firm } from '../../types';
import { logger } from '../../utils/logger';
import { supabase } from '../supabaseClient';
import { invokeFunction } from '../../src/lib/api';

export type AuthProfile = { advisor: Advisor; firm: Firm };

/** Result after password sign-in or session restore — may require MFA step or prompt to enroll. */
export type LoginSuccess =
  | (AuthProfile & { mfaPending: true; totpFactorId: string; showMfaSetupBanner?: boolean })
  | (AuthProfile & { mfaPending: false; showMfaSetupBanner?: boolean });

/** Read `aal` from the current session JWT first (authoritative), then optional `user.aal`. */
function getSessionAal(session: Session | null | undefined): 'aal1' | 'aal2' {
  const token = session?.access_token;
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded)) as { aal?: string };
        if (payload.aal === 'aal2') return 'aal2';
        if (payload.aal === 'aal1') return 'aal1';
      }
    } catch {
      /* fall through */
    }
  }
  const fromUser = (session?.user as { aal?: string } | undefined)?.aal;
  if (fromUser === 'aal2') return 'aal2';
  return 'aal1';
}

async function getPostLoginMfaState(): Promise<
  | { mfaPending: true; totpFactorId: string }
  | { mfaPending: false; showMfaSetupBanner: boolean }
> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasTotp = (factors?.totp?.length ?? 0) > 0;

  if (!hasTotp) {
    return { mfaPending: false, showMfaSetupBanner: true };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const aal = getSessionAal(session);

  if (aal === 'aal2') {
    return { mfaPending: false, showMfaSetupBanner: false };
  }

  const totpFactors = factors!.totp!;
  const verified = totpFactors.find((f) => f.status === 'verified');
  const factorId = verified?.id ?? totpFactors[0]?.id;
  if (!factorId) {
    return { mfaPending: false, showMfaSetupBanner: true };
  }
  return { mfaPending: true, totpFactorId: factorId };
}

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

const GET_SESSION_TIMEOUT_MS = 12_000;

/** Avoid hanging forever if `getSession` never settles (blocked storage, bad client config, etc.). */
async function getSessionResilient() {
    try {
        return await Promise.race([
            supabase.auth.getSession(),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                `supabase.auth.getSession() timed out after ${GET_SESSION_TIMEOUT_MS}ms`,
                            ),
                        ),
                    GET_SESSION_TIMEOUT_MS,
                ),
            ),
        ]);
    } catch (e) {
        logger.warn('getSessionResilient:', e);
        return { data: { session: null }, error: null as import('@supabase/supabase-js').AuthError | null };
    }
}

export const authService = {
    login: async (email: string, password: string): Promise<LoginSuccess> => {
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
        const mfa = await getPostLoginMfaState();
        if (mfa.mfaPending) {
            return { ...profile, mfaPending: true, totpFactorId: mfa.totpFactorId };
        }
        return { ...profile, mfaPending: false, showMfaSetupBanner: mfa.showMfaSetupBanner };
    },

    logout: async (): Promise<void> => {
        setCache(null);
        await supabase.auth.signOut();
    },

    getSession: async () => {
        const { data } = await getSessionResilient();
        return data.session;
    },

    restoreSession: async (): Promise<LoginSuccess | null> => {
        try {
            const { data: { session }, error } = await getSessionResilient();
            if (error) {
                logger.warn('authService.restoreSession getSession:', error.message);
                return null;
            }
            if (!session?.user) return null;
            try {
                const profile = await fetchAdvisorProfile(session.user.id);
                setCache(profile);
                const mfa = await getPostLoginMfaState();
                if (mfa.mfaPending) {
                    return { ...profile, mfaPending: true, totpFactorId: mfa.totpFactorId };
                }
                return { ...profile, mfaPending: false, showMfaSetupBanner: mfa.showMfaSetupBanner };
            } catch {
                return null;
            }
        } catch (e) {
            logger.warn('authService.restoreSession failed:', e);
            return null;
        }
    },

    onAuthStateChange: (callback: (event: string, session: LoginSuccess | null) => void) => {
        let lastProcessedUserId: string | null = null;
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'TOKEN_REFRESHED' && cachedAdvisor) {
                return;
            }
            if (session?.user) {
                if (session.user.id === lastProcessedUserId) return;
                lastProcessedUserId = session.user.id;
                try {
                    const profile = await fetchAdvisorProfile(session.user.id);
                    setCache(profile);
                    const mfa = await getPostLoginMfaState();
                    if (mfa.mfaPending) {
                        callback(event, { ...profile, mfaPending: true, totpFactorId: mfa.totpFactorId });
                    } else {
                        callback(event, { ...profile, mfaPending: false, showMfaSetupBanner: mfa.showMfaSetupBanner });
                    }
                } catch {
                    setCache(null);
                    callback(event, null);
                }
            } else {
                lastProcessedUserId = null;
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

    /**
     * Revokes Akahu user tokens for all active firm connections (Edge Function `revoke-akahu-tokens`).
     * Call before account deletion or use `deleteAdvisorAccount` which runs this first.
     */
    revokeAkahuTokens: async (): Promise<{
        revokedIds: string[];
        failed: { id: string; message: string }[];
    }> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');
        const { data: adv } = await supabase
            .from('advisors')
            .select('firm_id')
            .eq('id', user.id)
            .single();
        if (!adv?.firm_id) throw new Error('No advisor profile');
        const { data, error } = await invokeFunction<{ revokedIds: string[]; failed: { id: string; message: string }[] }>(
            'revoke-akahu-tokens',
            { firm_id: adv.firm_id },
        );
        if (error) throw new Error(error);
        if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
            throw new Error(String((data as { error: string }).error));
        }
        return data as { revokedIds: string[]; failed: { id: string; message: string }[] };
    },

    /**
     * Deletes the signed-in advisor: revokes Akahu tokens, removes `advisors` row, deletes auth user.
     * Implemented by Edge Function `delete-advisor-account` (service role + admin API).
     */
    deleteAdvisorAccount: async (): Promise<void> => {
        const { data, error } = await invokeFunction('delete-advisor-account', {});
        if (error) throw new Error(error);
        if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
            throw new Error(String((data as { error: string }).error));
        }
        setCache(null);
        await supabase.auth.signOut();
    },
};