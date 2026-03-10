
import React, { useState, useEffect, useMemo } from 'react';
import { crmService } from '../../services/api';
import type { Client, Lead } from '../../types';
import { Icon } from './Icon';
import { Button } from './Button';

type Record = (Client | Lead) & { recordType: 'Client' | 'Lead' };

interface ChooseRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecord: (record: Record) => void;
}

export const ChooseRecordModal: React.FC<ChooseRecordModalProps> = ({ isOpen, onClose, onSelectRecord }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      Promise.all([crmService.getClients(), crmService.getLeads()])
        .then(([clientsData, leadsData]) => {
          setClients(clientsData);
          setLeads(leadsData);
          setIsLoading(false);
        })
        .catch(err => {
            console.error("Failed to fetch records:", err);
            setIsLoading(false);
        });
    }
  }, [isOpen]);

  const allRecords: Record[] = useMemo(() => {
    const clientRecords: Record[] = clients.map(c => ({ ...c, recordType: 'Client' }));
    const leadRecords: Record[] = leads.map(l => ({ ...l, recordType: 'Lead' }));
    return [...clientRecords, ...leadRecords].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, leads]);

  const filteredRecords = useMemo(() => {
    if (!searchTerm) return allRecords;
    return allRecords.filter(record =>
      record.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allRecords, searchTerm]);
  
  const handleSelect = () => {
    const record = allRecords.find(r => r.id === selectedRecordId);
    if (record) {
        onSelectRecord(record);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" aria-modal="true" role="dialog">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg m-4 transform transition-all flex flex-col h-[70vh]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
             <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Choose record</h3>
             <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none"><Icon name="X" className="h-5 w-5" /></button>
          </div>
          <div className="relative mt-2">
            <Icon name="Search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full text-sm bg-gray-100 dark:bg-gray-700 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 p-2">Records</p>
              {filteredRecords.map(record => (
                <li
                  key={`${record.recordType}-${record.id}`}
                  onClick={() => setSelectedRecordId(record.id)}
                  className={`flex items-center justify-between p-3 rounded-md cursor-pointer ${
                    selectedRecordId === record.id ? 'bg-primary-100 dark:bg-primary-900/40' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center min-w-0">
                    <img src={record.avatarUrl} alt={record.name} className="h-8 w-8 rounded-full mr-3" />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{record.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{record.email}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${record.recordType === 'Client' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'}`}>
                    {record.recordType}
                  </span>
                </li>
              ))}
                <li
                  className="flex items-center p-3 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  onClick={() => alert('Create new record functionality is not implemented yet.')}
                >
                    <div className="h-8 w-8 rounded-full mr-3 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <Icon name="Plus" className="h-5 w-5 text-gray-500" />
                    </div>
                    <p className="font-semibold text-sm">Create new record</p>
                </li>
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="subtle" size="sm" leftIcon="ChevronUp">Navigate</Button>
            <Button onClick={handleSelect} disabled={!selectedRecordId || isLoading} rightIcon="ArrowRight">
                Select record
            </Button>
        </div>
      </div>
    </div>
  );
};

