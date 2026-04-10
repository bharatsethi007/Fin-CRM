import React, { useState, useMemo, useEffect } from 'react';
import type { Advisor } from '../../types';
import { SettingsSidebar } from '../settings/SettingsSidebar';
import { ProfileSettings } from '../settings/ProfileSettings';
import { EmailSettings } from '../settings/EmailSettings';
import { DisclosureStatement } from '../compliance/DisclosureStatement';
import { FirmProfileSettings } from '../settings/FirmProfileSettings';
import { BrandingSettings } from '../settings/BrandingSettings';
import { AISkillsSettings } from '../settings/AISkillsSettings';
import { TaskAutomationSettings } from '../settings/TaskAutomationSettings';
import { LicenceSettings } from '../settings/LicenceSettings';
import { MFASettings } from '../settings/MFASettings';
import { Icon } from '../common/Icon';
import { SETTINGS_NAV_ITEMS } from '../settings/settingsConstants';
import { SettingsKnowledgeBank } from '../settings/SettingsKnowledgeBank';
import { SettingsSentences } from '../settings/SettingsSentences';
import { SettingsPreferences } from '../settings/SettingsPreferences';

interface SettingsPageProps {
  advisor: Advisor;
  onBack: () => void;
  initialSection?: string;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ advisor, onBack, initialSection }) => {
  const [activeSection, setActiveSection] = useState(initialSection || 'profile');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (initialSection) {
        setActiveSection(initialSection);
    }
  }, [initialSection]);

  const sectionTitle = useMemo(() => {
    for (const group of SETTINGS_NAV_ITEMS) {
        const item = group.items.find(i => i.id === activeSection);
        if (item) return item.name;
    }
    return 'Settings';
  }, [activeSection]);


  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSettings advisor={advisor} />;
      case 'email-calendar':
        return <EmailSettings />;
      case 'disclosure-statement':
        return <DisclosureStatement advisorId={advisor.id} firmId={advisor.firmId} />;
      case 'firm-profile':
        return <FirmProfileSettings advisorId={advisor?.id} firmId={advisor?.firmId} />;
      case 'branding':
        return <BrandingSettings />;
      case 'ai-skills':
        return <AISkillsSettings advisor={advisor} />;
      case 'task-automation':
        return <TaskAutomationSettings advisor={advisor} />;
      case 'licence':
        return <LicenceSettings />;
      case 'mfa':
        return <MFASettings advisor={advisor} />;
      case 'knowledge-bank':
        return <SettingsKnowledgeBank firmId={advisor.firmId} />;
      case 'sentences':
        return <SettingsSentences firmId={advisor.firmId} />;
      case 'preferences':
        return <SettingsPreferences firmId={advisor.firmId} />;
      case 'security':
        return (
          <div className="max-w-2xl space-y-4 p-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Use two-factor authentication (2FA) to protect your account. You can enroll an authenticator app from the account security flow when available.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              If your organisation enforces MFA, complete setup here before accessing sensitive client data.
            </p>
          </div>
        );
      default:
        return (
            <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center h-full">
                <Icon name="Construction" className="h-16 w-16 mb-4 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Under Construction</h3>
                <p>Settings for "{sectionTitle}" are not yet implemented.</p>
            </div>
        );
    }
  };


  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        {/* Custom Header for Settings Page */}
        <header className="flex items-center justify-between h-16 bg-white dark:bg-gray-800 px-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center">
                <button onClick={onBack} className="flex items-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                    <Icon name="ArrowLeft" className="h-5 w-5 mr-3"/>
                    <span className="text-lg font-semibold">Settings</span>
                </button>
                <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-4"></div>
                <h1 className="text-lg font-semibold text-gray-800 dark:text-white">{sectionTitle}</h1>
            </div>
            <button className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Icon name="HelpCircle" className="h-6 w-6" />
            </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
            <SettingsSidebar 
                activeSection={activeSection} 
                setActiveSection={setActiveSection} 
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
            />
            <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                <div className="p-8">
                    {renderSection()}
                </div>
            </main>
        </div>
    </div>
  );
};

export default SettingsPage;