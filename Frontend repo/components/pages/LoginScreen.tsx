import React, { useState } from 'react';
import { crmService } from '../../services/api';
import type { LoginSuccess } from '../../services/api';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';

interface LoginScreenProps {
  onLogin: (result: LoginSuccess) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResetSent(false);
    try {
      const result = await crmService.login(email, password);
      onLogin(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your email above, then click Forgot password.');
      return;
    }
    setError(null);
    setResetLoading(true);
    try {
      await crmService.sendPasswordReset(email.trim());
      setResetSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  const inputClasses = "block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-3";

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-sm mx-auto">
        <div className="text-center mb-8">
          <Icon name="Building" className="h-12 w-12 text-primary-600 mx-auto" />
          <h1 className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">Welcome to AdvisorFlow</h1>
          <p className="text-gray-500 dark:text-gray-400">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email address
            </label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClasses}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetLoading}
                className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 disabled:opacity-50"
              >
                {resetLoading ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClasses}
              />
            </div>
          </div>

          {resetSent && (
            <div className="flex items-center text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
              <Icon name="Mail" className="h-5 w-5 mr-2" />
              If an account exists for that email, we&apos;ve sent a password reset link.
            </div>
          )}

          {error && (
            <div className="flex items-center text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                <Icon name="ShieldAlert" className="h-5 w-5 mr-2" />
                {error}
            </div>
          )}

          <div>
            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full"
              size="lg"
            >
              Sign in
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default LoginScreen;
