import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/crmService';
import type { Application, Client } from '../../types';
import { ApplicationStatus } from '../../types';
import { APPLICATION_STATUS_COLUMNS } from '../../constants';
import { Card } from '../common/Card';
import { Icon, IconName } from '../common/Icon';
import { Button } from '../common/Button';
import { ApplicationDetailPage } from './ApplicationDetailPage';
import LoanApplicationForm from './LoanApplicationForm';

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

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      crmService.getApplications(),
      crmService.getClients()
    ]).then(([appsData, clientsData]) => {
      setApplications(appsData);
      setClients(clientsData);
      setIsLoading(false);
    }).catch(error => {
        console.error("Failed to fetch data:", error);
        setIsLoading(false);
    });
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
    try {
      await crmService.updateApplicationWorkflowStage(applicationId, targetStatus);
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
            <Button leftIcon="PlusCircle">Add Application</Button>
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
    </div>
  );
};

export default ApplicationTracker;