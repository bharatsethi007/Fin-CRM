import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logger } from '../../utils/logger';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';
import { applicationService, type Applicant, type Company } from '../../services/api';
import type { BankRates, AIRecommendationResponse } from '../../types';
import { crmService, noteService, authService } from '../../services/api';
import { supabase } from '../../services/supabaseClient';
import { geminiService, type StatementOfAdviceResponse } from '../../services/geminiService';
import { RiskPredictor } from './RiskPredictor';
import ApplicantsTab from '../application/tabs/ApplicantsTab';
import { useToast } from '../../hooks/useToast';
import { GenerateSOAPopup } from '../soa/GenerateSOAPopup';
import { PropertyInformationSection } from '@/components/deals/PropertyInformationSection';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { FieldWithAnomaly } from '@/components/ui/FieldWithAnomaly';
import { SoaStatusCard } from '@/components/deals/SoaStatusCard';
import { layerText } from '../soa/soaAgentUtils';
import {
  generateSoaHtml,
  normalizeComparisonRows,
  type SOAComparisonRow,
  type SOAData,
  type SoaPdfApplicationPropertyRow,
  type SoaPdfClientDnaPayload,
} from '@/lib/soaPdfTemplate';

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

/** Coerces DB / legacy values so `<select value>` always matches an `<option value>`. */
function normalizeApplicationType(raw: string | null | undefined): (typeof APPLICATION_TYPES)[number] {
  const v = String(raw ?? 'purchase').toLowerCase().trim();
  return (APPLICATION_TYPES as readonly string[]).includes(v)
    ? (v as (typeof APPLICATION_TYPES)[number])
    : 'purchase';
}

/** Ensures workflow dropdown value is always a defined `WORKFLOW_STAGES` key. */
function normalizeWorkflowStage(raw: string | null | undefined): (typeof WORKFLOW_STAGES)[number]['value'] {
  const v = String(raw ?? 'draft').toLowerCase().trim();
  return WORKFLOW_STAGES.some((s) => s.value === v)
    ? (v as (typeof WORKFLOW_STAGES)[number]['value'])
    : 'draft';
}

interface OverviewTabProps {
  application: any;
  client: any;
  onUpdate: () => void;
  onOpenStatementModal?: () => void;
  advisorId?: string;
  /** Incremented from parent when notes should reload (e.g. Realtime). */
  notesRefreshTick?: number;
}

/** Maps applicant_type to a short sidebar badge label. */
function applicantSidebarTypeLabel(applicantType: string): string {
  const s = (applicantType || 'primary').toLowerCase();
  if (s === 'secondary') return 'Secondary';
  if (s === 'guarantor') return 'Guarantor';
  return 'Primary';
}

/** Builds the display name shown on compact applicant tiles. */
function applicantTileDisplayName(a: Applicant): string {
  const parts = [a.title, a.first_name, a.middle_name, a.surname].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  );
  if (parts.length) {
    return parts.map((p) => p.trim()).join(' ').replace(/\s+/g, ' ');
  }
  const pref = typeof a.preferred_name === 'string' ? a.preferred_name.trim() : '';
  return pref || '—';
}

/** Display name for a company row in the overview sidebar. */
function companyTileDisplayName(c: Company): string {
  const entity = typeof c.entity_name === 'string' ? c.entity_name.trim() : '';
  const trading = typeof (c as { trading_name?: string }).trading_name === 'string'
    ? (c as { trading_name: string }).trading_name.trim()
    : '';
  return entity || trading || '—';
}

/** Badge label from company entity_type (Ltd, Trust, etc.). */
function companySidebarTypeLabel(c: Company): string {
  const t = typeof c.entity_type === 'string' ? c.entity_type.trim() : '';
  return t || 'Company';
}

/** Resolves company contact phone for sidebar tiles. */
function companyTilePhone(c: Company): string {
  const v = (c as { contact_phone?: unknown }).contact_phone;
  return typeof v === 'string' && v.trim() !== '' ? v : '—';
}

/** Resolves company contact email for sidebar tiles. */
function companyTileEmail(c: Company): string {
  const v = (c as { contact_email?: unknown }).contact_email;
  return typeof v === 'string' && v.trim() !== '' ? v : '—';
}

/** Extracts lender comparison rows from stored quant matrix JSON for PDF export. */
function comparisonFromQuantMatrix(quant: unknown): Record<string, unknown>[] | undefined {
  if (quant == null || typeof quant !== 'object') return undefined;
  const o = quant as Record<string, unknown>;
  if (Array.isArray(o.comparison)) return o.comparison as Record<string, unknown>[];
  if (Array.isArray(o.rows)) return o.rows as Record<string, unknown>[];
  return undefined;
}

/** Placeholder comparison rows when live data has no structured matrix (print preview). */
const SOA_PDF_DEMO_COMPARISON: SOAComparisonRow[] = [
  { lender: 'BNZ', rate: 6.49, fiveYrCost: 313720, cashback: 0, flexibility: 'medium', isRecommended: true },
  { lender: 'ASB', rate: 6.59, fiveYrCost: 317950, cashback: 3000, flexibility: 'high' },
  { lender: 'Westpac', rate: 6.69, fiveYrCost: 321100, cashback: 0, flexibility: 'medium' },
];

/** Builds `layer7_risks` as string[] from mixed agent/jsonb shapes. */
function soaPdfLayer7Risks(content: Record<string, unknown>): string[] | undefined {
  const raw = content.layer7_risks;
  if (Array.isArray(raw)) {
    const list = raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
    return list.length ? list : undefined;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const list = raw
      .split(/\n+/)
      .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean);
    return list.length ? list : undefined;
  }
  const layer7 = content.layer7;
  if (typeof layer7 === 'string' && layer7.trim()) return [layer7.trim()];
  return undefined;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  application,
  client,
  onUpdate,
  onOpenStatementModal,
  advisorId,
  notesRefreshTick = 0,
}) => {
  const [detail, setDetail] = useState<ApplicationDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [workflowStage, setWorkflowStage] = useState<string>(() =>
    normalizeWorkflowStage(application.status?.toString()),
  );
  const [interestRates, setInterestRates] = useState<BankRates[]>([]);
  const [isLoadingRates, setIsLoadingRates] = useState(true);
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendationResponse | null>(null);
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const toast = useToast();
  const [savingLending, setSavingLending] = useState(false);

  const [loanAmountEdit, setLoanAmountEdit] = useState<string>('');
  const [applicationTypeEdit, setApplicationTypeEdit] = useState<string>(() =>
    normalizeApplicationType(
      (application as { application_type?: string | null }).application_type ??
        (application as { applicationType?: string | null }).applicationType,
    ),
  );
  const [loanPurposeEdit, setLoanPurposeEdit] = useState<string>('');
  const [loanTermYearsEdit, setLoanTermYearsEdit] = useState<string>('30');
  const [interestRateEdit, setInterestRateEdit] = useState<string>('');
  const [lenderNameEdit, setLenderNameEdit] = useState<string>('');
  const [propertyAddressEdit, setPropertyAddressEdit] = useState<string>('');
  const [propertyValueEdit, setPropertyValueEdit] = useState<string>('');
  const [propertyRefresh, setPropertyRefresh] = useState(0);

  const [showApplicantsManager, setShowApplicantsManager] = useState(false);
  const [sidebarCompanies, setSidebarCompanies] = useState<Company[]>([]);
  const [sidebarPartiesRefreshKey, setSidebarPartiesRefreshKey] = useState(0);

  const [financials, setFinancials] = useState({
    income: client.financials?.income ?? 0,
    expenses: client.financials?.expenses ?? 0,
    assets: client.financials?.assets ?? 0,
    liabilities: client.financials?.liabilities ?? 0,
    netPosition: (client.financials?.assets ?? 0) - (client.financials?.liabilities ?? 0),
  });

  const [expenses, setExpenses] = useState(() =>
    client.financials?.expenses != null ? String(Math.round(client.financials.expenses)) : '',
  );

  const [applicantsForAdvice, setApplicantsForAdvice] = useState<Applicant[]>([]);

  const [showGeneratePopup, setShowGeneratePopup] = useState(false);
  const [showSoaEditor, setShowSoaEditor] = useState(false);

  const deal = application;
  const applicationId = deal?.id ?? '';

  const SOA_CARD_SELECT =
    'id, status, version, updated_at, created_at, adviser_lender_name, layer_client_situation, layer_regulatory_gate, layer_market_scan, layer_quant_matrix, layer_recommendation, layer_sensitivity, layer_risks, layer_commission';

  const { data: approvedSoa } = useQuery({
    queryKey: ['approved-soa', applicationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('soas')
        .select(SOA_CARD_SELECT)
        .eq('application_id', applicationId)
        .eq('status', 'adviser_review')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!applicationId,
  });

  const { data: existingSoa } = useQuery({
    queryKey: ['existing-soa', applicationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('soas')
        .select(SOA_CARD_SELECT)
        .eq('application_id', applicationId)
        .neq('status', 'adviser_review')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!applicationId,
  });

  const soaData = useMemo(() => {
    const row = (approvedSoa ?? existingSoa) as Record<string, unknown> | null | undefined;
    if (!row?.id) return null;
    const approved = row.status === 'adviser_review';
    const quant = row.layer_quant_matrix;
    const comparison = comparisonFromQuantMatrix(quant);
    const content: Record<string, unknown> = {
      layer1_client_situation: layerText(row.layer_client_situation),
      layer2_regulatory_gate: layerText(row.layer_regulatory_gate),
      layer3_market_scan: layerText(row.layer_market_scan),
      layer4_quantitative: layerText(quant),
      layer5_recommendation: layerText(row.layer_recommendation),
      layer6_sensitivity: layerText(row.layer_sensitivity),
      layer7_risks: layerText(row.layer_risks),
      layer8_commission: layerText(row.layer_commission),
    };
    if (comparison?.length) content.comparison = comparison;
    return {
      id: String(row.id),
      status: approved ? 'final' : typeof row.status === 'string' ? row.status : 'draft',
      version: typeof row.version === 'number' ? row.version : 1,
      updated_at: row.updated_at as string | null,
      created_at: row.created_at as string | null | undefined,
      recommended_lender: typeof row.adviser_lender_name === 'string' ? row.adviser_lender_name : '',
      content,
    };
  }, [approvedSoa, existingSoa]);

  /** Renders SOA HTML in a new window and triggers print (avoids Radix dialog print issues). */
  const handleExportPdf = useCallback(async () => {
    if (!soaData) {
      toast.error('No SOA to export');
      return;
    }
    const soa = soaData;
    const c = soa.content as Record<string, unknown>;
    const adviser = authService.getCurrentUser() as {
      name?: string;
      full_name?: string;
      fsp_number?: string;
    } | null;

    const clientFirst = (client as { first_name?: string })?.first_name ?? 'Blair';
    const clientLast = (client as { last_name?: string })?.last_name ?? 'Matthews';
    const clientName =
      client?.name?.trim?.() ||
      [client?.first_name, client?.last_name].filter(Boolean).join(' ').trim() ||
      `${clientFirst} ${clientLast}`.trim();

    const dealRef =
      (application as { referenceNumber?: string; reference_number?: string }).referenceNumber ??
      (application as { reference_number?: string }).reference_number ??
      'AF-20260329-0017';

    const str = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

    let clientDna: SoaPdfClientDnaPayload = null;
    let applicationProperties: SoaPdfApplicationPropertyRow[] = [];
    if (applicationId) {
      const { data: dnaRow, error: dnaErr } = await supabase
        .from('soa_client_dna')
        .select('analysis')
        .eq('deal_id', applicationId)
        .maybeSingle();
      if (dnaErr) {
        logger.log('SOA PDF: soa_client_dna not loaded', dnaErr.message ?? String(dnaErr));
      } else if (dnaRow?.analysis != null) {
        clientDna = { analysis: dnaRow.analysis };
      }

      const { data: propRows, error: propErr } = await supabase
        .from('application_properties')
        .select('*')
        .eq('application_id', applicationId);
      if (propErr) {
        logger.log('SOA PDF: application_properties not loaded', propErr.message ?? String(propErr));
      } else {
        applicationProperties = (propRows ?? []) as SoaPdfApplicationPropertyRow[];
      }
    }

    const comparisonRaw = Array.isArray(c.comparison) ? (c.comparison as Record<string, unknown>[]) : [];
    let layer4Quant: SOAComparisonRow[] =
      comparisonRaw.length > 0 ? normalizeComparisonRows(comparisonRaw) : [];

    const legacyL4 = c.layer4_quantitative;
    if (layer4Quant.length === 0 && Array.isArray(legacyL4)) {
      layer4Quant = legacyL4 as SOAComparisonRow[];
    }
    if (layer4Quant.length === 0) {
      layer4Quant = SOA_PDF_DEMO_COMPARISON;
    }

    const soaPdfPayload: SOAData = {
      id: soa.id,
      version: soa.version || 1,
      status: soa.status === 'final' || soa.status === 'adviser_review' ? 'final' : 'draft',
      client: {
        name: clientName,
        email: (client as { email?: string })?.email,
      },
      dealRef,
      date: (soa.updated_at as string) || new Date().toISOString(),
      adviserName: adviser?.full_name || adviser?.name || 'Super Admin',
      adviserFSP: adviser?.fsp_number,
      recommendedLender: soa.recommended_lender,
      content: {
        layer1_client_situation: str(c.layer1_client_situation) || str(c.layer1),
        layer2_regulatory_gate: str(c.layer2_regulatory_gate) || str(c.layer2),
        layer3_market_scan: str(c.layer3_market_scan) || str(c.layer3),
        layer4_quantitative: layer4Quant,
        layer5_recommendation: str(c.layer5_recommendation) || str(c.layer5),
        layer6_sensitivity: str(c.layer6_sensitivity) || str(c.layer6),
        layer7_risks: soaPdfLayer7Risks(c),
        layer8_commission: str(c.layer8_commission) || str(c.layer8),
      },
      tenantBrand: {
        name: 'Kiwi Mortgages',
        primaryColor: '#2563eb',
      },
      clientDna,
      applicationProperties,
      staticMapsApiKey:
        typeof import.meta.env.VITE_GOOGLE_MAPS_KEY === 'string'
          ? import.meta.env.VITE_GOOGLE_MAPS_KEY
          : undefined,
    };

    const html = generateSoaHtml(soaPdfPayload);
    const printWindow = window.open('', '_blank', 'width=1000,height=1200,scrollbars=yes');
    if (!printWindow) {
      toast.error('Popup blocked — allow popups to export PDF');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 1000);
  }, [application, client, soaData, toast]);
  const [showAdviceReviewModal, setShowAdviceReviewModal] = useState(false);
  const [adviceReview, setAdviceReview] = useState<StatementOfAdviceResponse | null>(null);

  const [applicationNotes, setApplicationNotes] = useState<{ id: string; authorName: string; createdAt: string; content: string }[]>([]);
  const [applicationNotesLoading, setApplicationNotesLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Sync loan edit fields from detail
  useEffect(() => {
    if (detail) {
      setLoanAmountEdit(detail.loan_amount != null ? String(detail.loan_amount) : '');
      setApplicationTypeEdit(normalizeApplicationType(detail.application_type));
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

        const { data: latestExpense } = await supabase
          .from('expenses')
          .select('*')
          .eq('application_id', application.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const totalExpensesMonthly = Number(latestExpense?.total_monthly) || 0;
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
          setExpenses(totalExpensesAnnual ? String(Math.round(totalExpensesAnnual)) : '');
        }
      } catch (err) {
        logger.error('Failed to compute financial summary:', err);
      }
    };

    loadFinancials();
    return () => {
      cancelled = true;
    };
  }, [application.id]);

  // Load applicants + companies for sidebar and advice payloads (matches ApplicantsTab dual-fetch)
  useEffect(() => {
    if (!application.id) return;
    Promise.all([
      applicationService.getApplicants(application.id),
      applicationService.getCompanies(application.id),
    ])
      .then(([applicantsData, companiesData]) => {
        setApplicantsForAdvice(applicantsData || []);
        setSidebarCompanies(companiesData || []);
      })
      .catch((err) => {
        logger.error('Failed to load applicants/companies for overview:', err);
        setApplicantsForAdvice([]);
        setSidebarCompanies([]);
      });
  }, [application.id, sidebarPartiesRefreshKey]);

  // Load application notes on mount and when parent signals refresh (Realtime)
  useEffect(() => {
    if (application.id) {
      setApplicationNotesLoading(true);
      noteService
        .getApplicationNotes(application.id)
        .then((notes) => setApplicationNotes(notes))
        .catch(() => setApplicationNotes([]))
        .finally(() => setApplicationNotesLoading(false));
    }
  }, [application.id, notesRefreshTick]);

  // Load application detail on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    applicationService
      .getApplicationById(application.id)
      .then((data) => {
        if (!cancelled) {
          setDetail(data as ApplicationDetailRow);
          setWorkflowStage(normalizeWorkflowStage((data as ApplicationDetailRow)?.workflow_stage));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to load application detail:', err);
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
      logger.error(err);
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
      const data = await applicationService.getApplicationById(application.id);
      setDetail(data as ApplicationDetailRow);
      onUpdate();
      toast.success('Workflow stage updated');
    } catch (err) {
      logger.error('Failed to update workflow stage:', err);
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
    logger.log('[Advice Summary] Notes insert payload:', payload);

    if (!firmId) {
      toast.error('Cannot save: firm ID is missing. Ensure the application is linked to a firm.');
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
      toast.success('Advice summary saved to application notes');
      setShowAdviceReviewModal(false);
      setAdviceReview(null);
      applicationService.getApplicationById(application.id).then((data) => {
        setDetail(data as ApplicationDetailRow);
      });
      noteService.getApplicationNotes(application.id).then(setApplicationNotes);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save note');
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
      toast.error('Cannot add note: firm ID is missing.');
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
      toast.success('Note added');
      const notes = await noteService.getApplicationNotes(application.id);
      setApplicationNotes(notes);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add note');
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
      toast.success('Changes saved');
    } catch (err) {
      logger.error('Failed to save lending details:', err);
      toast.error('Failed to save changes');
    } finally {
      setSavingLending(false);
    }
  };

  const handleLendingPropertyAddressSelect = useCallback(
    async (address: string) => {
      const id = application.id?.trim();
      if (!id) return;
      logger.log('Address selected:', address);
      setPropertyAddressEdit(address);
      try {
        const { error: delErr } = await supabase
          .from('application_properties')
          .delete()
          .eq('application_id', id);
        if (delErr) {
          logger.error('OverviewTab: delete application_properties', delErr);
          toast.error(delErr.message || 'Could not clear existing property');
          return;
        }

        const { data: prop, error: insertError } = await supabase
          .from('application_properties')
          .insert({
            application_id: id,
            address_full: address,
            address_normalized: address,
            is_primary: true,
          })
          .select()
          .single();

        if (insertError) {
          logger.error('Insert failed:', insertError);
          toast.error(insertError.message || 'Could not save property');
          return;
        }
        if (!prop?.id) {
          toast.error('Property insert returned no row');
          return;
        }

        logger.log('Property inserted:', prop.id);

        const { data: enrichData, error: enrichError } = await supabase.functions.invoke('enrich-property', {
          body: { propertyId: prop.id, address },
        });

        logger.log('Enrich result:', enrichData, enrichError);

        if (enrichError) {
          toast.error(enrichError.message || 'Enrichment request failed');
        } else {
          toast.success('Enriching property from LINZ…');
        }

        await applicationService.updateApplication(id, { property_address: address || null });
        setDetail((d) => (d ? { ...d, property_address: address || null } : null));
        setPropertyRefresh(Date.now());
        onUpdate();
      } catch (e: unknown) {
        logger.error('OverviewTab: lending property address select', e);
        toast.error(e instanceof Error ? e.message : 'Could not save property address');
      }
    },
    [application.id, onUpdate, toast],
  );

  const loanAmountNum = loanAmountEdit !== '' ? Number(loanAmountEdit) : (detail?.loan_amount != null ? Number(detail.loan_amount) : application.loanAmount ?? 0);
  const propertyValueNum = propertyValueEdit !== '' ? Number(propertyValueEdit) : (detail?.property_value != null ? Number(detail.property_value) : null);
  const lvr =
    propertyValueNum != null && propertyValueNum > 0 && loanAmountNum > 0
      ? `${((loanAmountNum / propertyValueNum) * 100).toFixed(1)}%`
      : '—';

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
      </div>
    );
  }

  const firmId = application.firm_id ?? application.firmId ?? '';

  return (
    <>
      <div className="mb-6">
        <RiskPredictor applicationId={application.id} firmId={firmId} />
      </div>
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Lending Details → Property → Notes */}
          <div className="lg:col-span-2 space-y-6">
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
                  <label
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    htmlFor="lending-property-address"
                  >
                    Property Address
                  </label>
                  <AddressAutocomplete
                    id="lending-property-address"
                    value={propertyAddressEdit}
                    onValueChange={setPropertyAddressEdit}
                    onSelect={(addr) => {
                      void handleLendingPropertyAddressSelect(addr);
                    }}
                    placeholder="64 Manukau Road, Epsom, Auckland"
                    className={inputClasses}
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
            </Card>

            <div className="mt-6">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Property Information</h2>
              <PropertyInformationSection
                applicationId={deal.id}
                refreshKey={propertyRefresh}
              />
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

          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Applicants</h3>
                <button
                  type="button"
                  onClick={() => setShowApplicantsManager(true)}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 border border-transparent hover:border-primary-200 dark:hover:border-primary-800"
                  aria-label="Add or manage applicants"
                >
                  <Icon name="Plus" className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {applicantsForAdvice.length === 0 && sidebarCompanies.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No applicants or companies yet. Use + to add.</p>
                ) : (
                  <>
                    {applicantsForAdvice.map((a) => (
                      <div
                        key={`applicant-${a.id}`}
                        className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-gray-900/40 px-3 py-2 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate min-w-0">
                            {applicantTileDisplayName(a)}
                          </span>
                          <span className="flex-shrink-0 text-[10px] font-semibold text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 px-1.5 py-0.5 rounded">
                            {applicantSidebarTypeLabel(a.applicant_type)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                          <Icon name="Phone" className="h-3 w-3 flex-shrink-0 opacity-70" />
                          <span className="truncate">{a.mobile_phone || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          <Icon name="Mail" className="h-3 w-3 flex-shrink-0 opacity-70" />
                          <span className="truncate">{a.email_primary || '—'}</span>
                        </div>
                      </div>
                    ))}
                    {sidebarCompanies.map((co) => (
                      <div
                        key={`company-${co.id}`}
                        className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-gray-900/40 px-3 py-2 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Icon name="Building2" className="h-3.5 w-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {companyTileDisplayName(co)}
                            </span>
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-semibold text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 px-1.5 py-0.5 rounded">
                            {companySidebarTypeLabel(co)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                          <Icon name="Phone" className="h-3 w-3 flex-shrink-0 opacity-70" />
                          <span className="truncate">{companyTilePhone(co)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          <Icon name="Mail" className="h-3 w-3 flex-shrink-0 opacity-70" />
                          <span className="truncate">{companyTileEmail(co)}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
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
                <FieldWithAnomaly
                  label="TOTAL EXPENSES (ANNUAL)"
                  anomaly={{
                    message: 'Below HEM benchmark',
                    detail:
                      '$9,095 vs expected ~$40,800 for couple with 1 dependant. Lenders will use HEM.',
                  }}
                  helperText="Using HEM $3,400/mo for servicing"
                >
                  <input
                    type="text"
                    value={expenses}
                    onChange={(e) => {
                      const v = e.target.value;
                      setExpenses(v);
                      const n = Number(String(v).replace(/[^0-9.]/g, '')) || 0;
                      setFinancials((f) => ({ ...f, expenses: n }));
                    }}
                    className="w-full rounded-md border-0 bg-amber-50/50 px-3 py-2.5 text-sm transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-amber-950/25 dark:text-gray-100 dark:focus:bg-gray-900"
                    placeholder="$0.00"
                  />
                </FieldWithAnomaly>
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

            <div className="mb-4">
              <SoaStatusCard
                soa={soaData}
                onView={() => setShowSoaEditor(true)}
                onExportPdf={() => void handleExportPdf()}
                onRegenerate={() => {
                  setShowSoaEditor(false);
                  setShowGeneratePopup(true);
                }}
                onGenerate={() => {
                  setShowSoaEditor(false);
                  setShowGeneratePopup(true);
                }}
              />
            </div>

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

        <GenerateSOAPopup
          open={showSoaEditor && Boolean(soaData?.id)}
          onOpenChange={setShowSoaEditor}
          dealId={application.id}
          factFindId={(application as { fact_find_id?: string | null }).fact_find_id ?? null}
          firmId={firmId}
          mode="edit"
          initialData={soaData}
        />
        <GenerateSOAPopup
          open={showGeneratePopup}
          onOpenChange={(next) => {
            if (!next) setShowGeneratePopup(false);
          }}
          dealId={application.id}
          factFindId={(application as { fact_find_id?: string | null }).fact_find_id ?? null}
          firmId={firmId}
          mode="run"
        />

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

      {/* Full-screen applicants manager (embeds ApplicantsTab) */}
      {showApplicantsManager && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Applicants manager"
        >
          <div className="flex justify-end p-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowApplicantsManager(false);
                setSidebarPartiesRefreshKey((k) => k + 1);
              }}
              className="rounded-lg p-2 text-white hover:bg-white/10 transition-colors"
              aria-label="Close applicants manager"
            >
              <Icon name="X" className="h-6 w-6" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden px-4 pb-4 min-h-0">
            <div className="h-full max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
              <div className="p-4">
                <ApplicantsTab
                  application={application}
                  client={client}
                  currentUser={advisorId ? { id: advisorId } : null}
                  onUpdate={() => {
                    setSidebarPartiesRefreshKey((k) => k + 1);
                    onUpdate();
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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

    </>
  );
};
