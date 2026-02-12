

export enum LeadStatus {
  New = "New Lead",
  Contacted = "Contacted",
  MeetingScheduled = "Meeting Scheduled",
  ApplicationStarted = "Application Started",
  ClosedWon = "Closed - Won",
  ClosedLost = "Closed - Lost",
}

export enum ApplicationStatus {
  Draft = "Draft",
  ApplicationSubmitted = "Application Submitted",
  ConditionalApproval = "Conditional Approval",
  UnconditionalApproval = "Unconditional Approval",
  Settled = "Settled",
  Declined = "Declined",
}

export enum ClientPortalStatus {
  NotSetup = "Not Setup",
  Pending = "Pending Activation",
  Active = "Active",
}

export interface Firm {
  id: string;
  name: string;
}

export interface Client {
  id: string;
  firmId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  postalCode?: string;
  dateOfBirth?: string;
  leadSource?: string;
  employmentStatus?: string;
  employerName?: string;
  notes?: string;
  dateAdded: string;
  advisorId: string;
  avatarUrl: string;
  financials: {
    income: number;
    expenses: number;
    assets: number;
    liabilities: number;
    otherBorrowings: number;
  };
  creditScore: {
    score: number;
    provider: string;
    lastUpdated: string;
  };
  portal: {
    status: ClientPortalStatus;
    lastLogin?: string;
  };
}

export interface Lead {
  id: string;
  firmId: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: LeadStatus;
  estimatedLoanAmount: number;
  dateAdded: string;
  clientId?: string;
  avatarUrl: string;
  conversionProbability?: number;
}

export interface Application {
  id: string;
  firmId: string;
  referenceNumber: string;
  clientName: string;
  clientId: string;
  advisorId: string;
  lender: string;
  loanAmount: number;
  status: ApplicationStatus;
  estSettlementDate: string;
  status_detail: 'Active' | 'Needs Attention' | 'On Hold';
  lastUpdated: string;
  updatedByName: string;
  riskLevel?: 'Low' | 'Medium' | 'High';
  lenderReferenceNumber?: string;
  brokerId?: string;
  financeDueDate?: string;
  loanSecurityAddress?: string;
}

export interface Task {
  id:string;
  firmId: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  priority: 'High' | 'Medium' | 'Low';
  clientId?: string;
  applicationId?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatarUrl?: string;
  recurring?: 'none' | 'daily' | 'weekly' | 'monthly';
  category?: string;
}

export interface Advisor {
    id: string;
    firmId: string;
    name: string;
    email: string;
    avatarUrl: string;
    role: 'admin' | 'broker';
    password?: string; // For mock authentication
    preferredTimezone?: string;
    startWeekOn?: 'Sunday' | 'Monday';
}

export const DOCUMENT_CATEGORIES = [
  '01 Fact Find',
  '02 Financial Evidence',
  '03 Property Documents',
  '04 Lender Application',
  '05 Compliance',
  '06 Insurance',
  '07 Settlement',
  '08 Ongoing Reviews',
] as const;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number] | 'ID' | 'Financial' | 'Other';

export interface Document {
  id: string;
  firmId: string;
  clientId: string;
  name: string;
  category: DocumentCategory;
  folderId?: string;
  uploadDate: string;
  createdAt?: string;
  url: string;
  expiryDate?: string;
  status?: 'Valid' | 'Expiring Soon' | 'Expired';
}

export interface DocumentFolder {
  id: string;
  firmId: string;
  clientId: string;
  name: string;
}

export const KYC_SECTIONS = [
  'primary_photo_id',
  'secondary_id',
  'proof_of_address',
  'trust_kyc',
  'source_of_funds',
] as const;

export type KYCSection = typeof KYC_SECTIONS[number];

export const KYC_SECTION_LABELS: Record<KYCSection, string> = {
  primary_photo_id: 'Primary Photo Identification',
  secondary_id: 'Secondary Identification',
  proof_of_address: 'Proof of Address',
  trust_kyc: 'Trust KYC',
  source_of_funds: 'Source of Funds Evidence',
};

export const REMINDER_OPTIONS = [
  { value: 1, label: '1 day before' },
  { value: 7, label: '1 week before' },
  { value: 30, label: '1 month before' },
] as const;

export interface KYCDocument {
  id: string;
  firmId: string;
  clientId: string;
  name: string;
  url: string;
  kycSection: KYCSection;
  expiryDate?: string;
  status?: 'Valid' | 'Expiring Soon' | 'Expired';
  reminderDaysBefore?: number;
  createdAt?: string;
}

export interface Notification {
  id: string;
  firmId: string;
  userId?: string;
  clientId?: string;
  documentId?: string;
  type: string;
  title: string;
  message?: string;
  dueDate?: string;
  reminderDate?: string;
  readAt?: string;
  createdAt?: string;
}

export interface Note {
  id: string;
  firmId: string;
  clientId: string;
  applicationId?: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  firmId: string;
  taskId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
  createdAt: string;
}

export interface AuditTrailEntry {
  id: string;
  firmId: string;
  clientId: string;
  userName: string;
  userAvatarUrl: string;
  action: string;
  timestamp: string;
  recommendationId?: string;
  recommendationSummary?: string;
}

export interface InterestRate {
  term: string;
  rate: number;
}

export interface BankRates {
  lender: string;
  rates: InterestRate[];
}

export interface LenderRecommendation {
    lender: string;
    confidenceScore: number;
    rationale: string;
    pros: string[];
    cons: string[];
    interestRate?: string;
}

export interface AIRecommendationResponse {
    assessmentSummary: string;
    recommendations: LenderRecommendation[];
    recommendationId: string;
}

export interface OneRoofPropertyDetails {
  address: string;
  type: string;
  propertyId: string;
  listedOn: string;
  broadband: string;
  floorArea: number;
  landArea: number;
  unitaryPlan: string;
  typeOfTitle: string;
  decadeOfConstruction: string;
  contour: string;
  construction: string;
  condition: string;
  deck: string;
  council: string;
  title: string;
  legalDescription: string;
  estateDescription: string;
}

export interface AIComplianceResult {
    isCompliant: boolean;
    reason: string | null;
}

export interface CallTranscript {
  id: string;
  firmId: string;
  clientId?: string;
  timestamp: string;
  duration: number; // in seconds
  transcript: string;
  summary: string;
  actionItems: string[];
  notes?: string;
}