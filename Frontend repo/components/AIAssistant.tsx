import React, { useState, useRef, useEffect } from 'react';
import { Button } from './common/Button';
import { Icon } from './common/Icon';
import { geminiService } from '../services/geminiService';

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

const AIAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'ai', text: "Kia ora! I'm your AI assistant. How can I help you today? Try asking 'Summarize my new leads'." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const aiResponse = await geminiService.getDashboardInsights(input);
      const aiMessage: Message = { sender: 'ai', text: aiResponse };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error fetching AI response:', error);
      const errorMessage: Message = { sender: 'ai', text: "Sorry, I couldn't fetch a response. Please try again." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Chat Window */}
      <div className={`fixed bottom-24 right-4 sm:right-8 w-[calc(100%-2rem)] sm:w-96 h-[32rem] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col z-50 border border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <Icon name="Sparkles" className="h-6 w-6 text-primary-500" />
              <h3 className="text-lg font-semibold ml-2">AI Assistant</h3>
            </div>
            <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
                <Icon name="X" className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex items-start gap-2.5 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                {msg.sender === 'ai' && <div className="p-2 bg-primary-600 rounded-full text-white"><Icon name="Bot" className="h-4 w-4" /></div>}
                <div className={`p-3 rounded-lg max-w-xs ${msg.sender === 'ai' ? 'bg-gray-100 dark:bg-gray-700' : 'bg-primary-600 text-white'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-primary-600 rounded-full text-white"><Icon name="Bot" className="h-4 w-4" /></div>
                <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-700">
                  <Icon name="Loader" className="h-5 w-5 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                placeholder="Ask anything..."
                className="flex-grow bg-gray-100 dark:bg-gray-700 border border-transparent rounded-l-lg focus:outline-none focus:ring-2 focus:ring-primary-500 px-4"
                disabled={isLoading}
              />
              <Button onClick={handleSendMessage} isLoading={isLoading} className="rounded-l-none">
                <Icon name="Send" className="h-5 w-5" />
              </Button>
            </div>
          </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-4 sm:right-8 h-16 w-16 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90 backdrop-blur-lg border border-white/30 text-white flex items-center justify-center shadow-lg hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-300 transition-transform duration-200 z-50"
        aria-label="Toggle AI Assistant"
      >
        <Icon name={isOpen ? 'X' : 'Sparkles'} className="h-8 w-8 transition-transform duration-300" />
      </button>
    </>
  );
};

export default AIAssistant;