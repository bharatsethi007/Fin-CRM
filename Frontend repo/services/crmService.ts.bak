

import type { Client, Lead, Application, Task, Advisor, Document, DocumentFolder, Note, AuditTrailEntry, AIRecommendationResponse, OneRoofPropertyDetails, BankRates, Firm, CallTranscript, TaskComment, KYCDocument, Notification } from '../types';
import type { KYCSection } from '../types';
import { LeadStatus, ApplicationStatus, ClientPortalStatus } from '../types';
import { APPLICATION_STATUS_TO_WORKFLOW } from '../constants';
import { supabase } from './supabaseClient';

const MOCK_FIRMS: Firm[] = [
    { id: 'firm_1', name: 'Kiwi Mortgages' },
    { id: 'firm_2', name: 'Southern Cross Financial' },
];

// Supabase firm_id is UUID; mock firms use 'firm_1' etc. Use this when calling Supabase.
const SUPABASE_FIRM_ID_FALLBACK = '6c03c55d-d9fa-43df-a0e1-a4c63df7ee5b';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function toSupabaseFirmId(firmId: string | undefined): string {
    if (!firmId) return SUPABASE_FIRM_ID_FALLBACK;
    return UUID_REGEX.test(firmId) ? firmId : SUPABASE_FIRM_ID_FALLBACK;
}

const MOCK_ADVISORS: Advisor[] = [
    { id: 'adv_1', firmId: 'firm_1', name: 'Bruce Wayne', email: 'bruce.wayne@wayne-enterprises.com', avatarUrl: 'https://i.pravatar.cc/150?u=adv_1', role: 'admin', password: 'password123', preferredTimezone: 'UTC', startWeekOn: 'Monday' },
    { id: 'adv_2', firmId: 'firm_1', name: 'Sarah Chen', email: 'sarah.chen@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_2', role: 'broker', password: 'password123' },
    { id: 'adv_3', firmId: 'firm_2', name: 'Olivia Garcia', email: 'olivia.g@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_3', role: 'admin', password: 'password123' },
    { id: 'adv_4', firmId: 'firm_2', name: 'Noah Martinez', email: 'noah.m@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_4', role: 'broker', password: 'password123' },
    { id: 'adv_5', firmId: 'firm_1', name: 'Emma Robinson', email: 'emma.r@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_5', role: 'broker', password: 'password123' },
    { id: 'adv_6', firmId: 'firm_2', name: 'James Smith', email: 'james.s@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_6', role: 'broker', password: 'password123' },
];

let MOCK_CLIENTS: Client[] = [
  {
    id: 'c1', firmId: 'firm_1', name: 'Aroha Taylor', email: 'aroha.t@example.co.nz', phone: '021 123 4567',
    address: '12 Kiwi Street, Auckland', dateAdded: '2023-10-15', advisorId: 'adv_1',
    avatarUrl: 'https://i.pravatar.cc/150?u=c1',
    financials: { income: 120000, expenses: 65000, assets: 450000, liabilities: 250000, otherBorrowings: 15000 },
    creditScore: { score: 780, provider: 'Credit Simple', lastUpdated: '2024-07-15' },
    portal: { status: ClientPortalStatus.Active, lastLogin: '2024-07-29T11:00:00Z' },
  },
  {
    id: 'c2', firmId: 'firm_1', name: 'Ben Cooper', email: 'ben.c@example.co.nz', phone: '022 987 6543',
    address: '45 Fern Road, Wellington', dateAdded: '2023-09-22', advisorId: 'adv_1',
    avatarUrl: 'https://i.pravatar.cc/150?u=c2',
    financials: { income: 95000, expenses: 50000, assets: 250000, liabilities: 80000, otherBorrowings: 5000 },
    creditScore: { score: 650, provider: 'Credit Simple', lastUpdated: '2024-06-20' },
    portal: { status: ClientPortalStatus.Pending },
  },
  { id: 'c3', firmId: 'firm_2', name: 'Ivy Clark', email: 'ivy.c@example.co.nz', phone: '021 111 2222', address: '101 Main Street, Christchurch', dateAdded: '2023-11-01', advisorId: 'adv_3', avatarUrl: 'https://i.pravatar.cc/150?u=c3', financials: { income: 150000, expenses: 80000, assets: 750000, liabilities: 350000, otherBorrowings: 25000 }, creditScore: { score: 810, provider: 'Centrix', lastUpdated: '2024-07-01' }, portal: { status: ClientPortalStatus.NotSetup } },
  { id: 'c4', firmId: 'firm_2', name: 'Jack Roberts', email: 'jack.r@example.co.nz', phone: '021 222 3333', address: '202 High Street, Dunedin', dateAdded: '2023-12-05', advisorId: 'adv_4', avatarUrl: 'https://i.pravatar.cc/150?u=c4', financials: { income: 200000, expenses: 100000, assets: 1200000, liabilities: 500000, otherBorrowings: 50000 }, creditScore: { score: 790, provider: 'Credit Simple', lastUpdated: '2024-07-05' }, portal: { status: ClientPortalStatus.Active, lastLogin: '2024-07-28T15:30:00Z' } },
  { id: 'c5', firmId: 'firm_1', name: 'Kate Allen', email: 'kate.a@example.co.nz', phone: '021 333 4444', address: '303 Beach Road, Tauranga', dateAdded: '2024-01-15', advisorId: 'adv_2', avatarUrl: 'https://i.pravatar.cc/150?u=c5', financials: { income: 80000, expenses: 45000, assets: 150000, liabilities: 40000, otherBorrowings: 10000 }, creditScore: { score: 620, provider: 'Centrix', lastUpdated: '2024-07-10' }, portal: { status: ClientPortalStatus.NotSetup } },
];

const MOCK_LEADS: Lead[] = [
    { id: 'l1', firmId: 'firm_1', name: 'Chloe Davis', email: 'chloe.d@example.com', phone: '027 111 2222', source: 'Website', status: LeadStatus.New, estimatedLoanAmount: 550000, dateAdded: '2024-07-28', avatarUrl: 'https://i.pravatar.cc/150?u=l1' },
    { id: 'l2', firmId: 'firm_1', name: 'David Miller', email: 'david.m@example.com', phone: '021 333 4444', source: 'Referral', status: LeadStatus.New, estimatedLoanAmount: 800000, dateAdded: '2024-07-27', avatarUrl: 'https://i.pravatar.cc/150?u=l2' },
    { id: 'l3', firmId: 'firm_2', name: 'Eva Green', email: 'eva.g@example.com', phone: '022 555 6666', source: 'Facebook', status: LeadStatus.Contacted, estimatedLoanAmount: 450000, dateAdded: '2024-07-26', avatarUrl: 'https://i.pravatar.cc/150?u=l3' },
    { id: 'l4', firmId: 'firm_2', name: 'Frank Harris', email: 'frank.h@example.com', phone: '021 777 8888', source: 'Website', status: LeadStatus.MeetingScheduled, estimatedLoanAmount: 1200000, dateAdded: '2024-07-25', avatarUrl: 'https://i.pravatar.cc/150?u=l4' },
];


let MOCK_APPLICATIONS: Application[] = [
    { id: 'd1', firmId: 'firm_1', referenceNumber: 'AF-2407-001', clientName: 'Aroha Taylor', clientId: 'c1', advisorId: 'adv_1', lender: 'ANZ', loanAmount: 650000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-08-30', status_detail: 'Active', lastUpdated: '2024-07-29T14:00:00Z', updatedByName: 'Liam Wilson', lenderReferenceNumber: 'ANZ-12345', brokerId: 'BWF-007', financeDueDate: '2024-08-15', loanSecurityAddress: '12 Kiwi Street, Auckland' },
    { id: 'd2', firmId: 'firm_1', referenceNumber: 'AF-2407-002', clientName: 'Ben Cooper', clientId: 'c2', advisorId: 'adv_2', lender: 'ASB', loanAmount: 480000, status: ApplicationStatus.ConditionalApproval, estSettlementDate: '2024-09-15', status_detail: 'Needs Attention', lastUpdated: '2024-07-28T10:15:00Z', updatedByName: 'Sarah Chen', lenderReferenceNumber: 'ASB-67890', brokerId: 'SCF-002', financeDueDate: '2024-08-20', loanSecurityAddress: '45 Fern Road, Wellington' },
    { id: 'd3', firmId: 'firm_2', referenceNumber: 'AF-2407-003', clientName: 'Ivy Clark', clientId: 'c3', advisorId: 'adv_3', lender: 'BNZ', loanAmount: 720000, status: ApplicationStatus.UnconditionalApproval, estSettlementDate: '2024-08-20', status_detail: 'Active', lastUpdated: '2024-07-29T09:30:00Z', updatedByName: 'Olivia Garcia', lenderReferenceNumber: 'BNZ-54321', brokerId: 'OGF-001', financeDueDate: '2024-08-10', loanSecurityAddress: '101 Main Street, Christchurch' },
    { id: 'd4', firmId: 'firm_2', referenceNumber: 'AF-2407-004', clientName: 'Jack Roberts', clientId: 'c4', advisorId: 'adv_4', lender: 'Westpac', loanAmount: 950000, status: ApplicationStatus.Settled, estSettlementDate: '2024-07-25', status_detail: 'Active', lastUpdated: '2024-07-25T11:00:00Z', updatedByName: 'Noah Martinez', lenderReferenceNumber: 'WPC-98765', brokerId: 'NMF-003', financeDueDate: '2024-07-20', loanSecurityAddress: '202 High Street, Dunedin' },
];


let MOCK_TASKS: Task[] = [
    { id: 't1', firmId: 'firm_1', title: 'Follow up with Chloe Davis', dueDate: '2024-07-30', isCompleted: false, priority: 'High', applicationId: 'd1', assigneeId: 'adv_2', recurring: 'none' },
    { id: 't2', firmId: 'firm_1', title: 'Request bank statements from Ben Cooper', dueDate: '2024-07-29', isCompleted: false, priority: 'High', clientId: 'c2', assigneeId: 'adv_1', recurring: 'weekly' },
    { id: 't3', firmId: 'firm_2', title: 'Prepare meeting agenda for Frank Harris', dueDate: '2024-08-01', isCompleted: false, priority: 'Medium', assigneeId: 'adv_3', recurring: 'none' },
    { id: 't4', firmId: 'firm_1', title: 'Review Aroha Taylor\'s application documents', dueDate: '2024-08-02', isCompleted: true, priority: 'Medium', clientId: 'c1', applicationId: 'd1', assigneeId: 'adv_1', recurring: 'none' },
    { id: 't5', firmId: 'firm_1', title: 'Update KYC for Aroha Taylor', dueDate: '2024-08-15', isCompleted: false, priority: 'High', clientId: 'c1', assigneeId: 'adv_1', recurring: 'none', category: 'compliance' },
    { id: 't6', firmId: 'firm_1', title: 'Renew Expiring ID for Ben Cooper', dueDate: '2024-08-10', isCompleted: false, priority: 'Medium', clientId: 'c2', assigneeId: 'adv_2', recurring: 'none', category: 'compliance' },
    { id: 't7', firmId: 'firm_2', title: 'Conduct Annual Review for Ivy Clark', dueDate: '2024-08-20', isCompleted: false, priority: 'Low', clientId: 'c3', assigneeId: 'adv_3', recurring: 'none', category: 'compliance' },
];

let MOCK_TASK_COMMENTS: TaskComment[] = [
    { id: 'tc1', firmId: 'firm_1', taskId: 't2', authorId: 'adv_1', authorName: 'Bruce Wayne', authorAvatarUrl: 'https://i.pravatar.cc/150?u=adv_1', content: 'Client said they will send this by EOD.', createdAt: '2024-07-28T14:00:00Z' },
    { id: 'tc2', firmId: 'firm_1', taskId: 't2', authorId: 'adv_2', authorName: 'Sarah Chen', authorAvatarUrl: 'https://i.pravatar.cc/150?u=adv_2', content: 'Thanks for the update. I will follow up tomorrow if not received.', createdAt: '2024-07-28T14:05:00Z' },
];

const MOCK_DOCUMENTS: Document[] = [
  { id: 'doc1', firmId: 'firm_1', clientId: 'c1', name: 'Passport_Aroha_Taylor.pdf', category: 'ID', uploadDate: '2023-10-16', url: '#', expiryDate: '2028-05-20' },
  { id: 'doc2', firmId: 'firm_1', clientId: 'c1', name: '3_Month_Bank_Statements.pdf', category: 'Financial', uploadDate: '2023-10-18', url: '#' },
  { id: 'doc3', firmId: 'firm_2', clientId: 'c3', name: 'Drivers_Licence_Ivy_Clark.jpg', category: 'ID', uploadDate: '2023-09-25', url: '#', expiryDate: '2024-08-30'}, // Note: This will be "Expiring Soon" in July
  { id: 'doc4', firmId: 'firm_1', clientId: 'c2', name: 'Expired_ID_Ben_Cooper.pdf', category: 'ID', uploadDate: '2021-12-01', url: '#', expiryDate: '2023-12-31' },
];

let MOCK_NOTES: Note[] = [
  { 
    id: 'n1', firmId: 'firm_1', clientId: 'c1', applicationId: 'd1',
    content: 'Aroha called to ask about the progress of her application with ANZ. I told her we are waiting for the valuation report. @SarahChen to follow up on Friday.', 
    authorId: 'adv_1', authorName: 'Liam Wilson', authorAvatarUrl: 'https://i.pravatar.cc/150?u=adv_1', 
    createdAt: '2024-07-28T10:30:00Z' 
  },
  { 
    id: 'n2', firmId: 'firm_2', clientId: 'c3', 
    content: 'Initial meeting with Ivy went well. She is looking to purchase her first home in the next 3-6 months. Sent her a budget planner to complete.', 
    authorId: 'adv_3', authorName: 'Olivia Garcia', authorAvatarUrl: 'https://i.pravatar.cc/150?u=adv_3', 
    createdAt: '2024-07-20T11:00:00Z' 
  },
   {
    id: 'n3', firmId: 'firm_1', clientId: 'c2',
    content: 'Ben Cooper mentioned he might be getting a pay rise in the next quarter. This could improve his borrowing capacity significantly.',
    authorId: 'adv_2', authorName: 'Sarah Chen', authorAvatarUrl: 'https://i.pravatar.cc/150?u=adv_2',
    createdAt: '2024-07-25T15:00:00Z'
  },
];

let MOCK_AUDIT_TRAIL: AuditTrailEntry[] = [
    { id: 'at1', firmId: 'firm_1', clientId: 'c1', userName: 'Sarah Chen', userAvatarUrl: 'https://i.pravatar.cc/150?u=adv_2', action: 'uploaded document: 3_Month_Bank_Statements.pdf', timestamp: '2024-07-28T11:00:00Z'},
    { id: 'at2', firmId: 'firm_1', clientId: 'c1', userName: 'Liam Wilson', userAvatarUrl: 'https://i.pravatar.cc/150?u=adv_1', action: 'added a new note to application AF-2407-001.', timestamp: '2024-07-28T10:30:00Z'},
    { id: 'at3', firmId: 'firm_2', clientId: 'c3', userName: 'Olivia Garcia', userAvatarUrl: 'https://i.pravatar.cc/150?u=adv_3', action: 'added a new note.', timestamp: '2024-07-20T11:00:00Z'},
];

let MOCK_CALL_TRANSCRIPTS: CallTranscript[] = [
    {
        id: 'ct1',
        firmId: 'firm_1',
        clientId: 'c1',
        timestamp: '2024-07-25T10:00:00Z',
        duration: 320,
        transcript: "Liam: Hi Aroha, it's Liam from Kiwi Mortgages. Just calling to check in on the application. Aroha: Hi Liam, thanks for calling. I was just about to email you. I've got the payslips you asked for. Liam: Great! Can you send them over to me today? Also, the bank is asking for a letter from your employer confirming your start date. Aroha: Oh, okay. I can ask my HR department for that. It might take a day or two. Liam: No problem at all. Just send it through when you can. Once we have those two documents, we should be good to go for unconditional approval. Aroha: Fantastic. I'll get on to it right away. Thanks, Liam. Liam: You're welcome, talk soon.",
        summary: "Liam Wilson from Kiwi Mortgages called Aroha Taylor to follow up on her mortgage application. Aroha confirmed she has her payslips ready to send. Liam requested an additional document: a letter from her employer confirming her start date. Aroha agreed to request this from her HR department.",
        actionItems: [
            "Aroha to send her payslips to Liam today.",
            "Aroha to request an employment confirmation letter from HR.",
            "Liam to follow up if documents are not received in two days."
        ]
    },
    {
        id: 'ct2',
        firmId: 'firm_1',
        clientId: 'c2',
        timestamp: '2024-07-26T11:30:00Z',
        duration: 185,
        transcript: "Sarah: Hi Ben, Sarah here. Just following up on the conditional approval. Ben: Hi Sarah, yeah I saw the email. What does 'conditional' mean exactly? Sarah: It just means the bank is happy with your profile, they just need to see the valuation report for the property before they give the final sign-off. Ben: Ah, I see. Has that been ordered? Sarah: Yes, it has. We expect it back in the next 3 to 5 working days. I'll let you know as soon as I have it. Ben: Perfect, thanks for clarifying.",
        summary: "Sarah Chen called Ben Cooper to discuss his conditional loan approval. She explained that the only outstanding condition is the property valuation report, which has been ordered and is expected within 3-5 business days.",
        actionItems: [ "Sarah to monitor for the valuation report.", "Sarah to update Ben once the report is received." ],
        notes: "Client was initially confused about the conditional approval status but is now clear on the next steps."
    },
    {
        id: 'ct3',
        firmId: 'firm_1',
        timestamp: '2024-07-27T09:00:00Z',
        duration: 240,
        transcript: "Caller: Hi, I was on your website and I'm interested in getting a home loan. My name's Chloe. Bruce: Hi Chloe, Bruce speaking. Thanks for calling. Are you a first home buyer? Chloe: Yes, I am. It's all a bit overwhelming. I'm not sure where to start. Bruce: Not to worry, that's what we're here for. The first step would be to schedule a brief chat to understand your situation. Do you have some time free tomorrow? Chloe: Yes, tomorrow afternoon works. Bruce: Great, I'll send you a calendar invitation for 2pm. I'll also send you a link to our online fact-find form. If you could fill that out beforehand, it will help us make the most of our time. Chloe: Sounds good. Thanks, Bruce.",
        summary: "An inbound call was received from a new lead, Chloe, who is a first home buyer. She expressed uncertainty about the home loan process. Bruce Wayne scheduled a meeting for the following day at 2pm and sent her an online fact-find form to complete prior to the meeting.",
        actionItems: [ "Bruce to send calendar invite to Chloe for 2pm.", "Bruce to send link to online fact-find form.", "Chloe to complete fact-find form before the meeting." ]
    }
];

const MOCK_RECOMMENDATIONS: Record<string, AIRecommendationResponse> = {};
const MOCK_PROPERTY_DETAILS: OneRoofPropertyDetails = { address: '51 Kent Terrace, Riverhead, Rodney', type: 'House', propertyId: 'NLA00767', listedOn: '07/08/2025', broadband: 'Fibre, VDSL, Wireless', floorArea: 120, landArea: 1601, unitaryPlan: 'Zone 19 Residential - Single House Zone', typeOfTitle: 'Freehold', decadeOfConstruction: '1960s', contour: 'Level', construction: 'External Walls: Wood Roof: Iron', condition: 'External Walls: Average Roof: Average', deck: 'Yes', council: 'Auckland - Rodney', title: '462282', legalDescription: 'LOT 1 DP 416041', estateDescription: 'FSIM,1/1,LOT 1 DEPOSITED PLAN 416041,1601m2' };
const MOCK_INTEREST_RATES: BankRates[] = [ { lender: 'ANZ', rates: [ { term: '1-Year Fixed', rate: 7.24 }, { term: '2-Year Fixed', rate: 6.79 }, { term: '3-Year Fixed', rate: 6.65 }, { term: 'Floating', rate: 8.64 }, ] }, { lender: 'ASB', rates: [ { term: '1-Year Fixed', rate: 7.24 }, { term: '2-Year Fixed', rate: 6.79 }, { term: '3-Year Fixed', rate: 6.65 }, { term: 'Floating', rate: 8.64 }, ] }, { lender: 'BNZ', rates: [ { term: '1-Year Fixed', rate: 7.24 }, { term: '2-Year Fixed', rate: 6.79 }, { term: '3-Year Fixed', rate: 6.65 }, { term: 'Floating', rate: 8.64 }, ] }, { lender: 'Westpac', rates: [ { term: '1-Year Fixed', rate: 7.29 }, { term: '2-Year Fixed', rate: 6.85 }, { term: '3-Year Fixed', rate: 6.69 }, { term: 'Floating', rate: 8.64 }, ] }, { lender: 'Kiwi Bank', rates: [ { term: '1-Year Fixed', rate: 7.25 }, { term: '2-Year Fixed', rate: 6.79 }, { term: '3-Year Fixed', rate: 6.65 }, { term: 'Floating', rate: 8.50 }, ] } ];

let currentUser: Advisor | null = null;
let currentFirm: Firm | null = null;

const mockApiCall = <T,>(data: T): Promise<T> => {
    return new Promise(resolve => setTimeout(() => resolve(data), 500));
}
const getMockLeadConversionProbability = (lead: Lead): number => { let score = 0.5; if (lead.source === 'Referral') score += 0.25; if (lead.source === 'Website') score += 0.1; if (lead.estimatedLoanAmount > 750000) score += 0.1; if (lead.status === LeadStatus.MeetingScheduled) score = 0.75; if (lead.status === LeadStatus.ApplicationStarted) score = 0.9; return Math.min(score, 0.95); };
const getMockApplicationRisk = (app: Application): 'Low' | 'Medium' | 'High' => { const lastUpdated = new Date(app.lastUpdated); const today = new Date(); const daysSinceUpdate = (today.getTime() - lastUpdated.getTime()) / (1000 * 3600 * 24); if (app.status_detail === 'Needs Attention') return 'High'; if (app.status_detail === 'On Hold') return 'Medium'; if (app.status === ApplicationStatus.ApplicationSubmitted && daysSinceUpdate > 14) return 'High'; if (app.status === ApplicationStatus.ConditionalApproval && daysSinceUpdate > 21) return 'Medium'; return 'Low'; };

export const crmService = {
  login: (email: string, password: string): Promise<{ advisor: Advisor; firm: Firm }> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const advisor = MOCK_ADVISORS.find(
          (a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password
        );

        if (advisor) {
          const firm = MOCK_FIRMS.find((f) => f.id === advisor.firmId);
          if (firm) {
            currentUser = advisor;
            currentFirm = firm;
            resolve({ advisor, firm });
          } else {
            reject(new Error("Consistency error: Firm not found for this advisor."));
          }
        } else {
          reject(new Error("Invalid email or password."));
        }
      }, 500);
    });
  },
  logout: () => {
    currentUser = null;
    currentFirm = null;
  },
  getAdvisor: () => {
    if (!currentUser) throw new Error("Not logged in");
    return mockApiCall(currentUser);
  },
  getAdvisors: () => {
      if (!currentFirm) return mockApiCall([]);
      return mockApiCall(MOCK_ADVISORS.filter(a => a.firmId === currentFirm!.id));
  },
  getFirms: () => mockApiCall([...MOCK_FIRMS]),
  
  getClients: async () => {
    if (!currentFirm) return [];
    
    try {
        // Import supabase at the top of the file
        const { supabase } = await import('./supabaseClient');
        
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('firm_id', supabaseFirmId);
        
        if (error) {
            console.error('Error fetching clients from Supabase:', error);
            return [];
        }
        
        // Map Supabase data to your Client type
        const mappedClients: Client[] = (data || []).map(client => {
            const portalStatus = client.portal_status as string | undefined;
            const status = (portalStatus === 'Active' || portalStatus === 'Pending Activation' || portalStatus === 'Not Setup')
                ? (portalStatus as ClientPortalStatus)
                : ClientPortalStatus.NotSetup;
            return {
                id: client.id,
                firmId: client.firm_id,
                name: `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Unnamed',
                email: client.email,
                phone: client.phone || '',
                address: client.residential_address || '',
                city: client.city || undefined,
                postalCode: client.postal_code || undefined,
                dateOfBirth: client.date_of_birth ? new Date(client.date_of_birth).toISOString().slice(0, 10) : undefined,
                leadSource: client.lead_source || undefined,
                employmentStatus: client.employment_status || undefined,
                employerName: client.employer_name || undefined,
                notes: client.notes || undefined,
                dateAdded: client.created_at ? new Date(client.created_at).toLocaleDateString('en-NZ') : '',
                advisorId: client.assigned_to || '',
                avatarUrl: client.photo_url || `https://i.pravatar.cc/150?u=${client.id}`,
                financials: {
                    income: Number(client.annual_income) || 0,
                    expenses: Number(client.annual_expenses) || 0,
                    assets: Number(client.total_assets) || 0,
                    liabilities: Number(client.total_liabilities) || 0,
                    otherBorrowings: Number(client.other_borrowings) || 0,
                },
                creditScore: {
                    score: Number(client.credit_score) || 0,
                    provider: client.credit_score_provider || '',
                    lastUpdated: client.credit_score_last_updated ? new Date(client.credit_score_last_updated).toISOString().slice(0, 10) : '',
                },
                portal: {
                    status,
                    lastLogin: client.portal_last_login ? new Date(client.portal_last_login).toISOString() : undefined,
                },
            };
        });
        
        return mappedClients;
    } catch (err) {
        console.error('Failed to load clients:', err);
        return [];
    }
},
  getLeads: () => {
    if (!currentFirm) return mockApiCall([]);
    const leadsWithProbs = MOCK_LEADS
        .filter(l => l.firmId === currentFirm!.id)
        .map(lead => ({
            ...lead,
            conversionProbability: getMockLeadConversionProbability(lead)
        }));
    return mockApiCall(leadsWithProbs);
  },
  getApplications: async () => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('applications')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const clientsData = await supabase.from('clients').select('id, first_name, last_name').in('id', (data || []).map(a => a.client_id));
        const clientsMap = new Map((clientsData.data || []).map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]));

        return (data || []).map(app => {
            const workflowToStatus: Record<string, ApplicationStatus> = {
                draft: ApplicationStatus.Draft,
                submitted: ApplicationStatus.ApplicationSubmitted,
                conditional: ApplicationStatus.ConditionalApproval,
                conditional_approval: ApplicationStatus.ConditionalApproval,
                unconditional: ApplicationStatus.UnconditionalApproval,
                unconditional_approval: ApplicationStatus.UnconditionalApproval,
                settled: ApplicationStatus.Settled,
                declined: ApplicationStatus.Declined,
            };
            const status = workflowToStatus[app.workflow_stage] || ApplicationStatus.Draft;
            const lenders = app.selected_lenders?.length ? app.selected_lenders : (app.lender_name ? [app.lender_name] : []);
            return {
                id: app.id,
                firmId: app.firm_id,
                referenceNumber: app.reference_number || '',
                clientName: clientsMap.get(app.client_id) || 'Unknown',
                clientId: app.client_id,
                advisorId: app.assigned_to || '',
                lender: lenders[0] || app.lender_name || 'N/A',
                loanAmount: Number(app.loan_amount) || 0,
                status,
                estSettlementDate: app.settlement_date ? new Date(app.settlement_date).toISOString().slice(0, 10) : '',
                status_detail: app.status === 'active' ? 'Active' : 'Needs Attention',
                lastUpdated: app.created_at || '',
                updatedByName: '',
                lenderReferenceNumber: app.lender_product || undefined,
                brokerId: undefined,
                financeDueDate: undefined,
                loanSecurityAddress: app.property_address || undefined,
                riskLevel: (app.risk_level as 'Low' | 'Medium' | 'High') || getMockApplicationRisk({
                    id: app.id,
                    status,
                    status_detail: 'Active',
                    lastUpdated: app.updated_at || app.created_at || '',
                } as Application) as 'Low' | 'Medium' | 'High',
            };
        });
    } catch (err) {
        console.error('Failed to load applications:', err);
        return [];
    }
  },
  updateApplicationWorkflowStage: async (applicationId: string, newStatus: ApplicationStatus): Promise<void> => {
    const workflowStage = APPLICATION_STATUS_TO_WORKFLOW[newStatus];
    if (!workflowStage) throw new Error(`Invalid status: ${newStatus}`);
    const { error } = await supabase
        .from('applications')
        .update({ workflow_stage: workflowStage })
        .eq('id', applicationId);
    if (error) throw error;
  },
  getTasks: async (): Promise<Task[]> => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });
        if (error) throw error;

        const userIds = [...new Set((data || []).map(t => t.assigned_to).filter(Boolean))] as string[];
        const usersMap = new Map<string, { name: string; photo_url?: string }>();
        if (userIds.length > 0) {
            const { data: usersData } = await supabase.from('users').select('id, first_name, last_name, photo_url').in('id', userIds);
            (usersData || []).forEach(u => usersMap.set(u.id, { name: `${u.first_name || ''} ${u.last_name || ''}`.trim(), photo_url: u.photo_url }));
        }

        return (data || []).map(t => {
            const assignee = t.assigned_to ? usersMap.get(t.assigned_to) : undefined;
            const priorityMap: Record<string, 'High' | 'Medium' | 'Low'> = {
                low: 'Low', medium: 'Medium', high: 'High',
            };
            const isCompleted = t.status === 'completed';
            const taskType = t.task_type || 'to_do';
            return {
                id: t.id,
                firmId: t.firm_id,
                title: t.title,
                description: t.description,
                dueDate: t.due_date ? new Date(t.due_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                dueTime: t.due_time,
                isCompleted,
                priority: priorityMap[t.priority] || 'Medium',
                taskType: taskType as Task['taskType'],
                status: t.status as Task['status'],
                clientId: t.client_id,
                applicationId: t.application_id,
                assigneeId: t.assigned_to,
                assigneeName: assignee?.name,
                assigneeAvatarUrl: assignee?.photo_url,
                category: taskType === 'compliance' ? 'compliance' : undefined,
                completedAt: t.completed_at,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
            };
        });
    } catch (err) {
        console.error('Failed to load tasks:', err);
        return [];
    }
  },
  createTask: async (taskData: {
    title: string;
    description?: string;
    taskType?: string;
    priority?: string;
    clientId?: string;
    applicationId?: string;
    assignedTo?: string;
    dueDate: string;
    dueTime?: string;
  }): Promise<Task> => {
    if (!currentFirm || !currentUser) throw new Error('Not logged in');
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const currentUserId = currentUser.id;
    const userUuid = UUID_REGEX.test(currentUserId) ? currentUserId : null;

    const { data, error } = await supabase
        .from('tasks')
        .insert([{
            firm_id: supabaseFirmId,
            title: taskData.title,
            description: taskData.description || null,
            task_type: taskData.taskType || 'to_do',
            priority: (taskData.priority || 'medium').toLowerCase(),
            client_id: taskData.clientId || null,
            application_id: taskData.applicationId || null,
            assigned_to: (taskData.assignedTo && UUID_REGEX.test(taskData.assignedTo)) ? taskData.assignedTo : null,
            due_date: taskData.dueDate || null,
            due_time: taskData.dueTime || null,
            status: 'pending',
            created_by: userUuid,
        }])
        .select()
        .single();
    if (error) throw error;

    return {
        id: data.id,
        firmId: data.firm_id,
        title: data.title,
        description: data.description,
        dueDate: data.due_date ? new Date(data.due_date).toISOString().slice(0, 10) : '',
        isCompleted: false,
        priority: (data.priority === 'high' ? 'High' : data.priority === 'low' ? 'Low' : 'Medium') as 'High' | 'Medium' | 'Low',
        taskType: (data.task_type || 'to_do') as Task['taskType'],
        status: data.status,
        clientId: data.client_id,
        applicationId: data.application_id,
        assigneeId: data.assigned_to,
        category: data.task_type === 'compliance' ? 'compliance' : undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
  },
  getDocuments: async (clientId?: string) => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        let query = supabase
            .from('documents')
            .select('*')
            .eq('firm_id', supabaseFirmId);
        if (clientId) query = query.eq('client_id', clientId);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const documentsWithStatus = (data || []).map(doc => {
            let status: Document['status'] | undefined;
            if ((doc.category === 'ID' || doc.category?.includes('Compliance')) && doc.expiry_date) {
                const expiryDate = new Date(doc.expiry_date);
                const diffTime = expiryDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays < 0) status = 'Expired';
                else if (diffDays <= 30) status = 'Expiring Soon';
                else status = 'Valid';
            }
            return {
                id: doc.id,
                firmId: doc.firm_id,
                clientId: doc.client_id,
                name: doc.name,
                category: doc.category as Document['category'],
                folderId: doc.folder_id || undefined,
                uploadDate: doc.upload_date ? new Date(doc.upload_date).toLocaleDateString('en-NZ') : '',
                createdAt: doc.created_at,
                url: doc.url,
                expiryDate: doc.expiry_date ? new Date(doc.expiry_date).toISOString().slice(0, 10) : undefined,
                status,
            };
        });
        return documentsWithStatus;
    } catch (err) {
        console.error('Failed to load documents:', err);
        return [];
    }
  },

  addDocument: async (clientId: string, file: File, category: string, folderId?: string | null): Promise<Document> => {
    if (!currentFirm) return Promise.reject("No firm context");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const fileName = `${clientId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(fileName, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(uploadData.path);
    const publicUrl = urlData.publicUrl;

    const { data: docData, error: insertError } = await supabase
        .from('documents')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: clientId,
            name: file.name,
            category,
            url: publicUrl,
            upload_date: new Date().toISOString().slice(0, 10),
            folder_id: folderId || null,
        }])
        .select()
        .single();
    if (insertError) throw insertError;

    return {
        id: docData.id,
        firmId: docData.firm_id,
        clientId: docData.client_id,
        name: docData.name,
        category: docData.category as Document['category'],
        folderId: docData.folder_id || undefined,
        uploadDate: docData.upload_date ? new Date(docData.upload_date).toLocaleDateString('en-NZ') : '',
        createdAt: docData.created_at,
        url: docData.url,
    };
  },

  updateDocument: async (documentId: string, updates: { name?: string; category?: string; expiryDate?: string | null; reminderDaysBefore?: number | null }): Promise<void> => {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.expiryDate !== undefined) payload.expiry_date = updates.expiryDate;
    if (updates.reminderDaysBefore !== undefined) payload.reminder_days_before = updates.reminderDaysBefore;
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase.from('documents').update(payload).eq('id', documentId);
    if (error) throw error;
  },

  deleteDocument: async (documentId: string): Promise<void> => {
    const { error } = await supabase.from('documents').delete().eq('id', documentId);
    if (error) throw error;
  },

  renameFolder: async (folderId: string, name: string): Promise<void> => {
    const { error } = await supabase.from('document_folders').update({ name }).eq('id', folderId);
    if (error) throw error;
  },

  deleteFolder: async (folderId: string): Promise<void> => {
    const { error } = await supabase.from('documents').update({ folder_id: null }).eq('folder_id', folderId);
    if (error) throw error;
    const { error: delError } = await supabase.from('document_folders').delete().eq('id', folderId);
    if (delError) throw delError;
  },

  getFolders: async (clientId: string) => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('document_folders')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .eq('client_id', clientId)
            .order('name');
        if (error) throw error;
        return (data || []).map(f => ({
            id: f.id,
            firmId: f.firm_id,
            clientId: f.client_id,
            name: f.name,
        }));
    } catch (err) {
        console.error('Failed to load folders:', err);
        return [];
    }
  },

  createFolder: async (clientId: string, name: string): Promise<DocumentFolder> => {
    if (!currentFirm) return Promise.reject("No firm context");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const { data, error } = await supabase
        .from('document_folders')
        .insert([{ firm_id: supabaseFirmId, client_id: clientId, name }])
        .select()
        .single();
    if (error) throw error;
    return { id: data.id, firmId: data.firm_id, clientId: data.client_id, name: data.name };
  },

  moveDocumentsToFolder: async (documentIds: string[], folderId: string | null): Promise<void> => {
    if (documentIds.length === 0) return;
    const { error } = await supabase
        .from('documents')
        .update({ folder_id: folderId })
        .in('id', documentIds);
    if (error) throw error;
  },

  getKycDocuments: async (clientId: string): Promise<KYCDocument[]> => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .eq('client_id', clientId)
            .not('kyc_section', 'is', null)
            .order('created_at', { ascending: false });
        if (error) throw error;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return (data || []).map(doc => {
            let status: KYCDocument['status'];
            if (doc.expiry_date) {
                const expiryDate = new Date(doc.expiry_date);
                const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) status = 'Expired';
                else if (diffDays <= 30) status = 'Expiring Soon';
                else status = 'Valid';
            } else status = undefined;
            return {
                id: doc.id,
                firmId: doc.firm_id,
                clientId: doc.client_id,
                name: doc.name,
                url: doc.url,
                kycSection: doc.kyc_section as KYCSection,
                expiryDate: doc.expiry_date ? new Date(doc.expiry_date).toISOString().slice(0, 10) : undefined,
                status,
                reminderDaysBefore: doc.reminder_days_before ?? undefined,
                createdAt: doc.created_at,
            };
        });
    } catch (err) {
        console.error('Failed to load KYC documents:', err);
        return [];
    }
  },

  addKycDocument: async (clientId: string, file: File, kycSection: KYCSection, expiryDate?: string | null, reminderDaysBefore?: number | null): Promise<KYCDocument> => {
    if (!currentFirm) return Promise.reject("No firm context");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const fileName = `${clientId}/kyc/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(fileName, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(uploadData.path);
    const publicUrl = urlData.publicUrl;

    const { data: docData, error: insertError } = await supabase
        .from('documents')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: clientId,
            name: file.name,
            category: 'ID',
            url: publicUrl,
            upload_date: new Date().toISOString().slice(0, 10),
            kyc_section: kycSection,
            expiry_date: expiryDate || null,
            reminder_days_before: reminderDaysBefore ?? null,
        }])
        .select()
        .single();
    if (insertError) throw insertError;

    if (reminderDaysBefore && expiryDate) {
        const expiry = new Date(expiryDate);
        expiry.setDate(expiry.getDate() - reminderDaysBefore);
        const reminderDate = expiry.toISOString().slice(0, 10);
        await supabase.from('notifications').insert([{
            firm_id: supabaseFirmId,
            document_id: docData.id,
            client_id: clientId,
            type: 'kyc_expiry_reminder',
            title: 'KYC document expiring soon',
            message: `${file.name} expires on ${expiryDate}. Reminder set for ${reminderDate}.`,
            due_date: expiryDate,
            reminder_date: reminderDate,
        }]);
    }

    return {
        id: docData.id,
        firmId: docData.firm_id,
        clientId: docData.client_id,
        name: docData.name,
        url: docData.url,
        kycSection: docData.kyc_section as KYCSection,
        expiryDate: docData.expiry_date ? new Date(docData.expiry_date).toISOString().slice(0, 10) : undefined,
        reminderDaysBefore: docData.reminder_days_before ?? undefined,
        createdAt: docData.created_at,
    };
  },

  updateKycDocument: async (documentId: string, updates: { expiryDate?: string | null; reminderDaysBefore?: number | null }): Promise<void> => {
    const payload: Record<string, unknown> = {};
    if (updates.expiryDate !== undefined) payload.expiry_date = updates.expiryDate;
    if (updates.reminderDaysBefore !== undefined) payload.reminder_days_before = updates.reminderDaysBefore;
    if (Object.keys(payload).length === 0) return;
    const { data: doc, error } = await supabase.from('documents').update(payload).eq('id', documentId).select('client_id, name').single();
    if (error) throw error;

    if (updates.reminderDaysBefore !== undefined && updates.reminderDaysBefore > 0 && updates.expiryDate) {
        await supabase.from('notifications').delete().eq('document_id', documentId).eq('type', 'kyc_expiry_reminder');
        const supabaseFirmId = toSupabaseFirmId(currentFirm?.id);
        const expiry = new Date(updates.expiryDate);
        expiry.setDate(expiry.getDate() - updates.reminderDaysBefore);
        const reminderDate = expiry.toISOString().slice(0, 10);
        await supabase.from('notifications').insert([{
            firm_id: supabaseFirmId,
            document_id: documentId,
            client_id: doc?.client_id,
            type: 'kyc_expiry_reminder',
            title: 'KYC document expiring soon',
            message: `${doc?.name || 'Document'} expires on ${updates.expiryDate}.`,
            due_date: updates.expiryDate,
            reminder_date: reminderDate,
        }]);
    }
  },

  getNotifications: async (): Promise<Notification[]> => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .not('reminder_date', 'is', null)
            .lte('reminder_date', today)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return (data || []).map(n => ({
            id: n.id,
            firmId: n.firm_id,
            userId: n.user_id,
            clientId: n.client_id,
            documentId: n.document_id,
            type: n.type,
            title: n.title,
            message: n.message,
            dueDate: n.due_date,
            reminderDate: n.reminder_date,
            readAt: n.read_at,
            createdAt: n.created_at,
        }));
    } catch (err) {
        console.error('Failed to load notifications:', err);
        return [];
    }
  },

  markNotificationRead: async (notificationId: string): Promise<void> => {
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
    if (error) throw error;
  },

  getNotes: async (clientId?: string, applicationId?: string) => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        let query = supabase
            .from('notes')
            .select('*')
            .eq('firm_id', supabaseFirmId);
        if (clientId) query = query.eq('client_id', clientId);
        if (applicationId) query = query.eq('application_id', applicationId);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        return (data || []).map(n => ({
            id: n.id,
            firmId: n.firm_id,
            clientId: n.client_id,
            applicationId: n.application_id || undefined,
            content: n.content,
            authorId: n.author_id || '',
            authorName: n.author_name,
            authorAvatarUrl: n.author_avatar_url || '',
            createdAt: n.created_at,
        }));
    } catch (err) {
        console.error('Failed to load notes:', err);
        return [];
    }
  },
  getAuditTrail: async (clientId: string) => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('audit_trail')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });
        if (error) throw error;

        return (data || []).map(at => ({
            id: at.id,
            firmId: at.firm_id,
            clientId: at.client_id,
            userName: at.user_name,
            userAvatarUrl: at.user_avatar_url || '',
            action: at.action,
            timestamp: at.created_at,
            recommendationId: at.recommendation_id || undefined,
            recommendationSummary: at.recommendation_summary || undefined,
        }));
    } catch (err) {
        console.error('Failed to load audit trail:', err);
        return [];
    }
  },

  addAuditTrailEntry: async (entryData: Omit<AuditTrailEntry, 'id' | 'timestamp' | 'firmId'>): Promise<AuditTrailEntry> => {
    if (!currentFirm) return Promise.reject("No firm context");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const { data, error } = await supabase
        .from('audit_trail')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: entryData.clientId,
            user_name: entryData.userName,
            user_avatar_url: entryData.userAvatarUrl || null,
            action: entryData.action,
            recommendation_id: entryData.recommendationId || null,
            recommendation_summary: entryData.recommendationSummary || null,
        }])
        .select()
        .single();
    if (error) throw error;
    return {
        ...entryData,
        id: data.id,
        firmId: data.firm_id,
        timestamp: data.created_at,
    };
  },

  addNote: async (noteData: Omit<Note, 'id' | 'createdAt' | 'firmId'>): Promise<Note> => {
    if (!currentFirm) return Promise.reject("No firm context");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const authorId = (noteData.authorId && UUID_REGEX.test(noteData.authorId)) ? noteData.authorId : null;
    const { data, error } = await supabase
        .from('notes')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: noteData.clientId,
            application_id: noteData.applicationId || null,
            content: noteData.content,
            author_id: authorId,
            author_name: noteData.authorName,
            author_avatar_url: noteData.authorAvatarUrl || null,
        }])
        .select()
        .single();
    if (error) throw error;

    let action = 'added a new note.';
    if (noteData.applicationId) {
        const apps = await supabase.from('applications').select('reference_number').eq('id', noteData.applicationId).single();
        action = `added a new note to application ${apps?.data?.reference_number || ''}.`;
    }
    await crmService.addAuditTrailEntry({
        clientId: noteData.clientId,
        userName: noteData.authorName,
        userAvatarUrl: noteData.authorAvatarUrl,
        action,
    });
    return {
        ...noteData,
        id: data.id,
        firmId: data.firm_id,
        createdAt: data.created_at,
    };
  },

  addTask: (taskData: Omit<Task, 'id' | 'isCompleted' | 'firmId'>): Promise<Task> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const newTask: Task = {
      ...taskData,
      id: `t${MOCK_TASKS.length + 1}`,
      firmId: currentFirm.id,
      isCompleted: false,
    };
    MOCK_TASKS.unshift(newTask);
    if (taskData.clientId) {
      crmService.addAuditTrailEntry({
          clientId: taskData.clientId,
          userName: currentUser.name,
          userAvatarUrl: currentUser.avatarUrl,
          action: `created task: "${taskData.title}"`
      });
    }
    return mockApiCall(newTask);
  },
  
  updateClientContactDetails: (clientId: string, details: Partial<Pick<Client, 'name' | 'email' | 'phone' | 'address'>>): Promise<Client> => {
    if (!currentUser) return Promise.reject("Not logged in");
    const clientIndex = MOCK_CLIENTS.findIndex(c => c.id === clientId);
    if (clientIndex > -1) {
        const originalClient = { ...MOCK_CLIENTS[clientIndex] };
        MOCK_CLIENTS[clientIndex] = { ...MOCK_CLIENTS[clientIndex], ...details };
        
        const changes = Object.keys(details)
            .filter(key => details[key as keyof typeof details] !== originalClient[key as keyof typeof details])
            .map(key => `${key} changed`)
            .join(', ');

        if (changes) {
            crmService.addAuditTrailEntry({
                clientId: clientId,
                userName: currentUser.name,
                userAvatarUrl: currentUser.avatarUrl,
                action: `updated contact details: ${changes}.`
            });
        }
        return mockApiCall(MOCK_CLIENTS[clientIndex]);
    }
    return Promise.reject('Client not found');
  },
  
  updateClientFinancials: (clientId: string, financials: Client['financials']): Promise<Client> => {
    if (!currentUser) return Promise.reject("Not logged in");
    const clientIndex = MOCK_CLIENTS.findIndex(c => c.id === clientId);
    if (clientIndex > -1) {
        MOCK_CLIENTS[clientIndex].financials = financials;
        crmService.addAuditTrailEntry({
            clientId: clientId,
            userName: currentUser.name,
            userAvatarUrl: currentUser.avatarUrl,
            action: 'updated the financial summary.'
        });
        return mockApiCall(MOCK_CLIENTS[clientIndex]);
    }
    return Promise.reject('Client not found');
  },

  updateApplicationDetails: async (applicationId: string, details: Partial<Application>): Promise<Application> => {
    if (!currentUser) return Promise.reject("Not logged in");
    const updatePayload: Record<string, unknown> = {};
    if (details.lender !== undefined) updatePayload.lender_name = details.lender;
    if (details.loanAmount !== undefined) updatePayload.loan_amount = details.loanAmount;
    if (details.estSettlementDate !== undefined) updatePayload.settlement_date = details.estSettlementDate || null;
    if (details.loanSecurityAddress !== undefined) updatePayload.property_address = details.loanSecurityAddress;

    const { data: updated, error } = await supabase
        .from('applications')
        .update(updatePayload)
        .eq('id', applicationId)
        .select()
        .single();
    if (error) throw error;

    const changes = Object.keys(details).join(', ');
    if (changes) {
        await crmService.addAuditTrailEntry({
            clientId: updated.client_id,
            userName: currentUser.name,
            userAvatarUrl: currentUser.avatarUrl,
            action: `updated application ${updated.reference_number}: ${changes}.`,
        });
    }

    const clientsData = await supabase.from('clients').select('first_name, last_name').eq('id', updated.client_id).single();
    const clientName = clientsData.data ? `${clientsData.data.first_name || ''} ${clientsData.data.last_name || ''}`.trim() : 'Unknown';

    const workflowToStatus: Record<string, ApplicationStatus> = {
        draft: ApplicationStatus.Draft,
        submitted: ApplicationStatus.ApplicationSubmitted,
        conditional: ApplicationStatus.ConditionalApproval,
        conditional_approval: ApplicationStatus.ConditionalApproval,
        unconditional: ApplicationStatus.UnconditionalApproval,
        unconditional_approval: ApplicationStatus.UnconditionalApproval,
        settled: ApplicationStatus.Settled,
        declined: ApplicationStatus.Declined,
    };
    return {
        id: updated.id,
        firmId: updated.firm_id,
        referenceNumber: updated.reference_number || '',
        clientName,
        clientId: updated.client_id,
        advisorId: updated.assigned_to || '',
        lender: details.lender ?? updated.lender_name ?? 'N/A',
        loanAmount: Number(details.loanAmount ?? updated.loan_amount) || 0,
        status: workflowToStatus[updated.workflow_stage] || ApplicationStatus.Draft,
        estSettlementDate: details.estSettlementDate ?? (updated.settlement_date ? new Date(updated.settlement_date).toISOString().slice(0, 10) : ''),
        status_detail: 'Active',
        lastUpdated: new Date().toISOString(),
        updatedByName: currentUser.name,
        loanSecurityAddress: details.loanSecurityAddress ?? updated.property_address,
    };
  },

  createDraftApplication: async (clientId: string, clientName: string): Promise<Application> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    const { count } = await supabase.from('applications').select('*', { count: 'exact', head: true }).eq('firm_id', supabaseFirmId);
    const refNum = `AF-${year}${month}-${((count || 0) + 1).toString().padStart(3, '0')}`;

    const { data, error } = await supabase
        .from('applications')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: clientId,
            assigned_to: null,
            reference_number: refNum,
            application_type: 'purchase',
            workflow_stage: 'draft',
            status: 'active',
            loan_amount: 0,
        }])
        .select()
        .single();
    if (error) throw error;

    await crmService.addAuditTrailEntry({
        clientId,
        userName: currentUser.name,
        userAvatarUrl: currentUser.avatarUrl,
        action: `created a new draft application: ${refNum}.`,
    });

    return {
        id: data.id,
        firmId: data.firm_id,
        referenceNumber: data.reference_number,
        clientName,
        clientId: data.client_id,
        advisorId: data.assigned_to || '',
        lender: 'N/A',
        loanAmount: 0,
        status: ApplicationStatus.Draft,
        estSettlementDate: '',
        status_detail: 'Needs Attention',
        lastUpdated: data.created_at,
        updatedByName: currentUser.name,
        lenderReferenceNumber: '',
        brokerId: '',
        financeDueDate: '',
        loanSecurityAddress: '',
    };
  },

  getApplicationById: async (applicationId: string) => {
    const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('id', applicationId)
        .single();
    if (error) throw error;
    return data;
  },

  saveApplicationDraft: async (
    applicationId: string,
    data: {
      loanAmount: number;
      purpose: string;
      term: number;
      propertyAddress: string;
      propertyValue: number | null;
      propertyDetails: Record<string, unknown> | null;
      selectedLenders: string[];
    }
  ): Promise<void> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const purposeToAppType: Record<string, string> = {
      'First Home Purchase': 'purchase',
      'Next Home Purchase': 'purchase',
      'Investment Property': 'purchase',
      'Refinance': 'refinance',
      'Top-up': 'topup',
    };
    const appType = purposeToAppType[data.purpose] || 'purchase';

    const { error } = await supabase
        .from('applications')
        .update({
            loan_amount: data.loanAmount,
            loan_term_years: data.term,
            application_type: appType,
            loan_purpose: data.purpose,
            property_address: data.propertyAddress || null,
            property_value: data.propertyValue,
            property_details: data.propertyDetails,
            lender_name: data.selectedLenders[0] || null,
            selected_lenders: data.selectedLenders,
            workflow_stage: 'draft',
        })
        .eq('id', applicationId);
    if (error) throw error;
  },

  submitApplication: async (
    applicationId: string,
    data: {
      loanAmount: number;
      purpose: string;
      term: number;
      propertyAddress: string;
      propertyValue: number;
      propertyDetails: Record<string, unknown> | null;
      selectedLenders: string[];
    }
  ): Promise<Application> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const purposeToAppType: Record<string, string> = {
      'First Home Purchase': 'purchase',
      'Next Home Purchase': 'purchase',
      'Investment Property': 'purchase',
      'Refinance': 'refinance',
      'Top-up': 'topup',
    };
    const appType = purposeToAppType[data.purpose] || 'purchase';

    const { data: updated, error } = await supabase
        .from('applications')
        .update({
            loan_amount: data.loanAmount,
            loan_term_years: data.term,
            application_type: appType,
            loan_purpose: data.purpose,
            property_address: data.propertyAddress,
            property_value: data.propertyValue,
            property_details: data.propertyDetails,
            lender_name: data.selectedLenders[0] || null,
            selected_lenders: data.selectedLenders,
            workflow_stage: 'submitted',
            submitted_at: new Date().toISOString(),
        })
        .eq('id', applicationId)
        .select()
        .single();
    if (error) throw error;

    await crmService.addAuditTrailEntry({
        clientId: updated.client_id,
        userName: currentUser.name,
        userAvatarUrl: currentUser.avatarUrl,
        action: `submitted application ${updated.reference_number} to ${data.selectedLenders.join(', ')} for $${data.loanAmount.toLocaleString()}.`,
    });

    const clientsData = await supabase.from('clients').select('first_name, last_name').eq('id', updated.client_id).single();
    const clientName = clientsData.data ? `${clientsData.data.first_name || ''} ${clientsData.data.last_name || ''}`.trim() : 'Unknown';

    return {
        id: updated.id,
        firmId: updated.firm_id,
        referenceNumber: updated.reference_number || '',
        clientName,
        clientId: updated.client_id,
        advisorId: updated.assigned_to || '',
        lender: data.selectedLenders[0] || 'N/A',
        loanAmount: data.loanAmount,
        status: ApplicationStatus.ApplicationSubmitted,
        estSettlementDate: '',
        status_detail: 'Active',
        lastUpdated: updated.submitted_at,
        updatedByName: currentUser.name,
        loanSecurityAddress: data.propertyAddress,
    };
  },

  saveLenderRecommendation: (clientId: string, recommendation: AIRecommendationResponse): Promise<AIRecommendationResponse> => {
    if (!currentUser) return Promise.reject("Not logged in");
    MOCK_RECOMMENDATIONS[recommendation.recommendationId] = recommendation;
    
    crmService.addAuditTrailEntry({
        clientId: clientId,
        userName: `${currentUser.name} (via AI)`,
        userAvatarUrl: currentUser.avatarUrl,
        action: 'generated an AI lender recommendation.',
        recommendationId: recommendation.recommendationId,
        recommendationSummary: recommendation.assessmentSummary,
    });
    return mockApiCall(recommendation);
  },
  
  getLenderRecommendationById: (recommendationId: string): Promise<AIRecommendationResponse | undefined> => {
    return mockApiCall(MOCK_RECOMMENDATIONS[recommendationId]);
  },

  getOneRoofPropertyDetails: (address: string): Promise<OneRoofPropertyDetails> => {
    const details = { ...MOCK_PROPERTY_DETAILS, address };
    return new Promise(resolve => setTimeout(() => resolve(details), 1000));
  },

  getCurrentInterestRates: (): Promise<BankRates[]> => {
    return mockApiCall(MOCK_INTEREST_RATES);
  },

  setupClientPortal: async (clientId: string): Promise<Client> => {
    if (!currentUser) return Promise.reject("Not logged in");
    const clientIndex = MOCK_CLIENTS.findIndex(c => c.id === clientId);
    if (clientIndex > -1) {
      MOCK_CLIENTS[clientIndex].portal.status = ClientPortalStatus.Pending;
      await crmService.addAuditTrailEntry({
          clientId: clientId,
          userName: currentUser.name,
          userAvatarUrl: currentUser.avatarUrl,
          action: 'sent client portal invitation.'
      });
      return mockApiCall(MOCK_CLIENTS[clientIndex]);
    }
    return Promise.reject('Client not found');
  },

  resendPortalInvitation: async (clientId: string): Promise<void> => {
    if (!currentUser) return Promise.reject("Not logged in");
    await crmService.addAuditTrailEntry({
        clientId: clientId,
        userName: currentUser.name,
        userAvatarUrl: currentUser.avatarUrl,
        action: 'resent client portal invitation.'
    });
    alert(`Invitation link resent to client.`);
    return mockApiCall(undefined);
  },

  loginAsClient: (clientId: string): Promise<void> => {
    alert(`Simulating login as client ${clientId}. In a real app, this would open a new tab.`);
    return mockApiCall(undefined);
  },

  getAllCallTranscripts: async (): Promise<CallTranscript[]> => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('call_transcripts')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .order('timestamp', { ascending: false });
        if (error) throw error;
        return (data || []).map(ct => ({
            id: ct.id,
            firmId: ct.firm_id,
            clientId: ct.client_id || undefined,
            timestamp: ct.timestamp,
            duration: ct.duration,
            transcript: ct.transcript,
            summary: ct.summary || '',
            actionItems: ct.action_items || [],
            notes: ct.notes || undefined,
        }));
    } catch (err) {
        console.error('Failed to load call transcripts:', err);
        return [];
    }
  },

  getCallTranscriptsForClient: async (clientId: string): Promise<CallTranscript[]> => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('call_transcripts')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .eq('client_id', clientId)
            .order('timestamp', { ascending: false });
        if (error) throw error;
        return (data || []).map(ct => ({
            id: ct.id,
            firmId: ct.firm_id,
            clientId: ct.client_id || undefined,
            timestamp: ct.timestamp,
            duration: ct.duration,
            transcript: ct.transcript,
            summary: ct.summary || '',
            actionItems: ct.action_items || [],
            notes: ct.notes || undefined,
        }));
    } catch (err) {
        console.error('Failed to load call transcripts:', err);
        return [];
    }
  },

  addCallTranscript: async (transcriptData: Omit<CallTranscript, 'id' | 'firmId'>): Promise<CallTranscript> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
    const { data, error } = await supabase
        .from('call_transcripts')
        .insert([{
            firm_id: supabaseFirmId,
            client_id: transcriptData.clientId || null,
            timestamp: transcriptData.timestamp,
            duration: transcriptData.duration,
            transcript: transcriptData.transcript,
            summary: transcriptData.summary || null,
            action_items: transcriptData.actionItems || [],
            notes: transcriptData.notes || null,
        }])
        .select()
        .single();
    if (error) throw error;

    if (transcriptData.clientId) {
        await crmService.addAuditTrailEntry({
            clientId: transcriptData.clientId,
            userName: `${currentUser.name} (via Talk Intelligence)`,
            userAvatarUrl: currentUser.avatarUrl,
            action: `logged a call transcript. Duration: ${Math.floor(transcriptData.duration / 60)}m ${transcriptData.duration % 60}s.`,
        });
    }
    return {
        ...transcriptData,
        id: data.id,
        firmId: data.firm_id,
    };
  },

  updateCallTranscript: async (callId: string, updates: { clientId?: string; notes?: string }): Promise<CallTranscript> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const { data: existing } = await supabase.from('call_transcripts').select('*').eq('id', callId).single();
    if (!existing) return Promise.reject('Call transcript not found');

    const updatePayload: Record<string, unknown> = {};
    if (updates.clientId !== undefined) updatePayload.client_id = updates.clientId;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;

    const { data: updated, error } = await supabase
        .from('call_transcripts')
        .update(updatePayload)
        .eq('id', callId)
        .select()
        .single();
    if (error) throw error;

    if (updates.clientId && !existing.client_id) {
        await crmService.addAuditTrailEntry({
            clientId: updates.clientId,
            userName: currentUser.name,
            userAvatarUrl: currentUser.avatarUrl,
            action: `associated a call from ${new Date(existing.timestamp).toLocaleDateString()} with this record.`,
        });
    }
    if (updates.notes !== undefined && updates.notes !== (existing.notes || '') && updated.client_id) {
        await crmService.addAuditTrailEntry({
            clientId: updated.client_id,
            userName: currentUser.name,
            userAvatarUrl: currentUser.avatarUrl,
            action: `added a note to a call from ${new Date(existing.timestamp).toLocaleDateString()}.`,
        });
    }
    return {
        id: updated.id,
        firmId: updated.firm_id,
        clientId: updated.client_id || undefined,
        timestamp: updated.timestamp,
        duration: updated.duration,
        transcript: updated.transcript,
        summary: updated.summary || '',
        actionItems: updated.action_items || [],
        notes: updated.notes || undefined,
    };
  },

  getTaskComments: async (taskId: string): Promise<TaskComment[]> => {
    if (!currentFirm) return [];
    try {
        const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
        const { data, error } = await supabase
            .from('task_comments')
            .select('*')
            .eq('firm_id', supabaseFirmId)
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []).map(c => ({
            id: c.id,
            firmId: c.firm_id,
            taskId: c.task_id,
            content: c.content,
            authorId: c.author_id || '',
            authorName: c.author_name,
            authorAvatarUrl: c.author_avatar_url || '',
            createdAt: c.created_at,
        }));
    } catch (err) {
        console.error('Failed to load task comments:', err);
        return [];
    }
  },

  addTaskComment: async (commentData: Omit<TaskComment, 'id' | 'createdAt' | 'firmId'>): Promise<TaskComment> => {
      if (!currentFirm) return Promise.reject("No firm context");
      const supabaseFirmId = toSupabaseFirmId(currentFirm.id);
      const { data, error } = await supabase
          .from('task_comments')
          .insert([{
              firm_id: supabaseFirmId,
              task_id: commentData.taskId,
              content: commentData.content,
              author_id: commentData.authorId || null,
              author_name: commentData.authorName,
              author_avatar_url: commentData.authorAvatarUrl || null,
          }])
          .select()
          .single();
      if (error) throw error;
      return {
          ...commentData,
          id: data.id,
          firmId: data.firm_id,
          createdAt: data.created_at,
      };
  },

  updateTask: async (taskId: string, updates: Partial<Pick<Task, 'dueDate' | 'assigneeId' | 'recurring' | 'isCompleted' | 'priority' | 'title'>>): Promise<Task> => {
      const payload: Record<string, unknown> = {};
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
      if (updates.assigneeId !== undefined) payload.assigned_to = (updates.assigneeId && UUID_REGEX.test(updates.assigneeId)) ? updates.assigneeId : null;
      if (updates.priority !== undefined) payload.priority = (updates.priority || 'medium').toLowerCase();
      if (updates.isCompleted !== undefined) {
          payload.status = updates.isCompleted ? 'completed' : 'pending';
          payload.completed_at = updates.isCompleted ? new Date().toISOString() : null;
      }

      const { data, error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', taskId)
          .select()
          .single();
      if (error) throw error;

      const priorityMap: Record<string, 'High' | 'Medium' | 'Low'> = { low: 'Low', medium: 'Medium', high: 'High' };
      return {
          id: data.id,
          firmId: data.firm_id,
          title: data.title,
          description: data.description,
          dueDate: data.due_date ? new Date(data.due_date).toISOString().slice(0, 10) : '',
          isCompleted: data.status === 'completed',
          priority: priorityMap[data.priority] || 'Medium',
          taskType: (data.task_type || 'to_do') as Task['taskType'],
          status: data.status,
          clientId: data.client_id,
          applicationId: data.application_id,
          assigneeId: data.assigned_to,
          category: data.task_type === 'compliance' ? 'compliance' : undefined,
          completedAt: data.completed_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
      };
  },

  getAllDataForAI: async () => {
    if (!currentFirm) throw new Error("Not logged in");
    const [clients, leads, applications, tasks] = await Promise.all([
      crmService.getClients(),
      crmService.getLeads(),
      crmService.getApplications(),
      crmService.getTasks(),
    ]);
    return { clients, leads, applications, tasks };
  }
};

export const getCurrentFirm = () => currentFirm;
export { toSupabaseFirmId };