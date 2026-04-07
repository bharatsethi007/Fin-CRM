import React, { useCallback, useEffect, useState } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import type { Advisor } from '../../types';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Icon } from '../common/Icon';
import { MFASetup } from '../auth/MFASetup';

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  status?: string;
  created_at?: string;
};

function formatFactorDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-NZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export interface MFASettingsProps {
  advisor: Advisor;
}

export const MFASettings: React.FC<MFASettingsProps> = ({ advisor }) => {
  const [loading, setLoading] = useState(true);
  const [verifiedFactor, setVerifiedFactor] = useState<TotpFactor | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeCode, setRemoveCode] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadFactors = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      logger.error(error);
      setVerifiedFactor(null);
      setLoading(false);
      return;
    }
    const totp = (data?.totp ?? []) as TotpFactor[];
    const verified = totp.find((f) => f.status === 'verified') ?? null;
    setVerifiedFactor(verified);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  const handleSetupComplete = () => {
    setShowSetup(false);
    loadFactors();
  };

  const handleUnenroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedFactor?.id) return;
    if (removeCode.length !== 6) {
      setRemoveError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setRemoving(true);
    setRemoveError(null);
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: verifiedFactor.id,
    });
    if (chErr || !challenge?.id) {
      setRemoveError(chErr?.message ?? 'Could not verify. Try again.');
      setRemoving(false);
      return;
    }
    const { error: verErr } = await supabase.auth.mfa.verify({
      factorId: verifiedFactor.id,
      challengeId: challenge.id,
      code: removeCode.trim(),
    });
    if (verErr) {
      setRemoveError(verErr.message);
      setRemoving(false);
      return;
    }
    const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
    setRemoving(false);
    if (unErr) {
      setRemoveError(unErr.message);
      return;
    }
    setRemoveOpen(false);
    setRemoveCode('');
    setVerifiedFactor(null);
    await loadFactors();
  };

  const inputCodeClass =
    'block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-3 text-gray-900 dark:text-white text-center text-xl tracking-[0.35em] font-mono';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-600 mb-3" />
        <p className="text-sm">Loading security settings…</p>
      </div>
    );
  }

  const enrolled = verifiedFactor != null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Add a second step when you sign in to protect access to client financial data.
        </p>
      </div>

      {!enrolled && !showSetup && (
        <Card className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex gap-3 mb-4">
            <Icon name="ShieldCheck" className="h-8 w-8 text-primary-600 dark:text-primary-400 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Protect sensitive data</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Multi-factor authentication (MFA) helps prevent unauthorised access to your AdvisorFlow account and to
                client financial information. Use an authenticator app on your phone to generate one-time codes when you
                sign in.
              </p>
            </div>
          </div>
          <Button size="lg" className="w-full sm:w-auto" onClick={() => setShowSetup(true)} leftIcon="ShieldCheck">
            Enable Two-Factor Authentication
          </Button>
        </Card>
      )}

      {!enrolled && showSetup && (
        <div className="space-y-4">
          <Button variant="secondary" size="sm" onClick={() => setShowSetup(false)} leftIcon="ArrowLeft">
            Back
          </Button>
          <MFASetup friendlyName={`AdvisorFlow · ${advisor.name}`} onComplete={handleSetupComplete} />
        </div>
      )}

      {enrolled && (
        <Card className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 space-y-4">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold">
            <Icon name="CheckSquare" className="h-5 w-5" />
            <span>Two-Factor Authentication: Enabled ✓</span>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Authenticator name</dt>
              <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {verifiedFactor.friendly_name || 'Authenticator'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Added</dt>
              <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatFactorDate(verifiedFactor.created_at)}
              </dd>
            </div>
          </dl>

          {!removeOpen ? (
            <Button variant="danger" size="sm" onClick={() => { setRemoveOpen(true); setRemoveCode(''); setRemoveError(null); }}>
              Remove
            </Button>
          ) : (
            <form onSubmit={handleUnenroll} className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enter your current 6-digit code from the authenticator app to confirm removal. This will turn off
                two-factor authentication for your account.
              </p>
              <div>
                <label htmlFor="mfa-remove-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current code
                </label>
                <input
                  id="mfa-remove-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={removeCode}
                  onChange={(e) => setRemoveCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={inputCodeClass}
                />
              </div>
              {removeError && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                  {removeError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="danger" isLoading={removing} disabled={removeCode.length !== 6}>
                  Confirm remove
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setRemoveOpen(false);
                    setRemoveCode('');
                    setRemoveError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
};
