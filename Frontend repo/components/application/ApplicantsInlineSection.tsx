import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import type { Application, Client } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Card } from '../common/Card';
import { applicationService, type Applicant, type Company } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const inputClasses =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr'] as const;
const GENDERS = ['Male', 'Female', 'Other'] as const;
const APPLICANT_TYPES = ['primary', 'secondary', 'guarantor'] as const;
const ENTITY_TYPES = ['Pty Ltd', 'Ltd', 'Trust', 'Partnership', 'Sole Trader', 'Other'] as const;
const PREFERRED_CONTACT = ['Phone', 'Email'] as const;
const RESIDENTIAL_STATUSES = ['Own Home - Mortgage', 'Own Home - No Mortgage', 'Renting', 'Boarding', 'Living with Parents'] as const;
const RESIDENCY_STATUSES = ['NZ Citizen', 'NZ Permanent Resident', 'NZ Resident', 'Australian Citizen', 'Work Visa', 'Student Visa', 'Other'] as const;
const MARITAL_STATUSES = ['Single', 'Married', 'De Facto', 'Separated', 'Divorced', 'Widowed'] as const;

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-6">
    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-600">{title}</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

interface ApplicantsInlineSectionProps {
  application: Application;
  client: Client;
  currentUser: { id?: string } | null;
  onUpdate: () => void;
}

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

/** Returns a short label for applicant_type (Primary / Secondary / Guarantor). */
function applicantRoleLabel(t: string | undefined): string {
  const x = (t || 'primary').toLowerCase();
  if (x === 'primary') return 'Primary';
  if (x === 'secondary') return 'Secondary';
  if (x === 'guarantor') return 'Guarantor';
  return (t || 'primary').charAt(0).toUpperCase() + (t || 'primary').slice(1);
}

/** Full display name for a personal applicant row. */
function applicantListName(a: Applicant): string {
  return [a.title, a.first_name, a.middle_name, a.surname].filter(Boolean).join(' ').trim() || 'Unnamed';
}

/** Builds two-letter initials for avatar circle. */
function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

export const ApplicantsInlineSection: React.FC<ApplicantsInlineSectionProps> = ({ application, client, onUpdate }) => {
  const toast = useToast();

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [showAddApplicantModal, setShowAddApplicantModal] = useState(false);
  const [applicantKind, setApplicantKind] = useState<'personal' | 'company'>('personal');
  const [editingApplicant, setEditingApplicant] = useState<Applicant | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [submittingApplicant, setSubmittingApplicant] = useState(false);
  const [deletingApplicantId, setDeletingApplicantId] = useState<string | null>(null);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [applicantFormError, setApplicantFormError] = useState<string | null>(null);
  const [applicantForm, setApplicantForm] = useState(emptyApplicantForm());
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm());
  const [companyFormError, setCompanyFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!application.id) return;
    setApplicantsLoading(true);
    Promise.all([
      applicationService.getApplicants(application.id),
      applicationService.getCompanies(application.id),
    ])
      .then(([applicantsData, companiesData]) => {
        setApplicants(applicantsData || []);
        setCompanies(companiesData || []);
      })
      .catch((err) => {
        logger.error('Failed to load applicants/companies:', err);
        setApplicants([]);
        setCompanies([]);
      })
      .finally(() => setApplicantsLoading(false));
  }, [application.id]);

  const resetApplicantForm = () => {
    setApplicantForm(emptyApplicantForm());
    setApplicantFormError(null);
  };

  const resetCompanyForm = () => {
    setCompanyForm(emptyCompanyForm());
    setCompanyFormError(null);
  };

  const handleDeleteApplicant = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this applicant?')) return;
    setDeletingApplicantId(id);
    try {
      await applicationService.deleteApplicant(id);
      const data = await applicationService.getApplicants(application.id);
      setApplicants(data || []);
      onUpdate();
      toast.success('Applicant removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove applicant');
    } finally {
      setDeletingApplicantId(null);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this company/trust?')) return;
    setDeletingCompanyId(id);
    try {
      await applicationService.deleteCompany(id);
      const data = await applicationService.getCompanies(application.id);
      setCompanies(data || []);
      onUpdate();
      toast.success('Company removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove company');
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const handleImportFromClient = () => {
    const first = client.name?.trim().split(/\s+/)[0] ?? '';
    const last = client.name?.trim().split(/\s+/).slice(1).join(' ') ?? '';
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
    toast.info('Client details imported');
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
        } else {
          await applicationService.createCompany(application.id, payload);
        }
        const successMsg = editingCompany ? 'Company updated' : 'Company added';
        setShowAddApplicantModal(false);
        setEditingCompany(null);
        resetCompanyForm();
        const [applicantsData, companiesData] = await Promise.all([
          applicationService.getApplicants(application.id),
          applicationService.getCompanies(application.id),
        ]);
        setApplicants(applicantsData || []);
        setCompanies(companiesData || []);
        onUpdate();
        toast.success(successMsg);
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
      } else {
        await applicationService.createApplicant(application.id, payload as Partial<Applicant>);
      }
      const successMsg = editingApplicant ? 'Applicant updated' : 'Applicant added';
      setShowAddApplicantModal(false);
      setEditingApplicant(null);
      resetApplicantForm();
      const [applicantsData, companiesData] = await Promise.all([
        applicationService.getApplicants(application.id),
        applicationService.getCompanies(application.id),
      ]);
      setApplicants(applicantsData || []);
      setCompanies(companiesData || []);
      onUpdate();
      toast.success(successMsg);
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

  const openAddModal = () => {
    setApplicantKind('personal');
    setEditingApplicant(null);
    setEditingCompany(null);
    resetApplicantForm();
    resetCompanyForm();
    setShowAddApplicantModal(true);
  };

  return (
    <>
      <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Applicants</h3>
          <button
            type="button"
            onClick={openAddModal}
            className="shrink-0 px-2 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-colors"
          >
            + Add
          </button>
        </div>
        {applicantsLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-gray-500 dark:text-gray-400">
            <Icon name="Loader" className="h-4 w-4 animate-spin flex-shrink-0" />
            <span>Loading…</span>
          </div>
        ) : applicants.length === 0 && companies.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-1">No applicants yet.</p>
        ) : (
          <div className="space-y-0 divide-y divide-gray-200 dark:divide-gray-700">
            {applicants.map((a) => {
              const label = applicantListName(a);
              return (
                <div key={`applicant-${a.id}`} className="flex items-center gap-2 py-2.5 text-sm first:pt-0">
                  <div
                    className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 flex items-center justify-center text-[10px] font-bold shrink-0"
                    aria-hidden
                  >
                    {initialsFromDisplayName(label)}
                  </div>
                  <span className="flex-1 min-w-0 truncate font-medium text-gray-900 dark:text-gray-100" title={label}>
                    {label}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200">
                    {applicantRoleLabel(a.applicant_type as string)}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => {
                        setApplicantKind('personal');
                        setEditingApplicant(a);
                        setEditingCompany(null);
                        setApplicantForm(applicantToForm(a));
                        setApplicantFormError(null);
                        setCompanyFormError(null);
                        setShowAddApplicantModal(true);
                      }}
                      className="p-1.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                    >
                      <Icon name="Pencil" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => handleDeleteApplicant(a.id)}
                      disabled={deletingApplicantId === a.id}
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 disabled:opacity-50"
                    >
                      {deletingApplicantId === a.id ? (
                        <Icon name="Loader" className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon name="Trash2" className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            {companies.map((c) => {
              const co = c as Company;
              const entityName = co.entity_name || 'Unnamed entity';
              const badge = ((co.entity_type as string) || 'Company').slice(0, 24);
              return (
                <div key={`company-${co.id}`} className="flex items-center gap-2 py-2.5 text-sm">
                  <div
                    className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center shrink-0"
                    aria-hidden
                  >
                    <Icon name="Building2" className="h-4 w-4" />
                  </div>
                  <span className="flex-1 min-w-0 truncate font-medium text-gray-900 dark:text-gray-100" title={entityName}>
                    {entityName}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 max-w-[5.5rem] truncate" title={badge}>
                    {badge}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => {
                        setApplicantKind('company');
                        setEditingCompany(c);
                        setEditingApplicant(null);
                        setCompanyForm(companyToForm(c));
                        setCompanyFormError(null);
                        setApplicantFormError(null);
                        setShowAddApplicantModal(true);
                      }}
                      className="p-1.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                    >
                      <Icon name="Pencil" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => handleDeleteCompany(co.id)}
                      disabled={deletingCompanyId === co.id}
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 disabled:opacity-50"
                    >
                      {deletingCompanyId === co.id ? (
                        <Icon name="Loader" className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon name="Trash2" className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Add / Edit Applicant Modal */}
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
    </>
  );
};

export default ApplicantsInlineSection;
