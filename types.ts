export enum LeadStatus {
  New = "New Lead",
  Contacted = "Contacted",
  MeetingScheduled = "Meeting Scheduled",
  ApplicationStarted = "Application Started",
  ClosedWon = "Closed - Won",
  ClosedLost = "Closed - Lost",
}

export enum ApplicationStatus {
  ApplicationSubmitted = "Application Submitted",
  ConditionalApproval = "Conditional Approval",
  UnconditionalApproval = "Unconditional Approval",
  Settled = "Settled",
  Declined = "Declined",
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  dateAdded: string;
  advisorId: string;
  avatarUrl: string;
  financials: {
    income: number;
    expenses: number;
    assets: number;
    liabilities: number;
  };
  creditScore: {
    score: number;
    provider: string;
    lastUpdated: string;
  };
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: LeadStatus;
  estimatedLoanAmount: number;
  dateAdded: string;
  clientId?: string;
  avatarUrl: string;
}

export interface Application {
  id: string;
  referenceNumber: string;
  clientName: string;
  clientId: string;
  lender: string;
  loanAmount: number;
  status: ApplicationStatus;
  estSettlementDate: string;
  status_detail: 'Active' | 'Needs Attention' | 'On Hold';
  lastUpdated: string;
  updatedByName: string;
}

export interface Task {
  id:string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  priority: 'High' | 'Medium' | 'Low';
  clientId?: string;
  applicationId?: string;
}

export interface Advisor {
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
}

export interface Document {
  id: string;
  clientId: string;
  name: string;
  category: 'ID' | 'Financial' | 'Other';
  uploadDate: string;
  url: string;
}

export interface Note {
  id: string;
  clientId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
  createdAt: string;
}

export interface AuditTrailEntry {
  id: string;
  clientId: string;
  userName: string;
  userAvatarUrl: string;
  action: string;
  timestamp: string;
}