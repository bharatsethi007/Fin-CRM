import React, { useState, useEffect } from 'react';
import { crmService, getCurrentFirm } from '../../services/api';
import { applicationService } from '../../services/applicationService';
import type { Application, Client } from '../../types';
import { ApplicationStatus } from '../../types';
import { APPLICATION_STATUS_COLUMNS, APPLICATION_STATUS_TO_WORKFLOW } from '../../constants';
import { Icon, IconName } from '../common/Icon';
import { Button } from '../common/Button';
import { ApplicationDetailPage } from './ApplicationDetailPage';
import LoanApplicationForm from './LoanApplicationForm';

type SupabaseApplicationRow = {
  id: string;
  firm_id: string;
  client_id: string;
  assigned_to?: string;
  reference_number?: string;
  application_type?: string;
  loan_amount?: number;
  workflow_stage?: string;
  status?: string;
  lender_name?: string;
  settlement_date?: string;
  updated_at?: string;
  created_at?: string;
  clients?: { first_name?: string; last_name?: string; email?: string } | null;
};

function mapRowToApplication(row: SupabaseApplicationRow): Application {
  const workflowToStatus: Record<string, ApplicationStatus> = {
    draft: ApplicationStatus.Draft,
    submitted: ApplicationStatus.ApplicationSubmitted,
    conditional: ApplicationStatus.ConditionalApproval,
    unconditional: ApplicationStatus.UnconditionalApproval,
    settled: ApplicationStatus.Settled,
    declined: ApplicationStatus.Declined,
  };
  const clientName = row.clients
    ? [row.clients.first_name, row.clients.last_name].filter(Boolean).join(' ').trim() || 'Unknown'
    : 'Unknown';
  return {
    id: row.id,
    firmId: row.firm_id,
    referenceNumber: row.reference_number || '',
    clientName,
    clientId: row.client_id,
    advisorId: row.assigned_to || '',
    lender: row.lender_name || 'N/A',
    loanAmount: Number(row.loan_amount) || 0,
    status: workflowToStatus[row.workflow_stage || 'draft'] ?? ApplicationStatus.Draft,
    estSettlementDate: row.settlement_date ? new Date(row.settlement_date).toISOString().slice(0, 10) : '',
    status_detail: row.status === 'active' ? 'Active' : 'Needs Attention',
    lastUpdated: row.updated_at || row.created_at || '',
    updatedByName: '',
  };
}

const RiskBadge: React.FC<{ risk: Application['riskLevel'] }> = ({ risk }) => {
    if (!risk) return null;
    const riskConfig: Record<NonNullable<Application['riskLevel']>, { icon: IconName, color: string, text: string }> = {
        'Low': { icon: 'ShieldCheck', color: 'text-green-500', text: 'Low risk' },
        'Medium': { icon: 'ShieldAlert', color: 'text-yellow-500', text: 'Medium risk' },
        'High': { icon: 'ShieldAlert', color: 'text-red-500', text: 'High risk' },
    };
    const config = riskConfig[risk];
    return (
        <div className="group relative flex items-center">
             <Icon name={config.icon} className={`h-5 w-5 ${config.color}`} />
             <span className="absolute -top-7 left-1/2 -translate-x-1/2 w-max px-2 py-1 bg-gray-700 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {config.text}
            </span>
        </div>
    );
};

const ApplicationCard: React.FC<{
  application: Application;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
}> = ({ application, onClick, onDragStart, onDragEnd, isDragging }) => (
  <div
    draggable
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    onClick={onClick}
    className={`p-3 mb-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm cursor-grab active:cursor-grabbing hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${isDragging ? 'opacity-50' : ''}`}
  >
    <div className="flex justify-between items-start">
        <div>
            <p className="font-semibold text-sm">{application.clientName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{application.lender}</p>
        </div>
        <RiskBadge risk={application.riskLevel} />
    </div>
    <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-1">
      ${application.loanAmount.toLocaleString()}
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
      Settlement: {application.estSettlementDate}
    </p>
  </div>
);

const ApplicationStatusBadge: React.FC<{ status: ApplicationStatus }> = ({ status }) => {
  const statusClasses = {
    [ApplicationStatus.Draft]: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    [ApplicationStatus.ApplicationSubmitted]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    [ApplicationStatus.ConditionalApproval]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    [ApplicationStatus.UnconditionalApproval]: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    [ApplicationStatus.Settled]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    [ApplicationStatus.Declined]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusClasses[status]}`}>{status}</span>;
};

const ApplicationTracker: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [pendingDraftEdit, setPendingDraftEdit] = useState<{ application: Application; client: Client } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ApplicationStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // New Application modal
  const [showNewAppModal, setShowNewAppModal] = useState(false);
  const [newAppClientId, setNewAppClientId] = useState('');
  const [newAppApplicationType, setNewAppApplicationType] = useState<'purchase' | 'refinance' | 'top-up'>('purchase');
  const [newAppLoanPurpose, setNewAppLoanPurpose] = useState('');
  const [newAppLoanAmount, setNewAppLoanAmount] = useState<string>('');
  const [isSubmittingNewApp, setIsSubmittingNewApp] = useState(false);
  const [newAppError, setNewAppError] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<{ application: Application; client: Client } | null>(null);

  const fetchData = () => {
    const firm = getCurrentFirm();
    if (!firm?.id) {
      setApplications([]);
      setClients([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    Promise.all([
      applicationService.getApplications(firm.id).then(rows => (rows || []).map(mapRowToApplication)),
      crmService.getClients(),
    ])
      .then(([appsData, clientsData]) => {
        setApplications(appsData);
        setClients(clientsData);
      })
      .catch(error => {
        console.error('Failed to fetch data:', error);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getApplicationsByStatus = (status: ApplicationStatus) => {
    return applications.filter(app => app.status === status);
  };

  const handleApplicationClick = (application: Application) => {
    const client = clients.find(c => c.id === application.clientId);
    if (client) {
        setSelectedApplication(application);
        setSelectedClient(client);
    } else {
        console.error("Client not found for application", application);
        alert("Could not find the client associated with this application.");
    }
  };

  const handleUpdate = () => {
    fetchData();
  };

  const handleBackToList = () => {
    setSelectedApplication(null);
    setSelectedClient(null);
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    const firm = getCurrentFirm();
    if (!firm?.id) {
      setNewAppError('No firm session. Please log in again.');
      return;
    }
    if (!newAppClientId.trim()) {
      setNewAppError('Please select a client.');
      return;
    }
    setIsSubmittingNewApp(true);
    setNewAppError(null);
    try {
      await applicationService.createApplication({
        firm_id: firm.id,
        client_id: newAppClientId,
        application_type: newAppApplicationType,
        loan_purpose: newAppLoanPurpose.trim() || undefined,
        loan_amount: newAppLoanAmount ? Number(newAppLoanAmount) : undefined,
      });
      setShowNewAppModal(false);
      setNewAppClientId('');
      setNewAppApplicationType('purchase');
      setNewAppLoanPurpose('');
      setNewAppLoanAmount('');
      fetchData();
    } catch (err) {
      console.error('Failed to create application:', err);
      setNewAppError(err instanceof Error ? err.message : 'Could not create application. Please try again.');
    } finally {
      setIsSubmittingNewApp(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, application: Application) => {
    setDraggingId(application.id);
    e.dataTransfer.setData('applicationId', application.id);
    e.dataTransfer.setData('applicationStatus', application.status);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleDragOver = (e: React.DragEvent, status?: ApplicationStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (status !== undefined) setDragOverStatus(status);
  };

  const handleDragLeave = () => {
    setDragOverStatus(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: ApplicationStatus) => {
    e.preventDefault();
    setDragOverStatus(null);
    const applicationId = e.dataTransfer.getData('applicationId');
    const sourceStatus = e.dataTransfer.getData('applicationStatus') as ApplicationStatus;
    if (!applicationId || sourceStatus === targetStatus) return;
    setDraggingId(null);
    setIsUpdating(true);
    const stage = APPLICATION_STATUS_TO_WORKFLOW[targetStatus] as 'draft' | 'submitted' | 'conditional' | 'unconditional' | 'settled' | 'declined';
    try {
      await applicationService.updateWorkflowStage(applicationId, stage);
      setApplications(prev =>
        prev.map(app =>
          app.id === applicationId ? { ...app, status: targetStatus } : app
        )
      );
    } catch (err) {
      console.error('Failed to update application stage:', err);
      fetchData();
    } finally {
      setIsUpdating(false);
    }
  };

  const viewButtonClasses = (isActive: boolean) => 
    `inline-flex items-center px-3 py-1.5 text-sm font-medium focus:z-10 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors ${
        isActive
        ? 'bg-primary-600 text-white'
        : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
    }`;
    
  if (selectedApplication && selectedClient) {
    return (
      <ApplicationDetailPage
        application={selectedApplication}
        client={selectedClient}
        onBack={handleBackToList}
        onUpdate={handleUpdate}
        onEditDraft={selectedApplication.status === ApplicationStatus.Draft ? () => {
          setPendingDraftEdit({ application: selectedApplication, client: selectedClient });
          setSelectedApplication(null);
          setSelectedClient(null);
        } : undefined}
      />
    );
  }

  if (pendingDraftEdit) {
    return (
      <LoanApplicationForm
        client={pendingDraftEdit.client}
        draftApplication={{ id: pendingDraftEdit.application.id, referenceNumber: pendingDraftEdit.application.referenceNumber }}
        isEditMode={true}
        onBack={() => setPendingDraftEdit(null)}
        onSuccess={handleUpdate}
        onApplicationsUpdated={() => { setPendingDraftEdit(null); handleUpdate(); }}
      />
    );
  }

  if (newDraft) {
    return (
      <LoanApplicationForm
        client={newDraft.client}
        draftApplication={{ id: newDraft.application.id, referenceNumber: newDraft.application.referenceNumber }}
        isEditMode={false}
        onBack={() => { setNewDraft(null); handleUpdate(); }}
        onSuccess={handleUpdate}
        onApplicationsUpdated={() => { setNewDraft(null); handleUpdate(); }}
      />
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Application Tracker</h2>
          <p className="text-gray-500 dark:text-gray-400">Monitor active applications from submission to settlement.</p>
        </div>
        <div className="flex items-center space-x-4">
             <div className="inline-flex rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
                <button onClick={() => setView('board')} className={`${viewButtonClasses(view === 'board')} rounded-l-md`}>
                    <Icon name="LayoutDashboard" className="h-4 w-4 mr-2" />
                    Board
                </button>
                <button onClick={() => setView('list')} className={`${viewButtonClasses(view === 'list')} -ml-px rounded-r-md`}>
                    <Icon name="List" className="h-4 w-4 mr-2" />
                    List
                </button>
            </div>
            <Button leftIcon="PlusCircle" onClick={() => setShowNewAppModal(true)}>New Application</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-96">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
        {view === 'board' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {APPLICATION_STATUS_COLUMNS.map(status => (
                <div
                  key={status}
                  className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-4 min-h-[200px] transition-all ${
                    isUpdating ? 'opacity-50' : ''
                  } ${dragOverStatus === status ? 'ring-2 ring-primary-500 ring-inset' : ''}`}
                  onDragOver={(e) => handleDragOver(e, status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, status)}
                >
                <h3 className="font-semibold mb-4 text-center text-gray-600 dark:text-gray-300">
                    {status} ({getApplicationsByStatus(status).length})
                </h3>
                <div className="h-[calc(100vh-20rem)] overflow-y-auto pr-2">
                    {getApplicationsByStatus(status).map(app => (
                        <ApplicationCard
                          key={app.id}
                          application={app}
                          onClick={() => handleApplicationClick(app)}
                          onDragStart={(e) => handleDragStart(e, app)}
                          onDragEnd={handleDragEnd}
                          isDragging={draggingId === app.id}
                        />
                    ))}
                </div>
                </div>
            ))}
            </div>
        )}
        {view === 'list' && (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                                <th scope="col" className="px-6 py-3">Reference #</th>
                                <th scope="col" className="px-6 py-3">Client</th>
                                <th scope="col" className="px-6 py-3">Lender</th>
                                <th scope="col" className="px-6 py-3">Amount</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3">Est. Settlement</th>
                                <th scope="col" className="px-6 py-3 text-center">Risk</th>
                            </tr>
                        </thead>
                        <tbody>
                            {applications.map(app => (
                                <tr key={app.id} onClick={() => handleApplicationClick(app)} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{app.referenceNumber}</td>
                                    <td className="px-6 py-4">{app.clientName}</td>
                                    <td className="px-6 py-4">{app.lender}</td>
                                    <td className="px-6 py-4 font-medium">${app.loanAmount.toLocaleString()}</td>
                                    <td className="px-6 py-4"><ApplicationStatusBadge status={app.status} /></td>
                                    <td className="px-6 py-4">{app.estSettlementDate}</td>
                                    <td className="px-6 py-4"><div className="flex justify-center"><RiskBadge risk={app.riskLevel} /></div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
        </>
      )}

      {/* New Application Modal */}
      {showNewAppModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <form onSubmit={handleCreateApplication}>
              <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
                <h3 className="text-lg font-semibold">New Application</h3>
                <button type="button" onClick={() => { setShowNewAppModal(false); setNewAppError(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {newAppError && (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">{newAppError}</p>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</label>
                  <select
                    value={newAppClientId}
                    onChange={e => setNewAppClientId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  >
                    <option value="">Select a client</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Application type</label>
                  <select
                    value={newAppApplicationType}
                    onChange={e => setNewAppApplicationType(e.target.value as 'purchase' | 'refinance' | 'top-up')}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="purchase">Purchase</option>
                    <option value="refinance">Refinance</option>
                    <option value="top-up">Top-up</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loan purpose</label>
                  <input
                    type="text"
                    value={newAppLoanPurpose}
                    onChange={e => setNewAppLoanPurpose(e.target.value)}
                    placeholder="e.g. First home"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loan amount</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={newAppLoanAmount}
                    onChange={e => setNewAppLoanAmount(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="p-5 border-t dark:border-gray-700 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => { setShowNewAppModal(false); setNewAppError(null); }}>Cancel</Button>
                <Button type="submit" isLoading={isSubmittingNewApp} leftIcon="PlusCircle">Create Application</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApplicationTracker;
