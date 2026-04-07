import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { getCurrentFirm } from '../../services/api';
import { crmService } from '../../services/api';
import { applicationService } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { Application, Client } from '../../types';
import { ApplicationStatus, ClientPortalStatus } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { ApplicationDetailPage } from './ApplicationDetailPage';

type AppRow = {
  id: string;
  firm_id?: string | null;
  reference_number?: string | null;
  client_id: string;
  loan_amount?: number | null;
  application_type?: string | null;
  workflow_stage?: string | null;
  assigned_to?: string | null;
  created_at?: string | null;
  clients?: { first_name?: string; last_name?: string; email?: string } | null;
};

const WORKFLOW_PILL_CLASSES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  conditional: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
  unconditional: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
  settled: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
};

const WorkflowBadge: React.FC<{ stage: string }> = ({ stage }) => {
  const normalized = (stage || 'draft').toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const classes = WORKFLOW_PILL_CLASSES[normalized] ?? WORKFLOW_PILL_CLASSES.draft;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
};

const APPLICATION_TYPES = ['purchase', 'refinance', 'top-up', 'construction'] as const;

interface ApplicationsPageProps {
  initialApplicationId?: string | null;
  onClearInitialApplicationId?: () => void;
}

const ANOMALY_FILTER_KEY = 'fi_anomaly_application_ids';

export default function ApplicationsPage({ initialApplicationId, onClearInitialApplicationId }: ApplicationsPageProps) {
  const toast = useToast();
  const [rows, setRows] = useState<AppRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [anomalyFilterIds, setAnomalyFilterIds] = useState<string[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalClientId, setModalClientId] = useState('');
  const [modalApplicationType, setModalApplicationType] = useState<typeof APPLICATION_TYPES[number]>('purchase');
  const [modalLoanPurpose, setModalLoanPurpose] = useState('');
  const [modalLoanAmount, setModalLoanAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<AppRow | null>(null);

  const workflowToStatus: Record<string, ApplicationStatus> = {
    draft: ApplicationStatus.Draft,
    submitted: ApplicationStatus.ApplicationSubmitted,
    conditional: ApplicationStatus.ConditionalApproval,
    unconditional: ApplicationStatus.UnconditionalApproval,
    settled: ApplicationStatus.Settled,
    declined: ApplicationStatus.Declined,
  };

  const rowToApplication = (row: AppRow): Application => ({
    id: row.id,
    firmId: row.firm_id || '',
    referenceNumber: row.reference_number || '',
    clientName: clientName(row),
    clientId: row.client_id,
    advisorId: row.assigned_to || '',
    lender: '',
    loanAmount: Number(row.loan_amount) || 0,
    status: workflowToStatus[(row.workflow_stage || 'draft').toLowerCase()] ?? ApplicationStatus.Draft,
    estSettlementDate: '',
    status_detail: 'Active',
    lastUpdated: row.created_at || '',
    updatedByName: '',
  });

  const selectedClient: Client | null = selectedRow
    ? clients.find((c) => c.id === selectedRow.client_id) ?? {
        id: selectedRow.client_id,
        firmId: '',
        name: clientName(selectedRow),
        email: selectedRow.clients?.email ?? '',
        phone: '',
        address: '',
        dateAdded: selectedRow.created_at ?? '',
        advisorId: '',
        avatarUrl: '',
        financials: { income: 0, expenses: 0, assets: 0, liabilities: 0, otherBorrowings: 0 },
        creditScore: { score: 0, provider: '', lastUpdated: '' },
        portal: { status: ClientPortalStatus.NotSetup },
      }
    : null;

  const fetchData = () => {
    const firm = getCurrentFirm();
    if (!firm?.id) {
      setRows([]);
      setClients([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      applicationService.getApplications(firm.id) as Promise<AppRow[]>,
      crmService.getClients(),
    ])
      .then(([apps, clientsData]) => {
        const list = apps || [];
        setRows(list);
        setClients(clientsData || []);
        setSelectedRow((prev) => {
          if (!prev) return prev;
          const next = list.find((r: AppRow) => r.id === prev.id);
          return next ?? prev;
        });
        if (initialApplicationId && list.length > 0) {
          const row = list.find((r: AppRow) => r.id === initialApplicationId);
          if (row) setSelectedRow(row);
          onClearInitialApplicationId?.();
        }
      })
      .catch((err) => logger.error('Failed to fetch applications:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  useAutoRefresh(fetchData, 30);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ANOMALY_FILTER_KEY);
      if (!raw) return;
      const ids = JSON.parse(raw) as unknown;
      if (Array.isArray(ids) && ids.every((x) => typeof x === 'string')) {
        setAnomalyFilterIds(ids);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const clearAnomalyFilter = () => {
    sessionStorage.removeItem(ANOMALY_FILTER_KEY);
    setAnomalyFilterIds(null);
  };

  const displayRows =
    anomalyFilterIds && anomalyFilterIds.length > 0
      ? rows.filter((r) => anomalyFilterIds.includes(r.id))
      : rows;

  const clientName = (row: AppRow) =>
    row.clients
      ? [row.clients.first_name, row.clients.last_name].filter(Boolean).join(' ').trim() || '—'
      : '—';

  const createdDate = (row: AppRow) =>
    row.created_at
      ? new Date(row.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : '—';

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    const firm = getCurrentFirm();
    if (!firm?.id) {
      setModalError('No firm session. Please log in again.');
      return;
    }
    if (!modalClientId.trim()) {
      setModalError('Please select a client.');
      return;
    }
    setSubmitting(true);
    setModalError(null);
    try {
      const created = await applicationService.createApplication({
        firm_id: firm.id,
        client_id: modalClientId,
        application_type: modalApplicationType,
        loan_purpose: modalLoanPurpose.trim() || undefined,
        loan_amount: modalLoanAmount ? Number(modalLoanAmount) : undefined,
      });
      const fullRow = (await applicationService.getApplicationById(created.id)) as AppRow;
      setShowModal(false);
      setModalClientId('');
      setModalApplicationType('purchase');
      setModalLoanPurpose('');
      setModalLoanAmount('');
      setSelectedRow(fullRow);
      fetchData();
      toast.success('Application created');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create application.';
      setModalError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (selectedRow && selectedClient) {
    return (
      <ApplicationDetailPage
        application={rowToApplication(selectedRow)}
        client={selectedClient}
        onBack={() => setSelectedRow(null)}
        onUpdate={() => fetchData()}
      />
    );
  }

  return (
    <div className="text-gray-900 dark:text-gray-100">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Applications</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">View and manage loan applications.</p>
        </div>
        <Button leftIcon="PlusCircle" onClick={() => setShowModal(true)}>
          New Application
        </Button>
      </div>

      {anomalyFilterIds && anomalyFilterIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span>
            Showing applications with <strong>open anomalies</strong> ({displayRows.length} match
            {displayRows.length === 1 ? '' : 'es'}).
          </span>
          <button
            type="button"
            onClick={clearAnomalyFilter}
            className="font-medium text-amber-800 underline hover:text-amber-950 dark:text-amber-200"
          >
            Show all applications
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" className="px-6 py-3">Reference</th>
                  <th scope="col" className="px-6 py-3">Client Name</th>
                  <th scope="col" className="px-6 py-3">Loan Amount</th>
                  <th scope="col" className="px-6 py-3">Type</th>
                  <th scope="col" className="px-6 py-3">Workflow Stage</th>
                  <th scope="col" className="px-6 py-3">Assigned To</th>
                  <th scope="col" className="px-6 py-3">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      {rows.length === 0
                        ? 'No applications yet. Create one with New Application.'
                        : 'No applications match this filter.'}
                    </td>
                  </tr>
                )}
                {displayRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedRow(row)}
                    className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700 cursor-pointer"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {row.reference_number || '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-gray-100">{clientName(row)}</td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                      {row.loan_amount != null ? `$${Number(row.loan_amount).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-gray-100">
                      {row.application_type ? String(row.application_type) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <WorkflowBadge stage={row.workflow_stage || 'draft'} />
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-gray-100">
                      {row.assigned_to ? 'Assigned' : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {createdDate(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Application Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <form onSubmit={handleSubmitNew}>
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New Application</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setModalError(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Icon name="X" className="h-5 w-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {modalError && (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                    {modalError}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</label>
                  <select
                    value={modalClientId}
                    onChange={(e) => setModalClientId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  >
                    <option value="">Select a client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Application Type</label>
                  <select
                    value={modalApplicationType}
                    onChange={(e) => setModalApplicationType(e.target.value as typeof APPLICATION_TYPES[number])}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {APPLICATION_TYPES.map((t) => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loan Purpose</label>
                  <input
                    type="text"
                    value={modalLoanPurpose}
                    onChange={(e) => setModalLoanPurpose(e.target.value)}
                    placeholder="e.g. First home"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loan Amount</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={modalLoanAmount}
                    onChange={(e) => setModalLoanAmount(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowModal(false);
                    setModalError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={submitting} leftIcon="PlusCircle">
                  Create Application
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
