import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';
interface LiveCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCallComplete: (transcript: string, duration: number) => void;
  clientName: string;
}

interface TranscriptEntry {
    speaker: string;
    text: string;
    isFinal: boolean;
}

export const LiveCallModal: React.FC<LiveCallModalProps> = ({ isOpen, onClose, onCallComplete, clientName }) => {
    const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle');
    const [elapsedTime, setElapsedTime] = useState(0);
    const [transcriptLog, setTranscriptLog] = useState<TranscriptEntry[]>([]);

    const scrollRef = useRef<HTMLDivElement | null>(null);

    const cleanup = useCallback(() => {
        setStatus('idle');
        setElapsedTime(0);
    }, []);

    const handleStop = () => {
        const finalTranscript = transcriptLog
            .map(entry => `${entry.speaker}: ${entry.text}`)
            .join('\n');
        
        onCallComplete(finalTranscript, elapsedTime);
        cleanup();
        onClose();
    };

    const handleStart = async () => {
        if (status !== 'idle') return;
        setStatus('error');
    };
    
    useEffect(() => {
        if (!isOpen) {
            cleanup();
        }
    }, [isOpen, cleanup]);
    
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [transcriptLog]);

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    
    const getStatusIndicator = () => {
        switch (status) {
            case 'connecting': return <><Icon name="Loader" className="animate-spin h-3 w-3 mr-2" />Connecting...</>;
            case 'listening': return <><span className="relative flex h-3 w-3 mr-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>Live</>;
            case 'error': return <>Error</>;
            default: return <>Idle</>;
        }
    }
    
    const renderContent = () => {
        if (status === 'idle' || status === 'error') {
            return (
                 <div className="flex flex-col items-center justify-center text-center h-[32rem]">
                    <Icon name="PhoneCall" className="h-16 w-16 text-gray-400 mb-4" />
                    <p className="mb-6 text-gray-500 dark:text-gray-400">Ready to start the call with {clientName}?</p>
                    {status === 'error' && (
                        <p className="text-red-600 dark:text-red-400 mb-4 max-w-md text-sm">
                            Live Gemini audio cannot use a browser API key (it would be exposed in the bundle). This flow needs a
                            secure server-side session — not configured yet.
                        </p>
                    )}
                    <Button size="lg" leftIcon="Mic" onClick={handleStart}>
                      Start Call
                    </Button>
                </div>
            );
        }
        
        return (
             <div className="flex flex-col h-[32rem]">
                <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
                    <div className="flex items-center text-sm font-semibold">
                        {getStatusIndicator()}
                    </div>
                    <div className="font-mono text-lg font-semibold">{formatTime(elapsedTime)}</div>
                    <Button size="sm" variant="danger" leftIcon="Square" onClick={handleStop}>
                        End Call
                    </Button>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {transcriptLog.map((entry, index) => (
                        <div key={index} className={`flex flex-col ${entry.speaker === clientName ? 'items-start' : 'items-end'}`}>
                            <div className={`p-3 rounded-lg max-w-xl ${entry.speaker === clientName ? 'bg-gray-100 dark:bg-gray-700' : 'bg-primary-600 text-white'}`}>
                                <p className="text-xs font-bold mb-1">{entry.speaker}</p>
                                <p className={`text-sm ${!entry.isFinal ? 'opacity-70' : ''}`}>{entry.text}</p>
                            </div>
                        </div>
                    ))}
                    {status === 'connecting' && <p className="text-center text-gray-500">Establishing secure connection...</p>}
                </div>
            </div>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={handleStop} title="Talk Intelligence">
            {renderContent()}
        </Modal>
    );
};
