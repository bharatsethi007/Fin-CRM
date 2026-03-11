
import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/api';
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
    const [selectedNote, setSelectedNote] = useState<Note | null>(null);
    const [clients, setClients] = useState<Client[]>([]);

    const fetchNotes = async () => {
        setIsLoading(true);
        try {
            const [fetchedNotes, fetchedClients] = await Promise.all([
                crmService.getNotes(),
                crmService.getClients(),
            ]);
            setNotes(
                fetchedNotes.sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
            );
            setClients(fetchedClients);
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
        setSelectedNote(null);
        fetchNotes(); // Refresh notes list
    };
    
    const handleBack = () => {
        setView('list');
        setSelectedRecord(null);
        setSelectedNote(null);
    }

    const handleOpenNoteForClient = (note: Note) => {
        const client = clients.find(c => c.id === note.clientId);
        if (!client) {
            // If we can't resolve the client, just stay on the list.
            return;
        }
        setSelectedRecord({ ...client, recordType: 'Client' });
        setSelectedNote(note);
        setView('newNote');
    };

    if (view === 'newNote' && selectedRecord) {
        return <NoteEditor record={selectedRecord} note={selectedNote || undefined} onSave={handleNoteSaved} onBack={handleBack} />;
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
            ) : (
                <div className="flex-1 flex flex-col border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                    {/* Header row: tabs + sort (simple) */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 text-sm">
                        <div className="flex items-center gap-4">
                            <button className="font-medium text-gray-900 dark:text-gray-100">
                                Notes <span className="text-gray-500 dark:text-gray-400">({notes.length})</span>
                            </button>
                            <span className="text-gray-400 dark:text-gray-500 cursor-not-allowed">
                                Templates
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>Sorted by</span>
                            <button className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400">
                                Creation date
                                <Icon name="ChevronDown" className="h-3 w-3" />
                            </button>
                        </div>
                    </div>

                    {/* Favorites placeholder */}
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
                        <div className="font-medium mb-1">Favorites</div>
                        <p>Notes that you favorite will appear here</p>
                    </div>

                    {/* Notes table */}
                    {notes.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                            No notes yet. Click &quot;New note&quot; to create your first note.
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-800 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    <tr>
                                        <th className="px-6 py-2 text-left">Note</th>
                                        <th className="px-6 py-2 text-left">Created by</th>
                                        <th className="px-6 py-2 text-left">Client</th>
                                        <th className="px-6 py-2 text-left">Created at</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                    {notes.map((note) => {
                                        const firstLine = note.content.split('\n')[0] || '(Untitled note)';
                                        const createdAt = note.createdAt
                                            ? new Date(note.createdAt).toLocaleDateString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })
                                            : '';
                                        const client = clients.find(c => c.id === note.clientId);
                                        const clientName = client?.name ?? '—';
                                        return (
                                            <tr
                                                key={note.id}
                                                className="hover:bg-gray-50 dark:hover:bg-gray-900/40 cursor-pointer"
                                                onClick={() => handleOpenNoteForClient(note)}
                                            >
                                                <td className="px-6 py-3">
                                                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                                        {firstLine}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                                                            <img
                                                              src={note.authorAvatarUrl}
                                                              alt={note.authorName}
                                                              className="h-6 w-6 rounded-full"
                                                            />
                                                        </div>
                                                        <span className="text-gray-800 dark:text-gray-200">
                                                            {note.authorName}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-gray-500 dark:text-gray-400">
                                                    <div className="flex items-center gap-2">
                                                        {client ? (
                                                          <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                                                            <img
                                                              src={client.avatarUrl}
                                                              alt={client.name}
                                                              className="h-6 w-6 rounded-full"
                                                            />
                                                          </div>
                                                        ) : (
                                                          <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                                            <Icon name="Users" className="h-3 w-3 text-gray-500" />
                                                          </div>
                                                        )}
                                                        <span>{clientName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-gray-500 dark:text-gray-400">
                                                    {createdAt}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
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

