import React, { useState, useEffect } from 'react';
import type { Application, Client } from '../../types';
import { ApplicationStatus } from '../../types';
import type { BankRates, AIRecommendationResponse } from '../../types';
import { Button } from '../common/Button';
import { Icon, IconName } from '../common/Icon';
import { Card } from '../common/Card';
import { applicationService, type Applicant, type Company, type Income, type Expense, type Asset, type Liability } from '../../services/applicationService';
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
const EXPENSE_FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Annually'] as const;

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

  const [financials, setFinancials] = useState({
    income: client.financials?.income ?? 0,
    expenses: client.financials?.expenses ?? 0,
    assets: client.financials?.assets ?? 0,
    liabilities: client.financials?.liabilities ?? 0,
    netPosition: (client.financials?.assets ?? 0) - (client.financials?.liabilities ?? 0),
  });

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

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
  const [submittingExpense, setSubmittingExpense] = useState(false);

  useEffect(() => {
    if (activeTab === 'expenses' && application.id) {
      setExpensesLoading(true);
      applicationService
        .getExpenses(application.id)
        .then((data) => setExpenses(data || []))
        .catch(() => setExpenses([]))
        .finally(() => setExpensesLoading(false));
    }
  }, [activeTab, application.id]);

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

  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetFormError, setAssetFormError] = useState<string | null>(null);
  const [submittingAsset, setSubmittingAsset] = useState(false);

  useEffect(() => {
    if (activeTab === 'assets' && application.id) {
      setAssetsLoading(true);
      applicationService
        .getAssets(application.id)
        .then((data) => setAssets(data || []))
        .catch(() => setAssets([]))
        .finally(() => setAssetsLoading(false));
    }
  }, [activeTab, application.id]);

  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [liabilitiesLoading, setLiabilitiesLoading] = useState(false);
  const [showLiabilityModal, setShowLiabilityModal] = useState(false);
  const [editingLiability, setEditingLiability] = useState<Liability | null>(null);
  const [liabilityFormError, setLiabilityFormError] = useState<string | null>(null);
  const [submittingLiability, setSubmittingLiability] = useState(false);

  useEffect(() => {
    if (activeTab === 'liabilities' && application.id) {
      setLiabilitiesLoading(true);
      applicationService
        .getLiabilities(application.id)
        .then((data) => setLiabilities(data || []))
        .catch(() => setLiabilities([]))
        .finally(() => setLiabilitiesLoading(false));
    }
  }, [activeTab, application.id]);

  const [documents, setDocuments] = useState<any[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>('01 Fact Find');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    if (activeTab === 'documents' && application.id) {
      setDocumentsLoading(true);
      applicationService
        .getDocuments(application.id)
        .then((data) => setDocuments(data || []))
        .catch(() => setDocuments([]))
        .finally(() => setDocumentsLoading(false));
    }
  }, [activeTab, application.id]);

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

  const resetExpenseForm = () => {
    setExpenseForm(emptyExpenseForm());
    setExpenseFormError(null);
  };

  const emptyExpenseForm = () => ({
    household_name: '',
    food_freq: 'Monthly',
    disc_freq: 'Monthly',
    children_freq: 'Monthly',
    health_freq: 'Monthly',
    transport_freq: 'Monthly',
    housing_freq: 'Monthly',
    commitments_freq: 'Monthly',
    food_groceries: '0',
    dining_takeaway: '0',
    alcohol_tobacco: '0',
    entertainment: '0',
    holidays_travel: '0',
    clothing_personal: '0',
    grooming_beauty: '0',
    phone_internet: '0',
    streaming_subscriptions: '0',
    gifts_donations: '0',
    pets: '0',
    other_discretionary: '0',
    childcare: '0',
    school_fees_public: '0',
    school_fees_private: '0',
    tertiary_education: '0',
    health_insurance: '0',
    medical_dental: '0',
    gym_sports: '0',
    life_insurance: '0',
    income_protection: '0',
    vehicle_running_costs: '0',
    vehicle_insurance: '0',
    public_transport: '0',
    rates: '0',
    body_corporate: '0',
    home_insurance: '0',
    utilities: '0',
    rent_board: '0',
    property_maintenance: '0',
    child_support: '0',
    spousal_maintenance: '0',
    other_regular_commitments: '0',
  });

  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());

  const expenseToForm = (exp: Expense) => ({
    household_name: (exp.household_name as string) || '',
    food_freq: 'Monthly',
    disc_freq: 'Monthly',
    children_freq: 'Monthly',
    health_freq: 'Monthly',
    transport_freq: 'Monthly',
    housing_freq: 'Monthly',
    commitments_freq: 'Monthly',
    food_groceries: exp.food_groceries != null ? String(exp.food_groceries) : '0',
    dining_takeaway: exp.dining_takeaway != null ? String(exp.dining_takeaway) : '0',
    alcohol_tobacco: exp.alcohol_tobacco != null ? String(exp.alcohol_tobacco) : '0',
    entertainment: exp.entertainment != null ? String(exp.entertainment) : '0',
    holidays_travel: exp.holidays_travel != null ? String(exp.holidays_travel) : '0',
    clothing_personal: exp.clothing_personal != null ? String(exp.clothing_personal) : '0',
    grooming_beauty: exp.grooming_beauty != null ? String(exp.grooming_beauty) : '0',
    phone_internet: exp.phone_internet != null ? String(exp.phone_internet) : '0',
    streaming_subscriptions: exp.streaming_subscriptions != null ? String(exp.streaming_subscriptions) : '0',
    gifts_donations: exp.gifts_donations != null ? String(exp.gifts_donations) : '0',
    pets: exp.pets != null ? String(exp.pets) : '0',
    other_discretionary: exp.other_discretionary != null ? String(exp.other_discretionary) : '0',
    childcare: exp.childcare != null ? String(exp.childcare) : '0',
    school_fees_public: exp.school_fees_public != null ? String(exp.school_fees_public) : '0',
    school_fees_private: exp.school_fees_private != null ? String(exp.school_fees_private) : '0',
    tertiary_education: exp.tertiary_education != null ? String(exp.tertiary_education) : '0',
    health_insurance: exp.health_insurance != null ? String(exp.health_insurance) : '0',
    medical_dental: exp.medical_dental != null ? String(exp.medical_dental) : '0',
    gym_sports: exp.gym_sports != null ? String(exp.gym_sports) : '0',
    life_insurance: exp.life_insurance != null ? String(exp.life_insurance) : '0',
    income_protection: exp.income_protection != null ? String(exp.income_protection) : '0',
    vehicle_running_costs: exp.vehicle_running_costs != null ? String(exp.vehicle_running_costs) : '0',
    vehicle_insurance: exp.vehicle_insurance != null ? String(exp.vehicle_insurance) : '0',
    public_transport: exp.public_transport != null ? String(exp.public_transport) : '0',
    rates: exp.rates != null ? String(exp.rates) : '0',
    body_corporate: exp.body_corporate != null ? String(exp.body_corporate) : '0',
    home_insurance: exp.home_insurance != null ? String(exp.home_insurance) : '0',
    utilities: exp.utilities != null ? String(exp.utilities) : '0',
    rent_board: exp.rent_board != null ? String(exp.rent_board) : '0',
    property_maintenance: exp.property_maintenance != null ? String(exp.property_maintenance) : '0',
    child_support: exp.child_support != null ? String(exp.child_support) : '0',
    spousal_maintenance: exp.spousal_maintenance != null ? String(exp.spousal_maintenance) : '0',
    other_regular_commitments: exp.other_regular_commitments != null ? String(exp.other_regular_commitments) : '0',
  });

  const emptyAssetForm = () => ({
    asset_type: 'Property' as 'Property' | 'Vehicle' | 'Bank Account' | 'KiwiSaver' | 'Investment' | 'Other',
    // Property
    property_address: '',
    property_suburb: '',
    property_city: '',
    property_region: '',
    property_postcode: '',
    property_type: '',
    zoning: '',
    property_value: '',
    valuation_type: '',
    valuation_date: '',
    monthly_rental_income: '',
    to_be_sold: false,
    will_become_investment: false,
    // Vehicle
    vehicle_type: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_value: '',
    vehicle_rego: '',
    // Bank account
    bank_name: '',
    account_type: '',
    account_number: '',
    account_balance: '',
    is_direct_debit: false,
    // KiwiSaver
    kiwisaver_provider: '',
    kiwisaver_member_number: '',
    kiwisaver_balance: '',
    kiwisaver_contribution_rate: '',
    // Investment
    investment_description: '',
    investment_value: '',
    // Other
    other_description: '',
    other_value: '',
  });

  const [assetForm, setAssetForm] = useState(emptyAssetForm());

  const emptyLiabilityForm = () => ({
    liability_type: 'Mortgage' as 'Mortgage' | 'Credit Card' | 'Personal Loan' | 'Vehicle Loan' | 'Student Loan' | 'Tax Debt' | 'Other',
    lender: '',
    account_number: '',
    original_limit: '',
    current_balance: '',
    interest_rate: '',
    repayment_amount: '',
    repayment_frequency: 'Monthly',
    repayment_type: '',
    loan_term_end_date: '',
    fixed_rate_expiry: '',
    mortgage_type: '',
    linked_asset_id: '',
    to_be_refinanced: false,
    to_be_paid_out: false,
    card_type: '',
  });

  const [liabilityForm, setLiabilityForm] = useState(emptyLiabilityForm());

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

  const expenseMonthlyFrom = (val: string, freq: string) => {
    const n = Number(val) || 0;
    switch (freq) {
      case 'Weekly':
        return (n * 52) / 12;
      case 'Fortnightly':
        return (n * 26) / 12;
      case 'Monthly':
        return n;
      case 'Annually':
        return n / 12;
      default:
        return n;
    }
  };

  const computeExpenseTotals = (f = expenseForm) => {
    const foodMonthly =
      expenseMonthlyFrom(f.food_groceries, f.food_freq) +
      expenseMonthlyFrom(f.dining_takeaway, f.food_freq) +
      expenseMonthlyFrom(f.alcohol_tobacco, f.food_freq);

    const discMonthly =
      expenseMonthlyFrom(f.entertainment, f.disc_freq) +
      expenseMonthlyFrom(f.holidays_travel, f.disc_freq) +
      expenseMonthlyFrom(f.clothing_personal, f.disc_freq) +
      expenseMonthlyFrom(f.grooming_beauty, f.disc_freq) +
      expenseMonthlyFrom(f.phone_internet, f.disc_freq) +
      expenseMonthlyFrom(f.streaming_subscriptions, f.disc_freq) +
      expenseMonthlyFrom(f.gifts_donations, f.disc_freq) +
      expenseMonthlyFrom(f.pets, f.disc_freq) +
      expenseMonthlyFrom(f.other_discretionary, f.disc_freq);

    const childrenMonthly =
      expenseMonthlyFrom(f.childcare, f.children_freq) +
      expenseMonthlyFrom(f.school_fees_public, f.children_freq) +
      expenseMonthlyFrom(f.school_fees_private, f.children_freq) +
      expenseMonthlyFrom(f.tertiary_education, f.children_freq);

    const healthMonthly =
      expenseMonthlyFrom(f.health_insurance, f.health_freq) +
      expenseMonthlyFrom(f.medical_dental, f.health_freq) +
      expenseMonthlyFrom(f.gym_sports, f.health_freq) +
      expenseMonthlyFrom(f.life_insurance, f.health_freq) +
      expenseMonthlyFrom(f.income_protection, f.health_freq);

    const transportMonthly =
      expenseMonthlyFrom(f.vehicle_running_costs, f.transport_freq) +
      expenseMonthlyFrom(f.vehicle_insurance, f.transport_freq) +
      expenseMonthlyFrom(f.public_transport, f.transport_freq);

    const housingMonthly =
      expenseMonthlyFrom(f.rates, f.housing_freq) +
      expenseMonthlyFrom(f.body_corporate, f.housing_freq) +
      expenseMonthlyFrom(f.home_insurance, f.housing_freq) +
      expenseMonthlyFrom(f.utilities, f.housing_freq) +
      expenseMonthlyFrom(f.rent_board, f.housing_freq) +
      expenseMonthlyFrom(f.property_maintenance, f.housing_freq);

    const commitmentsMonthly =
      expenseMonthlyFrom(f.child_support, f.commitments_freq) +
      expenseMonthlyFrom(f.spousal_maintenance, f.commitments_freq) +
      expenseMonthlyFrom(f.other_regular_commitments, f.commitments_freq);

    const totalEssential = housingMonthly + transportMonthly + healthMonthly;
    const totalDiscretionary = foodMonthly + discMonthly + childrenMonthly;
    const totalMonthly = totalEssential + totalDiscretionary + commitmentsMonthly;

    return { totalEssential, totalDiscretionary, totalMonthly };
  };

  const buildExpensePayload = (): Partial<Expense> => {
    const { totalEssential, totalDiscretionary, totalMonthly } = computeExpenseTotals();
    const f = expenseForm;
    const num = (v: string) => (v === '' ? null : Number(v) || 0);

    return {
      household_name: f.household_name.trim(),
      expense_frequency: 'monthly',
      food_groceries: num(f.food_groceries),
      dining_takeaway: num(f.dining_takeaway),
      alcohol_tobacco: num(f.alcohol_tobacco),
      entertainment: num(f.entertainment),
      holidays_travel: num(f.holidays_travel),
      clothing_personal: num(f.clothing_personal),
      grooming_beauty: num(f.grooming_beauty),
      phone_internet: num(f.phone_internet),
      streaming_subscriptions: num(f.streaming_subscriptions),
      gifts_donations: num(f.gifts_donations),
      pets: num(f.pets),
      other_discretionary: num(f.other_discretionary),
      childcare: num(f.childcare),
      school_fees_public: num(f.school_fees_public),
      school_fees_private: num(f.school_fees_private),
      tertiary_education: num(f.tertiary_education),
      health_insurance: num(f.health_insurance),
      medical_dental: num(f.medical_dental),
      gym_sports: num(f.gym_sports),
      life_insurance: num(f.life_insurance),
      income_protection: num(f.income_protection),
      vehicle_running_costs: num(f.vehicle_running_costs),
      vehicle_insurance: num(f.vehicle_insurance),
      public_transport: num(f.public_transport),
      rates: num(f.rates),
      body_corporate: num(f.body_corporate),
      home_insurance: num(f.home_insurance),
      utilities: num(f.utilities),
      rent_board: num(f.rent_board),
      property_maintenance: num(f.property_maintenance),
      child_support: num(f.child_support),
      spousal_maintenance: num(f.spousal_maintenance),
      other_regular_commitments: num(f.other_regular_commitments),
      total_essential: totalEssential,
      total_discretionary: totalDiscretionary,
      total_monthly: totalMonthly,
    } as Partial<Expense>;
  };

  const buildAssetPayload = (): Partial<Asset> => {
    const t = assetForm.asset_type;
    const payload: Partial<Asset> & Record<string, unknown> = {
      asset_type: t,
    };

    if (t === 'Property') {
      payload.property_address = assetForm.property_address || undefined;
      payload.property_suburb = assetForm.property_suburb || undefined;
      payload.property_city = assetForm.property_city || undefined;
      payload.property_region = assetForm.property_region || undefined;
      payload.property_postcode = assetForm.property_postcode || undefined;
      payload.property_type = assetForm.property_type || undefined;
      payload.zoning = assetForm.zoning || undefined;
      payload.property_value = assetForm.property_value ? Number(assetForm.property_value) || 0 : undefined;
      payload.valuation_type = assetForm.valuation_type || undefined;
      payload.valuation_date = assetForm.valuation_date || undefined;
      payload.monthly_rental_income = assetForm.monthly_rental_income
        ? Number(assetForm.monthly_rental_income) || 0
        : undefined;
      payload.to_be_sold = assetForm.to_be_sold;
      payload.will_become_investment = assetForm.will_become_investment;
    } else if (t === 'Vehicle') {
      payload.vehicle_type = assetForm.vehicle_type || undefined;
      payload.vehicle_make = assetForm.vehicle_make || undefined;
      payload.vehicle_model = assetForm.vehicle_model || undefined;
      payload.vehicle_year = assetForm.vehicle_year ? Number(assetForm.vehicle_year) || undefined : undefined;
      payload.vehicle_value = assetForm.vehicle_value ? Number(assetForm.vehicle_value) || 0 : undefined;
      payload.vehicle_rego = assetForm.vehicle_rego || undefined;
    } else if (t === 'Bank Account') {
      payload.bank_name = assetForm.bank_name || undefined;
      payload.account_type = assetForm.account_type || undefined;
      payload.account_number = assetForm.account_number || undefined;
      payload.account_balance = assetForm.account_balance ? Number(assetForm.account_balance) || 0 : undefined;
      payload.is_direct_debit = assetForm.is_direct_debit;
    } else if (t === 'KiwiSaver') {
      payload.kiwisaver_provider = assetForm.kiwisaver_provider || undefined;
      payload.kiwisaver_member_number = assetForm.kiwisaver_member_number || undefined;
      payload.kiwisaver_balance = assetForm.kiwisaver_balance ? Number(assetForm.kiwisaver_balance) || 0 : undefined;
      payload.kiwisaver_contribution_rate = assetForm.kiwisaver_contribution_rate
        ? Number(assetForm.kiwisaver_contribution_rate) || 0
        : undefined;
    } else if (t === 'Investment') {
      payload.investment_description = assetForm.investment_description || undefined;
      payload.investment_value = assetForm.investment_value ? Number(assetForm.investment_value) || 0 : undefined;
    } else if (t === 'Other') {
      payload.other_description = assetForm.other_description || undefined;
      payload.other_value = assetForm.other_value ? Number(assetForm.other_value) || 0 : undefined;
    }

    // Also populate generic numeric columns for easier reporting.
    if (t === 'Property' && payload.property_value != null) {
      payload.property_value = payload.property_value;
    } else if (t === 'Vehicle' && payload.vehicle_value != null) {
      payload.vehicle_value = payload.vehicle_value;
    } else if (t === 'Bank Account' && payload.account_balance != null) {
      payload.account_balance = payload.account_balance;
    } else if (t === 'KiwiSaver' && payload.kiwisaver_balance != null) {
      payload.kiwisaver_balance = payload.kiwisaver_balance;
    } else if ((t === 'Investment' || t === 'Other') && payload.other_value != null) {
      payload.estimated_value = payload.other_value as number;
    }

    return payload;
  };

  const liabilityMonthlyFrom = (amount: number, freq: string): number => {
    switch (freq) {
      case 'Weekly':
        return (amount * 52) / 12;
      case 'Fortnightly':
        return (amount * 26) / 12;
      case 'Monthly':
      default:
        return amount;
    }
  };

  const buildLiabilityPayload = (): Partial<Liability> => {
    const t = liabilityForm.liability_type;
    const payload: Partial<Liability> & Record<string, unknown> = {
      liability_type: t,
    };

    const num = (v: string) => (v === '' ? undefined : Number(v) || 0);

    payload.lender = liabilityForm.lender || undefined;
    payload.account_number = liabilityForm.account_number || undefined;
    payload.current_balance = num(liabilityForm.current_balance);

    if (t === 'Mortgage' || t === 'Personal Loan' || t === 'Vehicle Loan' || t === 'Student Loan' || t === 'Tax Debt' || t === 'Other') {
      payload.original_limit = num(liabilityForm.original_limit);
      payload.interest_rate = num(liabilityForm.interest_rate);
      payload.repayment_amount = num(liabilityForm.repayment_amount);
      payload.repayment_frequency = liabilityForm.repayment_frequency;
      payload.repayment_type = t === 'Mortgage' ? liabilityForm.repayment_type || undefined : undefined;
      payload.loan_term_end_date = liabilityForm.loan_term_end_date || undefined;
      if (t === 'Mortgage') {
        payload.fixed_rate_expiry = liabilityForm.fixed_rate_expiry || undefined;
        payload.mortgage_type = liabilityForm.mortgage_type || undefined;
        payload.linked_asset_id = liabilityForm.linked_asset_id || undefined;
      }
      if (t === 'Vehicle Loan') {
        payload.linked_asset_id = liabilityForm.linked_asset_id || undefined;
      }
    } else if (t === 'Credit Card') {
      payload.card_type = liabilityForm.card_type || undefined;
      payload.card_limit = num(liabilityForm.original_limit);
      payload.current_balance = num(liabilityForm.current_balance);
    }

    payload.to_be_paid_out = liabilityForm.to_be_paid_out;
    payload.to_be_refinanced = liabilityForm.to_be_refinanced;

    // Derived monthly repayment
    const repay = num(liabilityForm.repayment_amount) || 0;
    payload.monthly_repayment = liabilityMonthlyFrom(repay, liabilityForm.repayment_frequency);

    return payload;
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

  const handleSaveExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.household_name.trim()) {
      setExpenseFormError('Household name is required.');
      return;
    }
    setSubmittingExpense(true);
    setExpenseFormError(null);
    try {
      const payload = buildExpensePayload();
      if (editingExpense) {
        await applicationService.updateExpense(editingExpense.id, payload);
        setToastMessage('Household expenses updated');
      } else {
        await applicationService.createExpense(application.id, payload);
        setToastMessage('Household expenses added');
      }
      setShowExpensesModal(false);
      setEditingExpense(null);
      resetExpenseForm();
      const data = await applicationService.getExpenses(application.id);
      setExpenses(data || []);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : err instanceof Error
            ? err.message
            : 'Failed to save expenses.';
      setExpenseFormError(msg);
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this household expenses record?')) return;
    try {
      await applicationService.deleteExpense(id);
      const data = await applicationService.getExpenses(application.id);
      setExpenses(data || []);
      setToastMessage('Household expenses removed');
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to remove expenses');
    }
  };

  const handleSaveAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetForm.asset_type) {
      setAssetFormError('Asset type is required.');
      return;
    }
    setSubmittingAsset(true);
    setAssetFormError(null);
    try {
      const payload = buildAssetPayload();
      if (editingAsset) {
        await applicationService.updateAsset(editingAsset.id, payload);
        setToastMessage('Asset updated');
      } else {
        await applicationService.createAsset(application.id, payload);
        setToastMessage('Asset added');
      }
      setShowAssetModal(false);
      setEditingAsset(null);
      setAssetForm(emptyAssetForm());
      const data = await applicationService.getAssets(application.id);
      setAssets(data || []);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : err instanceof Error
            ? err.message
            : 'Failed to save asset.';
      setAssetFormError(msg);
    } finally {
      setSubmittingAsset(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this asset?')) return;
    try {
      await applicationService.deleteAsset(id);
      const data = await applicationService.getAssets(application.id);
      setAssets(data || []);
      setToastMessage('Asset removed');
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to remove asset');
    }
  };

  const handleSaveLiabilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liabilityForm.liability_type) {
      setLiabilityFormError('Liability type is required.');
      return;
    }
    setSubmittingLiability(true);
    setLiabilityFormError(null);
    try {
      const payload = buildLiabilityPayload();
      if (editingLiability) {
        await applicationService.updateLiability(editingLiability.id, payload);
        setToastMessage('Liability updated');
      } else {
        await applicationService.createLiability(application.id, payload);
        setToastMessage('Liability added');
      }
      setShowLiabilityModal(false);
      setEditingLiability(null);
      setLiabilityForm(emptyLiabilityForm());
      const data = await applicationService.getLiabilities(application.id);
      setLiabilities(data || []);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : err instanceof Error
            ? err.message
            : 'Failed to save liability.';
      setLiabilityFormError(msg);
    } finally {
      setSubmittingLiability(false);
    }
  };

  const handleDeleteLiability = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this liability?')) return;
    try {
      await applicationService.deleteLiability(id);
      const data = await applicationService.getLiabilities(application.id);
      setLiabilities(data || []);
      setToastMessage('Liability removed');
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to remove liability');
    }
  };

  const handleUploadDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please choose a file to upload.');
      return;
    }
    setUploadingDocument(true);
    setUploadError(null);
    try {
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
        setUploadError('Firm ID is missing. Please ensure the application and client are linked to a firm.');
        setUploadingDocument(false);
        return;
      }
      const doc = await applicationService.uploadDocument(
        application.id,
        clientId,
        firmId,
        uploadFile,
        uploadCategory
      );
      setDocuments((prev) => [doc, ...prev]);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadCategory('01 Fact Find');
      setToastMessage('Document uploaded');
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : err instanceof Error
            ? err.message
            : 'Failed to upload document.';
      setUploadError(msg);
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleDeleteDocument = async (id: string, url: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await applicationService.deleteDocument(id, url);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setToastMessage('Document deleted');
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to delete document');
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

  const renderExpensesTab = () => {
    if (expensesLoading) {
      return (
        <div className="flex justify-center items-center py-24">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Household Expenses</h3>
          <Button
            leftIcon="PlusCircle"
            type="button"
            onClick={() => {
              setEditingExpense(null);
              resetExpenseForm();
              setShowExpensesModal(true);
            }}
          >
            Add Household Expenses
          </Button>
        </div>

        {expenses.length === 0 ? (
          <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No household expenses yet. Click &quot;Add Household Expenses&quot; to get started.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {expenses.map((exp) => (
              <Card
                key={exp.id}
                className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {exp.household_name || 'Household'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Total monthly: ${Number(exp.total_monthly || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Pencil"
                      onClick={() => {
                        setEditingExpense(exp);
                        setExpenseForm(expenseToForm(exp));
                        setExpenseFormError(null);
                        setShowExpensesModal(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Trash2"
                      onClick={() => handleDeleteExpense(exp.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {showExpensesModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingExpense ? 'Edit Household Expenses' : 'Add Household Expenses'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowExpensesModal(false);
                    setEditingExpense(null);
                    resetExpenseForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveExpenseSubmit} className="flex flex-col min-h-0">
                <div className="overflow-y-auto p-4 flex-1">
                  {expenseFormError && (
                    <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md mb-4">
                      {expenseFormError}
                    </p>
                  )}

                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Household Name
                    </label>
                    <input
                      type="text"
                      value={expenseForm.household_name}
                      onChange={(e) => setExpenseForm((f) => ({ ...f, household_name: e.target.value }))}
                      className={inputClasses}
                      placeholder="e.g. Household of Mr BS SS"
                      required
                    />
                  </div>

                  <FormSection title="Food &amp; Groceries">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Food &amp; Groceries
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.food_groceries}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, food_groceries: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Dining &amp; Takeaway
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.dining_takeaway}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, dining_takeaway: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Alcohol &amp; Tobacco
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.alcohol_tobacco}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, alcohol_tobacco: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Frequency
                      </label>
                      <select
                        value={expenseForm.food_freq}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, food_freq: e.target.value }))}
                        className={inputClasses}
                      >
                        {EXPENSE_FREQUENCIES.map((fq) => (
                          <option key={fq} value={fq}>
                            {fq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormSection>

                  <FormSection title="Discretionary">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Entertainment
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.entertainment}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, entertainment: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Holidays &amp; Travel
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.holidays_travel}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, holidays_travel: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Clothing &amp; Personal
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.clothing_personal}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, clothing_personal: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Grooming &amp; Beauty
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.grooming_beauty}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, grooming_beauty: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Phone &amp; Internet
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.phone_internet}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, phone_internet: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Streaming &amp; Subscriptions
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.streaming_subscriptions}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, streaming_subscriptions: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Gifts &amp; Donations
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.gifts_donations}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, gifts_donations: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Pets
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.pets}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, pets: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Other Discretionary
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.other_discretionary}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, other_discretionary: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Frequency
                      </label>
                      <select
                        value={expenseForm.disc_freq}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, disc_freq: e.target.value }))}
                        className={inputClasses}
                      >
                        {EXPENSE_FREQUENCIES.map((fq) => (
                          <option key={fq} value={fq}>
                            {fq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormSection>

                  <FormSection title="Children &amp; Education">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Childcare
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.childcare}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, childcare: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        School Fees — Public
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.school_fees_public}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, school_fees_public: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        School Fees — Private
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.school_fees_private}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, school_fees_private: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Tertiary Education
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.tertiary_education}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, tertiary_education: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Frequency
                      </label>
                      <select
                        value={expenseForm.children_freq}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, children_freq: e.target.value }))}
                        className={inputClasses}
                      >
                        {EXPENSE_FREQUENCIES.map((fq) => (
                          <option key={fq} value={fq}>
                            {fq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormSection>

                  <FormSection title="Health &amp; Wellness">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Health Insurance
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.health_insurance}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, health_insurance: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Medical &amp; Dental
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.medical_dental}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, medical_dental: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Gym &amp; Sports
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.gym_sports}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, gym_sports: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Life Insurance
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.life_insurance}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, life_insurance: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Income Protection
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.income_protection}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, income_protection: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Frequency
                      </label>
                      <select
                        value={expenseForm.health_freq}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, health_freq: e.target.value }))}
                        className={inputClasses}
                      >
                        {EXPENSE_FREQUENCIES.map((fq) => (
                          <option key={fq} value={fq}>
                            {fq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormSection>

                  <FormSection title="Transport">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Vehicle Running Costs
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.vehicle_running_costs}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, vehicle_running_costs: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Vehicle Insurance
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.vehicle_insurance}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, vehicle_insurance: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Public Transport
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.public_transport}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, public_transport: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Frequency
                      </label>
                      <select
                        value={expenseForm.transport_freq}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, transport_freq: e.target.value }))}
                        className={inputClasses}
                      >
                        {EXPENSE_FREQUENCIES.map((fq) => (
                          <option key={fq} value={fq}>
                            {fq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormSection>

                  <FormSection title="Property &amp; Housing">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Rates
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.rates}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, rates: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Body Corporate
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.body_corporate}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, body_corporate: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Home Insurance
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.home_insurance}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, home_insurance: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Utilities
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.utilities}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, utilities: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Rent &amp; Board
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.rent_board}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, rent_board: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Property Maintenance
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.property_maintenance}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, property_maintenance: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Frequency
                      </label>
                      <select
                        value={expenseForm.housing_freq}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, housing_freq: e.target.value }))}
                        className={inputClasses}
                      >
                        {EXPENSE_FREQUENCIES.map((fq) => (
                          <option key={fq} value={fq}>
                            {fq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormSection>

                  <FormSection title="Other Commitments">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Child Support
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.child_support}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, child_support: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Spousal Maintenance
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.spousal_maintenance}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, spousal_maintenance: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Other Regular Commitments
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={expenseForm.other_regular_commitments}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, other_regular_commitments: e.target.value }))}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Frequency
                      </label>
                      <select
                        value={expenseForm.commitments_freq}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, commitments_freq: e.target.value }))}
                        className={inputClasses}
                      >
                        {EXPENSE_FREQUENCIES.map((fq) => (
                          <option key={fq} value={fq}>
                            {fq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormSection>

                  {(() => {
                    const { totalEssential, totalDiscretionary, totalMonthly } = computeExpenseTotals();
                    return (
                      <div className="mt-4 space-y-1 text-sm">
                        <p className="font-medium text-gray-900 dark:text-white">
                          Total Essential (housing + transport + health): ${totalEssential.toLocaleString()}
                        </p>
                        <p className="font-medium text-gray-900 dark:text-white">
                          Total Discretionary (food + discretionary + children): $
                          {totalDiscretionary.toLocaleString()}
                        </p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          Total Monthly: ${totalMonthly.toLocaleString()}
                        </p>
                      </div>
                    );
                  })()}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowExpensesModal(false);
                      setEditingExpense(null);
                      resetExpenseForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={submittingExpense}>
                    {editingExpense ? 'Save changes' : 'Add Household Expenses'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const getAssetIcon = (type: string): IconName => {
    switch (type) {
      case 'Property':
        return 'Home';
      case 'Vehicle':
        return 'Car' as IconName; // fallback if not present will be handled by Icon
      case 'Bank Account':
        return 'Banknote';
      case 'KiwiSaver':
        return 'PiggyBank';
      case 'Investment':
        return 'DollarSign';
      default:
        return 'Wallet';
    }
  };

  const getAssetDisplayValue = (a: Asset): number => {
    if (a.asset_type === 'Property' && a.property_value != null) return Number(a.property_value);
    if (a.asset_type === 'Vehicle' && a.vehicle_value != null) return Number(a.vehicle_value);
    if (a.asset_type === 'Bank Account' && a.account_balance != null) return Number(a.account_balance);
    if (a.asset_type === 'KiwiSaver' && a.kiwisaver_balance != null) return Number(a.kiwisaver_balance);
    if (a.asset_type === 'Investment' && (a as any).investment_value != null) return Number((a as any).investment_value);
    if (a.asset_type === 'Other' && (a as any).other_value != null) return Number((a as any).other_value);
    if (a.estimated_value != null) return Number(a.estimated_value);
    return 0;
  };

  const assetToForm = (a: Asset) => ({
    ...emptyAssetForm(),
    asset_type: (a.asset_type as any) || 'Property',
    property_address: (a as any).property_address || '',
    property_suburb: (a as any).property_suburb || '',
    property_city: (a as any).property_city || '',
    property_region: (a as any).property_region || '',
    property_postcode: (a as any).property_postcode || '',
    property_type: (a as any).property_type || '',
    zoning: (a as any).zoning || '',
    property_value: (a as any).property_value != null ? String((a as any).property_value) : '',
    valuation_type: (a as any).valuation_type || '',
    valuation_date: (a as any).valuation_date || '',
    monthly_rental_income: (a as any).monthly_rental_income != null ? String((a as any).monthly_rental_income) : '',
    to_be_sold: Boolean((a as any).to_be_sold),
    will_become_investment: Boolean((a as any).will_become_investment),
    vehicle_type: (a as any).vehicle_type || '',
    vehicle_make: (a as any).vehicle_make || '',
    vehicle_model: (a as any).vehicle_model || '',
    vehicle_year: (a as any).vehicle_year != null ? String((a as any).vehicle_year) : '',
    vehicle_value: (a as any).vehicle_value != null ? String((a as any).vehicle_value) : '',
    vehicle_rego: (a as any).vehicle_rego || '',
    bank_name: (a as any).bank_name || '',
    account_type: (a as any).account_type || '',
    account_number: (a as any).account_number || '',
    account_balance: (a as any).account_balance != null ? String((a as any).account_balance) : '',
    is_direct_debit: Boolean((a as any).is_direct_debit),
    kiwisaver_provider: (a as any).kiwisaver_provider || '',
    kiwisaver_member_number: (a as any).kiwisaver_member_number || '',
    kiwisaver_balance: (a as any).kiwisaver_balance != null ? String((a as any).kiwisaver_balance) : '',
    kiwisaver_contribution_rate:
      (a as any).kiwisaver_contribution_rate != null ? String((a as any).kiwisaver_contribution_rate) : '',
    investment_description: (a as any).investment_description || '',
    investment_value: (a as any).investment_value != null ? String((a as any).investment_value) : '',
    other_description: (a as any).other_description || '',
    other_value: (a as any).other_value != null ? String((a as any).other_value) : '',
  });

  const renderAssetsTab = () => {
    if (assetsLoading) {
      return (
        <div className="flex justify-center items-center py-24">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
        </div>
      );
    }

    const totalAssets = assets.reduce((sum, a) => sum + getAssetDisplayValue(a), 0);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Assets</h3>
          <Button
            leftIcon="PlusCircle"
            type="button"
            onClick={() => {
              setEditingAsset(null);
              setAssetForm(emptyAssetForm());
              setAssetFormError(null);
              setShowAssetModal(true);
            }}
          >
            Add Asset
          </Button>
        </div>

        {assets.length === 0 ? (
          <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">No assets recorded yet. Click &quot;Add Asset&quot; to add one.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assets.map((asset) => (
              <Card
                key={asset.id}
                className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-primary-50 dark:bg-primary-900/30 p-2">
                      <Icon name={getAssetIcon(asset.asset_type)} className="h-4 w-4 text-primary-600 dark:text-primary-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {asset.asset_type || 'Asset'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        ${getAssetDisplayValue(asset).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Pencil"
                      onClick={() => {
                        setEditingAsset(asset);
                        setAssetForm(assetToForm(asset));
                        setAssetFormError(null);
                        setShowAssetModal(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Trash2"
                      onClick={() => handleDeleteAsset(asset.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Total Assets</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Sum of all recorded asset values.
              </p>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              ${totalAssets.toLocaleString()}
            </p>
          </div>
        </Card>

        {showAssetModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingAsset ? 'Edit Asset' : 'Add Asset'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAssetModal(false);
                    setEditingAsset(null);
                    setAssetForm(emptyAssetForm());
                    setAssetFormError(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveAssetSubmit} className="flex flex-col min-h-0">
                <div className="overflow-y-auto p-4 flex-1 space-y-4">
                  {assetFormError && (
                    <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                      {assetFormError}
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Asset Type
                    </label>
                    <select
                      value={assetForm.asset_type}
                      onChange={(e) =>
                        setAssetForm((f) => ({ ...f, asset_type: e.target.value as typeof f.asset_type }))
                      }
                      className={inputClasses}
                    >
                      <option value="Property">Property</option>
                      <option value="Vehicle">Vehicle</option>
                      <option value="Bank Account">Bank Account</option>
                      <option value="KiwiSaver">KiwiSaver</option>
                      <option value="Investment">Investment</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {assetForm.asset_type === 'Property' && (
                    <FormSection title="Property Details">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Property Address
                        </label>
                        <input
                          type="text"
                          value={assetForm.property_address}
                          onChange={(e) => setAssetForm((f) => ({ ...f, property_address: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Suburb
                        </label>
                        <input
                          type="text"
                          value={assetForm.property_suburb}
                          onChange={(e) => setAssetForm((f) => ({ ...f, property_suburb: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={assetForm.property_city}
                          onChange={(e) => setAssetForm((f) => ({ ...f, property_city: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Region
                        </label>
                        <input
                          type="text"
                          value={assetForm.property_region}
                          onChange={(e) => setAssetForm((f) => ({ ...f, property_region: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Postcode
                        </label>
                        <input
                          type="text"
                          value={assetForm.property_postcode}
                          onChange={(e) => setAssetForm((f) => ({ ...f, property_postcode: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Property Type
                        </label>
                        <select
                          value={assetForm.property_type}
                          onChange={(e) => setAssetForm((f) => ({ ...f, property_type: e.target.value }))}
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          <option>House and Land</option>
                          <option>Apartment/Unit/Flat</option>
                          <option>Townhouse</option>
                          <option>Section/Land</option>
                          <option>Commercial</option>
                          <option>Rural</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Zoning
                        </label>
                        <select
                          value={assetForm.zoning}
                          onChange={(e) => setAssetForm((f) => ({ ...f, zoning: e.target.value }))}
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          <option>Residential</option>
                          <option>Investment</option>
                          <option>Commercial</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Property Value
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={assetForm.property_value}
                          onChange={(e) => setAssetForm((f) => ({ ...f, property_value: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Valuation Type
                        </label>
                        <select
                          value={assetForm.valuation_type}
                          onChange={(e) => setAssetForm((f) => ({ ...f, valuation_type: e.target.value }))}
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          <option>Applicant Estimate</option>
                          <option>Registered Valuation</option>
                          <option>CV/RV</option>
                          <option>CoreLogic</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Valuation Date
                        </label>
                        <input
                          type="date"
                          value={assetForm.valuation_date}
                          onChange={(e) => setAssetForm((f) => ({ ...f, valuation_date: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      {assetForm.zoning === 'Investment' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Monthly Rental Income
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={assetForm.monthly_rental_income}
                            onChange={(e) =>
                              setAssetForm((f) => ({ ...f, monthly_rental_income: e.target.value }))
                            }
                            className={inputClasses}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="to_be_sold"
                          checked={assetForm.to_be_sold}
                          onChange={(e) =>
                            setAssetForm((f) => ({ ...f, to_be_sold: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label htmlFor="to_be_sold" className="text-sm text-gray-700 dark:text-gray-300">
                          To Be Sold
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="will_become_investment"
                          checked={assetForm.will_become_investment}
                          onChange={(e) =>
                            setAssetForm((f) => ({ ...f, will_become_investment: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label
                          htmlFor="will_become_investment"
                          className="text-sm text-gray-700 dark:text-gray-300"
                        >
                          Will Become Investment After Settlement
                        </label>
                      </div>
                    </FormSection>
                  )}

                  {assetForm.asset_type === 'Vehicle' && (
                    <FormSection title="Vehicle Details">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Vehicle Type
                        </label>
                        <select
                          value={assetForm.vehicle_type}
                          onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_type: e.target.value }))}
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          <option>Car</option>
                          <option>Motorbike</option>
                          <option>Boat</option>
                          <option>Caravan</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Vehicle Make
                        </label>
                        <input
                          type="text"
                          value={assetForm.vehicle_make}
                          onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_make: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Vehicle Model
                        </label>
                        <input
                          type="text"
                          value={assetForm.vehicle_model}
                          onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_model: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Vehicle Year
                        </label>
                        <input
                          type="number"
                          min={1900}
                          max={2100}
                          value={assetForm.vehicle_year}
                          onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_year: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Vehicle Value
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={assetForm.vehicle_value}
                          onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_value: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Vehicle Rego
                        </label>
                        <input
                          type="text"
                          value={assetForm.vehicle_rego}
                          onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_rego: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                    </FormSection>
                  )}

                  {assetForm.asset_type === 'Bank Account' && (
                    <FormSection title="Bank Account">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={assetForm.bank_name}
                          onChange={(e) => setAssetForm((f) => ({ ...f, bank_name: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Account Type
                        </label>
                        <select
                          value={assetForm.account_type}
                          onChange={(e) => setAssetForm((f) => ({ ...f, account_type: e.target.value }))}
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          <option>Transaction</option>
                          <option>Savings</option>
                          <option>Term Deposit</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Account Number
                        </label>
                        <input
                          type="text"
                          value={assetForm.account_number}
                          onChange={(e) => setAssetForm((f) => ({ ...f, account_number: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Account Balance
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={assetForm.account_balance}
                          onChange={(e) => setAssetForm((f) => ({ ...f, account_balance: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="is_direct_debit"
                          checked={assetForm.is_direct_debit}
                          onChange={(e) =>
                            setAssetForm((f) => ({ ...f, is_direct_debit: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label htmlFor="is_direct_debit" className="text-sm text-gray-700 dark:text-gray-300">
                          Is Direct Debit
                        </label>
                      </div>
                    </FormSection>
                  )}

                  {assetForm.asset_type === 'KiwiSaver' && (
                    <FormSection title="KiwiSaver">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          KiwiSaver Provider
                        </label>
                        <input
                          type="text"
                          value={assetForm.kiwisaver_provider}
                          onChange={(e) => setAssetForm((f) => ({ ...f, kiwisaver_provider: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Member Number
                        </label>
                        <input
                          type="text"
                          value={assetForm.kiwisaver_member_number}
                          onChange={(e) =>
                            setAssetForm((f) => ({ ...f, kiwisaver_member_number: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Balance
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={assetForm.kiwisaver_balance}
                          onChange={(e) => setAssetForm((f) => ({ ...f, kiwisaver_balance: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Contribution Rate (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={assetForm.kiwisaver_contribution_rate}
                          onChange={(e) =>
                            setAssetForm((f) => ({ ...f, kiwisaver_contribution_rate: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                    </FormSection>
                  )}

                  {assetForm.asset_type === 'Investment' && (
                    <FormSection title="Investment">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Investment Description
                        </label>
                        <input
                          type="text"
                          value={assetForm.investment_description}
                          onChange={(e) =>
                            setAssetForm((f) => ({ ...f, investment_description: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Investment Value
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={assetForm.investment_value}
                          onChange={(e) => setAssetForm((f) => ({ ...f, investment_value: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                    </FormSection>
                  )}

                  {assetForm.asset_type === 'Other' && (
                    <FormSection title="Other Asset">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={assetForm.other_description}
                          onChange={(e) =>
                            setAssetForm((f) => ({ ...f, other_description: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Value
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={assetForm.other_value}
                          onChange={(e) => setAssetForm((f) => ({ ...f, other_value: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                    </FormSection>
                  )}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowAssetModal(false);
                      setEditingAsset(null);
                      setAssetForm(emptyAssetForm());
                      setAssetFormError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={submittingAsset}>
                    {editingAsset ? 'Save changes' : 'Add Asset'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const getLiabilityIcon = (type: string): IconName => {
    switch (type) {
      case 'Mortgage':
        return 'Landmark';
      case 'Credit Card':
        return 'CreditCard';
      case 'Vehicle Loan':
        return 'Car' as IconName;
      case 'Student Loan':
        return 'BookKey';
      case 'Tax Debt':
        return 'Scale';
      case 'Personal Loan':
      case 'Other':
      default:
        return 'DollarSign';
    }
  };

  const getLiabilityMonthlyRepayment = (l: Liability): number => {
    const amt = Number((l as any).repayment_amount) || 0;
    const freq = ((l as any).repayment_frequency as string) || 'Monthly';
    return liabilityMonthlyFrom(amt, freq);
  };

  const liabilityToForm = (l: Liability) => ({
    ...emptyLiabilityForm(),
    liability_type: (l.liability_type as any) || 'Mortgage',
    lender: (l.lender as string) || '',
    account_number: (l as any).account_number || '',
    original_limit: (l as any).original_limit != null ? String((l as any).original_limit) : '',
    current_balance: (l.current_balance != null ? String(l.current_balance) : '') || '',
    interest_rate: (l as any).interest_rate != null ? String((l as any).interest_rate) : '',
    repayment_amount: (l as any).repayment_amount != null ? String((l as any).repayment_amount) : '',
    repayment_frequency: ((l as any).repayment_frequency as string) || 'Monthly',
    repayment_type: (l as any).repayment_type || '',
    loan_term_end_date: (l as any).loan_term_end_date || '',
    fixed_rate_expiry: (l as any).fixed_rate_expiry || '',
    mortgage_type: (l as any).mortgage_type || '',
    linked_asset_id: (l as any).linked_asset_id || '',
    to_be_refinanced: Boolean((l as any).to_be_refinanced),
    to_be_paid_out: Boolean((l as any).to_be_paid_out),
    card_type: (l as any).card_type || '',
  });

  const renderLiabilitiesTab = () => {
    if (liabilitiesLoading) {
      return (
        <div className="flex justify-center items-center py-24">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
        </div>
      );
    }

    const totalBalance = liabilities.reduce((sum, l) => sum + (Number((l.current_balance as number) || 0)), 0);
    const totalMonthly = liabilities.reduce((sum, l) => sum + getLiabilityMonthlyRepayment(l), 0);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Liabilities</h3>
          <Button
            leftIcon="PlusCircle"
            type="button"
            onClick={() => {
              setEditingLiability(null);
              setLiabilityForm(emptyLiabilityForm());
              setLiabilityFormError(null);
              setShowLiabilityModal(true);
            }}
          >
            Add Liability
          </Button>
        </div>

        {liabilities.length === 0 ? (
          <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No liabilities recorded yet. Click &quot;Add Liability&quot; to add one.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liabilities.map((l) => (
              <Card
                key={l.id}
                className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-primary-50 dark:bg-primary-900/30 p-2">
                      <Icon
                        name={getLiabilityIcon(l.liability_type)}
                        className="h-4 w-4 text-primary-600 dark:text-primary-300"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {l.liability_type || 'Liability'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {l.lender || '—'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Balance: ${Number((l.current_balance as number) || 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Monthly repayment: ${getLiabilityMonthlyRepayment(l).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Pencil"
                      onClick={() => {
                        setEditingLiability(l);
                        setLiabilityForm(liabilityToForm(l));
                        setLiabilityFormError(null);
                        setShowLiabilityModal(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon="Trash2"
                      onClick={() => handleDeleteLiability(l.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Total Liabilities</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Total balance and monthly repayments across all liabilities.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Balance</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                ${totalBalance.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Monthly Repayments</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                ${totalMonthly.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        {showLiabilityModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingLiability ? 'Edit Liability' : 'Add Liability'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowLiabilityModal(false);
                    setEditingLiability(null);
                    setLiabilityForm(emptyLiabilityForm());
                    setLiabilityFormError(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveLiabilitySubmit} className="flex flex-col min-h-0">
                <div className="overflow-y-auto p-4 flex-1 space-y-4">
                  {liabilityFormError && (
                    <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                      {liabilityFormError}
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Liability Type
                    </label>
                    <select
                      value={liabilityForm.liability_type}
                      onChange={(e) =>
                        setLiabilityForm((f) => ({ ...f, liability_type: e.target.value as typeof f.liability_type }))
                      }
                      className={inputClasses}
                    >
                      <option value="Mortgage">Mortgage</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Personal Loan">Personal Loan</option>
                      <option value="Vehicle Loan">Vehicle Loan</option>
                      <option value="Student Loan">Student Loan</option>
                      <option value="Tax Debt">Tax Debt</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {liabilityForm.liability_type === 'Mortgage' && (
                    <FormSection title="Mortgage Details">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Lender
                        </label>
                        <input
                          type="text"
                          value={liabilityForm.lender}
                          onChange={(e) => setLiabilityForm((f) => ({ ...f, lender: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Account Number
                        </label>
                        <input
                          type="text"
                          value={liabilityForm.account_number}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, account_number: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Original Limit
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={liabilityForm.original_limit}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, original_limit: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Current Balance
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={liabilityForm.current_balance}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, current_balance: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Interest Rate (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={liabilityForm.interest_rate}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, interest_rate: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Repayment Amount
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={liabilityForm.repayment_amount}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, repayment_amount: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Repayment Frequency
                        </label>
                        <select
                          value={liabilityForm.repayment_frequency}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, repayment_frequency: e.target.value }))
                          }
                          className={inputClasses}
                        >
                          {FREQUENCIES.filter((f) => f !== 'Annually').map((fq) => (
                            <option key={fq} value={fq}>
                              {fq}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Repayment Type
                        </label>
                        <select
                          value={liabilityForm.repayment_type}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, repayment_type: e.target.value }))
                          }
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          <option>Principal &amp; Interest</option>
                          <option>Interest Only</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Loan Term End Date
                        </label>
                        <input
                          type="date"
                          value={liabilityForm.loan_term_end_date}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, loan_term_end_date: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Fixed Rate Expiry
                        </label>
                        <input
                          type="date"
                          value={liabilityForm.fixed_rate_expiry}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, fixed_rate_expiry: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Mortgage Type
                        </label>
                        <select
                          value={liabilityForm.mortgage_type}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, mortgage_type: e.target.value }))
                          }
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          <option>Owner Occupied</option>
                          <option>Investment</option>
                          <option>Construction</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Linked Asset
                        </label>
                        <select
                          value={liabilityForm.linked_asset_id}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, linked_asset_id: e.target.value }))
                          }
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          {assets
                            .filter((a) => a.asset_type === 'Property')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {(a as any).property_address || 'Property'}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="mortgage_to_be_refinanced"
                          checked={liabilityForm.to_be_refinanced}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, to_be_refinanced: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label
                          htmlFor="mortgage_to_be_refinanced"
                          className="text-sm text-gray-700 dark:text-gray-300"
                        >
                          To Be Refinanced
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="mortgage_to_be_paid_out"
                          checked={liabilityForm.to_be_paid_out}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, to_be_paid_out: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label
                          htmlFor="mortgage_to_be_paid_out"
                          className="text-sm text-gray-700 dark:text-gray-300"
                        >
                          To Be Paid Out
                        </label>
                      </div>
                    </FormSection>
                  )}

                  {liabilityForm.liability_type === 'Credit Card' && (
                    <FormSection title="Credit Card">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Lender
                        </label>
                        <input
                          type="text"
                          value={liabilityForm.lender}
                          onChange={(e) => setLiabilityForm((f) => ({ ...f, lender: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Card Type
                        </label>
                        <select
                          value={liabilityForm.card_type}
                          onChange={(e) => setLiabilityForm((f) => ({ ...f, card_type: e.target.value }))}
                          className={inputClasses}
                        >
                          <option value="">—</option>
                          <option>Visa</option>
                          <option>Mastercard</option>
                          <option>Amex</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Account Number
                        </label>
                        <input
                          type="text"
                          value={liabilityForm.account_number}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, account_number: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Card Limit
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={liabilityForm.original_limit}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, original_limit: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Current Balance
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={liabilityForm.current_balance}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, current_balance: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="cc_to_be_paid_out"
                          checked={liabilityForm.to_be_paid_out}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, to_be_paid_out: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label
                          htmlFor="cc_to_be_paid_out"
                          className="text-sm text-gray-700 dark:text-gray-300"
                        >
                          To Be Paid Out
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="cc_to_be_refinanced"
                          checked={liabilityForm.to_be_refinanced}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, to_be_refinanced: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label
                          htmlFor="cc_to_be_refinanced"
                          className="text-sm text-gray-700 dark:text-gray-300"
                        >
                          To Be Refinanced
                        </label>
                      </div>
                    </FormSection>
                  )}

                  {(liabilityForm.liability_type === 'Personal Loan' ||
                    liabilityForm.liability_type === 'Vehicle Loan' ||
                    liabilityForm.liability_type === 'Student Loan' ||
                    liabilityForm.liability_type === 'Tax Debt' ||
                    liabilityForm.liability_type === 'Other') && (
                    <FormSection title="Loan Details">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Lender
                        </label>
                        <input
                          type="text"
                          value={liabilityForm.lender}
                          onChange={(e) => setLiabilityForm((f) => ({ ...f, lender: e.target.value }))}
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Account Number
                        </label>
                        <input
                          type="text"
                          value={liabilityForm.account_number}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, account_number: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Original Limit
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={liabilityForm.original_limit}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, original_limit: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Current Balance
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={liabilityForm.current_balance}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, current_balance: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Interest Rate (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={liabilityForm.interest_rate}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, interest_rate: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Repayment Amount
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={liabilityForm.repayment_amount}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, repayment_amount: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Repayment Frequency
                        </label>
                        <select
                          value={liabilityForm.repayment_frequency}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, repayment_frequency: e.target.value }))
                          }
                          className={inputClasses}
                        >
                          {FREQUENCIES.filter((f) => f !== 'Annually').map((fq) => (
                            <option key={fq} value={fq}>
                              {fq}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Loan Term End Date
                        </label>
                        <input
                          type="date"
                          value={liabilityForm.loan_term_end_date}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, loan_term_end_date: e.target.value }))
                          }
                          className={inputClasses}
                        />
                      </div>
                      {liabilityForm.liability_type === 'Vehicle Loan' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Linked Asset
                          </label>
                          <select
                            value={liabilityForm.linked_asset_id}
                            onChange={(e) =>
                              setLiabilityForm((f) => ({ ...f, linked_asset_id: e.target.value }))
                            }
                            className={inputClasses}
                          >
                            <option value="">—</option>
                            {assets
                              .filter((a) => a.asset_type === 'Vehicle')
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {(a as any).vehicle_make || 'Vehicle'}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="loan_to_be_paid_out"
                          checked={liabilityForm.to_be_paid_out}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, to_be_paid_out: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label
                          htmlFor="loan_to_be_paid_out"
                          className="text-sm text-gray-700 dark:text-gray-300"
                        >
                          To Be Paid Out
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="loan_to_be_refinanced"
                          checked={liabilityForm.to_be_refinanced}
                          onChange={(e) =>
                            setLiabilityForm((f) => ({ ...f, to_be_refinanced: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label
                          htmlFor="loan_to_be_refinanced"
                          className="text-sm text-gray-700 dark:text-gray-300"
                        >
                          To Be Refinanced
                        </label>
                      </div>
                    </FormSection>
                  )}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowLiabilityModal(false);
                      setEditingLiability(null);
                      setLiabilityForm(emptyLiabilityForm());
                      setLiabilityFormError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={submittingLiability}>
                    {editingLiability ? 'Save changes' : 'Add Liability'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const DOCUMENT_CATEGORIES_APP = [
    '01 Fact Find',
    '02 Financial Evidence',
    '03 Property Documents',
    '04 Lender Application',
    '05 Compliance',
    '06 Insurance',
    '07 Settlement',
    '08 Ongoing Reviews',
    'ID',
    'Financial',
    'Other',
  ] as const;

  const renderDocumentsTab = () => {
    if (documentsLoading) {
      return (
        <div className="flex justify-center items-center py-24">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
        </div>
      );
    }

    const totalDocuments = documents.length;
    const byCategory: Record<string, number> = {};
    documents.forEach((d: { category?: string }) => {
      const cat = d.category || 'Uncategorised';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    const grouped: Record<string, { id: string; name?: string; category?: string; upload_date?: string; uploadDate?: string; status?: string; url?: string }[]> = {};
    documents.forEach((d) => {
      const cat = d.category || 'Uncategorised';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(d);
    });

    const statusClasses = (status: string | null | undefined) => {
      switch (status) {
        case 'Expiring Soon':
          return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
        case 'Expired':
          return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
        case 'Valid':
        default:
          return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Documents</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Total: {totalDocuments} document{totalDocuments === 1 ? '' : 's'}
              {Object.keys(byCategory).length > 0 &&
                ` · ${Object.entries(byCategory)
                  .map(([cat, count]) => `${cat}: ${count}`)
                  .join(', ')}`}
            </p>
          </div>
          <Button
            leftIcon="Upload"
            type="button"
            onClick={() => {
              setShowUploadModal(true);
              setUploadError(null);
            }}
          >
            Upload Document
          </Button>
        </div>

        {totalDocuments === 0 ? (
          <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No documents uploaded yet. Click &quot;Upload Document&quot; to add one.
            </p>
          </Card>
        ) : (
          Object.keys(grouped)
            .sort()
            .map((category) => (
              <Card
                key={category}
                className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{category}</h4>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {grouped[category].length} document{grouped[category].length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {grouped[category].map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between px-4 py-3 text-sm bg-white dark:bg-gray-800 last:rounded-b-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Icon name="FileText" className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{doc.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Uploaded {doc.upload_date || doc.uploadDate || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClasses(doc.status)}`}
                        >
                          {doc.status || 'Valid'}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          leftIcon="Trash2"
                          onClick={() => handleDeleteDocument(doc.id, doc.url || '')}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))
        )}

        {showUploadModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Upload Document</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadFile(null);
                    setUploadError(null);
                    setUploadCategory('01 Fact Find');
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleUploadDocumentSubmit} className="flex flex-col min-h-0">
                <div className="overflow-y-auto p-4 flex-1 space-y-4">
                  {uploadError && (
                    <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                      {uploadError}
                    </p>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">File</label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.docx,.csv,.xlsx"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/30 dark:file:text-primary-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Category</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className={inputClasses}
                    >
                      {DOCUMENT_CATEGORIES_APP.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadFile(null);
                      setUploadError(null);
                      setUploadCategory('01 Fact Find');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={uploadingDocument}>
                    Upload
                  </Button>
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
        return renderExpensesTab();
      case 'assets':
        return renderAssetsTab();
      case 'liabilities':
        return renderLiabilitiesTab();
      case 'documents':
        return renderDocumentsTab();
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
