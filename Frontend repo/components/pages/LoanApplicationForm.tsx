import React, { useState, useEffect } from 'react';
import type { Client, Document, AIRecommendationResponse, OneRoofPropertyDetails, BankRates } from '../../types';
import { Button } from '../common/Button';
import { Icon, IconName } from '../common/Icon';
import { Card } from '../common/Card';
import { crmService } from '../../services/crmService';
import { geminiService } from '../../services/geminiService';

interface LoanApplicationFormProps {
  client: Client;
  draftApplication: { id: string; referenceNumber: string };
  isEditMode?: boolean;
  onBack: () => void;
  onSuccess?: () => void;
  onApplicationsUpdated?: () => void;
}

const LOAN_PURPOSES = ['First Home Purchase', 'Next Home Purchase', 'Investment Property', 'Refinance', 'Top-up'];

const PropertyDetailItem: React.FC<{icon: IconName, label: string, value: string | React.ReactNode}> = ({icon, label, value}) => (
    <div className="flex items-start">
        <Icon name={icon} className="h-5 w-5 mr-3 text-gray-400 flex-shrink-0 mt-0.5" />
        <div>
            <p className="font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <p className="font-semibold">{value}</p>
        </div>
    </div>
);

const LoanApplicationForm: React.FC<LoanApplicationFormProps> = ({ client, draftApplication, isEditMode = false, onBack, onSuccess, onApplicationsUpdated }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [saveSuccessMessage, setSaveSuccessMessage] = useState('');
    const [isLoadingExisting, setIsLoadingExisting] = useState(isEditMode);
    const [lendingDetails, setLendingDetails] = useState({
        loanAmount: 500000,
        purpose: LOAN_PURPOSES[0],
        term: 30,
    });
    const [propertyAddress, setPropertyAddress] = useState('51 Kent Terrace, Riverhead, Rodney');
    const [propertyValue, setPropertyValue] = useState<number | null>(null);
    const [propertyDetails, setPropertyDetails] = useState<OneRoofPropertyDetails | null>(null);
    const [isSearchingProperty, setIsSearchingProperty] = useState(false);
    const [selectedLenders, setSelectedLenders] = useState<string[]>([]);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingDocs, setIsLoadingDocs] = useState(true);
    const [aiRecommendation, setAiRecommendation] = useState<AIRecommendationResponse | null>(null);
    const [isRecommending, setIsRecommending] = useState(false);
    const [recommendationError, setRecommendationError] = useState<string | null>(null);
    const [interestRates, setInterestRates] = useState<BankRates[]>([]);
    const [isLoadingRates, setIsLoadingRates] = useState(true);

    const fetchRecommendation = async (rates: BankRates[]) => {
        setIsRecommending(true);
        setRecommendationError(null);
        setAiRecommendation(null);
        setSelectedLenders([]);
        try {
            const result = await geminiService.getLenderRecommendation(client, lendingDetails, rates);
            const recommendationId = `rec_${client.id}_${Date.now()}`;
            const fullRecommendation = { ...result, recommendationId };
            await crmService.saveLenderRecommendation(client.id, fullRecommendation);
            setAiRecommendation(fullRecommendation);
        } catch (error) {
            console.error(error);
            setRecommendationError('Failed to generate AI recommendation. Please try again.');
        } finally {
            setIsRecommending(false);
        }
    };

    const handleRefreshRecommendation = () => {
        if (interestRates.length > 0) {
            fetchRecommendation(interestRates);
        }
    };

    useEffect(() => {
        const loadInitialData = async () => {
            setIsRecommending(true);
            setIsLoadingDocs(true);
            setIsLoadingRates(true);

            try {
                const [docs, rates, existingApp] = await Promise.all([
                    crmService.getDocuments(),
                    crmService.getCurrentInterestRates(),
                    isEditMode ? crmService.getApplicationById(draftApplication.id) : Promise.resolve(null),
                ]);
                
                setDocuments(docs.filter(doc => doc.clientId === client.id));
                setInterestRates(rates);

                if (existingApp) {
                    setLendingDetails({
                        loanAmount: Number(existingApp.loan_amount) || 500000,
                        purpose: existingApp.loan_purpose || LOAN_PURPOSES[0],
                        term: existingApp.loan_term_years || 30,
                    });
                    setPropertyAddress(existingApp.property_address || '');
                    setPropertyValue(existingApp.property_value ? Number(existingApp.property_value) : null);
                    setPropertyDetails(existingApp.property_details as OneRoofPropertyDetails | null);
                    setSelectedLenders(existingApp.selected_lenders || (existingApp.lender_name ? [existingApp.lender_name] : []));
                }
                
                if (!isEditMode) {
                    await fetchRecommendation(rates);
                } else {
                    setAiRecommendation(null);
                    setRecommendationError(null);
                }
            } catch (error) {
                console.error("Failed to fetch initial data:", error);
                setRecommendationError("Failed to load initial application data.");
            } finally {
                setIsLoadingDocs(false);
                setIsLoadingRates(false);
                setIsLoadingExisting(false);
            }
        };

        loadInitialData();
    }, [client.id, draftApplication.id, isEditMode]);

    const handleLendingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setLendingDetails(prev => ({ ...prev, [name]: name === 'loanAmount' || name === 'term' ? Number(value) : value }));
    };

    const handlePropertySearch = async () => {
        if (!propertyAddress.trim()) return;
        setIsSearchingProperty(true);
        setPropertyValue(null);
        setPropertyDetails(null);

        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const mockValue = Math.floor(Math.random() * (1500000 - 700000 + 1)) + 700000;
            setPropertyValue(mockValue);

            const details = await crmService.getOneRoofPropertyDetails(propertyAddress);
            setPropertyDetails(details);
        } catch (error) {
            console.error("Failed to fetch property details", error);
        } finally {
            setIsSearchingProperty(false);
        }
    };
    
    const handleLenderToggle = (lender: string) => {
        setSelectedLenders(prev => 
            prev.includes(lender) ? prev.filter(l => l !== lender) : [...prev, lender]
        );
    };
    
    const handleSaveDraft = async () => {
        setIsSavingDraft(true);
        try {
            await crmService.saveApplicationDraft(draftApplication.id, {
                loanAmount: lendingDetails.loanAmount,
                purpose: lendingDetails.purpose,
                term: lendingDetails.term,
                propertyAddress: propertyAddress,
                propertyValue: propertyValue,
                propertyDetails: propertyDetails as Record<string, unknown> | null,
                selectedLenders,
            });
            onApplicationsUpdated?.();
            setSaveSuccessMessage('Draft saved');
            setTimeout(() => setSaveSuccessMessage(''), 2000);
        } catch (error) {
            console.error("Failed to save draft:", error);
            alert("Could not save draft. Please try again.");
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleSubmit = async () => {
        if (!propertyValue || !propertyDetails || selectedLenders.length === 0) return;
        setIsSubmitting(true);
        try {
            await crmService.submitApplication(draftApplication.id, {
                loanAmount: lendingDetails.loanAmount,
                purpose: lendingDetails.purpose,
                term: lendingDetails.term,
                propertyAddress: propertyAddress,
                propertyValue: propertyValue,
                propertyDetails: propertyDetails as Record<string, unknown>,
                selectedLenders,
            });
            onSuccess ? onSuccess() : onBack();
        } catch (error) {
            console.error("Failed to submit application:", error);
            alert("Could not submit application. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const inputClasses = "block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 sm:text-sm p-2";

    if (isLoadingExisting) {
        return (
            <div className="flex justify-center items-center h-64">
                <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
                <p className="ml-3 text-gray-500 dark:text-gray-400">Loading application...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{isEditMode ? 'Edit' : 'New'} Loan Application</h1>
                    <p className="text-gray-500 dark:text-gray-400">For client: {client.name} · {draftApplication.referenceNumber}</p>
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

                    {isSearchingProperty && !propertyDetails && (
                        <Card>
                            <div className="flex justify-center items-center h-24">
                                <Icon name="Loader" className="h-6 w-6 animate-spin text-primary-500" />
                                <p className="ml-3 text-gray-500 dark:text-gray-400">Fetching property data from OneRoof...</p>
                            </div>
                        </Card>
                    )}

                    {propertyDetails && !isSearchingProperty && (
                        <Card>
                            <h3 className="text-lg font-semibold mb-4 flex items-center">
                                <Icon name="Info" className="h-5 w-5 mr-2 text-primary-500" />
                                Property Data
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                <PropertyDetailItem icon="Wifi" label="Broadband available" value={propertyDetails.broadband} />
                                <PropertyDetailItem icon="Frame" label="Floor area" value={`${propertyDetails.floorArea}m²`} />
                                <PropertyDetailItem icon="LandPlot" label="Land area" value={`${propertyDetails.landArea}m²`} />
                                <PropertyDetailItem icon="Layers3" label="Unitary Plan" value={propertyDetails.unitaryPlan} />
                                <PropertyDetailItem icon="FileBadge2" label="Type of title" value={propertyDetails.typeOfTitle} />
                                <PropertyDetailItem icon="CalendarDays" label="Decade of construction" value={propertyDetails.decadeOfConstruction} />
                                <PropertyDetailItem icon="Mountain" label="Contour" value={propertyDetails.contour} />
                                <PropertyDetailItem icon="Construction" label="Construction" value={propertyDetails.construction} />
                                <PropertyDetailItem icon="ShieldCheck" label="Condition" value={propertyDetails.condition} />
                                <PropertyDetailItem icon="LayoutPanelTop" label="Deck" value={propertyDetails.deck} />
                                <PropertyDetailItem icon="Landmark" label="Council" value={propertyDetails.council} />
                                <PropertyDetailItem icon="BookKey" label="Title" value={propertyDetails.title} />
                                <PropertyDetailItem icon="FileText" label="Legal description" value={<span className="break-all">{propertyDetails.legalDescription}</span>} />
                                <PropertyDetailItem icon="FileText" label="Estate description" value={<span className="break-all">{propertyDetails.estateDescription}</span>} />
                            </div>
                        </Card>
                    )}

                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold flex items-center">
                                <Icon name="Percent" className="h-5 w-5 mr-2 text-primary-500" />
                                Current Interest Rates
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => alert('Refreshing rates...')} leftIcon="RefreshCw">
                                Refresh
                            </Button>
                        </div>
                        {isLoadingRates ? (
                            <div className="flex justify-center items-center h-24">
                                <Icon name="Loader" className="h-6 w-6 animate-spin text-primary-500" />
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                        <tr>
                                            <th scope="col" className="px-4 py-2">Lender</th>
                                            {interestRates[0]?.rates.map(rate => (
                                                <th key={rate.term} scope="col" className="px-4 py-2 text-center">{rate.term}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {interestRates.map(bank => (
                                            <tr key={bank.lender} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 last:border-b-0">
                                                <td className="px-4 py-2 font-semibold text-gray-900 dark:text-white">{bank.lender}</td>
                                                {bank.rates.map(rate => (
                                                    <td key={rate.term} className="px-4 py-2 text-center">{rate.rate.toFixed(2)}%</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    <div className="relative rounded-lg overflow-hidden">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-lg blur opacity-75 animate-[spin_6s_linear_infinite]"></div>
                        <Card className="relative">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold flex items-center">
                                        <Icon name="Sparkles" className="h-5 w-5 mr-2 text-primary-500" />
                                        AI Lender Recommendation
                                    </h3>
                                </div>
                                <Button variant="secondary" size="sm" onClick={handleRefreshRecommendation} isLoading={isRecommending} leftIcon="RefreshCw">
                                    Refresh
                                </Button>
                            </div>

                            {isRecommending && (
                                <div className="flex flex-col items-center justify-center h-48">
                                    <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
                                    <p className="mt-2 text-sm text-gray-500">Analyzing borrower's profile...</p>
                                </div>
                            )}

                            {recommendationError && !isRecommending && (
                                <div className="text-center text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded-md">
                                    <p>{recommendationError}</p>
                                </div>
                            )}
                            
                            {aiRecommendation && !isRecommending && (
                                <div>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-4">
                                        <h4 className="font-semibold text-sm">AI Assessment Summary</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{aiRecommendation.assessmentSummary}</p>
                                    </div>

                                    <h4 className="font-semibold mb-3">Top Recommendations</h4>
                                    <div className="space-y-4">
                                        {aiRecommendation.recommendations.map(rec => (
                                            <div 
                                                key={rec.lender}
                                                onClick={() => handleLenderToggle(rec.lender)}
                                                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedLenders.includes(rec.lender) ? 'bg-primary-50 dark:bg-primary-900/40 border-primary-500 shadow-lg' : 'bg-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30 border-gray-300 dark:border-gray-600'}`}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <p className="font-bold text-lg">{rec.lender}</p>
                                                    <div className="flex items-center gap-4">
                                                        {rec.interestRate && (
                                                            <div className="text-right">
                                                                <p className="text-xs text-gray-500">Interest Rate</p>
                                                                <p className="font-semibold text-primary-600 dark:text-primary-400">{rec.interestRate}</p>
                                                            </div>
                                                        )}
                                                        <div className="text-right">
                                                            <p className="text-xs text-gray-500">Confidence</p>
                                                            <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-1">
                                                                <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${rec.confidenceScore * 100}%` }}></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{rec.rationale}</p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 text-xs">
                                                    <div>
                                                        <p className="font-semibold text-green-600 flex items-center"><Icon name="TrendingUp" className="h-4 w-4 mr-1" /> Pros</p>
                                                        <ul className="list-disc list-inside pl-1 mt-1 space-y-1">
                                                            {rec.pros.map((pro, i) => <li key={i}>{pro}</li>)}
                                                        </ul>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-red-500 flex items-center"><Icon name="TrendingDown" className="h-4 w-4 mr-1" /> Cons</p>
                                                        <ul className="list-disc list-inside pl-1 mt-1 space-y-1">
                                                            {rec.cons.map((con, i) => <li key={i}>{con}</li>)}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>

                    <div className="flex justify-end items-center gap-2 pt-2">
                         {saveSuccessMessage && (
                           <span className="text-sm text-green-600 dark:text-green-400 font-medium">{saveSuccessMessage}</span>
                         )}
                         <Button variant="secondary" onClick={handleSaveDraft} disabled={isSavingDraft || isSubmitting} isLoading={isSavingDraft}>
                            {isSavingDraft ? 'Saving...' : 'Save Draft'}
                        </Button>
                         <Button size="lg" onClick={handleSubmit} disabled={selectedLenders.length === 0 || !propertyValue || !propertyDetails || isRecommending || isSubmitting} isLoading={isSubmitting}>
                            {isSubmitting ? 'Submitting...' : `Submit Application${selectedLenders.length > 0 ? ` to ${selectedLenders.length} Lender(s)` : ''}`}
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