import React, { useState, useEffect } from 'react';
import type { Client, Document } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';
import { crmService } from '../../services/crmService';

interface LoanApplicationFormProps {
  client: Client;
  onBack: () => void;
}

const LENDERS = ['ASB', 'BNZ', 'ANZ', 'Westpac', 'Kiwi Bank'];
const LOAN_PURPOSES = ['First Home Purchase', 'Next Home Purchase', 'Investment Property', 'Refinance', 'Top-up'];

const LoanApplicationForm: React.FC<LoanApplicationFormProps> = ({ client, onBack }) => {
    const [lendingDetails, setLendingDetails] = useState({
        loanAmount: 500000,
        purpose: LOAN_PURPOSES[0],
        term: 30,
    });
    const [propertyAddress, setPropertyAddress] = useState('');
    const [propertyValue, setPropertyValue] = useState<number | null>(null);
    const [isSearchingProperty, setIsSearchingProperty] = useState(false);
    const [selectedLenders, setSelectedLenders] = useState<string[]>([]);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingDocs, setIsLoadingDocs] = useState(true);

    useEffect(() => {
        setIsLoadingDocs(true);
        crmService.getDocuments()
            .then(allDocs => {
                setDocuments(allDocs.filter(doc => doc.clientId === client.id));
                setIsLoadingDocs(false);
            })
            .catch(error => {
                console.error("Failed to fetch documents:", error);
                setIsLoadingDocs(false);
            });
    }, [client.id]);

    const handleLendingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setLendingDetails(prev => ({ ...prev, [name]: name === 'loanAmount' || name === 'term' ? Number(value) : value }));
    };

    const handlePropertySearch = () => {
        if (!propertyAddress.trim()) return;
        setIsSearchingProperty(true);
        // Simulate API call to Core Logic
        setTimeout(() => {
            setPropertyValue(Math.floor(Math.random() * (1500000 - 700000 + 1)) + 700000);
            setIsSearchingProperty(false);
        }, 1500);
    };
    
    const handleLenderToggle = (lender: string) => {
        setSelectedLenders(prev => 
            prev.includes(lender) ? prev.filter(l => l !== lender) : [...prev, lender]
        );
    };
    
    const handleSubmit = () => {
        alert(`Submitting application for ${client.name} to ${selectedLenders.join(', ')} for a loan of $${lendingDetails.loanAmount}.`);
        onBack();
    };

    const inputClasses = "block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2";

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Loan Application</h1>
                    <p className="text-gray-500 dark:text-gray-400">For client: {client.name}</p>
                </div>
                <Button onClick={onBack} variant="secondary" leftIcon="ArrowLeft">
                    Back to Client Profile
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <h3 className="text-lg font-semibold mb-4">Lending Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div>
                                <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Loan Amount</label>
                                <div className="relative mt-1">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                        <span className="text-gray-500 sm:text-sm">$</span>
                                    </div>
                                    <input type="number" name="loanAmount" id="loanAmount" value={lendingDetails.loanAmount} onChange={handleLendingChange} className={`${inputClasses} pl-7`} />
                                </div>
                            </div>
                             <div>
                                <label htmlFor="purpose" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Purpose</label>
                                <select name="purpose" id="purpose" value={lendingDetails.purpose} onChange={handleLendingChange} className={`${inputClasses} mt-1`}>
                                    {LOAN_PURPOSES.map(p => <option key={p}>{p}</option>)}
                                </select>
                            </div>
                             <div>
                                <label htmlFor="term" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Loan Term (years)</label>
                                <input type="number" name="term" id="term" value={lendingDetails.term} onChange={handleLendingChange} className={`${inputClasses} mt-1`} />
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-lg font-semibold mb-4">Property Details</h3>
                        <div className="flex gap-2">
                             <input type="text" placeholder="Enter property address to search..." value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} className={`${inputClasses} flex-grow`} />
                             <Button onClick={handlePropertySearch} isLoading={isSearchingProperty} leftIcon="Search">Find Property</Button>
                        </div>
                        {propertyValue && (
                            <div className="mt-4 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                                <p className="font-semibold">{propertyAddress}</p>
                                <p className="text-sm">CoreLogic Estimated Value: <span className="font-bold text-lg text-primary-600 dark:text-primary-400">${propertyValue.toLocaleString()}</span></p>
                            </div>
                        )}
                    </Card>

                    <Card>
                        <h3 className="text-lg font-semibold mb-4">Submit to Lenders</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Select one or more lenders to submit this application to.</p>
                         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            {LENDERS.map(lender => (
                                <div 
                                    key={lender} 
                                    onClick={() => handleLenderToggle(lender)} 
                                    className={`p-4 border rounded-lg text-center cursor-pointer transition-all ${selectedLenders.includes(lender) ? 'bg-primary-100 dark:bg-primary-900/40 border-primary-500 ring-2 ring-primary-500' : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600'}`}
                                >
                                    <p className="font-semibold">{lender}</p>
                                </div>
                            ))}
                         </div>
                    </Card>

                    <div className="flex justify-end pt-2">
                        <Button size="lg" onClick={handleSubmit} disabled={selectedLenders.length === 0 || !propertyValue}>
                            Submit Application{selectedLenders.length > 0 && ` to ${selectedLenders.length} Lender(s)`}
                        </Button>
                    </div>

                </div>

                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <h3 className="text-lg font-semibold mb-4">Personal Details</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center"><Icon name="Contact" className="h-4 w-4 mr-3 text-gray-400" /> <span className="font-semibold">{client.name}</span></div>
                            <div className="flex items-center"><Icon name="Mail" className="h-4 w-4 mr-3 text-gray-400" /> <span>{client.email}</span></div>
                            <div className="flex items-center"><Icon name="Phone" className="h-4 w-4 mr-3 text-gray-400" /> <span>{client.phone}</span></div>
                            <div className="flex items-start"><Icon name="Home" className="h-4 w-4 mr-3 text-gray-400 mt-0.5" /> <span>{client.address}</span></div>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-lg font-semibold mb-4">Financial Summary</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span>Income:</span> <span className="font-medium">${client.financials.income.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Expenses:</span> <span className="font-medium">${client.financials.expenses.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Assets:</span> <span className="font-medium">${client.financials.assets.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Liabilities:</span> <span className="font-medium">${client.financials.liabilities.toLocaleString()}</span></div>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-lg font-semibold mb-4">Attached Documents</h3>
                        {isLoadingDocs ? (
                            <div className="flex justify-center items-center h-24">
                                <Icon name="Loader" className="h-6 w-6 animate-spin text-primary-500" />
                            </div>
                        ) : documents.length > 0 ? (
                            <ul className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                {documents.map(doc => (
                                    <li key={doc.id} className="flex items-center text-sm p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                        <Icon name="FileText" className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                                        <span className="truncate" title={doc.name}>{doc.name}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No documents on file.</p>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default LoanApplicationForm;