
import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/crmService';
import type { Note, Client, Lead } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { ChooseRecordModal } from '../common/ChooseRecordModal';
import { NoteEditor } from './NoteEditor';

type Record = (Client | Lead) & { recordType: 'Client' | 'Lead' };

const NotesPage: React.FC = () => {
    const [view, setView] = useState<'list' | 'chooseRecord' | 'newNote'>('list');
    const [notes, setNotes] = useState<Note[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);

    const fetchNotes = async () => {
        setIsLoading(true);
        try {
            const fetchedNotes = await crmService.getNotes();
            setNotes(fetchedNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } catch (error) {
            console.error("Failed to fetch notes:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotes();
    }, []);

    const handleSelectRecord = (record: Record) => {
        setSelectedRecord(record);
        setView('newNote');
    };

    const handleNoteSaved = () => {
        setView('list');
        setSelectedRecord(null);
        fetchNotes(); // Refresh notes list
    };
    
    const handleBack = () => {
        setView('list');
        setSelectedRecord(null);
    }

    if (view === 'newNote' && selectedRecord) {
        return <NoteEditor record={selectedRecord} onSave={handleNoteSaved} onBack={handleBack} />;
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold">Notes</h2>
                    <p className="text-gray-500 dark:text-gray-400">All your notes in one place.</p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="secondary" leftIcon="Filter">View settings</Button>
                    <Button leftIcon="Plus" onClick={() => setView('chooseRecord')}>New note</Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500" />
                </div>
            ) : notes.length > 0 ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed rounded-lg dark:border-gray-700">
                    <div className="w-24 h-24 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
                        <Icon name="FileText" className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Notes, Tasks, and Email sending</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Note listing is a future feature. Click below to create a new note.</p>
                    <Button onClick={() => setView('chooseRecord')} className="mt-6" leftIcon="Plus">New note</Button>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed rounded-lg dark:border-gray-700">
                    <div className="w-24 h-24 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
                        <Icon name="FileText" className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Notes, Tasks, and Email sending</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Keep your team in sync with shared notes and tasks.</p>
                    <Button onClick={() => setView('chooseRecord')} className="mt-6" leftIcon="Plus">New note</Button>
                </div>
            )}
            
            {view === 'chooseRecord' && (
                <ChooseRecordModal
                    isOpen={true}
                    onClose={() => setView('list')}
                    onSelectRecord={handleSelectRecord}
                />
            )}
        </div>
    );
};

export default NotesPage;
