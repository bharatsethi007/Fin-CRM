import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { crmService } from '../../services/api';
import type { Client, Advisor, Application } from '../../types';
import { ApplicationStatus } from '../../types';
import LoanApplicationForm from './LoanApplicationForm';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { ClientPortalStatus } from '../../types';
import DocumentsTab from '../common/DocumentsTab';
import KYCTab from '../common/KYCTab';

interface ClientDetailProps {
  client: Client;
  advisors?: Advisor[];
  applicationsRefreshKey?: number;
  onBack: () => void;
  onNewApplicationClick: () => void;
  onApplicationsUpdated?: () => void;
}

function getCreditRating(score: number): string {
  if (score >= 750) return 'Excellent';
  if (score >= 700) return 'Good';
  if (score >= 650) return 'Fair';
  if (score >= 550) return 'Poor';
  return 'Very Poor';
}

function computeFinancialAnalysis(f: Client['financials']) {
  const netAnnual = f.income - f.expenses;
  const netMonthly = f.income ? netAnnual / 12 : 0;
  const dti = f.income ? ((f.expenses + f.liabilities) / f.income) * 100 : 0;
  const totalDebt = f.liabilities + f.otherBorrowings;
  const ltv = f.assets ? (totalDebt / f.assets) * 100 : 0;
  const savingsRatio = f.income ? (netAnnual / f.income) * 100 : 0;
  const hardshipRisk = dti > 50 || savingsRatio < 10 ? 'High' : savingsRatio < 20 ? 'Medium' : 'Low';
  return { netMonthlySurplus: netMonthly, dti, ltv, savingsRatio, hardshipRisk };
}

const ClientDetail: React.FC<ClientDetailProps> = ({ client, advisors = [], applicationsRefreshKey = 0, onBack, onNewApplicationClick, onApplicationsUpdated }) => {
  const [activeTab, setActiveTab] = useState('applications');
  const [isEditing, setIsEditing] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(true);
  const [editingApplication, setEditingApplication] = useState<Application | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoadingApplications(true);
    crmService.getApplications().then(apps => {
      if (mounted) {
        setApplications(apps.filter(a => a.clientId === client.id));
        setIsLoadingApplications(false);
      }
    });
    return () => { mounted = false; };
  }, [client.id, applicationsRefreshKey]);
  const [editData, setEditData] = useState({
    name: client.name,
    email: client.email,
    phone: client.phone,
    address: client.address,
    city: client.city || '',
    postalCode: client.postalCode || '',
    dateOfBirth: client.dateOfBirth || '',
    leadSource: client.leadSource || '',
    employmentStatus: client.employmentStatus || '',
    employerName: client.employerName || '',
    notes: client.notes || '',
    income: String(client.financials.income),
    expenses: String(client.financials.expenses),
    assets: String(client.financials.assets),
    liabilities: String(client.financials.liabilities),
    otherBorrowings: String(client.financials.otherBorrowings),
  });

  const owner = client.advisorId ? advisors.find(a => a.id === client.advisorId) : null;
  const analysis = computeFinancialAnalysis(client.financials);

  const handleSave = async () => {
    try {
      const [firstName, ...lastNameParts] = editData.name.split(' ');
      const lastName = lastNameParts.join(' ') || '';

      const { error } = await supabase
        .from('clients')
        .update({
          first_name: firstName,
          last_name: lastName,
          email: editData.email,
          phone: editData.phone,
          residential_address: editData.address,
          city: editData.city || null,
          postal_code: editData.postalCode || null,
          date_of_birth: editData.dateOfBirth || null,
          lead_source: editData.leadSource || null,
          employment_status: editData.employmentStatus || null,
          employer_name: editData.employerName || null,
          notes: editData.notes || null,
          annual_income: Number(editData.income) || 0,
          annual_expenses: Number(editData.expenses) || 0,
          total_assets: Number(editData.assets) || 0,
          total_liabilities: Number(editData.liabilities) || 0,
          other_borrowings: Number(editData.otherBorrowings) || 0,
        })
        .eq('id', client.id);

      if (error) throw error;
      alert('Client updated!');
      setIsEditing(false);
      onBack();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const tabs = [
    { id: 'applications', label: 'Active Applications' },
    { id: 'documents', label: 'Documents' },
    { id: 'kyc', label: 'KYC' },
    { id: 'notes', label: 'Notes' },
    { id: 'calls', label: 'Calls' },
    { id: 'previous', label: 'Previous Applications' },
    { id: 'activities', label: 'Activities' },
    { id: 'audit', label: 'Audit Trail' },
  ];

  if (editingApplication && editingApplication.status === ApplicationStatus.Draft) {
    return (
      <LoanApplicationForm
        client={client}
        draftApplication={{ id: editingApplication.id, referenceNumber: editingApplication.referenceNumber }}
        isEditMode={true}
        onBack={() => setEditingApplication(null)}
        onApplicationsUpdated={onApplicationsUpdated}
        onSuccess={() => {
          setEditingApplication(null);
          onApplicationsUpdated?.();
        }}
      />
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
      {/* Header */}
      <div className="p-6 border-b dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={onBack} leftIcon="ArrowLeft">Back</Button>
            <img src={client.avatarUrl} alt={client.name} className="h-16 w-16 rounded-full" />
            <div>
              <h2 className="text-2xl font-bold">{client.name}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Client ID: {client.id}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button onClick={handleSave}>Save</Button>
                <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button onClick={() => setIsEditing(true)} leftIcon="Edit">Edit</Button>
                <Button onClick={onNewApplicationClick} leftIcon="FileText">New Application</Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Profile, Portal, Credit, Financials */}
        <div className="lg:col-span-1 space-y-6">
          {/* Client Profile */}
          <div className="border dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              Client Profile
              {!isEditing && <button type="button" onClick={() => setIsEditing(true)} aria-label="Edit"><Icon name="Edit" className="h-4 w-4 text-gray-500" /></button>}
            </h3>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Client Since</label>
                <p className="font-medium">{client.dateAdded}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Email</label>
                {isEditing ? (
                  <input value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })} className="w-full border px-2 py-1 rounded text-sm dark:bg-gray-700 dark:border-gray-600" />
                ) : (
                  <p className="font-medium text-sm">{client.email}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Phone</label>
                {isEditing ? (
                  <input value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} className="w-full border px-2 py-1 rounded text-sm dark:bg-gray-700 dark:border-gray-600" />
                ) : (
                  <p className="font-medium text-sm">{client.phone}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Address</label>
                {isEditing ? (
                  <input value={editData.address} onChange={e => setEditData({ ...editData, address: e.target.value })} className="w-full border px-2 py-1 rounded text-sm dark:bg-gray-700 dark:border-gray-600" />
                ) : (
                  <p className="font-medium text-sm">{client.address || '—'}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">City</label>
                  {isEditing ? (
                    <input value={editData.city} onChange={e => setEditData({ ...editData, city: e.target.value })} className="w-full border px-2 py-1 rounded text-sm dark:bg-gray-700 dark:border-gray-600" />
                  ) : (
                    <p className="font-medium text-sm">{client.city || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Postal Code</label>
                  {isEditing ? (
                    <input value={editData.postalCode} onChange={e => setEditData({ ...editData, postalCode: e.target.value })} className="w-full border px-2 py-1 rounded text-sm dark:bg-gray-700 dark:border-gray-600" />
                  ) : (
                    <p className="font-medium text-sm">{client.postalCode || '—'}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Date of Birth</label>
                {isEditing ? (
                  <input type="date" value={editData.dateOfBirth} onChange={e => setEditData({ ...editData, dateOfBirth: e.target.value })} className="w-full border px-2 py-1 rounded text-sm dark:bg-gray-700 dark:border-gray-600" />
                ) : (
                  <p className="font-medium text-sm">{client.dateOfBirth ? new Date(client.dateOfBirth).toLocaleDateString() : '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Employment</label>
                {isEditing ? (
                  <div className="space-y-1">
                    <select value={editData.employmentStatus} onChange={e => setEditData({ ...editData, employmentStatus: e.target.value })} className="w-full border px-2 py-1 rounded text-sm dark:bg-gray-700 dark:border-gray-600">
                      <option value="">—</option>
                      <option value="Employed">Employed</option>
                      <option value="Self-employed">Self-employed</option>
                      <option value="Contract">Contract</option>
                      <option value="Casual">Casual</option>
                      <option value="Unemployed">Unemployed</option>
                      <option value="Retired">Retired</option>
                    </select>
                    <input value={editData.employerName} onChange={e => setEditData({ ...editData, employerName: e.target.value })} placeholder="Employer" className="w-full border px-2 py-1 rounded text-sm dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                ) : (
                  <p className="font-medium text-sm">{[client.employmentStatus, client.employerName].filter(Boolean).join(' at ') || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Owner(s)</label>
                <div className="flex items-center gap-2 mt-1">
                  {owner ? (
                    <>
                      <img src={owner.avatarUrl} alt={owner.name} className="h-6 w-6 rounded-full" />
                      <span className="text-sm font-medium">{owner.name}</span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-500">Unassigned</span>
                  )}
                  <Button variant="ghost" size="sm">Add</Button>
                </div>
              </div>
            </div>
          </div>

          {/* Client Portal */}
          <div className="border dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Client Portal</h3>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded text-sm font-medium ${client.portal.status === ClientPortalStatus.Active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : client.portal.status === ClientPortalStatus.Pending ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'}`}>
                {client.portal.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {client.portal.status === ClientPortalStatus.Active && client.portal.lastLogin
                ? `Last login: ${new Date(client.portal.lastLogin).toLocaleDateString()}`
                : client.portal.status === ClientPortalStatus.NotSetup
                  ? 'The client portal is not set up.'
                  : 'The client portal is pending activation.'}
            </p>
            {client.portal.status === ClientPortalStatus.Active && (
              <Button variant="outline" size="sm" className="mt-2">→ Login as Client</Button>
            )}
          </div>

          {/* Credit Score */}
          <div className="border dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Credit Score</h3>
            {client.creditScore.score > 0 ? (
              <>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{client.creditScore.score}</div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">{getCreditRating(client.creditScore.score)}</p>
                <p className="text-xs text-gray-500 mt-1">Last updated: {client.creditScore.lastUpdated || '—'}</p>
                {client.creditScore.provider && <p className="text-xs text-gray-500">Provider: {client.creditScore.provider}</p>}
              </>
            ) : (
              <p className="text-sm text-gray-500">No credit score on file.</p>
            )}
            <Button variant="ghost" size="sm" className="mt-2">Update</Button>
          </div>

          {/* Financial Analysis (calculated) */}
          <div className="border dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Financial Analysis</h3>
            <ul className="space-y-2 text-sm">
              <li><span className="text-gray-500 dark:text-gray-400">Net Monthly Surplus:</span> <span className="font-medium">${analysis.netMonthlySurplus.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></li>
              <li><span className="text-gray-500 dark:text-gray-400">Debt-to-Income Ratio:</span> <span className="font-medium">{analysis.dti.toFixed(1)}%</span></li>
              <li><span className="text-gray-500 dark:text-gray-400">Loan-to-Value Ratio (Est.):</span> <span className="font-medium">{analysis.ltv.toFixed(1)}%</span></li>
              <li><span className="text-gray-500 dark:text-gray-400">Savings Ratio:</span> <span className="font-medium">{analysis.savingsRatio.toFixed(1)}%</span></li>
              <li><span className="text-gray-500 dark:text-gray-400">Hardship Risk:</span> <span className={`font-medium ${analysis.hardshipRisk === 'High' ? 'text-red-600 dark:text-red-400' : analysis.hardshipRisk === 'Medium' ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>{analysis.hardshipRisk}</span></li>
            </ul>
          </div>

          {/* Financial Summary (all 5 fields) */}
          <div className="border dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3 flex items-center justify-between">
              Financial Summary
              {!isEditing && <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>}
            </h3>
            <ul className="space-y-2 text-sm">
              <li><span className="text-gray-500 dark:text-gray-400">Income:</span> {isEditing ? <input type="number" value={editData.income} onChange={e => setEditData({ ...editData, income: e.target.value })} className="w-24 border px-2 py-0.5 rounded dark:bg-gray-700 dark:border-gray-600" /> : <span className="font-medium">${client.financials.income.toLocaleString()}</span>}</li>
              <li><span className="text-gray-500 dark:text-gray-400">Expenses:</span> {isEditing ? <input type="number" value={editData.expenses} onChange={e => setEditData({ ...editData, expenses: e.target.value })} className="w-24 border px-2 py-0.5 rounded dark:bg-gray-700 dark:border-gray-600" /> : <span className="font-medium">${client.financials.expenses.toLocaleString()}</span>}</li>
              <li><span className="text-gray-500 dark:text-gray-400">Assets:</span> {isEditing ? <input type="number" value={editData.assets} onChange={e => setEditData({ ...editData, assets: e.target.value })} className="w-24 border px-2 py-0.5 rounded dark:bg-gray-700 dark:border-gray-600" /> : <span className="font-medium">${client.financials.assets.toLocaleString()}</span>}</li>
              <li><span className="text-gray-500 dark:text-gray-400">Liabilities:</span> {isEditing ? <input type="number" value={editData.liabilities} onChange={e => setEditData({ ...editData, liabilities: e.target.value })} className="w-24 border px-2 py-0.5 rounded dark:bg-gray-700 dark:border-gray-600" /> : <span className="font-medium">${client.financials.liabilities.toLocaleString()}</span>}</li>
              <li><span className="text-gray-500 dark:text-gray-400">Other Borrowings:</span> {isEditing ? <input type="number" value={editData.otherBorrowings} onChange={e => setEditData({ ...editData, otherBorrowings: e.target.value })} className="w-24 border px-2 py-0.5 rounded dark:bg-gray-700 dark:border-gray-600" /> : <span className="font-medium">${client.financials.otherBorrowings.toLocaleString()}</span>}</li>
            </ul>
          </div>
        </div>

        {/* Right column: Tabs + content */}
        <div className="lg:col-span-2 border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex border-b dark:border-gray-700 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-4 min-h-[200px]">
            {activeTab === 'applications' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold">Current Applications</h4>
                  <Button size="sm" onClick={onNewApplicationClick}>New Application</Button>
                </div>
                {isLoadingApplications ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                ) : applications.length > 0 ? (
                  <ul className="space-y-3">
                    {applications.map(app => (
                      <li
                        key={app.id}
                        onClick={() => app.status === ApplicationStatus.Draft && setEditingApplication(app)}
                        className={`flex justify-between items-center p-3 rounded-lg ${app.status === ApplicationStatus.Draft ? 'bg-gray-50 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors' : 'bg-gray-50 dark:bg-gray-700/50'}`}
                      >
                        <div>
                          <p className="font-semibold">{app.referenceNumber}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{app.lender} · ${app.loanAmount.toLocaleString()}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{app.status}</p>
                        </div>
                        {app.status === ApplicationStatus.Draft && (
                          <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">Click to edit</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No active applications yet. Create one with &quot;New Application&quot;.</p>
                )}
              </div>
            )}
            {activeTab === 'documents' && (
              <DocumentsTab clientId={client.id} clientEmail={client.email} onDocumentsUpdated={onApplicationsUpdated} />
            )}
            {activeTab === 'kyc' && (
              <KYCTab clientId={client.id} clientName={client.name} onUpdated={onApplicationsUpdated} />
            )}
            {activeTab !== 'applications' && activeTab !== 'documents' && activeTab !== 'kyc' && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{tabs.find(t => t.id === activeTab)?.label} content will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientDetail;

