
import type { Client, Lead, Application, Task, Advisor, Document, Note, AuditTrailEntry, AIRecommendationResponse, OneRoofPropertyDetails, BankRates, Firm, CallTranscript, TaskComment } from '../types';
import { LeadStatus, ApplicationStatus, ClientPortalStatus } from '../types';

const MOCK_FIRMS: Firm[] = [
    { id: 'firm_1', name: 'Kiwi Mortgages' },
    { id: 'firm_2', name: 'Southern Cross Financial' },
];

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
    { id: 'd1', firmId: 'firm_1', referenceNumber: 'AF-2407-001', clientName: 'Aroha Taylor', clientId: 'c1', lender: 'ANZ', loanAmount: 650000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-08-30', status_detail: 'Active', lastUpdated: '2024-07-29T14:00:00Z', updatedByName: 'Liam Wilson' },
    { id: 'd2', firmId: 'firm_1', referenceNumber: 'AF-2407-002', clientName: 'Ben Cooper', clientId: 'c2', lender: 'ASB', loanAmount: 480000, status: ApplicationStatus.ConditionalApproval, estSettlementDate: '2024-09-15', status_detail: 'Needs Attention', lastUpdated: '2024-07-28T10:15:00Z', updatedByName: 'Sarah Chen' },
    { id: 'd3', firmId: 'firm_2', referenceNumber: 'AF-2407-003', clientName: 'Ivy Clark', clientId: 'c3', lender: 'BNZ', loanAmount: 720000, status: ApplicationStatus.UnconditionalApproval, estSettlementDate: '2024-08-20', status_detail: 'Active', lastUpdated: '2024-07-29T09:30:00Z', updatedByName: 'Olivia Garcia' },
    { id: 'd4', firmId: 'firm_2', referenceNumber: 'AF-2407-004', clientName: 'Jack Roberts', clientId: 'c4', lender: 'Westpac', loanAmount: 950000, status: ApplicationStatus.Settled, estSettlementDate: '2024-07-25', status_detail: 'Active', lastUpdated: '2024-07-25T11:00:00Z', updatedByName: 'Noah Martinez' },
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
  
  getClients: () => {
      if (!currentFirm) return mockApiCall([]);
      return mockApiCall([...MOCK_CLIENTS].filter(c => c.firmId === currentFirm!.id));
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
  getApplications: () => {
    if (!currentFirm) return mockApiCall([]);
    const appsWithRisk = MOCK_APPLICATIONS
        .filter(a => a.firmId === currentFirm!.id)
        .map(app => ({
            ...app,
            riskLevel: getMockApplicationRisk(app)
        }));
    return mockApiCall(appsWithRisk);
  },
  getTasks: (): Promise<Task[]> => {
    if (!currentFirm) return mockApiCall([]);
    const firmTasks = [...MOCK_TASKS].filter(t => t.firmId === currentFirm!.id);

    const tasksWithAssignees = firmTasks.map(task => {
        if (task.assigneeId) {
            const assignee = MOCK_ADVISORS.find(a => a.id === task.assigneeId);
            return {
                ...task,
                assigneeName: assignee?.name,
                assigneeAvatarUrl: assignee?.avatarUrl,
            };
        }
        return task;
    });

    return mockApiCall(tasksWithAssignees);
  },
  getDocuments: () => {
    if (!currentFirm) return mockApiCall([]);
    const firmDocuments = MOCK_DOCUMENTS.filter(d => d.firmId === currentFirm!.id);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const documentsWithStatus = firmDocuments.map(doc => {
        if (doc.category === 'ID' && doc.expiryDate) {
            const expiryDate = new Date(doc.expiryDate);
            const diffTime = expiryDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let status: Document['status'] = 'Valid';
            if (diffDays < 0) {
                status = 'Expired';
            } else if (diffDays <= 30) {
                status = 'Expiring Soon';
            }
            return { ...doc, status };
        }
        return doc;
    });

    return mockApiCall(documentsWithStatus);
  },
  getNotes: () => {
    if (!currentFirm) return mockApiCall([]);
    return mockApiCall([...MOCK_NOTES].filter(n => n.firmId === currentFirm!.id));
  },
  getAuditTrail: (clientId: string) => {
    if (!currentFirm) return mockApiCall([]);
    return mockApiCall(MOCK_AUDIT_TRAIL.filter(at => at.clientId === clientId && at.firmId === currentFirm!.id));
  },

  addAuditTrailEntry: (entryData: Omit<AuditTrailEntry, 'id' | 'timestamp' | 'firmId'>): Promise<AuditTrailEntry> => {
    if (!currentFirm) return Promise.reject("No firm context");
    const newEntry: AuditTrailEntry = {
      ...entryData,
      id: `at${MOCK_AUDIT_TRAIL.length + 1}`,
      firmId: currentFirm.id,
      timestamp: new Date().toISOString(),
    };
    MOCK_AUDIT_TRAIL.unshift(newEntry);
    return mockApiCall(newEntry);
  },

  addNote: (noteData: Omit<Note, 'id' | 'createdAt' | 'firmId'>): Promise<Note> => {
    if (!currentFirm) return Promise.reject("No firm context");
    const newNote: Note = {
      ...noteData,
      id: `n${MOCK_NOTES.length + 1}`,
      firmId: currentFirm.id,
      createdAt: new Date().toISOString(),
    };
    MOCK_NOTES.push(newNote);
    
    let action = 'added a new note.';
    if (noteData.applicationId) {
        const app = MOCK_APPLICATIONS.find(a => a.id === noteData.applicationId);
        action = `added a new note to application ${app?.referenceNumber || ''}.`;
    }

    crmService.addAuditTrailEntry({
        clientId: noteData.clientId,
        userName: noteData.authorName,
        userAvatarUrl: noteData.authorAvatarUrl,
        action: action
    });
    return mockApiCall(newNote);
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
    const appIndex = MOCK_APPLICATIONS.findIndex(a => a.id === applicationId);
    if (appIndex > -1) {
        const originalApp = { ...MOCK_APPLICATIONS[appIndex] };
        MOCK_APPLICATIONS[appIndex] = { ...MOCK_APPLICATIONS[appIndex], ...details, lastUpdated: new Date().toISOString(), updatedByName: currentUser.name };
        
        const changes = Object.keys(details)
            .filter(key => details[key as keyof Application] !== originalApp[key as keyof Application])
            .map(key => `${key} from '${originalApp[key as keyof Application]}' to '${details[key as keyof Application]}'`)
            .join(', ');

        if (changes) {
            await crmService.addAuditTrailEntry({
                clientId: MOCK_APPLICATIONS[appIndex].clientId,
                userName: currentUser.name,
                userAvatarUrl: currentUser.avatarUrl,
                action: `updated application ${MOCK_APPLICATIONS[appIndex].referenceNumber}: ${changes}.`
            });
        }
        
        return mockApiCall(MOCK_APPLICATIONS[appIndex]);
    }
    return Promise.reject('Application not found');
  },

  createDraftApplication: async (clientId: string, clientName: string): Promise<Application> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const newId = MOCK_APPLICATIONS.length + 1;

    const newApplication: Application = {
      id: `d${newId}`,
      firmId: currentFirm.id,
      referenceNumber: `AF-${year}${month}-${newId.toString().padStart(3, '0')}`,
      clientId,
      clientName,
      lender: 'N/A',
      loanAmount: 0,
      status: ApplicationStatus.Draft,
      estSettlementDate: '',
      status_detail: 'Needs Attention',
      lastUpdated: now.toISOString(),
      updatedByName: currentUser.name,
    };

    MOCK_APPLICATIONS.unshift(newApplication);
    await crmService.addAuditTrailEntry({
      clientId,
      userName: currentUser.name,
      userAvatarUrl: currentUser.avatarUrl,
      action: `created a new draft application: ${newApplication.referenceNumber}.`
    });
    return mockApiCall(newApplication);
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

  getAllCallTranscripts: (): Promise<CallTranscript[]> => {
    if (!currentFirm) return mockApiCall([]);
    const transcripts = MOCK_CALL_TRANSCRIPTS.filter(ct => ct.firmId === currentFirm!.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return mockApiCall(transcripts);
  },

  getCallTranscriptsForClient: (clientId: string): Promise<CallTranscript[]> => {
    if (!currentFirm) return mockApiCall([]);
    const transcripts = MOCK_CALL_TRANSCRIPTS.filter(ct => ct.clientId === clientId && ct.firmId === currentFirm!.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return mockApiCall(transcripts);
  },

  addCallTranscript: (transcriptData: Omit<CallTranscript, 'id' | 'firmId'>): Promise<CallTranscript> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const newTranscript: CallTranscript = {
      ...transcriptData,
      id: `ct${MOCK_CALL_TRANSCRIPTS.length + 1}`,
      firmId: currentFirm.id,
    };
    MOCK_CALL_TRANSCRIPTS.unshift(newTranscript);
    
    if (transcriptData.clientId) {
        crmService.addAuditTrailEntry({
            clientId: transcriptData.clientId,
            userName: `${currentUser.name} (via Talk Intelligence)`,
            userAvatarUrl: currentUser.avatarUrl,
            action: `logged a call transcript. Duration: ${Math.floor(transcriptData.duration / 60)}m ${transcriptData.duration % 60}s.`
        });
    }
    return mockApiCall(newTranscript);
  },

  updateCallTranscript: async (callId: string, updates: { clientId?: string; notes?: string }): Promise<CallTranscript> => {
    if (!currentUser || !currentFirm) return Promise.reject("Not logged in");
    const callIndex = MOCK_CALL_TRANSCRIPTS.findIndex(c => c.id === callId);
    if (callIndex > -1) {
        const originalCall = { ...MOCK_CALL_TRANSCRIPTS[callIndex] };
        MOCK_CALL_TRANSCRIPTS[callIndex] = { ...MOCK_CALL_TRANSCRIPTS[callIndex], ...updates };

        if (updates.clientId && !originalCall.clientId) {
            await crmService.addAuditTrailEntry({
                clientId: updates.clientId,
                userName: currentUser.name,
                userAvatarUrl: currentUser.avatarUrl,
                action: `associated a call from ${new Date(originalCall.timestamp).toLocaleDateString()} with this record.`
            });
        }
        
        if (updates.notes !== undefined && updates.notes !== (originalCall.notes || '')) {
             if (MOCK_CALL_TRANSCRIPTS[callIndex].clientId) {
                 await crmService.addAuditTrailEntry({
                    clientId: MOCK_CALL_TRANSCRIPTS[callIndex].clientId!,
                    userName: currentUser.name,
                    userAvatarUrl: currentUser.avatarUrl,
                    action: `added a note to a call from ${new Date(originalCall.timestamp).toLocaleDateString()}.`
                });
             }
        }

        return mockApiCall(MOCK_CALL_TRANSCRIPTS[callIndex]);
    }
    return Promise.reject('Call transcript not found');
  },

  getTaskComments: (taskId: string): Promise<TaskComment[]> => {
    if (!currentFirm) return mockApiCall([]);
    const comments = MOCK_TASK_COMMENTS.filter(c => c.taskId === taskId && c.firmId === currentFirm!.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return mockApiCall(comments);
  },

  addTaskComment: (commentData: Omit<TaskComment, 'id' | 'createdAt' | 'firmId'>): Promise<TaskComment> => {
      if (!currentFirm) return Promise.reject("No firm context");
      const newComment: TaskComment = {
        ...commentData,
        id: `tc${MOCK_TASK_COMMENTS.length + 1}`,
        firmId: currentFirm.id,
        createdAt: new Date().toISOString(),
      };
      MOCK_TASK_COMMENTS.push(newComment);
      return mockApiCall(newComment);
  },

  updateTask: (taskId: string, updates: Partial<Pick<Task, 'dueDate' | 'assigneeId' | 'recurring' | 'isCompleted' | 'priority' | 'title'>>): Promise<Task> => {
      const taskIndex = MOCK_TASKS.findIndex(t => t.id === taskId);
      if (taskIndex > -1) {
          MOCK_TASKS[taskIndex] = { ...MOCK_TASKS[taskIndex], ...updates };
          const assignee = MOCK_ADVISORS.find(a => a.id === MOCK_TASKS[taskIndex].assigneeId);
          const updatedTaskWithAssignee = {
              ...MOCK_TASKS[taskIndex],
              assigneeName: assignee?.name,
              assigneeAvatarUrl: assignee?.avatarUrl,
          }
          return mockApiCall(updatedTaskWithAssignee);
      }
      return Promise.reject('Task not found');
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
