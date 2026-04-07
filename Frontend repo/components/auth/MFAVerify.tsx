import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';

const inputClasses =
  'block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-3 text-gray-900 dark:text-white text-center text-2xl tracking-[0.4em] font-mono';

export interface MFAVerifyProps {
  factorId: string;
  onVerified: () => void;
  /** Shown in the lost-access help text */
  supportEmail?: string;
}

export const MFAVerify: React.FC<MFAVerifyProps> = ({
  factorId,
  onVerified,
  supportEmail = 'support@advisorflow.com',
}) => {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [showLostHelp, setShowLostHelp] = useState(false);

  const startChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: chError } = await supabase.auth.mfa.challenge({ factorId });
    if (chError || !data?.id) {
      setError(chError?.message ?? 'Could not start verification. Please try again.');
      setChallengeId(null);
      setLoading(false);
      return;
    }
    setChallengeId(data.id);
    setLoading(false);
  }, [factorId]);

  useEffect(() => {
    startChallenge();
  }, [startChallenge]);

  useEffect(() => {
    const tick = () => {
      const sec = Math.floor(Date.now() / 1000);
      setSecondsLeft(30 - (sec % 30));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId || code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.trim(),
    });
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      setCode('');
      const { data: next, error: nextErr } = await supabase.auth.mfa.challenge({ factorId });
      if (!nextErr && next?.id) setChallengeId(next.id);
      return;
    }
    onVerified();
    // Force reload to ensure auth state is fully refreshed
    setTimeout(() => window.location.reload(), 300);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div className="text-center mb-6">
          <Icon name="ShieldCheck" className="h-10 w-10 text-primary-600 dark:text-primary-400 mx-auto" />
          <h2 className="text-xl font-bold mt-3 text-gray-900 dark:text-white">Two-factor authentication</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter the code from your authenticator app.
          </p>
        </div>

        {(loading || challengeId) && (
          <div className="flex items-center justify-center gap-2 mb-6 text-sm text-gray-600 dark:text-gray-300">
            <span className="inline-flex items-center justify-center min-w-[2.5rem] rounded-md bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 font-semibold tabular-nums px-2 py-1">
              {secondsLeft}s
            </span>
            <span>until next code</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-600 dark:text-primary-400" />
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Preparing verification…</p>
          </div>
        ) : !challengeId ? (
          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                <Icon name="ShieldAlert" className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <Button type="button" variant="secondary" className="w-full" onClick={() => startChallenge()}>
              Try again
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="mfa-verify-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Authentication code
              </label>
              <input
                id="mfa-verify-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={inputClasses}
                disabled={!challengeId}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                <Icon name="ShieldAlert" className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" isLoading={submitting} className="w-full" size="lg" disabled={code.length !== 6}>
              Verify
            </Button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
          <button
            type="button"
            onClick={() => setShowLostHelp((v) => !v)}
            className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            Lost access to authenticator?
          </button>
          {showLostHelp && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Contact{' '}
              <a href={`mailto:${supportEmail}`} className="font-medium text-primary-600 dark:text-primary-400 underline">
                {supportEmail}
              </a>{' '}
              for account recovery.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};
