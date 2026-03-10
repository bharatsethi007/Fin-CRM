
import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/api';
import type { Client, CallTranscript, Lead } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { LiveCallModal } from '../common/LiveCallModal';
import { CallDetailModal } from '../common/CallDetailModal';
import { geminiService } from '../../services/geminiService';

const CallsPage: React.FC = () => {
    const [calls, setCalls] = useState<CallTranscript[]>([]);
    const [clientsAndLeads, setClientsAndLeads] = useState<(Client | Lead)[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSimulatingCall, setIsSimulatingCall] = useState(false);
    const [isProcessingCall, setIsProcessingCall] = useState(false);
    const [selectedCall, setSelectedCall] = useState<CallTranscript | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [callsData, clientsData, leadsData] = await Promise.all([
                crmService.getAllCallTranscripts(),
                crmService.getClients(),
                crmService.getLeads(),
            ]);
            setCalls(callsData);
            setClientsAndLeads([...clientsData, ...leadsData]);
        } catch (err) {
            console.error("Failed to fetch call data:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCallComplete = async (transcript: string, duration: number) => {
        setIsProcessingCall(true);
        try {
            const { summary, actions } = await geminiService.summarizeAndExtractActions(transcript);
            await crmService.addCallTranscript({
                timestamp: new Date().toISOString(),
                duration,
                transcript,
                summary,
                actionItems: actions
            });
            await fetchData();
        } catch (error) {
            console.error("Failed to process call transcript:", error);
            alert("There was an error processing the call transcript.");
        } finally {
            setIsProcessingCall(false);
        }
    };

    const getRecordName = (clientId?: string) => {
        if (!clientId) return 'Unassociated';
        const record = clientsAndLeads.find(r => r.id === clientId);
        return record?.name || 'Unknown Record';
    };

    return (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold">Call Logs</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Review and manage all recorded calls.</p>
                </div>
                <Button leftIcon="Mic" onClick={() => setIsSimulatingCall(true)} isLoading={isProcessingCall}>
                    {isProcessingCall ? 'Processing Call...' : 'Start Live Call'}
                </Button>
            </div>
            
            <div className="overflow-x-auto">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
                    </div>
                ) : (
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                                <th scope="col" className="px-6 py-3">Date & Time</th>
                                <th scope="col" className="px-6 py-3">Associated With</th>
                                <th scope="col" className="px-6 py-3">Duration</th>
                                <th scope="col" className="px-6 py-3">Summary</th>
                                <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {calls.map(call => (
                                <tr key={call.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                                        {new Date(call.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${call.clientId ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                                            {getRecordName(call.clientId)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {`${Math.floor(call.duration / 60)}m ${call.duration % 60}s`}
                                    </td>
                                    <td className="px-6 py-4 max-w-sm">
                                        <p className="truncate">{call.summary}</p>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedCall(call)}>
                                            View Details
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {isSimulatingCall && (
                <LiveCallModal
                    isOpen={isSimulatingCall}
                    onClose={() => setIsSimulatingCall(false)}
                    onCallComplete={handleCallComplete}
                    clientName={"New Lead"} // Generic name for unassociated calls
                />
            )}

            {selectedCall && (
                <CallDetailModal
                    call={selectedCall}
                    onClose={() => setSelectedCall(null)}
                    onUpdate={() => {
                        setSelectedCall(null);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
};

export default CallsPage;

