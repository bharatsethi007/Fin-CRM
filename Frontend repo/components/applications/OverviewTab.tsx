import React, { useState, useEffect } from 'react';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';
import { applicationService, type Applicant } from '../../services/applicationService';
import type { BankRates, AIRecommendationResponse } from '../../types';
import { crmService, noteService, authService } from '../../services/api';
import { geminiService, type StatementOfAdviceResponse } from '../../services/geminiService';

type ApplicationDetailRow = {
  id: string;
  client_id: string;
  assigned_to?: string | null;
  application_type?: string | null;
  loan_amount?: number | null;
  loan_purpose?: string | null;
  loan_term_years?: number | null;
  interest_rate?: number | null;
  workflow_stage?: string | null;
  lender_name?: string | null;
  property_address?: string | null;
  property_value?: number | null;
  created_at?: string | null;
  clients?: { first_name?: string; last_name?: string; email?: string; phone?: string } | null;
  firm_id?: string | null;
  firmId?: string | null;
  client_id_ref?: string | null;
};

const APPLICATION_TYPES = ['purchase', 'refinance', 'top-up', 'construction', 'investment'] as const;

const inputClasses =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

const WORKFLOW_STAGES = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'unconditional', label: 'Unconditional' },
  { value: 'settled', label: 'Settled' },
  { value: 'declined', label: 'Declined' },
] as const;

interface OverviewTabProps {
  application: any;
  client: any;
  onUpdate: () => void;
  onOpenStatementModal?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  application,
  client,
  onUpdate,
  onOpenStatementModal,
}) => {
  const [detail, setDetail] = useState<ApplicationDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [workflowStage, setWorkflowStage] = useState<string>(application.status?.toString() || 'draft');
  const [interestRates, setInterestRates] = useState<BankRates[]>([]);
  const [isLoadingRates, setIsLoadingRates] = useState(true);
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendationResponse | null>(null);
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [savingLending, setSavingLending] = useState(false);

  const [loanAmountEdit, setLoanAmountEdit] = useState<string>('');
  const [applicationTypeEdit, setApplicationTypeEdit] = useState<string>('purchase');
  const [loanPurposeEdit, setLoanPurposeEdit] = useState<string>('');
  const [loanTermYearsEdit, setLoanTermYearsEdit] = useState<string>('30');
  const [interestRateEdit, setInterestRateEdit] = useState<string>('');
  const [lenderNameEdit, setLenderNameEdit] = useState<string>('');
  const [propertyAddressEdit, setPropertyAddressEdit] = useState<string>('');
  const [propertyValueEdit, setPropertyValueEdit] = useState<string>('');

  const [propSearchTerm, setPropSearchTerm] = useState('');
  const [propSearchResults, setPropSearchResults] = useState<any[]>([]);
  const [propSearching, setPropSearching] = useState(false);
  const [propAddress, setPropAddress] = useState('');
  const [propSuburb, setPropSuburb] = useState('');
  const [propCity, setPropCity] = useState('');
  const [propRegion, setPropRegion] = useState('');
  const [propPostcode, setPropPostcode] = useState('');
  const [propType, setPropType] = useState('');
  const [propZoning, setPropZoning] = useState('');
  const [propCV, setPropCV] = useState<number | ''>('');
  const [propValuationType, setPropValuationType] = useState('');
  const [propLandArea, setPropLandArea] = useState<number | ''>('');
  const [propTitleNumber, setPropTitleNumber] = useState('');
  const [propLegalDesc, setPropLegalDesc] = useState('');
  const [propSaving, setPropSaving] = useState(false);

  const [financials, setFinancials] = useState({
    income: client.financials?.income ?? 0,
    expenses: client.financials?.expenses ?? 0,
    assets: client.financials?.assets ?? 0,
    liabilities: client.financials?.liabilities ?? 0,
    netPosition: (client.financials?.assets ?? 0) - (client.financials?.liabilities ?? 0),
  });

  const [applicantsForAdvice, setApplicantsForAdvice] = useState<Applicant[]>([]);

  const [adviceSummaryLoading, setAdviceSummaryLoading] = useState(false);
  const [adviceSummaryError, setAdviceSummaryError] = useState<string | null>(null);
  const [showAdviceReviewModal, setShowAdviceReviewModal] = useState(false);
  const [adviceReview, setAdviceReview] = useState<StatementOfAdviceResponse | null>(null);

  const [applicationNotes, setApplicationNotes] = useState<{ id: string; authorName: string; createdAt: string; content: string }[]>([]);
  const [applicationNotesLoading, setApplicationNotesLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const [propertySearchTerm, setPropertySearchTerm] = useState('');
  const [propertySearchResults, setPropertySearchResults] = useState<any[]>([]);
  const [propertySearching, setPropertySearching] = useState(false);
  const [propertyAddress, setPropertyAddress] = useState(application?.property_address || '');
  const [propertySuburb, setPropertySuburb] = useState(application?.property_suburb || '');
  const [propertyCity, setPropertyCity] = useState(application?.property_city || '');
  const [propertyRegion, setPropertyRegion] = useState(application?.property_region || '');
  const [propertyPostcode, setPropertyPostcode] = useState(application?.property_postcode || '');
  const [propertyType, setPropertyType] = useState(application?.property_type || '');
  const [zoning, setZoning] = useState(application?.zoning || '');
  const [propertyValue, setPropertyValue] = useState<number | ''>(
    application?.property_value ? Number(application.property_value) : ''
  );
  const [valuationType, setValuationType] = useState(application?.valuation_type || '');
  const [landArea, setLandArea] = useState<number | ''>(
    application?.land_area_m2 ? Number(application.land_area_m2) : ''
  );
  const [titleNumber, setTitleNumber] = useState(application?.title_number || '');
  const [legalDescription, setLegalDescription] = useState(application?.legal_description || '');

  // Toast cleanup
  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  // Sync loan edit fields from detail
  useEffect(() => {
    if (detail) {
      setLoanAmountEdit(detail.loan_amount != null ? String(detail.loan_amount) : '');
      setApplicationTypeEdit(detail.application_type || 'purchase');
      setLoanPurposeEdit(detail.loan_purpose || '');
      setLoanTermYearsEdit(detail.loan_term_years != null ? String(detail.loan_term_years) : '30');
      setInterestRateEdit(detail.interest_rate != null ? String(detail.interest_rate) : '');
      setLenderNameEdit(detail.lender_name || '');
      setPropertyAddressEdit(detail.property_address || '');
      setPropertyValueEdit(detail.property_value != null ? String(detail.property_value) : '');
    }
  }, [detail]);

  // Financial summary calculation
  useEffect(() => {
    let cancelled = false;
    const loadFinancials = async () => {
      try {
        const applicantsData = await applicationService.getApplicants(application.id);
        const incomeLists = await Promise.all(
          (applicantsData || []).map((a) => applicationService.getIncome(a.id))
        );
        let totalIncome = 0;
        incomeLists.forEach((list) => {
          (list || []).forEach((inc: any) => {
            totalIncome += Number(inc.annual_gross_total) || 0;
          });
        });

        const expensesData = await applicationService.getExpenses(application.id);
        const totalExpensesMonthly = (expensesData || []).reduce(
          (sum: number, e: any) => sum + (Number(e.total_monthly) || 0),
          0
        );
        const totalExpensesAnnual = totalExpensesMonthly * 12;

        const assetsData = await applicationService.getAssets(application.id);
        const totalAssets = (assetsData || []).reduce((sum: number, a: any) => {
          const parts = [
            a.estimated_value,
            a.property_value,
            a.vehicle_value,
            a.account_balance,
            a.kiwisaver_balance,
            a.investment_value,
            a.other_value,
          ];
          return (
            sum +
            parts.reduce((s, v) => s + (v != null ? Number(v) || 0 : 0), 0)
          );
        }, 0);

        const liabilitiesData = await applicationService.getLiabilities(application.id);
        const totalLiabilities = (liabilitiesData || []).reduce(
          (sum: number, l: any) => sum + (Number(l.current_balance) || 0),
          0
        );

        const netPosition = totalAssets - totalLiabilities;

        if (!cancelled) {
          setFinancials({
            income: totalIncome,
            expenses: totalExpensesAnnual,
            assets: totalAssets,
            liabilities: totalLiabilities,
            netPosition,
          });
        }
      } catch (err) {
        console.error('Failed to compute financial summary:', err);
      }
    };

    loadFinancials();
    return () => {
      cancelled = true;
    };
  }, [application.id]);

  // Load applicants for advice on mount
  useEffect(() => {
    if (application.id) {
      applicationService.getApplicants(application.id)
        .then((data) => setApplicantsForAdvice(data || []))
        .catch(() => setApplicantsForAdvice([]));
    }
  }, [application.id]);

  // Load application notes on mount
  useEffect(() => {
    if (application.id) {
      setApplicationNotesLoading(true);
      noteService
        .getApplicationNotes(application.id)
        .then((notes) => setApplicationNotes(notes))
        .catch(() => setApplicationNotes([]))
        .finally(() => setApplicationNotesLoading(false));
    }
  }, [application.id]);

  // Load application detail on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    applicationService
      .getApplicationById(application.id)
      .then((data) => {
        if (!cancelled) {
          setDetail(data as ApplicationDetailRow);
          const stage = (data as ApplicationDetailRow)?.workflow_stage || 'draft';
          setWorkflowStage(String(stage).toLowerCase());
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load application detail:', err);
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [application.id]);

  // Load interest rates on mount
  useEffect(() => {
    crmService
      .getCurrentInterestRates()
      .then((rates) => setInterestRates(rates || []))
      .catch(() => setInterestRates([]))
      .finally(() => setIsLoadingRates(false));
  }, []);

  // Property search term debounce (propertySearchTerm)
  useEffect(() => {
    if (propertySearchTerm.length < 3) {
      setPropertySearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      handleSearchProperty();
    }, 400);
    return () => clearTimeout(timer);
  }, [propertySearchTerm]);

  // Click-outside handler for property-search-container
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.property-search-container')) {
        setPropertySearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // propSearchTerm debounce
  useEffect(() => {
    if (propSearchTerm.length < 3) { setPropSearchResults([]); return; }
    const t = setTimeout(handlePropSearch, 400);
    return () => clearTimeout(t);
  }, [propSearchTerm]);

  const fetchRecommendation = async () => {
    if (interestRates.length === 0) return;
    setIsRecommending(true);
    setRecommendationError(null);
    setAiRecommendation(null);
    try {
      const loanAmount = detail?.loan_amount ?? application.loanAmount ?? 500000;
      const term = detail?.loan_term_years ?? 30;
      const purpose = detail?.loan_purpose || 'Home loan';
      const result = await geminiService.getLenderRecommendation(
        client,
        { loanAmount, purpose, term },
        interestRates
      );
      setAiRecommendation({ ...result, recommendationId: `rec_${application.id}_${Date.now()}` });
    } catch (err) {
      console.error(err);
      setRecommendationError('Failed to generate AI recommendation. Please try again.');
    } finally {
      setIsRecommending(false);
    }
  };

  const handleWorkflowStageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const stage = e.target.value as typeof WORKFLOW_STAGES[number]['value'];
    const previous = workflowStage;
    setWorkflowStage(stage);
    try {
      await applicationService.updateWorkflowStage(application.id, stage);
      onUpdate();
      setToastMessage('Workflow stage updated');
    } catch (err) {
      console.error('Failed to update workflow stage:', err);
      setWorkflowStage(previous);
    }
  };

  const getSanitisedDataForAdvice = (): string => {
    const loanAmountNum = Number(loanAmountEdit) || 0;
    const propertyValueNum = Number(propertyValueEdit) || 0;
    const lvrPct =
      propertyValueNum > 0 && loanAmountNum > 0
        ? `${((loanAmountNum / propertyValueNum) * 100).toFixed(1)}%`
        : '—';
    const addr = (propertyAddressEdit || '').trim();
    const propertySuburbRegion = addr.includes(',')
      ? addr.split(',').slice(1).join(',').trim() || '[area only]'
      : addr ? '[suburb/region only]' : '—';
    const applicantLabels = applicantsForAdvice.length >= 2
      ? ['APPLICANT_1', 'APPLICANT_2']
      : ['APPLICANT_1'];
    const payload = {
      applicants: applicantLabels,
      loan_amount: loanAmountNum,
      loan_type: applicationTypeEdit,
      loan_purpose: loanPurposeEdit,
      loan_term_years: Number(loanTermYearsEdit) || undefined,
      property_value: propertyValueNum,
      lvr: lvrPct,
      income_total: financials.income,
      expense_total: financials.expenses,
      asset_total: financials.assets,
      liability_total: financials.liabilities,
      lender_name: lenderNameEdit,
      workflow_stage: workflowStage,
      property_suburb_region: propertySuburbRegion,
    };
    return JSON.stringify(payload, null, 2);
  };

  const handleGenerateAdviceSummary = async () => {
    setAdviceSummaryLoading(true);
    setAdviceSummaryError(null);
    try {
      const sanitised = getSanitisedDataForAdvice();
      const result = await geminiService.generateStatementOfAdvice(sanitised);
      setAdviceReview({ ...result });
      setShowAdviceReviewModal(true);
    } catch (err) {
      setAdviceSummaryError(
        err instanceof Error ? err.message : 'Could not generate summary. Check your Gemini API key is set in .env as VITE_GEMINI_API_KEY'
      );
    } finally {
      setAdviceSummaryLoading(false);
    }
  };

  const handleApproveAdviceSave = async () => {
    if (!adviceReview) return;
    const currentUser = authService.getCurrentUser();
    const adviserName = currentUser?.name ?? 'Adviser';
    const dateStr = new Date().toLocaleDateString(undefined, { dateStyle: 'long' });
    const fullFormatted = [
      '--- Statement of Advice ---',
      '',
      'Loan Recommendation',
      adviceReview.recommendation,
      '',
      'Why This Lender',
      adviceReview.whyThisLender,
      '',
      'Why Not Other Lenders',
      adviceReview.whyNotOthers,
      '',
      'How This Meets Client Needs',
      adviceReview.meetsNeeds,
      '',
      'Risks to Disclose',
      adviceReview.risks,
      '',
      'Adviser Notes',
      adviceReview.advisorNotes,
      '',
      `Prepared by: ${adviserName}`,
      `Date: ${dateStr}`,
      '',
      'This summary was AI-assisted and has been reviewed and approved by the adviser.',
    ].join('\n');

    const firmId =
      (detail as any)?.firm_id ??
      (detail as any)?.firmId ??
      application.firmId ??
      (application as any).firm_id ??
      client.firmId ??
      '';
    const clientId =
      (detail as any)?.client_id ??
      application.clientId ??
      (application as any).client_id ??
      client.id;

    const authorNameForNote = (typeof adviserName === 'string' && adviserName.trim()) ? adviserName.trim() : 'Adviser';
    const payload = {
      firm_id: firmId || null,
      client_id: clientId,
      application_id: application.id || null,
      content: fullFormatted,
      author_id: null,
      author_name: authorNameForNote,
    };
    console.log('[Advice Summary] Notes insert payload:', payload);

    if (!firmId) {
      setToastMessage('Cannot save: firm ID is missing. Ensure the application is linked to a firm.');
      return;
    }

    try {
      await noteService.createNote({
        content: fullFormatted,
        clientId,
        applicationId: application.id,
        firmId,
        authorName: authorNameForNote,
      });
      setToastMessage('Advice summary saved to application notes');
      setShowAdviceReviewModal(false);
      setAdviceReview(null);
      applicationService.getApplicationById(application.id).then((data) => {
        setDetail(data as ApplicationDetailRow);
      });
      noteService.getApplicationNotes(application.id).then(setApplicationNotes);
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to save note');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newNoteText.trim();
    if (!content) return;
    const firmId =
      (detail as any)?.firm_id ??
      (detail as any)?.firmId ??
      application.firmId ??
      (application as any).firm_id ??
      client.firmId ??
      '';
    const clientId =
      (detail as any)?.client_id ??
      application.clientId ??
      (application as any).client_id ??
      client.id;
    if (!firmId) {
      setToastMessage('Cannot add note: firm ID is missing.');
      return;
    }
    setAddingNote(true);
    try {
      await noteService.createNote({
        content,
        clientId,
        applicationId: application.id,
        firmId,
        authorName: authService.getCurrentUser()?.name ?? 'Adviser',
      });
      setNewNoteText('');
      setToastMessage('Note added');
      const notes = await noteService.getApplicationNotes(application.id);
      setApplicationNotes(notes);
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleSaveLendingDetails = async () => {
    setSavingLending(true);
    try {
      const payload: Record<string, unknown> = {};
      if (loanAmountEdit !== '') payload.loan_amount = Number(loanAmountEdit) || 0;
      if (applicationTypeEdit) payload.application_type = applicationTypeEdit;
      if (loanPurposeEdit !== undefined) payload.loan_purpose = loanPurposeEdit || null;
      if (loanTermYearsEdit !== '') payload.loan_term_years = Number(loanTermYearsEdit) || null;
      if (interestRateEdit !== '') payload.interest_rate = Number(interestRateEdit) || null;
      if (lenderNameEdit !== undefined) payload.lender_name = lenderNameEdit || null;
      if (propertyAddressEdit !== undefined) payload.property_address = propertyAddressEdit || null;
      if (propertyValueEdit !== '') payload.property_value = Number(propertyValueEdit) || null;
      await applicationService.updateApplication(application.id, payload);
      const updated = (await applicationService.getApplicationById(application.id)) as ApplicationDetailRow;
      setDetail(updated);
      onUpdate();
      setToastMessage('Changes saved');
    } catch (err) {
      console.error('Failed to save lending details:', err);
      setToastMessage('Failed to save changes');
    } finally {
      setSavingLending(false);
    }
  };

  const clientName = detail?.clients
    ? [detail.clients.first_name, detail.clients.last_name].filter(Boolean).join(' ').trim() || client.name
    : client.name;

  const loanAmountNum = loanAmountEdit !== '' ? Number(loanAmountEdit) : (detail?.loan_amount != null ? Number(detail.loan_amount) : application.loanAmount ?? 0);
  const propertyValueNum = propertyValueEdit !== '' ? Number(propertyValueEdit) : (detail?.property_value != null ? Number(detail.property_value) : null);
  const lvr =
    propertyValueNum != null && propertyValueNum > 0 && loanAmountNum > 0
      ? `${((loanAmountNum / propertyValueNum) * 100).toFixed(1)}%`
      : '—';

  const handleSearchProperty = async () => {
    if (!propertySearchTerm.trim()) return;
    setPropertySearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        propertySearchTerm
      )}&countrycodes=nz&format=json&addressdetails=1&limit=10`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AdvisorFlow-CRM/1.0' },
      });
      const results = await res.json();
      setPropertySearchResults(results || []);
    } catch (err) {
      console.error('Nominatim search error:', err);
    } finally {
      setPropertySearching(false);
    }
  };

  const handleSelectProperty = (row: any) => {
    const addr = row.display_name || '';
    const parts = row.address || {};
    setPropertyAddress(addr);
    setPropertySuburb(parts.suburb || parts.neighbourhood || parts.hamlet || '');
    setPropertyCity(parts.city || parts.town || parts.village || '');
    setPropertyRegion(parts.state || parts.region || '');
    setPropertyPostcode(parts.postcode || '');
    setPropertySearchResults([]);
    setPropertySearchTerm(addr);
  };

  const handleSaveProperty = async () => {
    try {
      await applicationService.updateApplication(application.id, {
        property_address: propertyAddress,
        property_suburb: propertySuburb,
        property_city: propertyCity,
        property_region: propertyRegion,
        property_postcode: propertyPostcode,
        property_type: propertyType,
        zoning: zoning,
        property_value: propertyValue === '' ? null : Number(propertyValue),
        valuation_type: valuationType,
        land_area_m2: landArea === '' ? null : Number(landArea),
        title_number: titleNumber,
        legal_description: legalDescription,
      });
      alert('Property details saved');
    } catch (err) {
      console.error('Save error:', err);
    }
  };

  const handlePropSearch = async () => {
    if (propSearchTerm.length < 3) return;
    setPropSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        propSearchTerm
      )}&countrycodes=nz&format=json&addressdetails=1&limit=8`;
      const res = await fetch(url, { headers: { 'User-Agent': 'AdvisorFlow-CRM/1.0' } });
      const data = await res.json();
      setPropSearchResults(data);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setPropSearching(false);
    }
  };

  const handlePropSelect = async (row: any) => {
    const a = row.address || {};
    setPropAddress(row.display_name || '');
    setPropSearchTerm(row.display_name || '');
    setPropSuburb(a.suburb || a.neighbourhood || '');
    setPropCity(a.city || a.town || a.village || '');
    setPropRegion(a.state || '');
    setPropPostcode(a.postcode || '');
    setPropSearchResults([]);

    // LINZ title lookup for CV / title / land area
    if (row.lat && row.lon && import.meta.env.VITE_LINZ_API_KEY) {
      try {
        const linzUrl = `https://data.linz.govt.nz/services/query/v1/vector.json?key=${import.meta.env.VITE_LINZ_API_KEY}&layer=50804&x=${row.lon}&y=${row.lat}&max_results=1&radius=100&geometry=true&with_field_names=true`;
        const linzRes = await fetch(linzUrl);
        const linzData = await linzRes.json();
        const feature = linzData?.vectorQuery?.layers?.['50804']?.features?.[0];
        if (feature) {
          const props = feature.properties || {};
          setPropTitleNumber(props?.title_no || props?.id || '');
          setPropLandArea(props?.land_area ? Number(props.land_area) : '');
          setPropLegalDesc(props?.legal_description || props?.title_no || '');
        }
      } catch (e) {
        console.log('LINZ title lookup failed:', e);
      }
    }
  };

  const handlePropSave = async () => {
    setPropSaving(true);
    try {
      await applicationService.updateApplication(application.id, {
        property_address: propAddress || null,
        property_suburb: propSuburb || null,
        property_city: propCity || null,
        property_region: propRegion || null,
        property_postcode: propPostcode || null,
        property_type: propType || null,
        zoning: propZoning || null,
        property_value: propCV === '' ? null : Number(propCV),
        valuation_type: propValuationType || null,
        land_area_m2: propLandArea === '' ? null : Number(propLandArea),
        title_number: propTitleNumber || null,
        legal_description: propLegalDesc || null,
      });
      alert('Property details saved');
    } catch (e) {
      console.error('Save error:', e);
    } finally {
      setPropSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Lending Details */}
          <div className="lg:col-span-2">
            <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Lending Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Loan Amount</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={loanAmountEdit}
                    onChange={(e) => setLoanAmountEdit(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g. 500000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Application Type</label>
                  <select
                    value={applicationTypeEdit}
                    onChange={(e) => setApplicationTypeEdit(e.target.value)}
                    className={inputClasses}
                  >
                    {APPLICATION_TYPES.map((t) => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Loan Purpose</label>
                  <input
                    type="text"
                    value={loanPurposeEdit}
                    onChange={(e) => setLoanPurposeEdit(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g. First home"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Loan Term (years)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={loanTermYearsEdit}
                    onChange={(e) => setLoanTermYearsEdit(e.target.value)}
                    className={inputClasses}
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Interest Rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={interestRateEdit}
                    onChange={(e) => setInterestRateEdit(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g. 6.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Lender Name</label>
                  <input
                    type="text"
                    value={lenderNameEdit}
                    onChange={(e) => setLenderNameEdit(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g. ANZ"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Property Address</label>
                  <input
                    type="text"
                    value={propertyAddressEdit}
                    onChange={(e) => setPropertyAddressEdit(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g. 12 Main St"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Property Value</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={propertyValueEdit}
                    onChange={(e) => setPropertyValueEdit(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g. 800000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">LVR</label>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 py-2">{lvr}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
                <Button onClick={handleSaveLendingDetails} isLoading={savingLending}>Save Changes</Button>
                <div className={`ai-button-wrapper${adviceSummaryLoading ? ' loading' : ''}`}>
                  <button
                    type="button"
                    className="ai-button-inner bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-md"
                    onClick={handleGenerateAdviceSummary}
                    disabled={adviceSummaryLoading}
                  >
                    {adviceSummaryLoading ? (
                      <>
                        <Icon name="Loader" className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span>AI is generating your advice summary...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="Sparkles" className="h-4 w-4 flex-shrink-0" />
                        <span>Generate Advice Summary</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="ai-button-wrapper">
                  <button
                    type="button"
                    className="ai-button-inner bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-md flex items-center gap-2"
                    onClick={() => onOpenStatementModal?.()}
                  >
                    <Icon name="FileText" className="h-4 w-4" />
                    <span>✨ Magic Drop</span>
                  </button>
                </div>
              </div>
              {adviceSummaryError && (
                <p className="mt-4 text-sm text-red-600 dark:text-red-400">{adviceSummaryError}</p>
              )}
            </Card>
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Client details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Icon name="User" className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{clientName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="Mail" className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">{client.email || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="Phone" className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">{client.phone || '—'}</span>
                </div>
              </div>
            </Card>

            <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Financial summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total income</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${financials.income.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total expenses (annual)</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${financials.expenses.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total assets</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${financials.assets.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total liabilities</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${financials.liabilities.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                  <span className="text-gray-700 dark:text-gray-300 font-semibold">Net position</span>
                  <span
                    className={`font-semibold ${
                      financials.netPosition >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    ${financials.netPosition.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Workflow stage</h3>
              <select
                value={workflowStage}
                onChange={handleWorkflowStageChange}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {WORKFLOW_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Card>
        </div>
        </div>

        {/* Property Information */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 property-search-container relative">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Property Information</h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={propertySearchTerm}
              onChange={e => setPropertySearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchProperty()}
              placeholder="Start typing a NZ property address..."
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={handleSearchProperty}
              disabled={propertySearching}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {propertySearching ? 'Searching...' : 'Search'}
            </button>
            {propertySearching && (
              <Icon name="Loader" className="h-4 w-4 animate-spin text-blue-500 ml-2" />
            )}
          </div>
          {propertySearchResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {propertySearchResults.map((row: any, i: number) => (
                <div
                  key={i}
                  onClick={() => handleSelectProperty(row)}
                  className="px-4 py-3 text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {row.display_name?.split(',')[0]}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{row.display_name}</div>
                </div>
              ))}
              {propertySearchResults.length === 0 && !propertySearching && (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  No results found
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Property Address</label>
              <input
                value={propertyAddress}
                onChange={e => setPropertyAddress(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Suburb</label>
              <input
                value={propertySuburb}
                onChange={e => setPropertySuburb(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">City</label>
              <input
                value={propertyCity}
                onChange={e => setPropertyCity(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Region</label>
              <input
                value={propertyRegion}
                onChange={e => setPropertyRegion(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Postcode</label>
              <input
                value={propertyPostcode}
                onChange={e => setPropertyPostcode(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Property Type</label>
              <select
                value={propertyType}
                onChange={e => setPropertyType(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select...</option>
                <option>House and Land</option>
                <option>Apartment/Unit/Flat</option>
                <option>Townhouse</option>
                <option>Section/Land</option>
                <option>Commercial</option>
                <option>Rural</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Zoning</label>
              <select
                value={zoning}
                onChange={e => setZoning(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select...</option>
                <option>Residential</option>
                <option>Investment</option>
                <option>Commercial</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Property Value / CV</label>
              <input
                type="number"
                value={propertyValue}
                onChange={e => setPropertyValue(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Enter CV/RV manually — available from your council rating database or CoreLogic.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Valuation Type</label>
              <select
                value={valuationType}
                onChange={e => setValuationType(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select...</option>
                <option>Applicant Estimate</option>
                <option>Registered Valuation</option>
                <option>CV/RV</option>
                <option>CoreLogic</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Land Area m²</label>
              <input
                type="number"
                value={landArea}
                onChange={e => setLandArea(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Title Number</label>
              <input
                value={titleNumber}
                onChange={e => setTitleNumber(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Legal Description</label>
              <input
                value={legalDescription}
                onChange={e => setLegalDescription(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={handleSaveProperty}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Save Property Details
            </button>
            <p className="text-xs text-gray-400">
              Address data sourced from LINZ. CV/RV and sale history require CoreLogic integration.
            </p>
          </div>
        </div>
          </div>
          <div className="hidden lg:block" />
        </div>

        {/* Application Notes */}
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" style={{ maxWidth: '720px' }}>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Notes</h3>
          {applicationNotesLoading ? (
            <div className="flex items-center gap-2 py-6 text-gray-500 dark:text-gray-400">
              <Icon name="Loader" className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading notes...</span>
            </div>
          ) : applicationNotes.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No notes yet. Add one below.</p>
          ) : (
            <div className="space-y-4 mb-6">
              {applicationNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-4"
                >
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span className="font-medium text-gray-900 dark:text-white">{note.authorName}</span>
                    <span>·</span>
                    <span>{note.createdAt ? new Date(note.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.content}</div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleAddNote} className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Add a note..."
              rows={3}
              className={inputClasses}
            />
            <Button type="submit" disabled={addingNote || !newNoteText.trim()} isLoading={addingNote}>
              Add Note
            </Button>
          </form>
        </Card>



        {/* AI Lender Recommendation */}
        {false && (
        <div className="relative rounded-lg overflow-hidden">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-lg blur opacity-75 animate-[spin_6s_linear_infinite]" />
          <Card className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                <Icon name="Sparkles" className="h-5 w-5 mr-2 text-primary-500 dark:text-primary-400" />
                AI Lender Recommendation
              </h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={fetchRecommendation}
                isLoading={isRecommending}
                leftIcon="RefreshCw"
              >
                Refresh
              </Button>
            </div>

            {isRecommending && (
              <div className="flex flex-col items-center justify-center h-48">
                <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500 dark:text-primary-400" />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Analyzing borrower&apos;s profile...</p>
              </div>
            )}

            {recommendationError && !isRecommending && (
              <div className="text-center text-red-500 dark:text-red-400 p-4 bg-red-50 dark:bg-red-900/20 rounded-md">
                <p>{recommendationError}</p>
              </div>
            )}

            {!aiRecommendation && !isRecommending && !recommendationError && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                Click Refresh to generate AI lender recommendations.
              </p>
            )}

            {aiRecommendation && !isRecommending && (
              <div>
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-4">
                  <h4 className="font-semibold text-sm text-gray-900 dark:text-white">AI Assessment Summary</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{aiRecommendation.assessmentSummary}</p>
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Top Recommendations</h4>
                <div className="space-y-4">
                  {aiRecommendation.recommendations.map((rec) => (
                    <div
                      key={rec.lender}
                      className="p-4 border-2 rounded-lg border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <p className="font-bold text-lg text-gray-900 dark:text-white">{rec.lender}</p>
                        <div className="flex items-center gap-4">
                          {rec.interestRate && (
                            <div className="text-right">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Interest Rate</p>
                              <p className="font-semibold text-primary-600 dark:text-primary-400">{rec.interestRate}</p>
                            </div>
                          )}
                          <div className="text-right">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Confidence</p>
                            <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-1">
                              <div
                                className="bg-green-500 h-2.5 rounded-full"
                                style={{ width: `${rec.confidenceScore * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{rec.rationale}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 text-xs">
                        <div>
                          <p className="font-semibold text-green-600 dark:text-green-400 flex items-center">
                            <Icon name="TrendingUp" className="h-4 w-4 mr-1" /> Pros
                          </p>
                          <ul className="list-disc list-inside pl-1 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                            {rec.pros.map((pro, i) => (
                              <li key={i}>{pro}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-red-500 dark:text-red-400 flex items-center">
                            <Icon name="TrendingDown" className="h-4 w-4 mr-1" /> Cons
                          </p>
                          <ul className="list-disc list-inside pl-1 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                            {rec.cons.map((con, i) => (
                              <li key={i}>{con}</li>
                            ))}
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
        )}
      </div>

      {/* Advice Summary Review Modal */}
      {showAdviceReviewModal && adviceReview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Advice Summary — Review Before Saving</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAdviceReviewModal(false);
                  setAdviceReview(null);
                  setAdviceSummaryError(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Icon name="X" className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1 space-y-4">
              {[
                { key: 'recommendation' as const, label: 'Loan Recommendation' },
                { key: 'whyThisLender' as const, label: 'Why This Lender' },
                { key: 'whyNotOthers' as const, label: 'Why Not Other Lenders' },
                { key: 'meetsNeeds' as const, label: 'How This Meets Client Needs' },
                { key: 'risks' as const, label: 'Risks to Disclose' },
                { key: 'advisorNotes' as const, label: 'Adviser Notes' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    {label}
                  </label>
                  <textarea
                    value={adviceReview[key]}
                    onChange={(e) => setAdviceReview((prev) => (prev ? { ...prev, [key]: e.target.value } : null))}
                    rows={key === 'recommendation' || key === 'risks' ? 3 : 4}
                    className={inputClasses}
                  />
                </div>
              ))}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Prepared by</span>{' '}
                  {authService.getCurrentUser()?.name ?? 'Adviser'}
                  <span className="font-medium text-gray-700 dark:text-gray-300">, Date</span>{' '}
                  {new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  This summary was AI-assisted and has been reviewed and approved by the adviser.
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowAdviceReviewModal(false);
                  setAdviceReview(null);
                  setAdviceSummaryError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleApproveAdviceSave}>
                Approve & Save to Notes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Local toast */}
      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium bg-gray-800 dark:bg-gray-700 text-white border border-gray-600 dark:border-gray-600"
          role="alert"
        >
          {toastMessage}
        </div>
      )}
    </>
  );
};
