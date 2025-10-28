import type { Client, Lead, Application, Task, Advisor, Document, Note, AuditTrailEntry } from '../types';
import { LeadStatus, ApplicationStatus } from '../types';

const MOCK_ADVISORS: Advisor[] = [
    { id: 'adv_1', name: 'Liam Wilson', email: 'liam.wilson@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_1' },
    { id: 'adv_2', name: 'Sarah Chen', email: 'sarah.chen@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_2' },
    { id: 'adv_3', name: 'Olivia Garcia', email: 'olivia.g@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_3' },
    { id: 'adv_4', name: 'Noah Martinez', email: 'noah.m@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_4' },
    { id: 'adv_5', name: 'Emma Robinson', email: 'emma.r@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_5' },
    { id: 'adv_6', name: 'James Smith', email: 'james.s@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_6' },
    { id: 'adv_7', name: 'Sophia Brown', email: 'sophia.b@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_7' },
    { id: 'adv_8', name: 'William Jones', email: 'william.j@advisorflow.co.nz', avatarUrl: 'https://i.pravatar.cc/150?u=adv_8' }
];

const MOCK_ADVISOR: Advisor = MOCK_ADVISORS[0];

const MOCK_CLIENTS: Client[] = [
  {
    id: 'c1', name: 'Aroha Taylor', email: 'aroha.t@example.co.nz', phone: '021 123 4567',
    address: '12 Kiwi Street, Auckland', dateAdded: '2023-10-15', advisorId: 'adv_1',
    avatarUrl: 'https://i.pravatar.cc/150?u=c1',
    financials: { income: 120000, expenses: 65000, assets: 450000, liabilities: 250000 },
    creditScore: { score: 780, provider: 'Credit Simple', lastUpdated: '2024-07-15' },
  },
  {
    id: 'c2', name: 'Ben Cooper', email: 'ben.c@example.co.nz', phone: '022 987 6543',
    address: '45 Fern Road, Wellington', dateAdded: '2023-09-22', advisorId: 'adv_1',
    avatarUrl: 'https://i.pravatar.cc/150?u=c2',
    financials: { income: 95000, expenses: 50000, assets: 250000, liabilities: 80000 },
    creditScore: { score: 650, provider: 'Credit Simple', lastUpdated: '2024-06-20' },
  },
  { id: 'c3', name: 'Ivy Clark', email: 'ivy.c@example.co.nz', phone: '021 111 2222', address: '101 Main Street, Christchurch', dateAdded: '2023-11-01', advisorId: 'adv_2', avatarUrl: 'https://i.pravatar.cc/150?u=c3', financials: { income: 150000, expenses: 80000, assets: 750000, liabilities: 350000 }, creditScore: { score: 810, provider: 'Centrix', lastUpdated: '2024-07-01' }},
  { id: 'c4', name: 'Jack Roberts', email: 'jack.r@example.co.nz', phone: '021 222 3333', address: '202 High Street, Dunedin', dateAdded: '2023-12-05', advisorId: 'adv_2', avatarUrl: 'https://i.pravatar.cc/150?u=c4', financials: { income: 200000, expenses: 100000, assets: 1200000, liabilities: 500000 }, creditScore: { score: 790, provider: 'Credit Simple', lastUpdated: '2024-07-05' }},
  { id: 'c5', name: 'Kate Allen', email: 'kate.a@example.co.nz', phone: '021 333 4444', address: '303 Beach Road, Tauranga', dateAdded: '2024-01-15', advisorId: 'adv_1', avatarUrl: 'https://i.pravatar.cc/150?u=c5', financials: { income: 80000, expenses: 45000, assets: 150000, liabilities: 40000 }, creditScore: { score: 620, provider: 'Centrix', lastUpdated: '2024-07-10' }},
  { id: 'c6', name: 'Michael Lee', email: 'michael.l@example.co.nz', phone: '021 555 1234', address: '15 Tui Lane, Christchurch', dateAdded: '2024-01-10', advisorId: 'adv_3', avatarUrl: 'https://i.pravatar.cc/150?u=c6', financials: { income: 110000, expenses: 60000, assets: 300000, liabilities: 150000 }, creditScore: { score: 720, provider: 'Centrix', lastUpdated: '2024-07-10' }},
  { id: 'c7', name: 'Zoe Walker', email: 'zoe.w@example.co.nz', phone: '022 666 5678', address: '22 Moana Crescent, Tauranga', dateAdded: '2024-02-15', advisorId: 'adv_4', avatarUrl: 'https://i.pravatar.cc/150?u=c7', financials: { income: 150000, expenses: 80000, assets: 600000, liabilities: 300000 }, creditScore: { score: 810, provider: 'Credit Simple', lastUpdated: '2024-07-12' }},
  { id: 'c8', name: 'Leo Hall', email: 'leo.h@example.co.nz', phone: '027 777 9101', address: '33 Rimu Drive, Hamilton', dateAdded: '2024-03-20', advisorId: 'adv_5', avatarUrl: 'https://i.pravatar.cc/150?u=c8', financials: { income: 85000, expenses: 45000, assets: 150000, liabilities: 50000 }, creditScore: { score: 680, provider: 'Centrix', lastUpdated: '2024-07-18' }},
  { id: 'c9', name: 'Mia Scott', email: 'mia.s@example.co.nz', phone: '021 888 1122', address: '44 Pohutukawa Ave, Dunedin', dateAdded: '2024-04-25', advisorId: 'adv_6', avatarUrl: 'https://i.pravatar.cc/150?u=c9', financials: { income: 130000, expenses: 70000, assets: 500000, liabilities: 200000 }, creditScore: { score: 760, provider: 'Credit Simple', lastUpdated: '2024-07-22' }},
  { id: 'c10', name: 'Lucas Adams', email: 'lucas.a@example.co.nz', phone: '022 999 3344', address: '55 Kauri Place, Queenstown', dateAdded: '2024-05-30', advisorId: 'adv_7', avatarUrl: 'https://i.pravatar.cc/150?u=c10', financials: { income: 180000, expenses: 90000, assets: 800000, liabilities: 400000 }, creditScore: { score: 800, provider: 'Centrix', lastUpdated: '2024-07-25' }},
  { id: 'c11', name: 'Amelia Nelson', email: 'amelia.n@example.co.nz', phone: '027 101 5566', address: '66 Nikau Street, Napier', dateAdded: '2024-06-05', advisorId: 'adv_8', avatarUrl: 'https://i.pravatar.cc/150?u=c11', financials: { income: 75000, expenses: 40000, assets: 100000, liabilities: 30000 }, creditScore: { score: 640, provider: 'Credit Simple', lastUpdated: '2024-07-28' }},
  { id: 'c12', name: 'Oliver Baker', email: 'oliver.b@example.co.nz', phone: '021 212 7788', address: '77 Totara Road, Palmerston North', dateAdded: '2024-07-10', advisorId: 'adv_3', avatarUrl: 'https://i.pravatar.cc/150?u=c12', financials: { income: 140000, expenses: 75000, assets: 550000, liabilities: 250000 }, creditScore: { score: 790, provider: 'Centrix', lastUpdated: '2024-07-29' }},
  { id: 'c13', name: 'Isla Carter', email: 'isla.c@example.co.nz', phone: '022 323 9900', address: '88 Manuka Way, Nelson', dateAdded: '2024-07-15', advisorId: 'adv_4', avatarUrl: 'https://i.pravatar.cc/150?u=c13', financials: { income: 90000, expenses: 50000, assets: 200000, liabilities: 70000 }, creditScore: { score: 710, provider: 'Credit Simple', lastUpdated: '2024-07-30' }},
];

const MOCK_LEADS: Lead[] = [
    { id: 'l1', name: 'Chloe Davis', email: 'chloe.d@example.com', phone: '027 111 2222', source: 'Website', status: LeadStatus.New, estimatedLoanAmount: 550000, dateAdded: '2024-07-28', avatarUrl: 'https://i.pravatar.cc/150?u=l1' },
    { id: 'l2', name: 'David Miller', email: 'david.m@example.com', phone: '021 333 4444', source: 'Referral', status: LeadStatus.New, estimatedLoanAmount: 800000, dateAdded: '2024-07-27', avatarUrl: 'https://i.pravatar.cc/150?u=l2' },
    { id: 'l3', name: 'Eva Green', email: 'eva.g@example.com', phone: '022 555 6666', source: 'Facebook', status: LeadStatus.Contacted, estimatedLoanAmount: 450000, dateAdded: '2024-07-26', avatarUrl: 'https://i.pravatar.cc/150?u=l3' },
    { id: 'l4', name: 'Frank Harris', email: 'frank.h@example.com', phone: '021 777 8888', source: 'Website', status: LeadStatus.MeetingScheduled, estimatedLoanAmount: 1200000, dateAdded: '2024-07-25', avatarUrl: 'https://i.pravatar.cc/150?u=l4' },
    { id: 'l5', name: 'Grace King', email: 'grace.k@example.com', phone: '027 999 0000', source: 'Referral', status: LeadStatus.ApplicationStarted, estimatedLoanAmount: 750000, dateAdded: '2024-07-24', avatarUrl: 'https://i.pravatar.cc/150?u=l5' },
    { id: 'l6', name: 'Henry Lewis', email: 'henry.l@example.com', phone: '021 121 2121', source: 'Walk-in', status: LeadStatus.ClosedWon, estimatedLoanAmount: 620000, dateAdded: '2024-07-23', avatarUrl: 'https://i.pravatar.cc/150?u=l6' },
];


const MOCK_APPLICATIONS: Application[] = [
    { id: 'd1', referenceNumber: 'AF-2407-001', clientName: 'Aroha Taylor', clientId: 'c1', lender: 'ANZ', loanAmount: 650000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-08-30', status_detail: 'Active', lastUpdated: '2024-07-29T14:00:00Z', updatedByName: 'Liam Wilson' },
    { id: 'd2', referenceNumber: 'AF-2407-002', clientName: 'Ben Cooper', clientId: 'c2', lender: 'ASB', loanAmount: 480000, status: ApplicationStatus.ConditionalApproval, estSettlementDate: '2024-09-15', status_detail: 'Needs Attention', lastUpdated: '2024-07-28T10:15:00Z', updatedByName: 'Sarah Chen' },
    { id: 'd3', referenceNumber: 'AF-2407-003', clientName: 'Ivy Clark', clientId: 'c3', lender: 'BNZ', loanAmount: 720000, status: ApplicationStatus.UnconditionalApproval, estSettlementDate: '2024-08-20', status_detail: 'Active', lastUpdated: '2024-07-29T09:30:00Z', updatedByName: 'Olivia Garcia' },
    { id: 'd4', referenceNumber: 'AF-2407-004', clientName: 'Jack Roberts', clientId: 'c4', lender: 'Westpac', loanAmount: 950000, status: ApplicationStatus.Settled, estSettlementDate: '2024-07-25', status_detail: 'Active', lastUpdated: '2024-07-25T11:00:00Z', updatedByName: 'Noah Martinez' },
    { id: 'd5', referenceNumber: 'AF-2406-005', clientName: 'Kate Allen', clientId: 'c5', lender: 'Kiwibank', loanAmount: 350000, status: ApplicationStatus.Declined, estSettlementDate: '2024-08-10', status_detail: 'Active', lastUpdated: '2024-07-26T16:45:00Z', updatedByName: 'Emma Robinson' },
    { id: 'd6', referenceNumber: 'AF-2205-006', clientName: 'Aroha Taylor', clientId: 'c1', lender: 'Westpac', loanAmount: 150000, status: ApplicationStatus.Settled, estSettlementDate: '2022-05-20', status_detail: 'Active', lastUpdated: '2022-05-20T12:00:00Z', updatedByName: 'James Smith' },
    { id: 'd7', referenceNumber: 'AF-2407-007', clientName: 'Frank Harris', clientId: 'c4', lender: 'Heartland', loanAmount: 1200000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-09-10', status_detail: 'On Hold', lastUpdated: '2024-07-27T18:00:00Z', updatedByName: 'Sophia Brown' },
    { id: 'd8', referenceNumber: 'AF-2407-008', clientName: 'Grace King', clientId: 'c5', lender: 'ASB', loanAmount: 750000, status: ApplicationStatus.ConditionalApproval, estSettlementDate: '2024-09-05', status_detail: 'Active', lastUpdated: '2024-07-30T08:00:00Z', updatedByName: 'William Jones' },
    { id: 'd9', referenceNumber: 'AF-2408-009', clientName: 'Michael Lee', clientId: 'c6', lender: 'ANZ', loanAmount: 550000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-09-20', status_detail: 'Active', lastUpdated: '2024-07-30T11:00:00Z', updatedByName: 'Liam Wilson' },
    { id: 'd10', referenceNumber: 'AF-2408-010', clientName: 'Zoe Walker', clientId: 'c7', lender: 'BNZ', loanAmount: 850000, status: ApplicationStatus.ConditionalApproval, estSettlementDate: '2024-09-18', status_detail: 'Active', lastUpdated: '2024-07-30T12:30:00Z', updatedByName: 'Sarah Chen' },
    { id: 'd11', referenceNumber: 'AF-2408-011', clientName: 'Leo Hall', clientId: 'c8', lender: 'ASB', loanAmount: 400000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-09-25', status_detail: 'Needs Attention', lastUpdated: '2024-07-29T16:00:00Z', updatedByName: 'Olivia Garcia' },
    { id: 'd12', referenceNumber: 'AF-2408-012', clientName: 'Mia Scott', clientId: 'c9', lender: 'Westpac', loanAmount: 680000, status: ApplicationStatus.UnconditionalApproval, estSettlementDate: '2024-08-28', status_detail: 'Active', lastUpdated: '2024-07-30T14:00:00Z', updatedByName: 'Noah Martinez' },
    { id: 'd13', referenceNumber: 'AF-2408-013', clientName: 'Lucas Adams', clientId: 'c10', lender: 'Kiwibank', loanAmount: 920000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-09-30', status_detail: 'Active', lastUpdated: '2024-07-30T15:15:00Z', updatedByName: 'Emma Robinson' },
    { id: 'd14', referenceNumber: 'AF-2408-014', clientName: 'Amelia Nelson', clientId: 'c11', lender: 'Heartland', loanAmount: 320000, status: ApplicationStatus.ConditionalApproval, estSettlementDate: '2024-09-22', status_detail: 'On Hold', lastUpdated: '2024-07-28T13:00:00Z', updatedByName: 'James Smith' },
    { id: 'd15', referenceNumber: 'AF-2408-015', clientName: 'Oliver Baker', clientId: 'c12', lender: 'ANZ', loanAmount: 780000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-10-01', status_detail: 'Active', lastUpdated: '2024-07-30T16:00:00Z', updatedByName: 'Sophia Brown' },
    { id: 'd16', referenceNumber: 'AF-2408-016', clientName: 'Isla Carter', clientId: 'c13', lender: 'ASB', loanAmount: 430000, status: ApplicationStatus.ConditionalApproval, estSettlementDate: '2024-09-28', status_detail: 'Active', lastUpdated: '2024-07-30T17:00:00Z', updatedByName: 'William Jones' },
    { id: 'd17', referenceNumber: 'AF-2408-017', clientName: 'Aroha Taylor', clientId: 'c1', lender: 'BNZ', loanAmount: 200000, status: ApplicationStatus.ApplicationSubmitted, estSettlementDate: '2024-09-12', status_detail: 'Active', lastUpdated: '2024-07-30T10:00:00Z', updatedByName: 'Liam Wilson' },
    { id: 'd18', referenceNumber: 'AF-2408-018', clientName: 'Ben Cooper', clientId: 'c2', lender: 'Westpac', loanAmount: 300000, status: ApplicationStatus.ConditionalApproval, estSettlementDate: '2024-09-14', status_detail: 'Active', lastUpdated: '2024-07-30T09:00:00Z', updatedByName: 'Sarah Chen' },
];


let MOCK_TASKS: Task[] = [
    { id: 't1', title: 'Follow up with Chloe Davis', dueDate: '2024-07-30', isCompleted: false, priority: 'High', applicationId: 'd1' },
    { id: 't2', title: 'Request bank statements from Ben Cooper', dueDate: '2024-07-29', isCompleted: false, priority: 'High', clientId: 'c2' },
    { id: 't3', title: 'Prepare meeting agenda for Frank Harris', dueDate: '2024-08-01', isCompleted: false, priority: 'Medium' },
    { id: 't4', title: 'Send settlement gift to Jack Roberts', dueDate: '2024-07-28', isCompleted: true, priority: 'Low' },
    { id: 't5', title: 'Update Eva Green on application status', dueDate: '2024-07-31', isCompleted: false, priority: 'Medium' },
    { id: 't6', title: 'Review Aroha Taylor\'s application documents', dueDate: '2024-08-05', isCompleted: false, priority: 'High', clientId: 'c1', applicationId: 'd1' },
];

const MOCK_DOCUMENTS: Document[] = [
  { id: 'doc1', clientId: 'c1', name: 'Passport_Aroha_Taylor.pdf', category: 'ID', uploadDate: '2023-10-16', url: '#' },
  { id: 'doc2', clientId: 'c1', name: '3_Month_Bank_Statements.pdf', category: 'Financial', uploadDate: '2023-10-18', url: '#' },
  { id: 'doc3', clientId: 'c1', name: 'Employment_Contract.pdf', category: 'Financial', uploadDate: '2023-10-18', url: '#' },
  { id: 'doc4', clientId: 'c2', name: 'Drivers_Licence_Ben_Cooper.jpg', category: 'ID', uploadDate: '2023-09-25', url: '#' },
  { id: 'doc5', clientId: 'c2', name: '2023_Tax_Return.pdf', category: 'Financial', uploadDate: '2023-10-02', url: '#' },
];

const MOCK_NOTES: Note[] = [
  { 
    id: 'n1', clientId: 'c1', 
    content: 'Aroha called to ask about the progress of her application with ANZ. I told her we are waiting for the valuation report. @SarahChen to follow up on Friday.', 
    authorId: 'adv_1', authorName: 'Liam Wilson', authorAvatarUrl: 'https://i.pravatar.cc/150?u=adv_1', 
    createdAt: '2024-07-28T10:30:00Z' 
  },
  { 
    id: 'n2', clientId: 'c1', 
    content: 'Client has provided the latest payslips. Uploaded to the documents tab.', 
    authorId: 'adv_2', authorName: 'Sarah Chen', authorAvatarUrl: 'https://i.pravatar.cc/150?u=adv_2', 
    createdAt: '2024-07-25T15:00:00Z' 
  },
  { 
    id: 'n3', clientId: 'c2', 
    content: 'Initial meeting with Ben went well. He is looking to purchase his first home in the next 3-6 months. Sent him a budget planner to complete.', 
    authorId: 'adv_1', authorName: 'Liam Wilson', authorAvatarUrl: 'https://i.pravatar.cc/150?u=adv_1', 
    createdAt: '2024-07-20T11:00:00Z' 
  },
];

let MOCK_AUDIT_TRAIL: AuditTrailEntry[] = [
    { id: 'at1', clientId: 'c1', userName: 'Sarah Chen', userAvatarUrl: 'https://i.pravatar.cc/150?u=adv_2', action: 'uploaded document: 3_Month_Bank_Statements.pdf', timestamp: '2024-07-28T11:00:00Z'},
    { id: 'at2', clientId: 'c1', userName: 'Liam Wilson', userAvatarUrl: 'https://i.pravatar.cc/150?u=adv_1', action: 'added a new note.', timestamp: '2024-07-28T10:30:00Z'},
    { id: 'at3', clientId: 'c1', userName: 'Liam Wilson', userAvatarUrl: 'https://i.pravatar.cc/150?u=adv_1', action: 'created task: Review Aroha Taylor\'s application documents', timestamp: '2024-07-27T09:00:00Z'},
    { id: 'at4', clientId: 'c2', userName: 'Liam Wilson', userAvatarUrl: 'https://i.pravatar.cc/150?u=adv_1', action: 'added a new note.', timestamp: '2024-07-20T11:00:00Z'},
];


const mockApiCall = <T,>(data: T): Promise<T> => {
    return new Promise(resolve => setTimeout(() => resolve(data), 500));
}

export const crmService = {
  getAdvisor: () => mockApiCall(MOCK_ADVISOR),
  getAdvisors: () => mockApiCall(MOCK_ADVISORS),
  getClients: () => mockApiCall([...MOCK_CLIENTS]),
  getLeads: () => mockApiCall([...MOCK_LEADS]),
  getApplications: () => mockApiCall([...MOCK_APPLICATIONS]),
  getTasks: () => mockApiCall([...MOCK_TASKS]),
  getDocuments: () => mockApiCall([...MOCK_DOCUMENTS]),
  getNotes: () => mockApiCall([...MOCK_NOTES]),
  getAuditTrail: (clientId: string) => mockApiCall(MOCK_AUDIT_TRAIL.filter(at => at.clientId === clientId)),

  addAuditTrailEntry: (entryData: Omit<AuditTrailEntry, 'id' | 'timestamp'>): Promise<AuditTrailEntry> => {
    const newEntry: AuditTrailEntry = {
      ...entryData,
      id: `at${MOCK_AUDIT_TRAIL.length + 1}`,
      timestamp: new Date().toISOString(),
    };
    MOCK_AUDIT_TRAIL.unshift(newEntry);
    return mockApiCall(newEntry);
  },

  addNote: (noteData: Omit<Note, 'id' | 'createdAt'>): Promise<Note> => {
    const newNote: Note = {
      ...noteData,
      id: `n${MOCK_NOTES.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    MOCK_NOTES.push(newNote);
    crmService.addAuditTrailEntry({
        clientId: noteData.clientId,
        userName: noteData.authorName,
        userAvatarUrl: noteData.authorAvatarUrl,
        action: 'added a new note.'
    });
    return mockApiCall(newNote);
  },

  addTask: (taskData: Omit<Task, 'id' | 'isCompleted'>): Promise<Task> => {
    const newTask: Task = {
      ...taskData,
      id: `t${MOCK_TASKS.length + 1}`,
      isCompleted: false,
    };
    MOCK_TASKS.unshift(newTask);
    if (taskData.clientId) {
      crmService.addAuditTrailEntry({
          clientId: taskData.clientId,
          userName: MOCK_ADVISOR.name,
          userAvatarUrl: MOCK_ADVISOR.avatarUrl,
          action: `created task: "${taskData.title}"`
      });
    }
    return mockApiCall(newTask);
  },
  
  updateClientFinancials: (clientId: string, financials: Client['financials'], advisor: Advisor): Promise<Client> => {
    const clientIndex = MOCK_CLIENTS.findIndex(c => c.id === clientId);
    if (clientIndex > -1) {
        MOCK_CLIENTS[clientIndex].financials = financials;
        crmService.addAuditTrailEntry({
            clientId: clientId,
            userName: advisor.name,
            userAvatarUrl: advisor.avatarUrl,
            action: 'updated the financial summary.'
        });
        return mockApiCall(MOCK_CLIENTS[clientIndex]);
    }
    return Promise.reject('Client not found');
  },

  getAllData: async () => {
    const [advisor, clients, leads, applications, tasks, advisors] = await Promise.all([
      crmService.getAdvisor(),
      crmService.getClients(),
      crmService.getLeads(),
      crmService.getApplications(),
      crmService.getTasks(),
      crmService.getAdvisors(),
    ]);
    return { advisor, clients, leads, applications, tasks, advisors };
  }
};