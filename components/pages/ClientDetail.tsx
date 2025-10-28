import React, { useState, useEffect } from 'react';
import type { Client, Application, Document, Task, Note, AuditTrailEntry } from '../../types';
import { ApplicationStatus } from '../../types';
import { Button } from '../common/Button';
import { Icon, IconName } from '../common/Icon';
import { Card } from '../common/Card';
import { crmService } from '../../services/crmService';
import { ConvertToTaskModal } from '../common/ConvertToTaskModal';

interface ClientDetailProps {
  client: Client;
  onBack: () => void;
  onNewApplicationClick: () => void;
}

const getCreditScoreInfo = (score: number) => {
    if (score >= 750) return { rating: 'Excellent', color: 'text-green-500' };
    if (score >= 650) return { rating: 'Good', color: 'text-sky-500' };
    if (score >= 550) return { rating: 'Fair', color: 'text-yellow-500' };
    return { rating: 'Poor', color: 'text-red-500' };
};

const ApplicationStatusBadge: React.FC<{ status: ApplicationStatus }> = ({ status }) => {
  const statusClasses = {
    [ApplicationStatus.ApplicationSubmitted]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    [ApplicationStatus.ConditionalApproval]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    [ApplicationStatus.UnconditionalApproval]: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    [ApplicationStatus.Settled]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    [ApplicationStatus.Declined]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusClasses[status]}`}>{status}</span>;
};

const TaskPriorityBadge: React.FC<{ priority: 'High' | 'Medium' | 'Low' }> = ({ priority }) => {
  const priorityClasses = {
    High: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    Low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };
  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${priorityClasses[priority]}`}>{priority}</span>;
};

const TABS = ['Active Applications', 'Documents', 'Notes', 'Previous Applications', 'Activities', 'Audit Trail'];

const ClientDetail: React.FC<ClientDetailProps> = ({ client, onBack, onNewApplicationClick }) => {
  const [currentClient, setCurrentClient] = useState<Client>(client);
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingFinancials, setIsEditingFinancials] = useState(false);
  const [editableFinancials, setEditableFinancials] = useState(currentClient.financials);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [noteToConvert, setNoteToConvert] = useState<Note | null>(null);

  const scoreInfo = getCreditScoreInfo(currentClient.creditScore.score);
  
  const fetchData = async () => {
      // Don't set isLoading to true here to avoid flicker on refresh
      const [allApplications, allDocs, allTasks, allNotes, allAuditTrail] = await Promise.all([
        crmService.getApplications(),
        crmService.getDocuments(),
        crmService.getTasks(),
        crmService.getNotes(),
        crmService.getAuditTrail(client.id)
      ]);
      setApplications(allApplications.filter(d => d.clientId === client.id));
      setDocuments(allDocs.filter(d => d.clientId === client.id));
      setTasks(allTasks.filter(t => t.clientId === client.id));
      setNotes(allNotes.filter(n => n.clientId === client.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setAuditTrail(allAuditTrail.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setIsLoading(false);
  };

  useEffect(() => {
    setCurrentClient(client);
  }, [client]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [client.id]);

  const handleFinancialsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditableFinancials(prev => ({
        ...prev,
        [name]: Number(value)
    }));
  };

  const handleSaveFinancials = async () => {
    try {
        const advisor = await crmService.getAdvisor();
        const updatedClient = await crmService.updateClientFinancials(currentClient.id, editableFinancials, advisor);
        setCurrentClient(updatedClient);
        setIsEditingFinancials(false);
        fetchData();
    } catch (error) {
        console.error('Failed to update financials:', error);
        alert('There was an error updating financials.');
    }
  };

  const handleSaveNote = async () => {
    if (!newNoteContent.trim()) return;
    setIsSubmittingNote(true);
    try {
        const advisor = await crmService.getAdvisor();
        await crmService.addNote({
            clientId: client.id,
            content: newNoteContent,
            authorId: advisor.id,
            authorName: advisor.name,
            authorAvatarUrl: advisor.avatarUrl,
        });
        setNewNoteContent('');
        fetchData();
    } catch (error) {
        console.error('Failed to save note:', error);
        alert('There was an error saving the note.');
    } finally {
        setIsSubmittingNote(false);
    }
  };

  const handleTaskCreated = (newTask: Task) => {
    fetchData();
    setActiveTab('Activities');
    alert(`Task "${newTask.title}" has been created successfully!`);
  };

  const renderNoteContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) =>
      part.startsWith('@') ? (
        <strong key={i} className="text-primary-600 dark:text-primary-400 font-semibold">{part}</strong>
      ) : (
        part
      )
    );
  };
  
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  };

  const getActionIcon = (action: string): IconName => {
      if (/note/i.test(action)) return 'FileText';
      if (/task/i.test(action)) return 'CheckSquare';
      if (/financial/i.test(action)) return 'Pencil';
      if (/document/i.test(action)) return 'FilePlus2';
      return 'Sparkles';
  };


  const activeApplications = applications.filter(d => d.status !== ApplicationStatus.Settled && d.status !== ApplicationStatus.Declined);
  const previousApplications = applications.filter(d => d.status === ApplicationStatus.Settled || d.status === ApplicationStatus.Declined);
  const documentsById = documents.filter(d => d.category === 'ID');
  const documentsByFinancial = documents.filter(d => d.category === 'Financial');

  const renderTabContent = () => {
    if (isLoading) {
        return <div className="flex justify-center items-center h-64"><Icon name="Loader" className="h-8 w-8 animate-spin" /></div>;
    }
    switch (activeTab) {
      case 'Active Applications':
        return (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-semibold">Current Applications</h4>
                    <Button leftIcon="FilePlus2" onClick={onNewApplicationClick}>
                        New Application
                    </Button>
                </div>
                {activeApplications.length > 0 ? (
                    <ul className="space-y-4">
                        {activeApplications.map(app => (
                            <li key={app.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex justify-between items-center">
                                <div>
                                    <p className="font-semibold">{app.referenceNumber}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{app.lender} - Loan Amount: ${app.loanAmount.toLocaleString()}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Est. Settlement: {app.estSettlementDate}</p>
                                </div>
                                <ApplicationStatusBadge status={app.status} />
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No active applications found.</p>}
            </div>
        );
      case 'Documents':
        return documents.length > 0 ? (
            <div className="space-y-6">
                <div>
                    <h4 className="font-semibold mb-2">IDs</h4>
                    <ul className="space-y-2">
                        {documentsById.map(doc => (
                            <li key={doc.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                <div className="flex items-center">
                                    <Icon name="FileText" className="h-5 w-5 mr-3 text-gray-400" />
                                    <div>
                                        <p className="text-sm font-medium">{doc.name}</p>
                                        <p className="text-xs text-gray-500">Uploaded: {doc.uploadDate}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" leftIcon="Download">Download</Button>
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h4 className="font-semibold mb-2">Financials</h4>
                     <ul className="space-y-2">
                        {documentsByFinancial.map(doc => (
                            <li key={doc.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                <div className="flex items-center">
                                    <Icon name="FileText" className="h-5 w-5 mr-3 text-gray-400" />
                                    <div>
                                        <p className="text-sm font-medium">{doc.name}</p>
                                        <p className="text-xs text-gray-500">Uploaded: {doc.uploadDate}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" leftIcon="Download">Download</Button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        ) : <p className="text-sm text-gray-500 dark:text-gray-400">No documents found.</p>;
      case 'Notes':
        return (
            <div className="space-y-6">
                <Card className="!p-0">
                    <div className="p-4">
                        <textarea
                            value={newNoteContent}
                            onChange={(e) => setNewNoteContent(e.target.value)}
                            rows={3}
                            placeholder="Add a new note... Use @ to mention colleagues."
                            className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2"
                            disabled={isSubmittingNote}
                        />
                    </div>
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t dark:border-gray-700 flex justify-end">
                        <Button onClick={handleSaveNote} isLoading={isSubmittingNote}>Add Note</Button>
                    </div>
                </Card>
                <div className="space-y-4">
                    {notes.map(note => (
                        <div key={note.id} className="flex items-start gap-4">
                            <img src={note.authorAvatarUrl} alt={note.authorName} className="h-10 w-10 rounded-full flex-shrink-0 mt-1" />
                            <div className="flex-grow p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold">{note.authorName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(note.createdAt).toLocaleString()}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" leftIcon="CheckSquare" onClick={() => setNoteToConvert(note)}>
                                        Create Task
                                    </Button>
                                </div>
                                <p className="mt-2 text-sm whitespace-pre-wrap">{renderNoteContent(note.content)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
      case 'Previous Applications':
         return previousApplications.length > 0 ? (
            <ul className="space-y-4">
                {previousApplications.map(app => (
                    <li key={app.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex justify-between items-center">
                        <div>
                            <p className="font-semibold">{app.referenceNumber}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{app.lender} - Loan Amount: ${app.loanAmount.toLocaleString()}</p>
                             <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Settled: {app.estSettlementDate}</p>
                        </div>
                        <ApplicationStatusBadge status={app.status} />
                    </li>
                ))}
            </ul>
        ) : <p className="text-sm text-gray-500 dark:text-gray-400">No previous applications found.</p>;
      case 'Activities':
         return tasks.length > 0 ? (
            <ul className="space-y-3">
                {tasks.map(task => (
                    <li key={task.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex justify-between items-center">
                        <div>
                           <p className={`text-sm ${task.isCompleted ? 'line-through text-gray-400' : ''}`}>{task.title}</p>
                           <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Due: {task.dueDate}</p>
                        </div>
                        <TaskPriorityBadge priority={task.priority} />
                    </li>
                ))}
            </ul>
         ) : <p className="text-sm text-gray-500 dark:text-gray-400">No activities found.</p>;
      case 'Audit Trail':
        return auditTrail.length > 0 ? (
            <div className="relative pl-6">
                <div className="absolute left-0 top-0 h-full w-0.5 bg-gray-200 dark:bg-gray-700" style={{ transform: 'translateX(2.125rem)' }}></div>
                <ul className="space-y-4">
                    {auditTrail.map(entry => (
                        <li key={entry.id} className="relative py-2">
                            <div className="flex items-center space-x-4">
                                <div className="relative z-10 flex items-center justify-center">
                                    <img src={entry.userAvatarUrl} alt={entry.userName} className="h-10 w-10 rounded-full ring-4 ring-white dark:ring-gray-800" />
                                    <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-700 rounded-full p-0.5 shadow">
                                        <Icon name={getActionIcon(entry.action)} className="h-4 w-4 text-gray-500" />
                                    </div>
                                </div>
                                <div className="flex-grow">
                                    <p className="text-sm text-gray-800 dark:text-gray-200">
                                        <span className="font-semibold">{entry.userName}</span> {entry.action}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{timeAgo(entry.timestamp)}</p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        ) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No audit trail history found.</p>;
      default:
        return null;
    }
  };
  
  return (
    <div>
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Client Profile</h1>
            <Button onClick={onBack} variant="secondary" leftIcon="ArrowLeft">
            Back to Clients
            </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <div className="flex flex-col items-center text-center border-b pb-4 dark:border-gray-700">
                        <img src={currentClient.avatarUrl} alt={currentClient.name} className="h-24 w-24 rounded-full mb-3" />
                        <h2 className="text-xl font-bold">{currentClient.name}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Client since {currentClient.dateAdded}</p>
                    </div>
                    <div className="space-y-3 text-sm pt-4">
                        <div className="flex items-center">
                            <Icon name="Mail" className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{currentClient.email}</span>
                        </div>
                        <div className="flex items-center">
                            <Icon name="Phone" className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                            <span>{currentClient.phone}</span>
                        </div>
                        <div className="flex items-start">
                            <Icon name="Home" className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span>{currentClient.address}</span>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold">Credit Score</h3>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => alert('Fetching latest credit score from Credit Simple...')}
                            leftIcon="RefreshCw"
                        >
                            Update
                        </Button>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2">
                        <p className={`text-5xl font-bold ${scoreInfo.color}`}>
                            {currentClient.creditScore.score}
                        </p>
                        <p className={`text-lg font-semibold mt-1 ${scoreInfo.color}`}>
                            {scoreInfo.rating}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            Last updated: {currentClient.creditScore.lastUpdated}
                        </p>
                    </div>
                </Card>

                 <Card>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold">Financial Summary</h3>
                        {!isEditingFinancials && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setEditableFinancials(currentClient.financials);
                                    setIsEditingFinancials(true);
                                }}
                                leftIcon="Pencil"
                            >
                                Edit
                            </Button>
                        )}
                    </div>
                     {isEditingFinancials ? (
                        <div className="space-y-3">
                            {(['income', 'expenses', 'assets', 'liabilities'] as const).map(field => (
                                <div key={field}>
                                    <label htmlFor={field} className="block text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{field}</label>
                                    <div className="relative mt-1 rounded-md shadow-sm">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                            <span className="text-gray-500 sm:text-sm">$</span>
                                        </div>
                                        <input
                                            type="number"
                                            id={field}
                                            name={field}
                                            value={editableFinancials[field]}
                                            onChange={handleFinancialsChange}
                                            className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2 pl-7"
                                        />
                                    </div>
                                </div>
                            ))}
                            <div className="flex justify-end space-x-2 pt-2">
                                <Button variant="secondary" onClick={() => setIsEditingFinancials(false)}>Cancel</Button>
                                <Button onClick={handleSaveFinancials}>Save</Button>
                            </div>
                        </div>
                     ) : (
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span>Income:</span> <span className="font-medium">${currentClient.financials.income.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Expenses:</span> <span className="font-medium">${currentClient.financials.expenses.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Assets:</span> <span className="font-medium">${currentClient.financials.assets.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Liabilities:</span> <span className="font-medium">${currentClient.financials.liabilities.toLocaleString()}</span></div>
                        </div>
                     )}
                </Card>
            </div>

            <div className="lg:col-span-2">
                <Card>
                    <div className="border-b border-gray-200 dark:border-gray-700">
                        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                            {TABS.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`${
                                        activeTab === tab
                                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </nav>
                    </div>
                    <div className="pt-6">
                        {renderTabContent()}
                    </div>
                </Card>
            </div>
      </div>
      {noteToConvert && (
          <ConvertToTaskModal 
            note={noteToConvert}
            onClose={() => setNoteToConvert(null)}
            onTaskCreated={handleTaskCreated}
          />
      )}
    </div>
  );
};

export default ClientDetail;