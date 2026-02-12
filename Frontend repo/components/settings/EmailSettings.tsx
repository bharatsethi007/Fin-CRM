import React from 'react';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';

export const EmailSettings: React.FC = () => {
    return (
        <div className="max-w-4xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Email and calendar accounts</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage and sync your email and calendar accounts to stay organized</p>

            <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Connected accounts</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    We take your privacy very seriously. Read our <a href="#" className="font-medium text-primary-600 hover:underline">Privacy Policy &rarr;</a>
                </p>

                <div className="mt-6 p-6 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                        <Button variant="secondary" className="w-full justify-center">
                            <img src="https://www.google.com/favicon.ico" alt="Google" className="h-5 w-5 mr-2" />
                            Connect Google Account
                        </Button>
                        <Button variant="secondary" className="w-full justify-center">
                            <img src="https://www.microsoft.com/favicon.ico" alt="Microsoft" className="h-5 w-5 mr-2" />
                            Connect Microsoft Account
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
