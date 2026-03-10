import React, { useState, useEffect } from 'react';
import type { Application, Client, Note, Document } from '../../types';
import { crmService } from '../../services/api';
import { geminiService } from '../../services/geminiService';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';
import { Card } from './Card';
import { MilestoneTracker } from './MilestoneTracker';

interface ApplicationDetailModalProps {
  application: Application;
  client: Client;
  onClose: () => void;
  onUpdate: () => void;
}

const TABS = ['Details', 'Personal', 'Financials', 'Documents', 'Comms'];

const DetailItem: React.FC<{ label: string; value: string | number; icon?: any }> = ({ label, value, icon }) => (
    <div className="flex items-center">
       {icon && <Icon name={icon} className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />}
        <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
            <p className="text-sm font-semibold">{value}</p>
        </div>
    </div>
);

export const ApplicationDetailModal: React.FC<ApplicationDetailModalProps> = ({ application, client, onClose, onUpdate }) => {
    const [activeTab, setActiveTab] = useState(TABS[0]);
    const [editableApplication, setEditableApplication] = useState(application);

    const [notes, setNotes] = useState<Note[]>([]);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [newNoteContent, setNewNoteContent] = useState('');
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    
    const [transcript, setTranscript] = useState('');
    const [auditResult, setAuditResult] = useState<{ summary: string; actions: string[] } | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);

    const fetchData = async () => {
        setIsLoadingData(true);
        const [allNotes, allDocs] = await Promise.all([
            crmService.getNotes(),
            crmService.getDocuments()
        ]);

        setNotes(
            allNotes
                .filter(n => n.applicationId === application.id)
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
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

    const handleSaveDetails = async () => {
        try {
            await crmService.updateApplicationDetails(application.id, {
                lender: editableApplication.lender,
                loanAmount: editableApplication.loanAmount,
                estSettlementDate: editableApplication.estSettlementDate,
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
            
            const advisor = await crmService.getAdvisor();
            await crmService.addNote({
                clientId: client.id,
                applicationId: application.id,
                content,
                authorId: advisor.id,
                authorName: advisor.name,
                authorAvatarUrl: advisor.avatarUrl,
            });
            setNewNoteContent('');
            setAuditResult(null); 
            setTranscript(''); 
            await fetchData(); 
            onUpdate(); 
        } catch (error) {
            console.error('Failed to save note:', error);
            alert('There was an error saving the note.');
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
            case 'Details':
                return (
                    <Card>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div>
                                <label htmlFor="lender" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lender</label>
                                <input type="text" name="lender" id="lender" value={editableApplication.lender} onChange={handleDetailsChange} className={`${inputClasses} mt-1`} />
                            </div>
                            <div>
                                <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Loan Amount</label>
                                <div className="relative mt-1">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><span className="text-gray-500 sm:text-sm">$</span></div>
                                    <input type="number" name="loanAmount" id="loanAmount" value={editableApplication.loanAmount} onChange={handleDetailsChange} className={`${inputClasses} pl-7`} />
                                </div>
                            </div>
                             <div>
                                <label htmlFor="estSettlementDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Est. Settlement Date</label>
                                <input type="date" name="estSettlementDate" id="estSettlementDate" value={editableApplication.estSettlementDate} onChange={handleDetailsChange} className={`${inputClasses} mt-1`} />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <Button onClick={handleSaveDetails}>Save Details</Button>
                        </div>
                    </Card>
                );
            case 'Personal':
                return (
                    <Card>
                         <h4 className="font-semibold mb-4">Personal Information</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailItem label="Full Name" value={client.name} icon="Contact" />
                            <DetailItem label="Email Address" value={client.email} icon="Mail" />
                            <DetailItem label="Phone Number" value={client.phone} icon="Phone" />
                            <DetailItem label="Address" value={client.address} icon="Home" />
                         </div>
                         <p className="text-xs text-gray-400 mt-4 text-center">To edit these details, please go to the main client profile page.</p>
                    </Card>
                );
            case 'Financials':
                return (
                     <Card>
                        <h4 className="font-semibold mb-4">Financial Summary</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailItem label="Annual Income" value={`$${client.financials.income.toLocaleString()}`} icon="TrendingUp" />
                            <DetailItem label="Annual Expenses" value={`$${client.financials.expenses.toLocaleString()}`} icon="TrendingDown" />
                            <DetailItem label="Total Assets" value={`$${client.financials.assets.toLocaleString()}`} icon="Gem" />
                            <DetailItem label="Total Liabilities" value={`$${client.financials.liabilities.toLocaleString()}`} icon="Landmark" />
                        </div>
                        <p className="text-xs text-gray-400 mt-4 text-center">To edit these details, please go to the main client profile page.</p>
                    </Card>
                );
            case 'Documents':
                return (
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                             <h4 className="font-semibold">Attached Documents</h4>
                             <Button size="sm" leftIcon="FilePlus2">Upload Document</Button>
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
                                        <Button variant="ghost" size="sm" leftIcon="Download">Download</Button>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No documents found for this client.</p>}
                    </Card>
                );
            case 'Comms':
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" aria-modal="true" role="dialog">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl h-[90vh] m-4 flex flex-col transform transition-all">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Application: {application.referenceNumber}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Client: {client.name}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <Icon name="X" className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-6 flex-grow overflow-y-auto">
                    <div className="mb-6">
                        <MilestoneTracker currentStatus={application.status} />
                    </div>

                    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                            {TABS.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`${
                                        activeTab === tab
                                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                                    } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div>
                        {renderTabContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};

