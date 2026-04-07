import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/api';
import type { Client } from '../../types';
import { Button } from '../common/Button';

export type AddClientFormInitialValues = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  dateOfBirth: string;
  leadSource: string;
  employmentStatus: string;
  employerName: string;
  income: string;
  expenses: string;
  assets: string;
  liabilities: string;
  otherBorrowings: string;
  notes: string;
}>;

interface Props {
  onBack: () => void;
  onSuccess: (client: Client) => void;
  initialValues?: AddClientFormInitialValues;
  /** When true, lighter chrome for embedding inside Add Client hub */
  embedded?: boolean;
  submitLabel?: string;
}

const toNum = (v: string) => (v === '' ? 0 : Number(v));

const emptyForm = {
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
};

const AddClientForm: React.FC<Props> = ({
  onBack,
  onSuccess,
  initialValues,
  embedded,
  submitLabel,
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(() => ({
    ...emptyForm,
    ...initialValues,
  }));

  useEffect(() => {
    if (initialValues && Object.keys(initialValues).length > 0) {
      setFormData((prev) => ({ ...prev, ...initialValues }));
    }
  }, [initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const newClient = await crmService.createClient({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        leadSource: formData.leadSource || undefined,
        notes: formData.notes || undefined,
        residentialAddress: formData.address || undefined,
        city: formData.city || undefined,
        postalCode: formData.postalCode || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        employmentStatus: formData.employmentStatus || undefined,
        employerName: formData.employerName || undefined,
        annualIncome: toNum(formData.income),
        annualExpenses: toNum(formData.expenses),
        totalAssets: toNum(formData.assets),
        totalLiabilities: toNum(formData.liabilities),
        otherBorrowings: toNum(formData.otherBorrowings),
      });
      onSuccess(newClient);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save client.';
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'rounded-lg p-4 border dark:border-gray-600'
          : 'bg-white dark:bg-gray-800 shadow-md rounded-lg p-6'
      }
      style={embedded ? { borderColor: 'var(--border-color)', background: 'var(--bg-card)' } : undefined}
    >
      <h2 className={`font-bold mb-4 ${embedded ? 'text-lg' : 'text-xl'}`}>Manual entry</h2>
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
            {loading ? 'Saving...' : submitLabel || 'Save Client'}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            {embedded ? 'Back' : 'Cancel'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddClientForm;
