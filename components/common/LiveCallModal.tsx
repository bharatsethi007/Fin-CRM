import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenaiBlob } from '@google/genai';

// Audio Encoding/Decoding helpers from guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): GenaiBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


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

    const aiRef = useRef<GoogleGenAI | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    
    // Audio related refs
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);
    
    const timerIntervalRef = useRef<number | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    // Transcription building refs
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());

    const cleanup = useCallback(async () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        
        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) {
                console.warn("Error closing session, it might have already been closed.", e);
            } finally {
                sessionPromiseRef.current = null;
            }
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }

        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            await inputAudioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
             for (const source of audioSourcesRef.current.values()) {
                source.stop();
             }
             audioSourcesRef.current.clear();
            await outputAudioContextRef.current.close();
        }
        
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

        setStatus('connecting');
        setTranscriptLog([]);
        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';

        try {
            if (!aiRef.current) {
                aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
            }
            const ai = aiRef.current;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            const outputNode = outputAudioContextRef.current.createGain();
            outputNode.connect(outputAudioContextRef.current.destination);
            outputNodeRef.current = outputNode;
            
            nextStartTimeRef.current = 0;
            
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                    },
                    systemInstruction: `You are a helpful mortgage advisor assistant. The client's name is ${clientName}. Keep your responses concise and professional.`,
                },
                callbacks: {
                    onopen: () => {
                        const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                        mediaStreamSourceRef.current = source;
                        
                        const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current!.destination);
                        
                        setStatus('listening');
                        const startTime = Date.now();
                        timerIntervalRef.current = window.setInterval(() => {
                           setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
                        }, 1000);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                       // Handle audio output
                       const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                       if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
                           nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                           const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
                           const source = outputAudioContextRef.current.createBufferSource();
                           source.buffer = audioBuffer;
                           source.connect(outputNodeRef.current);
                           source.addEventListener('ended', () => {
                               audioSourcesRef.current.delete(source);
                           });
                           source.start(nextStartTimeRef.current);
                           nextStartTimeRef.current += audioBuffer.duration;
                           audioSourcesRef.current.add(source);
                       }

                       if (message.serverContent?.interrupted) {
                           for (const source of audioSourcesRef.current.values()) {
                               source.stop();
                           }
                           audioSourcesRef.current.clear();
                           nextStartTimeRef.current = 0;
                       }
                       
                       // Handle transcriptions
                        if (message.serverContent?.inputTranscription) {
                            currentInputTranscriptionRef.current = message.serverContent.inputTranscription.text;
                        }
                        if (message.serverContent?.outputTranscription) {
                           currentOutputTranscriptionRef.current = message.serverContent.outputTranscription.text;
                        }
                        
                        // Update UI
                        setTranscriptLog(prev => {
                            const newLog = prev.filter(entry => entry.isFinal);
                            if (currentInputTranscriptionRef.current) {
                                newLog.push({ speaker: clientName, text: currentInputTranscriptionRef.current, isFinal: false });
                            }
                            if (currentOutputTranscriptionRef.current) {
                                newLog.push({ speaker: 'Advisor AI', text: currentOutputTranscriptionRef.current, isFinal: false });
                            }
                            return newLog;
                        });

                        if (message.serverContent?.turnComplete) {
                           setTranscriptLog(prev => {
                               return prev.map(entry => ({ ...entry, isFinal: true }));
                           });
                           currentInputTranscriptionRef.current = '';
                           currentOutputTranscriptionRef.current = '';
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        setStatus('error');
                    },
                    onclose: (e: CloseEvent) => {
                        cleanup();
                    },
                },
            });
        } catch (error) {
            console.error('Failed to start call:', error);
            setStatus('error');
            cleanup();
        }
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
                    {status === 'error' && <p className="text-red-500 mb-4">An error occurred. Please try again.</p>}
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
