import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/api';
import type { Lead } from '../../types';
import { LeadStatus } from '../../types';
import { LEAD_STATUS_COLUMNS } from '../../constants';
import { Card } from '../common/Card';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';

const LeadCard: React.FC<{ lead: Lead }> = ({ lead }) => {
    const probability = lead.conversionProbability || 0;
    const getBarColor = (p: number) => {
        if (p > 0.7) return 'bg-green-500';
        if (p > 0.4) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="p-3 mb-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm">{lead.name}</p>
                <img src={lead.avatarUrl} alt={lead.name} className="h-6 w-6 rounded-full" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{lead.email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Loan: ${lead.estimatedLoanAmount.toLocaleString()}
            </p>
            <div className="mt-3">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Conversion Probability</span>
                    <span className={`text-xs font-bold ${getBarColor(probability).replace('bg-', 'text-')}`}>
                        {(probability * 100).toFixed(0)}%
                    </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                    <div className={`${getBarColor(probability)} h-1.5 rounded-full`} style={{ width: `${probability * 100}%` }}></div>
                </div>
            </div>
        </div>
    );
};

const LeadPipeline: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add Lead inline modal state
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    crmService.getLeads()
      .then(data => {
        setLeads(data);
        setIsLoading(false);
      });
  }, []);

  const getLeadsByStatus = (status: LeadStatus) => {
    return leads.filter(lead => lead.status === status);
  };

  const resetAddLeadForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setLeadSource('');
    setError(null);
    setIsSubmitting(false);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('First name, last name, and email are required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const newLead = await crmService.createLead({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        leadSource: leadSource || undefined,
      });
      setLeads(prev => [newLead, ...prev]);
      resetAddLeadForm();
      setShowAddLeadModal(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create lead.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
       <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Lead Pipeline</h2>
          <p className="text-gray-500 dark:text-gray-400">Track leads from creation to close.</p>
        </div>
        <Button leftIcon="PlusCircle" onClick={() => setShowAddLeadModal(true)}>Add Lead</Button>
      </div>

      {showAddLeadModal && (
        <Card className="mb-6">
          <form onSubmit={handleCreateLead} className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lead Source</label>
              <select
                value={leadSource}
                onChange={e => setLeadSource(e.target.value)}
                className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">Select source</option>
                <option value="Website">Website</option>
                <option value="Referral">Referral</option>
                <option value="Facebook">Facebook</option>
                <option value="Walk-in">Walk-in</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  resetAddLeadForm();
                  setShowAddLeadModal(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                Create Lead
              </Button>
            </div>
          </form>
        </Card>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center h-96">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {LEAD_STATUS_COLUMNS.map(status => (
            <div key={status} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h3 className="font-semibold mb-4 text-center text-gray-600 dark:text-gray-300">
                {status.toUpperCase()} ({getLeadsByStatus(status).length})
              </h3>
              <div className="h-[calc(100vh-20rem)] overflow-y-auto pr-2">
                {getLeadsByStatus(status).map(lead => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeadPipeline;

