import type { IconName } from '../common/Icon';

interface SettingsNavItem {
    id: string;
    name: string;
    icon: IconName;
}

interface SettingsNavGroup {
    title: string;
    items: SettingsNavItem[];
}

export const SETTINGS_NAV_ITEMS: SettingsNavGroup[] = [
    {
        title: 'Personal',
        items: [
            { id: 'profile', name: 'Profile', icon: 'Contact' },
            { id: 'appearance', name: 'Appearance', icon: 'Paintbrush' },
            { id: 'email-calendar', name: 'Email and calendar accounts', icon: 'Mail' },
            { id: 'call-intelligence', name: 'Call intelligence', icon: 'PhoneCall' },
            { id: 'storage', name: 'Storage accounts', icon: 'Database' },
            { id: 'refer', name: 'Refer another team', icon: 'UserPlus' },
            { id: 'notifications', name: 'Notifications', icon: 'Bell' },
        ],
    },
    {
        title: 'Workspace',
        items: [
            { id: 'general', name: 'General', icon: 'Settings' },
            { id: 'members', name: 'Members and teams', icon: 'Users' },
            { id: 'call-recorder', name: 'Call recorder', icon: 'Mic' },
            { id: 'plans', name: 'Plans', icon: 'Gem' },
            { id: 'billing', name: 'Billing', icon: 'CreditCard' },
            { id: 'developers', name: 'Developers', icon: 'Code2' },
            { id: 'support', name: 'Support requests', icon: 'Headset' },
            { id: 'migrate', name: 'Migrate CRM', icon: 'DatabaseBackup' },
            { id: 'apps', name: 'Apps', icon: 'AppWindow' },
        ],
    },
    {
        title: 'Security',
        items: [
            { id: 'security', name: 'Security', icon: 'ShieldCheck' },
            { id: 'email-calendar-security', name: 'Email and calendar', icon: 'Calendar' },
            { id: 'expert-access', name: 'Expert access grants', icon: 'KeyRound' },
        ],
    }
];