

import React, { useState, useEffect, useRef } from 'react';
import type { Application, Client, Note, Document } from '../../types';
import { ApplicationStatus } from '../../types';
import { crmService } from '../../services/api';
import { geminiService } from '../../services/geminiService';
import { Button } from '../common/Button';
import { Icon, IconName } from '../common/Icon';
import { Card } from '../common/Card';
import { MilestoneTracker } from '../common/MilestoneTracker';
import { NZ_BANKS } from '../../constants';
import { ApplicantsTab } from '../application/ApplicantsTab';
import { EmploymentIncomeTab } from '../application/EmploymentIncomeTab';
import { ExpensesTab } from '../application/ExpensesTab';
import { AssetsTab } from '../application/AssetsTab';
import { LiabilitiesTab } from '../application/LiabilitiesTab';
import { CompaniesTab } from '../application/CompaniesTab';

interface ApplicationDetailPageProps {
  application: Application;
  client: Client;
  onBack: () => void;
  onUpdate: () => void;
  onEditDraft?: () => void;
}

const TABS: { name: string; icon: IconName }[] = [
    { name: 'Overview', icon: 'FileText' },
    { name: 'Applicants', icon: 'Users' },
    { name: 'Employment & Income', icon: 'Briefcase' },
    { name: 'Expenses', icon: 'TrendingDown' },
    { name: 'Assets', icon: 'Gem' },
    { name: 'Liabilities', icon: 'Landmark' },
    { name: 'Companies', icon: 'Building2' },
    { name: 'Documents', icon: 'FilePlus2' },
    { name: 'Notes', icon: 'Mail' }
];

const DetailItem: React.FC<{ label: string; value: string | number; icon?: any }> = ({ label, value, icon }) => (
    <div className="flex items-center">
       {icon && <Icon name={icon} className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />}
        <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
            <p className="text-sm font-semibold">{value}</p>
        </div>
    </div>
);

export const ApplicationDetailPage: React.FC<ApplicationDetailPageProps> = ({ application, client, onBack, onUpdate, onEditDraft }) => {
    const [activeTab, setActiveTab] = useState('Overview');
    const [editableApplication, setEditableApplication] = useState(application);

    const [notes, setNotes] = useState<Note[]>([]);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [newNoteContent, setNewNoteContent] = useState('');
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    
    const [transcript, setTranscript] = useState('');
    const [auditResult, setAuditResult] = useState<{ summary: string; actions: string[] } | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [isUploadingDoc, setIsUploadingDoc] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchData = async () => {
        setIsLoadingData(true);
        const [allNotes, allDocs] = await Promise.all([
            crmService.getNotes(),
            crmService.getDocuments()
        ]);

        setNotes(
            allNotes
                .filter(n => n.applicationId === application.id)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
        setDocuments(allDocs.filter(doc => doc.clientId === client.id));
        setIsLoadingData(false);
    };

    useEffect(() => {
        fetchData();
    }, [application.id]);

    useEffect(() => {
        setEditableApplication(application);
    }, [application]);

    const handleDetailsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setEditableApplication(prev => ({
            ...prev,
            [name]: name === 'loanAmount' ? Number(value) : value,
        }));
    };
    
    const handleUploadDocumentClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        e.target.value = '';
        if (files.length === 0) return;
        setIsUploadingDoc(true);
        try {
            for (const file of files) {
                await crmService.addDocument(client.id, file as File, 'Other');
            }
            await fetchData();
            onUpdate();
        } catch (err) {
            console.error('Document upload failed:', err);
            alert('Failed to upload document(s). Please try again.');
        } finally {
            setIsUploadingDoc(false);
        }
    };

    const handleSaveDetails = async () => {
        try {
            await crmService.updateApplicationDetails(application.id, {
                lender: editableApplication.lender,
                loanAmount: editableApplication.loanAmount,
                estSettlementDate: editableApplication.estSettlementDate,
                lenderReferenceNumber: editableApplication.lenderReferenceNumber,
                brokerId: editableApplication.brokerId,
                financeDueDate: editableApplication.financeDueDate,
                loanSecurityAddress: editableApplication.loanSecurityAddress,
            });
            onUpdate();
            alert("Application details saved!");
        } catch (error) {
            console.error("Failed to save details:", error);
            alert("Error saving details.");
        }
    };
    
    const handleAddNote = async (content: string) => {
        if (!content.trim()) return;

        setIsSubmittingNote(true);
        try {
            const complianceResult = await geminiService.analyzeCompliance(content);
            if (!complianceResult.isCompliant) {
                const proceed = window.confirm(
                    `Compliance Alert:\n\n${complianceResult.reason}\n\nAre you sure you want to post this note?`
                );
                if (!proceed) {
                    setIsSubmittingNote(false);
                    return;
                }
            }
            
            await crmService.createNote({
                clientId: client.id,
                applicationId: application.id,
                content,
            });
            setNewNoteContent('');
            setAuditResult(null); 
            setTranscript(''); 
            await fetchData(); 
            onUpdate(); 
        } catch (error: unknown) {
            console.error('Failed to save note:', error);
            alert(error instanceof Error ? error.message : 'There was an error saving the note.');
        } finally {
            setIsSubmittingNote(false);
        }
    };

    const handleAuditTranscript = async () => {
        if (!transcript.trim()) return;
        setIsAuditing(true);
        setAuditResult(null);
        try {
            const result = await geminiService.summarizeAndExtractActions(transcript);
            setAuditResult(result);
        } catch (error) {
            alert('Failed to audit transcript.');
        } finally {
            setIsAuditing(false);
        }
    };
    
    const handleAddSummaryToNotes = () => {
        if (!auditResult) return;
        const noteContent = `AI Summary of Meeting:\n${auditResult.summary}\n\nNext Actions:\n${auditResult.actions.map(a => `- ${a}`).join('\n')}`;
        handleAddNote(noteContent);
    };

    const timeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        return new Date(dateString).toLocaleString();
    };

    const inputClasses = "block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2";

    const renderTabContent = () => {
        if (isLoadingData) {
            return <div className="flex justify-center items-center h-64"><Icon name="Loader" className="h-8 w-8 animate-spin" /></div>;
        }
        switch (activeTab) {
            case 'Overview':
                return (
                    <Card>
                        {application.status === ApplicationStatus.Draft && onEditDraft && (
                            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between">
                                <p className="text-sm text-amber-800 dark:text-amber-200">This application is in draft. Complete the application form to submit.</p>
                                <Button size="sm" variant="secondary" onClick={onEditDraft} leftIcon="Pencil">Continue editing</Button>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor="lender" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lender</label>
                                <select name="lender" id="lender" value={editableApplication.lender || ''} onChange={handleDetailsChange} className={`${inputClasses} mt-1`}>
                                    <option value="">— Select —</option>
                                    {editableApplication.lender && !NZ_BANKS.includes(editableApplication.lender) && <option value={editableApplication.lender}>{editableApplication.lender}</option>}
                                    {NZ_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="lenderReferenceNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lender's Reference Number</label>
                                <input type="text" name="lenderReferenceNumber" id="lenderReferenceNumber" value={editableApplication.lenderReferenceNumber || ''} onChange={handleDetailsChange} className={`${inputClasses} mt-1`} />
                            </div>
                            <div>
                                <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Loan Amount</label>
                                <div className="relative mt-1">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><span className="text-gray-500 sm:text-sm">$</span></div>
                                    <input type="number" name="loanAmount" id="loanAmount" value={editableApplication.loanAmount} onChange={handleDetailsChange} className={`${inputClasses} pl-7`} />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="brokerId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Broker ID</label>
                                <input type="text" name="brokerId" id="brokerId" value={editableApplication.brokerId || ''} onChange={handleDetailsChange} className={`${inputClasses} mt-1`} />
                            </div>
                            <div>
                                <label htmlFor="estSettlementDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Est. Settlement Date</label>
                                <input type="date" name="estSettlementDate" id="estSettlementDate" value={editableApplication.estSettlementDate} onChange={handleDetailsChange} className={`${inputClasses} mt-1`} />
                            </div>
                            <div>
                                <label htmlFor="financeDueDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Finance Due Date</label>
                                <input type="date" name="financeDueDate" id="financeDueDate" value={editableApplication.financeDueDate || ''} onChange={handleDetailsChange} className={`${inputClasses} mt-1`} />
                            </div>
                            <div className="md:col-span-2">
                                <label htmlFor="loanSecurityAddress" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Loan Security Address</label>
                                <input type="text" name="loanSecurityAddress" id="loanSecurityAddress" value={editableApplication.loanSecurityAddress || ''} onChange={handleDetailsChange} className={`${inputClasses} mt-1`} />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <Button onClick={handleSaveDetails}>Save Details</Button>
                        </div>
                    </Card>
                );
            case 'Applicants':
                return <Card><ApplicantsTab applicationId={application.id} /></Card>;
            case 'Employment & Income':
                return <Card><EmploymentIncomeTab applicationId={application.id} /></Card>;
            case 'Expenses':
                return <Card><ExpensesTab applicationId={application.id} /></Card>;
            case 'Assets':
                return <Card><AssetsTab applicationId={application.id} /></Card>;
            case 'Liabilities':
                return <Card><LiabilitiesTab applicationId={application.id} /></Card>;
            case 'Companies':
                return <Card><CompaniesTab applicationId={application.id} /></Card>;
            case 'Documents':
                return (
                    <Card>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            multiple
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
                            onChange={handleFileInputChange}
                        />
                        <div className="flex justify-between items-center mb-4">
                             <h4 className="font-semibold">Attached Documents</h4>
                             <Button size="sm" leftIcon="FilePlus2" onClick={handleUploadDocumentClick} disabled={isUploadingDoc} isLoading={isUploadingDoc}>
                                 Upload Document
                             </Button>
                        </div>
                       
                        {documents.length > 0 ? (
                            <ul className="space-y-2">
                                {documents.map(doc => (
                                    <li key={doc.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                        <div className="flex items-center">
                                            <Icon name="FileText" className="h-5 w-5 mr-3 text-gray-400" />
                                            <div>
                                                <p className="text-sm font-medium">{doc.name}</p>
                                                <p className="text-xs text-gray-500">Uploaded: {doc.uploadDate}</p>
                                            </div>
                                        </div>
                                        <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                            <Button variant="ghost" size="sm" leftIcon="Download">Download</Button>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No documents found for this client.</p>}
                    </Card>
                );
            case 'Notes':
                return (
                    <div className="space-y-6">
                        <Card>
                            <h4 className="font-semibold mb-2 flex items-center"><Icon name="ClipboardCheck" className="h-5 w-5 mr-2 text-primary-500"/>AI Auditor</h4>
                            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={4} placeholder="Paste meeting or call transcript here..." className="block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2"/>
                            <div className="flex justify-end mt-2"><Button onClick={handleAuditTranscript} isLoading={isAuditing}>Summarize & Find Actions</Button></div>
                            {auditResult && (
                                <div className="mt-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-md border border-primary-200 dark:border-primary-800">
                                    <h5 className="font-semibold text-sm">Summary:</h5>
                                    <p className="text-sm mt-1 whitespace-pre-wrap">{auditResult.summary}</p>
                                    <h5 className="font-semibold text-sm mt-3">Next Actions:</h5>
                                    <ul className="list-disc list-inside text-sm mt-1 space-y-1">{auditResult.actions.map((action, i) => <li key={i}>{action}</li>)}</ul>
                                    <div className="flex justify-end mt-3"><Button size="sm" onClick={handleAddSummaryToNotes} leftIcon="PlusCircle" isLoading={isSubmittingNote}>Add to Notes</Button></div>
                                </div>
                            )}
                        </Card>
                        <Card>
                            <h4 className="font-semibold mb-4">Communication Log</h4>
                            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                                {notes.map(note => (
                                    <div key={note.id} className="flex items-start gap-3">
                                        <img src={note.authorAvatarUrl} alt={note.authorName} className="h-8 w-8 rounded-full flex-shrink-0 mt-1" />
                                        <div className="flex-grow p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                            <div className="flex justify-between items-center"><p className="font-semibold text-sm">{note.authorName}</p><p className="text-xs text-gray-500 dark:text-gray-400">{timeAgo(note.createdAt)}</p></div>
                                            <p className="mt-1 text-sm whitespace-pre-wrap">{note.content}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t dark:border-gray-700">
                                <textarea value={newNoteContent} onChange={(e) => setNewNoteContent(e.target.value)} rows={3} placeholder="Add a new note or email..." className={`${inputClasses} w-full`} disabled={isSubmittingNote}/>
                                <div className="flex justify-between items-center mt-2">
                                    <div className="group relative flex items-center text-xs text-gray-500">
                                        <Icon name="FileSignature" className="h-4 w-4 mr-1.5 text-green-500" />
                                        <span>AI Compliance check enabled</span>
                                        <span className="absolute left-0 -top-7 w-max px-2 py-1 bg-gray-700 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Notes are checked for compliance risks before posting.</span>
                                    </div>
                                    <Button onClick={() => handleAddNote(newNoteContent)} isLoading={isSubmittingNote} leftIcon="PlusCircle">Add Note</Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Application: {application.referenceNumber}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Client: {client.name}</p>
                </div>
                <Button onClick={onBack} variant="secondary" leftIcon="ArrowLeft">
                    Back to Deals
                </Button>
            </div>
            
            <Card className="p-6">
                <div className="mb-8">
                    <MilestoneTracker currentStatus={application.status} />
                </div>

                <div className="flex gap-8">
                    {/* Left Navigation */}
                    <aside className="w-56 flex-shrink-0">
                        <nav className="space-y-1">
                             {TABS.map(tab => (
                                <button
                                    key={tab.name}
                                    onClick={() => setActiveTab(tab.name)}
                                    className={`w-full flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                                        activeTab === tab.name
                                        ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <Icon name={tab.icon} className="h-5 w-5 mr-3" />
                                    <span>{tab.name}</span>
                                </button>
                            ))}
                        </nav>
                    </aside>

                    {/* Right Content */}
                    <main className="flex-1 min-w-0">
                        {renderTabContent()}
                    </main>
                </div>
            </Card>
        </div>
    );
};
