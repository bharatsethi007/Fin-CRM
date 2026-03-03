// Backend API base URL (NestJS). Use .env with VITE_API_URL to override.
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3000';

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
      { id: 'notes', name: 'Notes', icon: 'FileText', view: 'notes' },
      { id: 'emails', name: 'Emails', icon: 'Mail', view: 'emails' },
      { id: 'calls', name: 'Calls', icon: 'PhoneCall', view: 'calls' },
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

// NZ-specific dropdown options
export const NZ_REGIONS = ['Northland', 'Auckland', 'Waikato', 'Bay of Plenty', 'Gisborne', "Hawke's Bay", 'Taranaki', 'Manawatū-Whanganui', 'Wellington', 'Tasman', 'Nelson', 'Marlborough', 'West Coast', 'Canterbury', 'Otago', 'Southland'] as const;
export const NZ_BANKS = ['ANZ', 'ASB', 'BNZ', 'Westpac', 'Kiwibank', 'TSB', 'SBS Bank', 'The Co-operative Bank', 'Heartland Bank', 'HSBC', 'Rabobank'] as const;
export const NZ_KIWISAVER_PROVIDERS = ['ANZ', 'ASB', 'BNZ', 'Westpac', 'Fisher Funds', 'Milford', 'Simplicity', 'Kernel', 'InvestNow', 'Generate', 'Booster', 'AMP'] as const;
export const NZ_RESIDENCY_STATUS = ['NZ Citizen', 'NZ Permanent Resident', 'Australian Citizen', 'Work Visa', 'Student Visa', 'Other'] as const;

// Map ApplicationStatus to Supabase workflow_stage
export const APPLICATION_STATUS_TO_WORKFLOW: Record<ApplicationStatus, string> = {
    [ApplicationStatus.Draft]: 'draft',
    [ApplicationStatus.ApplicationSubmitted]: 'submitted',
    [ApplicationStatus.ConditionalApproval]: 'conditional',
    [ApplicationStatus.UnconditionalApproval]: 'unconditional',
    [ApplicationStatus.Settled]: 'settled',
    [ApplicationStatus.Declined]: 'declined',
};
