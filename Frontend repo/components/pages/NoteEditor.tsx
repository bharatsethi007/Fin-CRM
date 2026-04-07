
import React, { useState } from 'react';
import { logger } from '../../utils/logger';
import type { Client, Lead, Task, Note } from '../../types';
import { crmService } from '../../services/api';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';

type Record = (Client | Lead) & { recordType: 'Client' | 'Lead' };

interface NoteEditorProps {
    record: Record;
    note?: Note;
    onSave: () => void;
    onBack: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ record, note, onSave, onBack }) => {
    const [title, setTitle] = useState(() => {
        if (!note) return '';
        const [first, ...rest] = note.content.split('\n');
        return first || '';
    });
    const [content, setContent] = useState(() => {
        if (!note) return '';
        const [, ...rest] = note.content.split('\n');
        return rest.join('\n');
    });
    const [isFollowUp, setIsFollowUp] = useState(false);
    const [followUpDate, setFollowUpDate] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!title.trim() && !content.trim()) {
            alert("Note cannot be empty. Add a title or some content.");
            return;
        }
        if (isFollowUp && !followUpDate) {
            alert("Please select a follow-up date.");
            return;
        }
        
        const baseClientId =
          record.recordType === 'Client'
            ? record.id
            : (record as Lead).clientId || null;

        if (!baseClientId) {
          alert('This lead is not yet linked to a client, so notes cannot be saved. Convert it to a client first.');
          return;
        }

        const combinedContent = title.trim()
          ? `${title.trim()}\n\n${content}`.trim()
          : content;

        setIsSaving(true);
        try {
            if (note) {
                await crmService.updateNote(note.id, combinedContent);
            } else {
                await crmService.createNote({
                    clientId: baseClientId,
                    content: combinedContent,
                });
            }

            if (isFollowUp) {
                const advisor = await crmService.getAdvisor();
                await crmService.addTask({
                    title: `Follow up on note: "${(title || content).substring(0, 50)}..."`,
                    description: combinedContent,
                    dueDate: followUpDate,
                    priority: 'Medium',
                    clientId: record.recordType === 'Client' ? record.id : (record as Lead).clientId,
                    assignedTo: advisor.id,
                });
            }

            onSave();

        } catch (error: unknown) {
            logger.error("Failed to save note/task:", error);
            alert(error instanceof Error ? error.message : "An error occurred. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const inputClasses = "block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2";

    return (
        <div className="max-w-5xl mx-auto">
             <div className="flex justify-between items-center mb-4">
                <Button onClick={onBack} variant="secondary" leftIcon="ArrowLeft">
                    Back to Notes
                </Button>
                <Button onClick={handleSave} isLoading={isSaving} leftIcon="FileText">
                    Save
                </Button>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8">
                {/* Header / context pill */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Icon
                            name={record.recordType === 'Client' ? 'Users' : 'Contact'}
                            className="h-6 w-6 text-primary-500"
                        />
                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                Note for {record.recordType}
                            </p>
                            <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                {record.name}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Title */}
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Untitled note"
                    className="w-full text-2xl md:text-3xl font-semibold bg-transparent border-0 border-b border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:ring-0 mb-4 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />

                {/* Main editor area */}
                <div className="mt-2">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={12}
                        placeholder="Start typing your note..."
                        className={`${inputClasses} w-full min-h-[260px] resize-vertical`}
                    />
                </div>

                {/* Follow-up section */}
                <div className="mt-6 pt-4 border-t dark:border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isFollowUp}
                            onChange={(e) => setIsFollowUp(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                            Create follow-up task
                        </span>
                    </label>
                    {isFollowUp && (
                        <div className="flex items-center gap-3">
                            <label
                                htmlFor="follow-up-date"
                                className="block text-xs font-medium text-gray-500 dark:text-gray-400"
                            >
                                Follow-up date
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

