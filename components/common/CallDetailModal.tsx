
import React, { useState, useEffect, useMemo } from 'react';
import type { CallTranscript, Client, Lead } from '../../types';
import { crmService } from '../../services/crmService';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';

type Record = (Client | Lead) & { recordType: 'Client' | 'Lead' };

interface CallDetailModalProps {
    call: CallTranscript;
    onClose: () => void;
    onUpdate: () => void;
}

export const CallDetailModal: React.FC<CallDetailModalProps> = ({ call, onClose, onUpdate }) => {
    const [notes, setNotes] = useState(call.notes || '');
    const [selectedClientId, setSelectedClientId] = useState(call.clientId || '');
    const [allRecords, setAllRecords] = useState<Record[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingRecords, setIsLoadingRecords] = useState(false);

    const hasChanges = useMemo(() => {
        return notes !== (call.notes || '') || selectedClientId !== (call.clientId || '');
    }, [notes, selectedClientId, call]);

    useEffect(() => {
        if (!call.clientId) { // Only fetch if we need to show the selector
            setIsLoadingRecords(true);
            Promise.all([crmService.getClients(), crmService.getLeads()])
                .then(([clients, leads]) => {
                    const clientRecords: Record[] = clients.map(c => ({ ...c, recordType: 'Client' }));
                    const leadRecords: Record[] = leads.map(l => ({ ...l, recordType: 'Lead' }));
                    setAllRecords([...clientRecords, ...leadRecords].sort((a,b) => a.name.localeCompare(b.name)));
                    setIsLoadingRecords(false);
                });
        }
    }, [call.clientId]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await crmService.updateCallTranscript(call.id, {
                notes: notes,
                clientId: selectedClientId || undefined,
            });
            onUpdate();
            onClose();
        } catch (error) {
            console.error("Failed to update call:", error);
            alert("Could not update call details.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const associatedRecordName = useMemo(() => {
        if (!call.clientId) return null;
        const record = allRecords.find(r => r.id === call.clientId);
        return record?.name;
    }, [call.clientId, allRecords]);
    
    const inputClasses = "block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2";

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`Call Details - ${new Date(call.timestamp).toLocaleDateString()}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} isLoading={isSaving} disabled={!hasChanges}>Save Changes</Button>
                </>
            }
        >
            <div className="space-y-6">
                {/* Association Section */}
                <div>
                    <label htmlFor="client-association" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Associated Record
                    </label>
                    {call.clientId && associatedRecordName ? (
                        <p className="mt-1 text-sm font-semibold">{associatedRecordName}</p>
                    ) : (
                         <select
                            id="client-association"
                            value={selectedClientId}
                            onChange={(e) => setSelectedClientId(e.target.value)}
                            className={`${inputClasses} mt-1`}
                            disabled={isLoadingRecords}
                         >
                            <option value="">{isLoadingRecords ? 'Loading records...' : 'Select a Client or Lead'}</option>
                            {allRecords.map(record => (
                                <option key={record.id} value={record.id}>{record.name} ({record.recordType})</option>
                            ))}
                         </select>
                    )}
                </div>
                
                {/* AI Summary Section */}
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <h4 className="font-semibold text-sm mb-2 flex items-center"><Icon name="Sparkles" className="h-4 w-4 mr-2 text-primary-500" /> AI Summary & Actions</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{call.summary}</p>
                    <h5 className="font-semibold text-xs mb-1">Action Items</h5>
                    <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                        {call.actionItems.map((action, index) => (
                            <li key={index}>{action}</li>
                        ))}
                    </ul>
                </div>
                
                {/* Notes Section */}
                <div>
                    <label htmlFor="call-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Notes
                    </label>
                    <textarea
                        id="call-notes"
                        rows={4}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add your notes here..."
                        className={`${inputClasses} mt-1`}
                    />
                </div>
                
                {/* Transcript Section */}
                <div>
                    <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200">Full Transcript</h4>
                    <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg max-h-60 overflow-y-auto border dark:border-gray-600">
                        <p className="text-sm whitespace-pre-wrap">{call.transcript}</p>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
