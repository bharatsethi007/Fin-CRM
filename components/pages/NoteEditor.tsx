
import React, { useState } from 'react';
import type { Client, Lead, Task } from '../../types';
import { crmService } from '../../services/crmService';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';

type Record = (Client | Lead) & { recordType: 'Client' | 'Lead' };

interface NoteEditorProps {
    record: Record;
    onSave: () => void;
    onBack: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ record, onSave, onBack }) => {
    const [content, setContent] = useState('');
    const [isFollowUp, setIsFollowUp] = useState(false);
    const [followUpDate, setFollowUpDate] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!content.trim()) {
            alert("Note content cannot be empty.");
            return;
        }
        if (isFollowUp && !followUpDate) {
            alert("Please select a follow-up date.");
            return;
        }
        
        setIsSaving(true);
        try {
            const advisor = await crmService.getAdvisor();
            await crmService.addNote({
                clientId: record.recordType === 'Client' ? record.id : (record as Lead).clientId || '',
                content,
                authorId: advisor.id,
                authorName: advisor.name,
                authorAvatarUrl: advisor.avatarUrl,
            });

            if (isFollowUp) {
                await crmService.addTask({
                    title: `Follow up on note: "${content.substring(0, 50)}..."`,
                    dueDate: followUpDate,
                    priority: 'Medium',
                    clientId: record.recordType === 'Client' ? record.id : (record as Lead).clientId,
                });
            }

            onSave();

        } catch (error) {
            console.error("Failed to save note/task:", error);
            alert("An error occurred. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const inputClasses = "block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2";

    return (
        <div className="max-w-3xl mx-auto">
             <div className="flex justify-between items-center mb-6">
                <Button onClick={onBack} variant="secondary" leftIcon="ArrowLeft">
                    Back to Notes
                </Button>
                <Button onClick={handleSave} isLoading={isSaving} leftIcon="FileText">
                    Save Note
                </Button>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="p-3 mb-4 bg-gray-50 dark:bg-gray-700/50 rounded-md border dark:border-gray-600 flex items-center">
                    <Icon name={record.recordType === 'Client' ? 'Users' : 'Contact'} className="h-5 w-5 mr-3 text-gray-500" />
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Note for {record.recordType}</p>
                        <p className="font-semibold">{record.name}</p>
                    </div>
                </div>

                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={10}
                    placeholder="Write your note here..."
                    className={`${inputClasses} w-full`}
                />

                <div className="mt-4 pt-4 border-t dark:border-gray-700">
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isFollowUp}
                            onChange={(e) => setIsFollowUp(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="ml-2 text-sm font-medium">Follow up</span>
                    </label>
                    {isFollowUp && (
                        <div className="mt-3">
                            <label htmlFor="follow-up-date" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Follow-up Date
                            </label>
                            <input
                                type="date"
                                id="follow-up-date"
                                value={followUpDate}
                                onChange={(e) => setFollowUpDate(e.target.value)}
                                className={inputClasses}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
