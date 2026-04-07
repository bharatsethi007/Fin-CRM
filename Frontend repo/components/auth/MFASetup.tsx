import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';

const inputClasses =
  'block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-3 text-gray-900 dark:text-white text-center text-2xl tracking-[0.4em] font-mono';

export interface MFASetupProps {
  /** Shown in the user's authenticator app list */
  friendlyName?: string;
  onComplete: () => void;
}

/**
 * TOTP MFA enrolment: shows QR + secret, then verifies with challengeAndVerify.
 */
export const MFASetup: React.FC<MFASetupProps> = ({
  friendlyName = 'AdvisorFlow',
  onComplete,
}) => {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeUri, setQrCodeUri] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const enroll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    });
    if (enrollError) {
      setError(enrollError.message);
      setLoading(false);
      return;
    }
    if (!data?.id || !data.totp) {
      setError('Could not start MFA setup. Please try again.');
      setLoading(false);
      return;
    }
    setFactorId(data.id);
    setQrCodeUri(data.totp.qr_code ?? null);
    setManualSecret(data.totp.secret ?? null);
    setLoading(false);
  }, [friendlyName]);

  useEffect(() => {
    enroll();
  }, [enroll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setSuccess(true);
    window.setTimeout(() => onComplete(), 600);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 min-h-[320px]">
        <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-600 dark:text-primary-400" />
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Preparing authenticator setup…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div className="text-center mb-6">
          <Icon name="ShieldCheck" className="h-10 w-10 text-primary-600 dark:text-primary-400 mx-auto" />
          <h2 className="text-xl font-bold mt-3 text-gray-900 dark:text-white">Set up authenticator</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Scan the QR code or enter the key manually, then enter a code to confirm.
          </p>
        </div>

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/25 border border-green-200 dark:border-green-800 p-3 rounded-md mb-4">
            <Icon name="CheckSquare" className="h-5 w-5 flex-shrink-0" />
            <span>Authenticator added successfully.</span>
          </div>
        )}

        {!success && (
          <>
            {qrCodeUri && (
              <div className="flex justify-center mb-4 p-4 bg-white dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <img src={qrCodeUri} alt="Authenticator QR code" className="w-48 h-48 object-contain" />
              </div>
            )}

            {manualSecret && (
              <div className="mb-6">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Can&apos;t scan? Enter this key
                </p>
                <div className="break-all rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 p-3 font-mono text-sm text-gray-900 dark:text-gray-100 select-all">
                  {manualSecret}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="mfa-setup-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Verification code
                </label>
                <input
                  id="mfa-setup-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={inputClasses}
                  disabled={success}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                  <Icon name="ShieldAlert" className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" isLoading={submitting} className="w-full" size="lg" disabled={success || code.length !== 6}>
                Verify and enable
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
};
