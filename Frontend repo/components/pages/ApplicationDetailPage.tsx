import React, { useState, useEffect } from 'react';
import type { Application, Client } from '../../types';
import { ApplicationStatus } from '../../types';
import type { BankRates, AIRecommendationResponse } from '../../types';
import { Button } from '../common/Button';
import { Icon, IconName } from '../common/Icon';
import { Card } from '../common/Card';
import { applicationService, type Applicant, type Company, type Income } from '../../services/applicationService';
import { crmService } from '../../services/api';
import { geminiService } from '../../services/geminiService';

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

const TABS: { id: string; name: string; icon: IconName }[] = [
  { id: 'overview', name: 'Overview', icon: 'FileText' },
  { id: 'applicants', name: 'Applicants', icon: 'Users' },
  { id: 'income', name: 'Income', icon: 'Briefcase' },
  { id: 'expenses', name: 'Expenses', icon: 'TrendingDown' },
  { id: 'assets', name: 'Assets', icon: 'Gem' },
  { id: 'liabilities', name: 'Liabilities', icon: 'Landmark' },
  { id: 'documents', name: 'Documents', icon: 'FilePlus2' },
];

const WORKFLOW_PILL_CLASSES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  conditional: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
  unconditional: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  settled: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
};

const WorkflowPill: React.FC<{ stage: string }> = ({ stage }) => {
  const normalized = (stage || 'draft').toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const classes = WORKFLOW_PILL_CLASSES[normalized] ?? WORKFLOW_PILL_CLASSES.draft;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
};

const DetailRow: React.FC<{ label: string; value?: string | number | React.ReactNode; icon?: IconName }> = ({
  label,
  value,
  icon,
}) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-gray-200 dark:border-gray-700 last:border-0">
    {icon && <Icon name={icon} className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />}
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">{value ?? '—'}</div>
    </div>
  </div>
);

const ComingSoonPlaceholder: React.FC<{ tabName: string }> = ({ tabName }) => (
  <div className="flex flex-col items-center justify-center py-20 px-4">
    <div className="rounded-full bg-gray-100 dark:bg-gray-700/50 p-4 mb-4">
      <Icon name="Construction" className="h-10 w-10 text-gray-400 dark:text-gray-500" />
    </div>
    <p className="text-gray-500 dark:text-gray-400 font-medium text-center">
      Coming soon — {tabName} will be built here
    </p>
  </div>
);

const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr'] as const;
const GENDERS = ['Male', 'Female', 'Other'] as const;
const APPLICANT_TYPES = ['primary', 'secondary', 'guarantor'] as const;
const ENTITY_TYPES = ['Pty Ltd', 'Ltd', 'Trust', 'Partnership', 'Sole Trader', 'Other'] as const;
const PREFERRED_CONTACT = ['Phone', 'Email'] as const;
const RESIDENTIAL_STATUSES = ['Own Home - Mortgage', 'Own Home - No Mortgage', 'Renting', 'Boarding', 'Living with Parents'] as const;
const RESIDENCY_STATUSES = ['NZ Citizen', 'NZ Permanent Resident', 'NZ Resident', 'Australian Citizen', 'Work Visa', 'Student Visa', 'Other'] as const;
const MARITAL_STATUSES = ['Single', 'Married', 'De Facto', 'Separated', 'Divorced', 'Widowed'] as const;

const INCOME_TYPES = [
  { value: 'salary_wages', label: 'Salary/Wages' },
  { value: 'self_employed_sole', label: 'Self Employed — Sole Trader' },
  { value: 'self_employed_company', label: 'Self Employed — Company' },
  { value: 'rental', label: 'Rental Income' },
  { value: 'other', label: 'Other Income' },
] as const;

const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Annually'] as const;

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-6">
    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-600">{title}</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

interface ApplicationDetailPageProps {
  application: Application;
  client: Client;
  onBack: () => void;
  onUpdate: () => void;
  onEditDraft?: () => void;
}

export const ApplicationDetailPage: React.FC<ApplicationDetailPageProps> = ({
  application,
  client,
  onBack,
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
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

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [showAddApplicantModal, setShowAddApplicantModal] = useState(false);
  const [applicantKind, setApplicantKind] = useState<'personal' | 'company'>('personal');
  const [editingApplicant, setEditingApplicant] = useState<Applicant | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [submittingApplicant, setSubmittingApplicant] = useState(false);
  const [applicantFormError, setApplicantFormError] = useState<string | null>(null);
  const [applicantForm, setApplicantForm] = useState({
    title: '',
    first_name: '',
    middle_name: '',
    surname: '',
    preferred_name: '',
    date_of_birth: '',
    gender: '',
    applicant_type: 'primary',
    mobile_phone: '',
    email_primary: '',
    preferred_contact_method: 'Phone',
    current_address: '',
    current_suburb: '',
    current_city: '',
    current_region: '',
    current_postcode: '',
    current_country: 'New Zealand',
    residential_status: '',
    current_address_since: '',
    residency_status: '',
    country_of_birth: '',
    ird_number: '',
    driver_licence_number: '',
    driver_licence_version: '',
    driver_licence_expiry: '',
    passport_number: '',
    passport_expiry_date: '',
    marital_status: '',
    number_of_dependants: '',
  });

  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

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

  useEffect(() => {
    if ((activeTab === 'applicants' || activeTab === 'income') && application.id) {
      setApplicantsLoading(true);
      if (activeTab === 'applicants') {
        Promise.all([
          applicationService.getApplicants(application.id),
          applicationService.getCompanies(application.id),
        ])
          .then(([applicantsData, companiesData]) => {
            setApplicants(applicantsData || []);
            setCompanies(companiesData || []);
          })
          .catch((err) => {
            console.error('Failed to load applicants/companies:', err);
            setApplicants([]);
            setCompanies([]);
          })
          .finally(() => setApplicantsLoading(false));
      } else {
        applicationService
          .getApplicants(application.id)
          .then((data) => setApplicants(data || []))
          .catch(() => setApplicants([]))
          .finally(() => setApplicantsLoading(false));
      }
    }
  }, [activeTab, application.id]);

  const [incomeByApplicantId, setIncomeByApplicantId] = useState<Record<string, Income[]>>({});
  const [incomeTabLoading, setIncomeTabLoading] = useState(false);
  useEffect(() => {
    if (activeTab === 'income' && application.id && applicants.length > 0) {
      setIncomeTabLoading(true);
      Promise.all(applicants.map((a) => applicationService.getIncome(a.id)))
        .then((results) => {
          const map: Record<string, Income[]> = {};
          applicants.forEach((a, i) => {
            map[a.id] = results[i] || [];
          });
          setIncomeByApplicantId(map);
        })
        .catch(() => setIncomeByApplicantId({}))
        .finally(() => setIncomeTabLoading(false));
    }
  }, [activeTab, application.id, applicants.length, applicants.map((a) => a.id).join(',')]);

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

  const emptyApplicantForm = () => ({
    title: '',
    first_name: '',
    middle_name: '',
    surname: '',
    preferred_name: '',
    date_of_birth: '',
    gender: '',
    applicant_type: 'primary',
    mobile_phone: '',
    email_primary: '',
    preferred_contact_method: 'Phone',
    current_address: '',
    current_suburb: '',
    current_city: '',
    current_region: '',
    current_postcode: '',
    current_country: 'New Zealand',
    residential_status: '',
    current_address_since: '',
    residency_status: '',
    country_of_birth: '',
    ird_number: '',
    driver_licence_number: '',
    driver_licence_version: '',
    driver_licence_expiry: '',
    passport_number: '',
    passport_expiry_date: '',
    marital_status: '',
    number_of_dependants: '',
  });

  const emptyCompanyForm = () => ({
    entity_name: '',
    trading_name: '',
    entity_type: '',
    nzbn: '',
    company_number: '',
    gst_registered: false,
    gst_number: '',
    incorporation_date: '',
    industry: '',
    business_description: '',
    number_of_employees: '',
    is_trust: false,
    trust_name: '',
    business_address: '',
    business_suburb: '',
    business_city: '',
    business_region: '',
    business_postcode: '',
    contact_phone: '',
    contact_email: '',
    website: '',
    source_of_wealth: '',
    source_of_funds: '',
  });

  const [companyForm, setCompanyForm] = useState(emptyCompanyForm());
  const [companyFormError, setCompanyFormError] = useState<string | null>(null);

  const resetCompanyForm = () => {
    setCompanyForm(emptyCompanyForm());
    setCompanyFormError(null);
  };

  const emptyIncomeForm = () => ({
    income_type: '',
    gross_salary: '',
    salary_frequency: 'Monthly',
    allowances: '',
    allowances_frequency: 'Monthly',
    bonus: '',
    bonus_frequency: 'Monthly',
    commission: '',
    commission_frequency: 'Monthly',
    overtime: '',
    overtime_frequency: 'Monthly',
    overtime_guaranteed: false,
    business_name: '',
    tax_year: '',
    gross_sales: '',
    profit_before_tax: '',
    depreciation: '',
    interest_addbacks: '',
    non_recurring_expenses: '',
    tax_paid: '',
    previous_tax_year: '',
    prev_gross_sales: '',
    prev_profit_before_tax: '',
    prev_depreciation: '',
    prev_tax_paid: '',
    rental_property_address: '',
    rental_gross_monthly: '',
    rental_ownership_percent: '100',
    other_income_description: '',
    other_income_amount: '',
    other_income_frequency: 'Monthly',
  });

  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [incomeModalApplicant, setIncomeModalApplicant] = useState<Applicant | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [incomeForm, setIncomeForm] = useState(emptyIncomeForm());
  const [incomeFormError, setIncomeFormError] = useState<string | null>(null);
  const [submittingIncome, setSubmittingIncome] = useState(false);

  const resetApplicantForm = () => {
    setApplicantForm(emptyApplicantForm());
    setApplicantFormError(null);
  };

  const toDateInputValue = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v.slice(0, 10);
    if (typeof v === 'object' && v !== null && 'toISOString' in v) return (v as Date).toISOString().slice(0, 10);
    return '';
  };

  const applicantToForm = (a: Applicant) => ({
    title: (a.title as string) || '',
    first_name: (a.first_name as string) || '',
    middle_name: (a.middle_name as string) || '',
    surname: (a.surname as string) || '',
    preferred_name: (a.preferred_name as string) || '',
    date_of_birth: toDateInputValue(a.date_of_birth),
    gender: (a.gender as string) || '',
    applicant_type: (a.applicant_type as string) || 'primary',
    mobile_phone: (a.mobile_phone as string) || '',
    email_primary: (a.email_primary as string) || '',
    preferred_contact_method: (a.preferred_contact_method as string) || 'Phone',
    current_address: (a.current_address as string) || '',
    current_suburb: (a.current_suburb as string) || '',
    current_city: (a.current_city as string) || '',
    current_region: (a.current_region as string) || '',
    current_postcode: (a.current_postcode as string) || '',
    current_country: (a.current_country as string) || 'New Zealand',
    residential_status: (a.residential_status as string) || '',
    current_address_since: toDateInputValue(a.current_address_since),
    residency_status: (a.residency_status as string) || '',
    country_of_birth: (a.country_of_birth as string) || '',
    ird_number: (a.ird_number as string) || '',
    driver_licence_number: (a.driver_licence_number as string) || '',
    driver_licence_version: (a.driver_licence_version as string) || '',
    driver_licence_expiry: toDateInputValue(a.driver_licence_expiry),
    passport_number: (a.passport_number as string) || '',
    passport_expiry_date: toDateInputValue(a.passport_expiry_date),
    marital_status: (a.marital_status as string) || '',
    number_of_dependants: a.number_of_dependants != null ? String(a.number_of_dependants) : '',
  });

  const companyToForm = (c: Company) => ({
    entity_name: (c.entity_name as string) || '',
    trading_name: (c.trading_name as string) || '',
    entity_type: (c.entity_type as string) || '',
    nzbn: (c.nzbn as string) || '',
    company_number: (c.company_number as string) || '',
    gst_registered: Boolean(c.gst_registered),
    gst_number: (c.gst_number as string) || '',
    incorporation_date: toDateInputValue(c.incorporation_date),
    industry: (c.industry as string) || '',
    business_description: (c.business_description as string) || '',
    number_of_employees: (c.number_of_employees as string) ?? (c.number_of_employees != null ? String(c.number_of_employees) : ''),
    is_trust: Boolean(c.is_trust),
    trust_name: (c.trust_name as string) || '',
    business_address: (c.business_address as string) || '',
    business_suburb: (c.business_suburb as string) || '',
    business_city: (c.business_city as string) || '',
    business_region: (c.business_region as string) || '',
    business_postcode: (c.business_postcode as string) || '',
    contact_phone: (c.contact_phone as string) || '',
    contact_email: (c.contact_email as string) || '',
    website: (c.website as string) || '',
    source_of_wealth: (c.source_of_wealth as string) || '',
    source_of_funds: (c.source_of_funds as string) || '',
  });

  const handleDeleteApplicant = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this applicant?')) return;
    try {
      await applicationService.deleteApplicant(id);
      const data = await applicationService.getApplicants(application.id);
      setApplicants(data || []);
      setToastMessage('Applicant removed');
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to remove applicant');
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this company/trust?')) return;
    try {
      await applicationService.deleteCompany(id);
      const data = await applicationService.getCompanies(application.id);
      setCompanies(data || []);
      setToastMessage('Company removed');
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to remove company');
    }
  };

  const getApplicantDisplayName = (a: Applicant) =>
    [a.title, a.first_name, a.middle_name, a.surname].filter(Boolean).join(' ').trim() || 'Applicant';

  const frequencyToAnnualMultiplier = (freq: string): number => {
    switch (freq) {
      case 'Weekly': return 52;
      case 'Fortnightly': return 26;
      case 'Monthly': return 12;
      case 'Annually': return 1;
      default: return 12;
    }
  };

  const computeAnnualFromIncome = (inc: Income): number => {
    const type = (inc.income_type as string) || '';
    if (type === 'salary_wages' && inc.annual_gross_total != null) return Number(inc.annual_gross_total);
    if ((type === 'self_employed_sole' || type === 'self_employed_company') && inc.net_profit != null) return Number(inc.net_profit);
    if (type === 'rental') {
      const monthly = Number(inc.rental_gross_monthly) || 0;
      const pct = Number(inc.rental_ownership_percent) || 100;
      return monthly * 12 * (pct / 100);
    }
    if (type === 'other') {
      const amt = Number(inc.other_income_amount) || 0;
      const mult = frequencyToAnnualMultiplier((inc.other_income_frequency as string) || 'Monthly');
      return amt * mult;
    }
    return 0;
  };

  const incomeToForm = (inc: Income) => ({
    income_type: (inc.income_type as string) || '',
    gross_salary: inc.gross_salary != null ? String(inc.gross_salary) : '',
    salary_frequency: (inc.salary_frequency as string) || 'Monthly',
    allowances: inc.allowances != null ? String(inc.allowances) : '',
    allowances_frequency: (inc.allowances_frequency as string) || 'Monthly',
    bonus: inc.bonus != null ? String(inc.bonus) : '',
    bonus_frequency: (inc.bonus_frequency as string) || 'Monthly',
    commission: inc.commission != null ? String(inc.commission) : '',
    commission_frequency: (inc.commission_frequency as string) || 'Monthly',
    overtime: inc.overtime != null ? String(inc.overtime) : '',
    overtime_frequency: (inc.overtime_frequency as string) || 'Monthly',
    overtime_guaranteed: Boolean(inc.overtime_guaranteed),
    business_name: (inc.business_name as string) || '',
    tax_year: inc.tax_year != null ? String(inc.tax_year) : '',
    gross_sales: inc.gross_sales != null ? String(inc.gross_sales) : '',
    profit_before_tax: inc.profit_before_tax != null ? String(inc.profit_before_tax) : '',
    depreciation: inc.depreciation != null ? String(inc.depreciation) : '',
    interest_addbacks: inc.interest_addbacks != null ? String(inc.interest_addbacks) : '',
    non_recurring_expenses: inc.non_recurring_expenses != null ? String(inc.non_recurring_expenses) : '',
    tax_paid: inc.tax_paid != null ? String(inc.tax_paid) : '',
    previous_tax_year: inc.previous_tax_year != null ? String(inc.previous_tax_year) : '',
    prev_gross_sales: inc.prev_gross_sales != null ? String(inc.prev_gross_sales) : '',
    prev_profit_before_tax: inc.prev_profit_before_tax != null ? String(inc.prev_profit_before_tax) : '',
    prev_depreciation: inc.prev_depreciation != null ? String(inc.prev_depreciation) : '',
    prev_tax_paid: inc.prev_tax_paid != null ? String(inc.prev_tax_paid) : '',
    rental_property_address: (inc.rental_property_address as string) || '',
    rental_gross_monthly: inc.rental_gross_monthly != null ? String(inc.rental_gross_monthly) : '',
    rental_ownership_percent: inc.rental_ownership_percent != null ? String(inc.rental_ownership_percent) : '100',
    other_income_description: (inc.other_income_description as string) || '',
    other_income_amount: inc.other_income_amount != null ? String(inc.other_income_amount) : '',
    other_income_frequency: (inc.other_income_frequency as string) || 'Monthly',
  });

  const computeSalaryAnnualTotal = (): number => {
    const mul = (val: string, freq: string) => (Number(val) || 0) * frequencyToAnnualMultiplier(freq);
    return (
      mul(incomeForm.gross_salary, incomeForm.salary_frequency) +
      mul(incomeForm.allowances, incomeForm.allowances_frequency) +
      mul(incomeForm.bonus, incomeForm.bonus_frequency) +
      mul(incomeForm.commission, incomeForm.commission_frequency) +
      mul(incomeForm.overtime, incomeForm.overtime_frequency)
    );
  };

  const computeSelfEmployedNetProfit = (): number => {
    const pbt = Number(incomeForm.profit_before_tax) || 0;
    const dep = Number(incomeForm.depreciation) || 0;
    const addbacks = Number(incomeForm.interest_addbacks) || 0;
    const nonRec = Number(incomeForm.non_recurring_expenses) || 0;
    const tax = Number(incomeForm.tax_paid) || 0;
    return pbt + addbacks - dep - nonRec - tax;
  };

  const buildIncomePayload = (): Partial<Income> => {
    const type = incomeForm.income_type;
    const payload: Partial<Income> & Record<string, unknown> = { income_type: type };
    if (type === 'salary_wages') {
      payload.gross_salary = Number(incomeForm.gross_salary) || undefined;
      payload.salary_frequency = incomeForm.salary_frequency;
      payload.allowances = Number(incomeForm.allowances) || undefined;
      payload.allowances_frequency = incomeForm.allowances_frequency;
      payload.bonus = Number(incomeForm.bonus) || undefined;
      payload.bonus_frequency = incomeForm.bonus_frequency;
      payload.commission = Number(incomeForm.commission) || undefined;
      payload.commission_frequency = incomeForm.commission_frequency;
      payload.overtime = Number(incomeForm.overtime) || undefined;
      payload.overtime_frequency = incomeForm.overtime_frequency;
      payload.overtime_guaranteed = incomeForm.overtime_guaranteed;
      payload.annual_gross_total = computeSalaryAnnualTotal();
    } else if (type === 'self_employed_sole' || type === 'self_employed_company') {
      payload.business_name = incomeForm.business_name || undefined;
      payload.tax_year = incomeForm.tax_year ? Number(incomeForm.tax_year) : undefined;
      payload.gross_sales = Number(incomeForm.gross_sales) || undefined;
      payload.profit_before_tax = Number(incomeForm.profit_before_tax) || undefined;
      payload.depreciation = Number(incomeForm.depreciation) || undefined;
      payload.interest_addbacks = Number(incomeForm.interest_addbacks) || undefined;
      payload.non_recurring_expenses = Number(incomeForm.non_recurring_expenses) || undefined;
      payload.tax_paid = Number(incomeForm.tax_paid) || undefined;
      payload.net_profit = computeSelfEmployedNetProfit();
      payload.previous_tax_year = incomeForm.previous_tax_year ? Number(incomeForm.previous_tax_year) : undefined;
      payload.prev_gross_sales = Number(incomeForm.prev_gross_sales) || undefined;
      payload.prev_profit_before_tax = Number(incomeForm.prev_profit_before_tax) || undefined;
      payload.prev_depreciation = Number(incomeForm.prev_depreciation) || undefined;
      payload.prev_tax_paid = Number(incomeForm.prev_tax_paid) || undefined;
    } else if (type === 'rental') {
      payload.rental_property_address = incomeForm.rental_property_address || undefined;
      payload.rental_gross_monthly = Number(incomeForm.rental_gross_monthly) || undefined;
      payload.rental_ownership_percent = Number(incomeForm.rental_ownership_percent) || 100;
    } else if (type === 'other') {
      payload.other_income_description = incomeForm.other_income_description || undefined;
      payload.other_income_amount = Number(incomeForm.other_income_amount) || undefined;
      payload.other_income_frequency = incomeForm.other_income_frequency;
    }
    return payload;
  };

  const handleSaveIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incomeForm.income_type) {
      setIncomeFormError('Income type is required.');
      return;
    }
    const applicant = incomeModalApplicant;
    if (!applicant) return;
    setSubmittingIncome(true);
    setIncomeFormError(null);
    try {
      const payload = buildIncomePayload();
      if (editingIncome) {
        await applicationService.updateIncome(editingIncome.id, payload);
        setToastMessage('Income updated');
      } else {
        await applicationService.createIncome(applicant.id, payload);
        setToastMessage('Income added');
      }
      setShowAddIncomeModal(false);
      setIncomeModalApplicant(null);
      setEditingIncome(null);
      setIncomeForm(emptyIncomeForm());
      const updated = await applicationService.getIncome(applicant.id);
      setIncomeByApplicantId((prev) => ({ ...prev, [applicant.id]: updated || [] }));
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : err instanceof Error ? err.message : 'Failed to save income.';
      setIncomeFormError(msg);
    } finally {
      setSubmittingIncome(false);
    }
  };

  const handleDeleteIncome = async (applicantId: string, incomeId: string) => {
    if (!window.confirm('Are you sure you want to remove this income record?')) return;
    try {
      await applicationService.deleteIncome(incomeId);
      const data = await applicationService.getIncome(applicantId);
      setIncomeByApplicantId((prev) => ({ ...prev, [applicantId]: data || [] }));
      setToastMessage('Income removed');
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to remove income');
    }
  };

  const handleImportFromClient = () => {
    const first = detail?.clients?.first_name ?? client.name?.trim().split(/\s+/)[0] ?? '';
    const last = detail?.clients?.last_name ?? client.name?.trim().split(/\s+/).slice(1).join(' ') ?? '';
    setApplicantForm((f) => ({
      ...f,
      first_name: first,
      surname: last,
      email_primary: client.email ?? f.email_primary,
      mobile_phone: client.phone ?? f.mobile_phone,
      date_of_birth: client.dateOfBirth ? String(client.dateOfBirth).slice(0, 10) : f.date_of_birth,
      current_address: client.address ?? f.current_address,
      current_city: client.city ?? f.current_city,
      current_postcode: client.postalCode ?? f.current_postcode,
    }));
    setToastMessage('Client details imported');
  };

  const handleAddApplicantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applicantKind === 'company') {
      if (!companyForm.entity_name.trim()) {
        setCompanyFormError('Entity Name is required.');
        return;
      }
      setSubmittingApplicant(true);
      setCompanyFormError(null);
      try {
        const payload: Partial<Company> & Record<string, unknown> = {
          entity_name: companyForm.entity_name.trim(),
          entity_type: companyForm.entity_type || undefined,
          trading_name: companyForm.trading_name.trim() || undefined,
          nzbn: companyForm.nzbn.trim() || undefined,
          company_number: companyForm.company_number.trim() || undefined,
          gst_registered: companyForm.gst_registered,
          gst_number: companyForm.gst_number.trim() || undefined,
          incorporation_date: companyForm.incorporation_date || undefined,
          industry: companyForm.industry.trim() || undefined,
          business_description: companyForm.business_description.trim() || undefined,
          number_of_employees: companyForm.number_of_employees !== '' ? (Number(companyForm.number_of_employees) ?? undefined) : undefined,
          is_trust: companyForm.is_trust,
          trust_name: companyForm.trust_name.trim() || undefined,
          business_address: companyForm.business_address.trim() || undefined,
          business_suburb: companyForm.business_suburb.trim() || undefined,
          business_city: companyForm.business_city.trim() || undefined,
          business_region: companyForm.business_region.trim() || undefined,
          business_postcode: companyForm.business_postcode.trim() || undefined,
          contact_phone: companyForm.contact_phone.trim() || undefined,
          contact_email: companyForm.contact_email.trim() || undefined,
          website: companyForm.website.trim() || undefined,
          source_of_wealth: companyForm.source_of_wealth.trim() || undefined,
          source_of_funds: companyForm.source_of_funds.trim() || undefined,
        };
        if (editingCompany) {
          await applicationService.updateCompany(editingCompany.id, payload);
          setToastMessage('Company updated');
        } else {
          await applicationService.createCompany(application.id, payload);
          setToastMessage('Company added');
        }
        setShowAddApplicantModal(false);
        setEditingCompany(null);
        resetCompanyForm();
        const [applicantsData, companiesData] = await Promise.all([
          applicationService.getApplicants(application.id),
          applicationService.getCompanies(application.id),
        ]);
        setApplicants(applicantsData || []);
        setCompanies(companiesData || []);
      } catch (err) {
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: string }).message)
            : err instanceof Error
              ? err.message
              : 'Failed to save company.';
        setCompanyFormError(msg);
      } finally {
        setSubmittingApplicant(false);
      }
      return;
    }
    if (!applicantForm.first_name.trim() || !applicantForm.surname.trim()) {
      setApplicantFormError('First name and Surname are required.');
      return;
    }
    setSubmittingApplicant(true);
    setApplicantFormError(null);
    try {
      const payload: Record<string, unknown> = {
        applicant_type: applicantForm.applicant_type,
        first_name: applicantForm.first_name.trim(),
        surname: applicantForm.surname.trim(),
      };
      if (applicantForm.title) payload.title = applicantForm.title;
      if (applicantForm.middle_name) payload.middle_name = applicantForm.middle_name.trim();
      if (applicantForm.preferred_name) payload.preferred_name = applicantForm.preferred_name.trim();
      if (applicantForm.date_of_birth) payload.date_of_birth = applicantForm.date_of_birth;
      if (applicantForm.gender) payload.gender = applicantForm.gender;
      if (applicantForm.mobile_phone) payload.mobile_phone = applicantForm.mobile_phone.trim();
      if (applicantForm.email_primary) payload.email_primary = applicantForm.email_primary.trim();
      if (applicantForm.preferred_contact_method) payload.preferred_contact_method = applicantForm.preferred_contact_method;
      if (applicantForm.current_address) payload.current_address = applicantForm.current_address.trim();
      if (applicantForm.current_suburb) payload.current_suburb = applicantForm.current_suburb.trim();
      if (applicantForm.current_city) payload.current_city = applicantForm.current_city.trim();
      if (applicantForm.current_region) payload.current_region = applicantForm.current_region.trim();
      if (applicantForm.current_postcode) payload.current_postcode = applicantForm.current_postcode.trim();
      if (applicantForm.current_country) payload.current_country = applicantForm.current_country.trim();
      if (applicantForm.residential_status) payload.residential_status = applicantForm.residential_status;
      if (applicantForm.current_address_since) payload.current_address_since = applicantForm.current_address_since;
      if (applicantForm.residency_status) payload.residency_status = applicantForm.residency_status;
      if (applicantForm.country_of_birth) payload.country_of_birth = applicantForm.country_of_birth.trim();
      if (applicantForm.ird_number) payload.ird_number = applicantForm.ird_number.trim();
      if (applicantForm.driver_licence_number) payload.driver_licence_number = applicantForm.driver_licence_number.trim();
      if (applicantForm.driver_licence_version) payload.driver_licence_version = applicantForm.driver_licence_version.trim();
      if (applicantForm.driver_licence_expiry) payload.driver_licence_expiry = applicantForm.driver_licence_expiry;
      if (applicantForm.passport_number) payload.passport_number = applicantForm.passport_number.trim();
      if (applicantForm.passport_expiry_date) payload.passport_expiry_date = applicantForm.passport_expiry_date;
      if (applicantForm.marital_status) payload.marital_status = applicantForm.marital_status;
      if (applicantForm.number_of_dependants !== '') payload.number_of_dependants = Number(applicantForm.number_of_dependants) || 0;
      if (editingApplicant) {
        await applicationService.updateApplicant(editingApplicant.id, payload as Partial<Applicant>);
        setToastMessage('Applicant updated');
      } else {
        await applicationService.createApplicant(application.id, payload as Partial<Applicant>);
        setToastMessage('Applicant added');
      }
      setShowAddApplicantModal(false);
      setEditingApplicant(null);
      resetApplicantForm();
      const [applicantsData, companiesData] = await Promise.all([
        applicationService.getApplicants(application.id),
        applicationService.getCompanies(application.id),
      ]);
      setApplicants(applicantsData || []);
      setCompanies(companiesData || []);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : err instanceof Error
            ? err.message
            : 'Failed to add applicant.';
      setApplicantFormError(msg);
    } finally {
      setSubmittingApplicant(false);
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

  const financials = client.financials ?? {
    income: 0,
    expenses: 0,
    assets: 0,
    liabilities: 0,
    otherBorrowings: 0,
  };

  const renderOverview = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-24">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
        </div>
      );
    }

    return (
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
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button onClick={handleSaveLendingDetails} isLoading={savingLending}>Save Changes</Button>
              </div>
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
                  <span className="font-medium text-gray-900 dark:text-white">${(financials.income ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total expenses</span>
                  <span className="font-medium text-gray-900 dark:text-white">${(financials.expenses ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total assets</span>
                  <span className="font-medium text-gray-900 dark:text-white">${(financials.assets ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total liabilities</span>
                  <span className="font-medium text-gray-900 dark:text-white">${(financials.liabilities ?? 0).toLocaleString()}</span>
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

        {/* NZ Interest Rates Table */}
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Icon name="Percent" className="h-5 w-5 mr-2 text-primary-500 dark:text-primary-400" />
              Current Interest Rates
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => crmService.getCurrentInterestRates().then((r) => setInterestRates(r || []))}
              leftIcon="RefreshCw"
            >
              Refresh
            </Button>
          </div>
          {isLoadingRates ? (
            <div className="flex justify-center items-center h-24">
              <Icon name="Loader" className="h-6 w-6 animate-spin text-primary-500 dark:text-primary-400" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="px-4 py-2">Lender</th>
                    {interestRates[0]?.rates.map((rate) => (
                      <th key={rate.term} scope="col" className="px-4 py-2 text-center">
                        {rate.term}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {interestRates.map((bank) => (
                    <tr key={bank.lender} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 last:border-b-0">
                      <td className="px-4 py-2 font-semibold text-gray-900 dark:text-white">{bank.lender}</td>
                      {bank.rates.map((rate) => (
                        <td key={rate.term} className="px-4 py-2 text-center">
                          {rate.rate.toFixed(2)}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* AI Lender Recommendation */}
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
      </div>
    );
  };

  const renderApplicantsTab = () => {
    if (applicantsLoading) {
      return (
        <div className="flex justify-center items-center py-24">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Applicants</h3>
          <Button
            leftIcon="PlusCircle"
            onClick={() => {
              setApplicantKind('personal');
              setEditingApplicant(null);
              setEditingCompany(null);
              resetApplicantForm();
              resetCompanyForm();
              setShowAddApplicantModal(true);
            }}
          >
            Add Applicant
          </Button>
        </div>
        {applicants.length === 0 && companies.length === 0 ? (
          <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">No applicants yet. Add one to get started.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {applicants.map((a) => (
              <Card key={`applicant-${a.id}`} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {[a.title, a.first_name, a.middle_name, a.surname].filter(Boolean).join(' ').trim() || 'Unnamed'}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                      {(a.applicant_type || 'primary').charAt(0).toUpperCase() + (a.applicant_type || 'primary').slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Pencil"
                      onClick={() => {
                        setApplicantKind('personal');
                        setEditingApplicant(a);
                        setEditingCompany(null);
                        setApplicantForm(applicantToForm(a));
                        setApplicantFormError(null);
                        setCompanyFormError(null);
                        setShowAddApplicantModal(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Trash2"
                      onClick={() => handleDeleteApplicant(a.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {(a.mobile_phone || a.email_primary) && (
                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {a.mobile_phone && <p className="flex items-center gap-2"><Icon name="Phone" className="h-4 w-4 flex-shrink-0" />{a.mobile_phone}</p>}
                    {a.email_primary && <p className="flex items-center gap-2"><Icon name="Mail" className="h-4 w-4 flex-shrink-0" />{a.email_primary}</p>}
                  </div>
                )}
              </Card>
            ))}
            {companies.map((c) => (
              <Card key={`company-${c.id}`} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Icon name="Building2" className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{(c as Company).entity_name || 'Unnamed entity'}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                        {((c as Company).entity_type as string) || 'Company'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Pencil"
                      onClick={() => {
                        setApplicantKind('company');
                        setEditingCompany(c);
                        setEditingApplicant(null);
                        setCompanyForm(companyToForm(c));
                        setCompanyFormError(null);
                        setApplicantFormError(null);
                        setShowAddApplicantModal(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Trash2"
                      onClick={() => handleDeleteCompany(c.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {((c as Company).contact_phone || (c as Company).contact_email) && (
                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {(c as Company).contact_phone && <p className="flex items-center gap-2"><Icon name="Phone" className="h-4 w-4 flex-shrink-0" />{(c as Company).contact_phone}</p>}
                    {(c as Company).contact_email && <p className="flex items-center gap-2"><Icon name="Mail" className="h-4 w-4 flex-shrink-0" />{(c as Company).contact_email}</p>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Add Applicant Modal */}
        {showAddApplicantModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingApplicant ? 'Edit Applicant' : editingCompany ? 'Edit Company / Trust' : 'Add Applicant'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddApplicantModal(false);
                    setEditingApplicant(null);
                    setEditingCompany(null);
                    setApplicantKind('personal');
                    resetApplicantForm();
                    resetCompanyForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleAddApplicantSubmit} className="flex flex-col min-h-0">
                <div className="overflow-y-auto p-4 flex-1">
                  {/* Applicant type: Personal vs Company */}
                  <div className="mb-6">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Applicant type</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="applicantKind"
                          checked={applicantKind === 'personal'}
                          onChange={() => { setApplicantKind('personal'); setApplicantFormError(null); setCompanyFormError(null); }}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Personal Applicant</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="applicantKind"
                          checked={applicantKind === 'company'}
                          onChange={() => { setApplicantKind('company'); setApplicantFormError(null); setCompanyFormError(null); }}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Company / Trust</span>
                      </label>
                    </div>
                  </div>

                  {applicantKind === 'company' ? (
                    <>
                      {companyFormError && (
                        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md mb-4">{companyFormError}</p>
                      )}
                      <FormSection title="Entity Details">
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Entity Name *</label><input type="text" value={companyForm.entity_name} onChange={e => setCompanyForm(f => ({ ...f, entity_name: e.target.value }))} className={inputClasses} required /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Trading Name</label><input type="text" value={companyForm.trading_name} onChange={e => setCompanyForm(f => ({ ...f, trading_name: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Entity Type</label><select value={companyForm.entity_type} onChange={e => setCompanyForm(f => ({ ...f, entity_type: e.target.value }))} className={inputClasses}><option value="">—</option>{ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">NZBN</label><input type="text" value={companyForm.nzbn} onChange={e => setCompanyForm(f => ({ ...f, nzbn: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Company Number</label><input type="text" value={companyForm.company_number} onChange={e => setCompanyForm(f => ({ ...f, company_number: e.target.value }))} className={inputClasses} /></div>
                        <div className="flex items-center gap-2"><input type="checkbox" id="gst_registered" checked={companyForm.gst_registered} onChange={e => setCompanyForm(f => ({ ...f, gst_registered: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="gst_registered" className="text-sm text-gray-700 dark:text-gray-300">GST Registered</label></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">GST Number</label><input type="text" value={companyForm.gst_number} onChange={e => setCompanyForm(f => ({ ...f, gst_number: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Incorporation Date</label><input type="date" value={companyForm.incorporation_date} onChange={e => setCompanyForm(f => ({ ...f, incorporation_date: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Industry</label><input type="text" value={companyForm.industry} onChange={e => setCompanyForm(f => ({ ...f, industry: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Business Description</label><textarea value={companyForm.business_description} onChange={e => setCompanyForm(f => ({ ...f, business_description: e.target.value }))} className={inputClasses} rows={2} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Number of Employees</label><input type="number" min={0} value={companyForm.number_of_employees} onChange={e => setCompanyForm(f => ({ ...f, number_of_employees: e.target.value }))} className={inputClasses} /></div>
                        <div className="flex items-center gap-2"><input type="checkbox" id="is_trust" checked={companyForm.is_trust} onChange={e => setCompanyForm(f => ({ ...f, is_trust: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="is_trust" className="text-sm text-gray-700 dark:text-gray-300">Is Trust</label></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Trust Name</label><input type="text" value={companyForm.trust_name} onChange={e => setCompanyForm(f => ({ ...f, trust_name: e.target.value }))} className={inputClasses} /></div>
                      </FormSection>
                      <FormSection title="Business Address">
                        <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Business Address</label><input type="text" value={companyForm.business_address} onChange={e => setCompanyForm(f => ({ ...f, business_address: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Business Suburb</label><input type="text" value={companyForm.business_suburb} onChange={e => setCompanyForm(f => ({ ...f, business_suburb: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Business City</label><input type="text" value={companyForm.business_city} onChange={e => setCompanyForm(f => ({ ...f, business_city: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Business Region</label><input type="text" value={companyForm.business_region} onChange={e => setCompanyForm(f => ({ ...f, business_region: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Business Postcode</label><input type="text" value={companyForm.business_postcode} onChange={e => setCompanyForm(f => ({ ...f, business_postcode: e.target.value }))} className={inputClasses} /></div>
                      </FormSection>
                      <FormSection title="Contact">
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contact Phone</label><input type="tel" value={companyForm.contact_phone} onChange={e => setCompanyForm(f => ({ ...f, contact_phone: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contact Email</label><input type="email" value={companyForm.contact_email} onChange={e => setCompanyForm(f => ({ ...f, contact_email: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Website</label><input type="url" value={companyForm.website} onChange={e => setCompanyForm(f => ({ ...f, website: e.target.value }))} className={inputClasses} /></div>
                      </FormSection>
                      <FormSection title="Source of Wealth">
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Source of Wealth</label><input type="text" value={companyForm.source_of_wealth} onChange={e => setCompanyForm(f => ({ ...f, source_of_wealth: e.target.value }))} className={inputClasses} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Source of Funds</label><input type="text" value={companyForm.source_of_funds} onChange={e => setCompanyForm(f => ({ ...f, source_of_funds: e.target.value }))} className={inputClasses} /></div>
                      </FormSection>
                    </>
                  ) : (
                    <>
                      {applicantFormError && (
                        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md mb-4">{applicantFormError}</p>
                      )}
                      <div className="mb-4">
                        <Button type="button" variant="secondary" size="sm" leftIcon="UserPlus" onClick={handleImportFromClient}>
                          Import from Client Profile
                        </Button>
                      </div>
                  <FormSection title="Personal Details">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Title</label><select value={applicantForm.title} onChange={e => setApplicantForm(f => ({ ...f, title: e.target.value }))} className={inputClasses}><option value="">—</option>{TITLES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">First Name *</label><input type="text" value={applicantForm.first_name} onChange={e => setApplicantForm(f => ({ ...f, first_name: e.target.value }))} className={inputClasses} required /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Middle Name</label><input type="text" value={applicantForm.middle_name} onChange={e => setApplicantForm(f => ({ ...f, middle_name: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Surname *</label><input type="text" value={applicantForm.surname} onChange={e => setApplicantForm(f => ({ ...f, surname: e.target.value }))} className={inputClasses} required /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Preferred Name</label><input type="text" value={applicantForm.preferred_name} onChange={e => setApplicantForm(f => ({ ...f, preferred_name: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date of Birth</label><input type="date" value={applicantForm.date_of_birth} onChange={e => setApplicantForm(f => ({ ...f, date_of_birth: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Gender</label><select value={applicantForm.gender} onChange={e => setApplicantForm(f => ({ ...f, gender: e.target.value }))} className={inputClasses}><option value="">—</option>{GENDERS.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Applicant Type</label><select value={applicantForm.applicant_type} onChange={e => setApplicantForm(f => ({ ...f, applicant_type: e.target.value }))} className={inputClasses}>{APPLICANT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select></div>
                  </FormSection>
                  <FormSection title="Contact Details">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Mobile Phone</label><input type="tel" value={applicantForm.mobile_phone} onChange={e => setApplicantForm(f => ({ ...f, mobile_phone: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email Primary</label><input type="email" value={applicantForm.email_primary} onChange={e => setApplicantForm(f => ({ ...f, email_primary: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Preferred Contact Method</label><select value={applicantForm.preferred_contact_method} onChange={e => setApplicantForm(f => ({ ...f, preferred_contact_method: e.target.value }))} className={inputClasses}>{PREFERRED_CONTACT.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  </FormSection>
                  <FormSection title="Current Address">
                    <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Address</label><input type="text" value={applicantForm.current_address} onChange={e => setApplicantForm(f => ({ ...f, current_address: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Suburb</label><input type="text" value={applicantForm.current_suburb} onChange={e => setApplicantForm(f => ({ ...f, current_suburb: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current City</label><input type="text" value={applicantForm.current_city} onChange={e => setApplicantForm(f => ({ ...f, current_city: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Region</label><input type="text" value={applicantForm.current_region} onChange={e => setApplicantForm(f => ({ ...f, current_region: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Postcode</label><input type="text" value={applicantForm.current_postcode} onChange={e => setApplicantForm(f => ({ ...f, current_postcode: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Country</label><input type="text" value={applicantForm.current_country} onChange={e => setApplicantForm(f => ({ ...f, current_country: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Residential Status</label><select value={applicantForm.residential_status} onChange={e => setApplicantForm(f => ({ ...f, residential_status: e.target.value }))} className={inputClasses}><option value="">—</option>{RESIDENTIAL_STATUSES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Address Since</label><input type="date" value={applicantForm.current_address_since} onChange={e => setApplicantForm(f => ({ ...f, current_address_since: e.target.value }))} className={inputClasses} /></div>
                  </FormSection>
                  <FormSection title="Identification">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Residency Status</label><select value={applicantForm.residency_status} onChange={e => setApplicantForm(f => ({ ...f, residency_status: e.target.value }))} className={inputClasses}><option value="">—</option>{RESIDENCY_STATUSES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Country of Birth</label><input type="text" value={applicantForm.country_of_birth} onChange={e => setApplicantForm(f => ({ ...f, country_of_birth: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">IRD Number</label><input type="text" value={applicantForm.ird_number} onChange={e => setApplicantForm(f => ({ ...f, ird_number: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Driver Licence Number</label><input type="text" value={applicantForm.driver_licence_number} onChange={e => setApplicantForm(f => ({ ...f, driver_licence_number: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Driver Licence Version</label><input type="text" value={applicantForm.driver_licence_version} onChange={e => setApplicantForm(f => ({ ...f, driver_licence_version: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Driver Licence Expiry</label><input type="date" value={applicantForm.driver_licence_expiry} onChange={e => setApplicantForm(f => ({ ...f, driver_licence_expiry: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Passport Number</label><input type="text" value={applicantForm.passport_number} onChange={e => setApplicantForm(f => ({ ...f, passport_number: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Passport Expiry Date</label><input type="date" value={applicantForm.passport_expiry_date} onChange={e => setApplicantForm(f => ({ ...f, passport_expiry_date: e.target.value }))} className={inputClasses} /></div>
                  </FormSection>
                  <FormSection title="Family">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Marital Status</label><select value={applicantForm.marital_status} onChange={e => setApplicantForm(f => ({ ...f, marital_status: e.target.value }))} className={inputClasses}><option value="">—</option>{MARITAL_STATUSES.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Number of Dependants</label><input type="number" min={0} value={applicantForm.number_of_dependants} onChange={e => setApplicantForm(f => ({ ...f, number_of_dependants: e.target.value }))} className={inputClasses} /></div>
                  </FormSection>
                    </>
                  )}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setShowAddApplicantModal(false); setEditingApplicant(null); setEditingCompany(null); setApplicantKind('personal'); resetApplicantForm(); resetCompanyForm(); }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={submittingApplicant}>
                    {editingApplicant ? 'Save changes' : editingCompany ? 'Save changes' : applicantKind === 'company' ? 'Add Company' : 'Add Applicant'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const getIncomeTypeLabel = (value: string) => INCOME_TYPES.find((t) => t.value === value)?.label ?? value;
  const getIncomeCardSummary = (inc: Income) => {
    const type = (inc.income_type as string) || '';
    if (type === 'salary_wages') return { amount: inc.annual_gross_total, freq: 'Annually' };
    if (type === 'self_employed_sole' || type === 'self_employed_company') return { amount: inc.net_profit, freq: 'Annually' };
    if (type === 'rental') return { amount: inc.rental_gross_monthly, freq: 'Monthly' };
    if (type === 'other') return { amount: inc.other_income_amount, freq: (inc.other_income_frequency as string) || '' };
    return { amount: null, freq: '' };
  };

  const renderIncomeTab = () => {
    if (applicantsLoading && activeTab === 'income') {
      return (
        <div className="flex justify-center items-center py-24">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
        </div>
      );
    }
    if (applicants.length === 0) {
      return (
        <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">Add applicants in the Applicants tab first, then you can add income for each.</p>
        </Card>
      );
    }
    if (incomeTabLoading) {
      return (
        <div className="flex justify-center items-center py-24">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
        </div>
      );
    }
    return (
      <div className="space-y-8">
        {applicants.map((applicant) => {
          const incomes = incomeByApplicantId[applicant.id] || [];
          return (
            <div key={applicant.id}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Income — {getApplicantDisplayName(applicant)}</h3>
                <Button
                  type="button"
                  leftIcon="PlusCircle"
                  onClick={() => {
                    setIncomeModalApplicant(applicant);
                    setEditingIncome(null);
                    setIncomeForm(emptyIncomeForm());
                    setIncomeFormError(null);
                    setShowAddIncomeModal(true);
                  }}
                >
                  Add Income
                </Button>
              </div>
              {incomes.length === 0 ? (
                <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No income records yet.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {incomes.map((inc) => {
                    const { amount, freq } = getIncomeCardSummary(inc);
                    return (
                      <Card key={inc.id} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{getIncomeTypeLabel(inc.income_type as string)}</p>
                            {(amount != null && amount !== '') && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">${Number(amount).toLocaleString()} {freq && `· ${freq}`}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              leftIcon="Pencil"
                              onClick={() => {
                                setIncomeModalApplicant(applicant);
                                setEditingIncome(inc);
                                setIncomeForm(incomeToForm(inc));
                                setIncomeFormError(null);
                                setShowAddIncomeModal(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button type="button" variant="ghost" size="sm" leftIcon="Trash2" onClick={() => handleDeleteIncome(applicant.id, inc.id)}>Delete</Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Annual Income Summary */}
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">Annual Income Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-700 dark:text-gray-300">
              <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-4 py-3">Applicant</th>
                  <th scope="col" className="px-4 py-3 text-right">Total Annual Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {applicants.map((a) => {
                  const list = incomeByApplicantId[a.id] || [];
                  const total = list.reduce((sum, inc) => sum + computeAnnualFromIncome(inc), 0);
                  return (
                    <tr key={a.id} className="bg-white dark:bg-gray-800">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{getApplicantDisplayName(a)}</td>
                      <td className="px-4 py-3 text-right">${total.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Add/Edit Income Modal */}
        {showAddIncomeModal && incomeModalApplicant && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editingIncome ? 'Edit Income' : 'Add Income'} — {getApplicantDisplayName(incomeModalApplicant)}</h3>
                <button type="button" onClick={() => { setShowAddIncomeModal(false); setIncomeModalApplicant(null); setEditingIncome(null); setIncomeForm(emptyIncomeForm()); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveIncomeSubmit} className="flex flex-col min-h-0">
                <div className="overflow-y-auto p-4 flex-1">
                  {incomeFormError && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md mb-4">{incomeFormError}</p>}
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Income Type *</label>
                    <select value={incomeForm.income_type} onChange={(e) => setIncomeForm((f) => ({ ...f, income_type: e.target.value }))} className={inputClasses} required>
                      <option value="">—</option>
                      {INCOME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {incomeForm.income_type === 'salary_wages' && (
                    <FormSection title="Salary / Wages">
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Gross Salary</label><input type="number" min={0} step={0.01} value={incomeForm.gross_salary} onChange={e => setIncomeForm(f => ({ ...f, gross_salary: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Salary Frequency</label><select value={incomeForm.salary_frequency} onChange={e => setIncomeForm(f => ({ ...f, salary_frequency: e.target.value }))} className={inputClasses}>{FREQUENCIES.map(fq => <option key={fq} value={fq}>{fq}</option>)}</select></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Allowances</label><input type="number" min={0} step={0.01} value={incomeForm.allowances} onChange={e => setIncomeForm(f => ({ ...f, allowances: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Allowances Frequency</label><select value={incomeForm.allowances_frequency} onChange={e => setIncomeForm(f => ({ ...f, allowances_frequency: e.target.value }))} className={inputClasses}>{FREQUENCIES.map(fq => <option key={fq} value={fq}>{fq}</option>)}</select></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bonus</label><input type="number" min={0} step={0.01} value={incomeForm.bonus} onChange={e => setIncomeForm(f => ({ ...f, bonus: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bonus Frequency</label><select value={incomeForm.bonus_frequency} onChange={e => setIncomeForm(f => ({ ...f, bonus_frequency: e.target.value }))} className={inputClasses}>{FREQUENCIES.map(fq => <option key={fq} value={fq}>{fq}</option>)}</select></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Commission</label><input type="number" min={0} step={0.01} value={incomeForm.commission} onChange={e => setIncomeForm(f => ({ ...f, commission: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Commission Frequency</label><select value={incomeForm.commission_frequency} onChange={e => setIncomeForm(f => ({ ...f, commission_frequency: e.target.value }))} className={inputClasses}>{FREQUENCIES.map(fq => <option key={fq} value={fq}>{fq}</option>)}</select></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Overtime</label><input type="number" min={0} step={0.01} value={incomeForm.overtime} onChange={e => setIncomeForm(f => ({ ...f, overtime: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Overtime Frequency</label><select value={incomeForm.overtime_frequency} onChange={e => setIncomeForm(f => ({ ...f, overtime_frequency: e.target.value }))} className={inputClasses}>{FREQUENCIES.map(fq => <option key={fq} value={fq}>{fq}</option>)}</select></div>
                      <div className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" id="overtime_guaranteed" checked={incomeForm.overtime_guaranteed} onChange={e => setIncomeForm(f => ({ ...f, overtime_guaranteed: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="overtime_guaranteed" className="text-sm text-gray-700 dark:text-gray-300">Overtime Guaranteed</label></div>
                      <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Annual Gross Total</label><p className="py-2 text-sm font-medium text-gray-900 dark:text-white">${computeSalaryAnnualTotal().toLocaleString()}</p></div>
                    </FormSection>
                  )}

                  {(incomeForm.income_type === 'self_employed_sole' || incomeForm.income_type === 'self_employed_company') && (
                    <FormSection title="Self Employed">
                      <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Business Name</label><input type="text" value={incomeForm.business_name} onChange={e => setIncomeForm(f => ({ ...f, business_name: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tax Year</label><input type="number" min={2000} max={2100} value={incomeForm.tax_year} onChange={e => setIncomeForm(f => ({ ...f, tax_year: e.target.value }))} className={inputClasses} placeholder="2024" /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Gross Sales</label><input type="number" min={0} step={0.01} value={incomeForm.gross_sales} onChange={e => setIncomeForm(f => ({ ...f, gross_sales: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Profit Before Tax</label><input type="number" step={0.01} value={incomeForm.profit_before_tax} onChange={e => setIncomeForm(f => ({ ...f, profit_before_tax: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Depreciation</label><input type="number" min={0} step={0.01} value={incomeForm.depreciation} onChange={e => setIncomeForm(f => ({ ...f, depreciation: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Interest Addbacks</label><input type="number" min={0} step={0.01} value={incomeForm.interest_addbacks} onChange={e => setIncomeForm(f => ({ ...f, interest_addbacks: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Non Recurring Expenses</label><input type="number" min={0} step={0.01} value={incomeForm.non_recurring_expenses} onChange={e => setIncomeForm(f => ({ ...f, non_recurring_expenses: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tax Paid</label><input type="number" min={0} step={0.01} value={incomeForm.tax_paid} onChange={e => setIncomeForm(f => ({ ...f, tax_paid: e.target.value }))} className={inputClasses} /></div>
                      <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Net Profit (calculated)</label><p className="py-2 text-sm font-medium text-gray-900 dark:text-white">${computeSelfEmployedNetProfit().toLocaleString()}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Previous Tax Year</label><input type="number" min={2000} max={2100} value={incomeForm.previous_tax_year} onChange={e => setIncomeForm(f => ({ ...f, previous_tax_year: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Prev Gross Sales</label><input type="number" min={0} step={0.01} value={incomeForm.prev_gross_sales} onChange={e => setIncomeForm(f => ({ ...f, prev_gross_sales: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Prev Profit Before Tax</label><input type="number" step={0.01} value={incomeForm.prev_profit_before_tax} onChange={e => setIncomeForm(f => ({ ...f, prev_profit_before_tax: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Prev Depreciation</label><input type="number" min={0} step={0.01} value={incomeForm.prev_depreciation} onChange={e => setIncomeForm(f => ({ ...f, prev_depreciation: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Prev Tax Paid</label><input type="number" min={0} step={0.01} value={incomeForm.prev_tax_paid} onChange={e => setIncomeForm(f => ({ ...f, prev_tax_paid: e.target.value }))} className={inputClasses} /></div>
                    </FormSection>
                  )}

                  {incomeForm.income_type === 'rental' && (
                    <FormSection title="Rental Income">
                      <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rental Property Address</label><input type="text" value={incomeForm.rental_property_address} onChange={e => setIncomeForm(f => ({ ...f, rental_property_address: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rental Gross Monthly</label><input type="number" min={0} step={0.01} value={incomeForm.rental_gross_monthly} onChange={e => setIncomeForm(f => ({ ...f, rental_gross_monthly: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rental Ownership %</label><input type="number" min={0} max={100} value={incomeForm.rental_ownership_percent} onChange={e => setIncomeForm(f => ({ ...f, rental_ownership_percent: e.target.value }))} className={inputClasses} /></div>
                    </FormSection>
                  )}

                  {incomeForm.income_type === 'other' && (
                    <FormSection title="Other Income">
                      <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label><input type="text" value={incomeForm.other_income_description} onChange={e => setIncomeForm(f => ({ ...f, other_income_description: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Amount</label><input type="number" min={0} step={0.01} value={incomeForm.other_income_amount} onChange={e => setIncomeForm(f => ({ ...f, other_income_amount: e.target.value }))} className={inputClasses} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Frequency</label><select value={incomeForm.other_income_frequency} onChange={e => setIncomeForm(f => ({ ...f, other_income_frequency: e.target.value }))} className={inputClasses}>{FREQUENCIES.map(fq => <option key={fq} value={fq}>{fq}</option>)}</select></div>
                    </FormSection>
                  )}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                  <Button type="button" variant="secondary" onClick={() => { setShowAddIncomeModal(false); setIncomeModalApplicant(null); setEditingIncome(null); setIncomeForm(emptyIncomeForm()); }}>Cancel</Button>
                  <Button type="submit" isLoading={submittingIncome}>{editingIncome ? 'Save changes' : 'Add Income'}</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'applicants':
        return renderApplicantsTab();
      case 'income':
        return renderIncomeTab();
      case 'expenses':
        return <ComingSoonPlaceholder tabName="Expenses" />;
      case 'assets':
        return <ComingSoonPlaceholder tabName="Assets" />;
      case 'liabilities':
        return <ComingSoonPlaceholder tabName="Liabilities" />;
      case 'documents':
        return <ComingSoonPlaceholder tabName="Documents" />;
      default:
        return null;
    }
  };

  const currentStage = (detail?.workflow_stage || workflowStage || 'draft').toString().toLowerCase();

  return (
    <div className="text-gray-900 dark:text-gray-100">
      {/* Top header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onBack} variant="secondary" leftIcon="ArrowLeft" className="flex-shrink-0">
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{clientName}</h2>
            <span className="text-gray-500 dark:text-gray-400">·</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{application.referenceNumber}</span>
            <WorkflowPill stage={currentStage} />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {loanAmountNum ? `$${loanAmountNum.toLocaleString()}` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Card className="p-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-1 p-2 overflow-x-auto" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon name={tab.icon} className="h-4 w-4 flex-shrink-0" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <main className="p-6 bg-white dark:bg-gray-800 min-h-[400px]">
          {renderTabContent()}
        </main>
      </Card>

      {/* Success / error toast */}
      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium bg-gray-800 dark:bg-gray-700 text-white border border-gray-600 dark:border-gray-600"
          role="alert"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
};
