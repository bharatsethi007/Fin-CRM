import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { getCurrentFirm, toSupabaseFirmId } from '../../services/crmService';
import type { Client } from '../../types';
import { Button } from '../common/Button';
import { ClientPortalStatus } from '../../types';

interface Props {
  onBack: () => void;
  onSuccess: (client: Client) => void;
}

const toNum = (v: string) => (v === '' ? 0 : Number(v));

const AddClientForm: React.FC<Props> = ({ onBack, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    dateOfBirth: '',
    leadSource: '',
    employmentStatus: '',
    employerName: '',
    income: '',
    expenses: '',
    assets: '',
    liabilities: '',
    otherBorrowings: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const firm = getCurrentFirm();
    const firmId = toSupabaseFirmId(firm?.id);

    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{
          firm_id: firmId,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          residential_address: formData.address,
          city: formData.city || null,
          postal_code: formData.postalCode || null,
          date_of_birth: formData.dateOfBirth || null,
          lead_source: formData.leadSource || null,
          employment_status: formData.employmentStatus || null,
          employer_name: formData.employerName || null,
          notes: formData.notes || null,
          assigned_to: null,
          annual_income: toNum(formData.income),
          annual_expenses: toNum(formData.expenses),
          total_assets: toNum(formData.assets),
          total_liabilities: toNum(formData.liabilities),
          other_borrowings: toNum(formData.otherBorrowings),
          credit_score: 0,
          credit_score_provider: '',
          portal_status: 'Not Setup',
        }])
        .select()
        .single();

      if (error) throw error;

      const newClient: Client = {
        id: data.id,
        firmId: data.firm_id,
        name: `${data.first_name} ${data.last_name}`,
        email: data.email,
        phone: data.phone || '',
        address: data.residential_address || '',
        city: data.city || undefined,
        postalCode: data.postal_code || undefined,
        dateOfBirth: data.date_of_birth ? new Date(data.date_of_birth).toISOString().slice(0, 10) : undefined,
        leadSource: data.lead_source || undefined,
        employmentStatus: data.employment_status || undefined,
        employerName: data.employer_name || undefined,
        notes: data.notes || undefined,
        dateAdded: new Date(data.created_at).toLocaleDateString('en-NZ'),
        advisorId: data.assigned_to || '',
        avatarUrl: data.photo_url || `https://i.pravatar.cc/150?u=${data.id}`,
        financials: {
          income: toNum(formData.income),
          expenses: toNum(formData.expenses),
          assets: toNum(formData.assets),
          liabilities: toNum(formData.liabilities),
          otherBorrowings: toNum(formData.otherBorrowings),
        },
        creditScore: { score: 0, provider: '', lastUpdated: '' },
        portal: { status: ClientPortalStatus.NotSetup },
      };

      onSuccess(newClient);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
      <h2 className="text-xl font-bold mb-4">Add New Client</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="First Name"
            value={formData.firstName}
            onChange={e => setFormData({ ...formData, firstName: e.target.value })}
            required
            className="px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
          <input
            type="text"
            placeholder="Last Name"
            value={formData.lastName}
            onChange={e => setFormData({ ...formData, lastName: e.target.value })}
            required
            className="px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
        <input
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
          required
          className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
        />
        <input
          type="tel"
          placeholder="Phone"
          value={formData.phone}
          onChange={e => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
        />
        <input
          type="text"
          placeholder="Address"
          value={formData.address}
          onChange={e => setFormData({ ...formData, address: e.target.value })}
          className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
        />
        <div className="grid grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="City"
            value={formData.city}
            onChange={e => setFormData({ ...formData, city: e.target.value })}
            className="px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
          <input
            type="text"
            placeholder="Postal Code"
            value={formData.postalCode}
            onChange={e => setFormData({ ...formData, postalCode: e.target.value })}
            className="px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Date of Birth</label>
            <input
              type="date"
              value={formData.dateOfBirth}
              onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Lead Source</label>
            <select
              value={formData.leadSource}
              onChange={e => setFormData({ ...formData, leadSource: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="">Select source</option>
              <option value="Website">Website</option>
              <option value="Referral">Referral</option>
              <option value="Facebook">Facebook</option>
              <option value="Walk-in">Walk-in</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Employment Status</label>
            <select
              value={formData.employmentStatus}
              onChange={e => setFormData({ ...formData, employmentStatus: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="">Select status</option>
              <option value="Employed">Employed</option>
              <option value="Self-employed">Self-employed</option>
              <option value="Contract">Contract</option>
              <option value="Casual">Casual</option>
              <option value="Unemployed">Unemployed</option>
              <option value="Retired">Retired</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Employer Name"
            value={formData.employerName}
            onChange={e => setFormData({ ...formData, employerName: e.target.value })}
            className="px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
        <div>
          <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Internal Notes</label>
          <textarea
            placeholder="Notes (internal use)"
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        <h3 className="text-lg font-semibold mt-6 mb-2">Financial Summary</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Income ($)</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={formData.income}
              onChange={e => setFormData({ ...formData, income: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Expenses ($)</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={formData.expenses}
              onChange={e => setFormData({ ...formData, expenses: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Assets ($)</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={formData.assets}
              onChange={e => setFormData({ ...formData, assets: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Liabilities ($)</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={formData.liabilities}
              onChange={e => setFormData({ ...formData, liabilities: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Other Borrowings ($)</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={formData.otherBorrowings}
              onChange={e => setFormData({ ...formData, otherBorrowings: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Client'}
          </Button>
          <Button variant="ghost" onClick={onBack}>Cancel</Button>
        </div>
      </form>
    </div>
  );
};

export default AddClientForm;