import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

export type MFAGuardState = {
  /** True when the current session has completed MFA (AAL2). */
  isMfaVerified: boolean;
  isLoading: boolean;
};

/**
 * Whether the current user has AAL2 assurance (MFA verified this session).
 * Re-checks on Supabase auth state changes (e.g. after completing MFA).
 */
export function useMFAGuard(): MFAGuardState {
  const [isMfaVerified, setIsMfaVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!cancelled) {
        setIsMfaVerified(data?.currentLevel === 'aal2');
        setIsLoading(false);
      }
    };

    run();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      run();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { isMfaVerified, isLoading };
}
