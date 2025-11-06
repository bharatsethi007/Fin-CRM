
import { LeadStatus, ApplicationStatus } from './types';
import type { IconName } from './components/common/Icon';

export interface NavItem {
    id: string;
    name: string;
    icon: IconName;
    view?: string;
}

export interface NavSection {
    type: 'main' | 'collapsible';
    title?: string;
    items?: NavItem[];
    defaultOpen?: boolean;
}

export const SIDEBAR_NAV_ITEMS: NavSection[] = [
  {
    type: 'main',
    items: [
      { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', view: 'dashboard' },
    ],
  },
  {
    type: 'collapsible',
    title: 'My Workspace',
    defaultOpen: true,
    items: [
      { id: 'tasks', name: 'Tasks', icon: 'CheckSquare', view: 'tasks' },
      { id: 'notes', name: 'Notes', icon: 'FileText', view: 'dashboard' }, // placeholder
      { id: 'emails', name: 'Emails', icon: 'Mail', view: 'emails' },
      { id: 'calls', name: 'Calls', icon: 'PhoneCall', view: 'dashboard' }, // placeholder
      { id: 'clients', name: 'Clients', icon: 'Users', view: 'clients' },
      { id: 'leads', name: 'Leads', icon: 'Users', view: 'leads' },
      { id: 'deals', name: 'Deals', icon: 'DollarSign', view: 'applications' },
    ],
  },
];


export const LEAD_STATUS_COLUMNS: LeadStatus[] = [
    LeadStatus.New,
    LeadStatus.Contacted,
    LeadStatus.MeetingScheduled,
    LeadStatus.ApplicationStarted,
    LeadStatus.ClosedWon
];

export const APPLICATION_STATUS_COLUMNS: ApplicationStatus[] = [
    ApplicationStatus.Draft,
    ApplicationStatus.ApplicationSubmitted,
    ApplicationStatus.ConditionalApproval,
    ApplicationStatus.UnconditionalApproval,
    ApplicationStatus.Settled,
];