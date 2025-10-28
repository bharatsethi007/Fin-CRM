import { LeadStatus, ApplicationStatus } from './types';
import type { IconName } from './components/common/Icon';

interface NavItem {
    name: string;
    icon: IconName;
    view: string;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', icon: 'LayoutDashboard', view: 'dashboard' },
  { name: 'Leads', icon: 'Users', view: 'leads' },
  { name: 'Applications', icon: 'Briefcase', view: 'applications' },
  { name: 'Clients', icon: 'Contact', view: 'clients' },
  { name: 'Tasks', icon: 'CheckSquare', view: 'tasks' },
];

export const LEAD_STATUS_COLUMNS: LeadStatus[] = [
    LeadStatus.New,
    LeadStatus.Contacted,
    LeadStatus.MeetingScheduled,
    LeadStatus.ApplicationStarted,
    LeadStatus.ClosedWon
];

export const APPLICATION_STATUS_COLUMNS: ApplicationStatus[] = [
    ApplicationStatus.ApplicationSubmitted,
    ApplicationStatus.ConditionalApproval,
    ApplicationStatus.UnconditionalApproval,
    ApplicationStatus.Settled,
    ApplicationStatus.Declined
];