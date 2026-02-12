import React from 'react';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';

interface EmailPageProps {
    setCurrentView: (view: string) => void;
}

const EmailPage: React.FC<EmailPageProps> = ({ setCurrentView }) => {
    
    const handleComposeClick = () => {
        // Navigate to the email settings page
        setCurrentView('settings:email-calendar');
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md relative">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-4">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Drafts <span className="text-gray-400">0</span></div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Outbox <span className="text-gray-400">0</span></div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Templates <span className="text-gray-400">0</span></div>
                </div>
                <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Help</span>
                    <Button onClick={handleComposeClick} leftIcon="Mail">Compose email</Button>
                </div>
            </div>

            {/* Main Content - Empty State */}
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <div className="w-24 h-24 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
                    <Icon name="Mail" className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Email drafts</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No emails yet! Create your first email to get started.</p>
                <Button onClick={handleComposeClick} className="mt-6" leftIcon="Mail">Compose email</Button>

                 <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                    <div className="flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <Icon name="Mail" className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-3" />
                        <span className="text-sm">Email sync, People and Company records</span>
                    </div>
                 </div>
            </div>
        </div>
    );
};

export default EmailPage;
