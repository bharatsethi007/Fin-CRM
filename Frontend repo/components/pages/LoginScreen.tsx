import React, { useState } from 'react';
import { crmService } from '../../services/crmService';
import type { Firm, Advisor } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';

interface LoginScreenProps {
  onLogin: (advisor: Advisor, firm: Firm) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('bruce.wayne@wayne-enterprises.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { advisor, firm } = await crmService.login(email, password);
      onLogin(advisor, firm);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
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
            <label htmlFor="password"className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
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