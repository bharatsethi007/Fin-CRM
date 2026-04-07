import React, { useState, useEffect } from 'react';
import type { Application } from '../../../types';
import { Button } from '../../common/Button';
import { Icon, IconName } from '../../common/Icon';
import { Card } from '../../common/Card';
import { applicationService, type Asset, type Liability } from '../../../services/api';
import { useToast } from '../../../hooks/useToast';

const inputClasses =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-4">
    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-600">{title}</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly'] as const;

type LiabilityType = 'Mortgage' | 'Credit Card' | 'Personal Loan' | 'Vehicle Loan' | 'Student Loan' | 'Tax Debt' | 'Other';

const emptyLiabilityForm = () => ({
  liability_type: 'Mortgage' as LiabilityType,
  lender: '', account_number: '', original_limit: '', current_balance: '',
  interest_rate: '', repayment_amount: '', repayment_frequency: 'Monthly',
  repayment_type: '', loan_term_end_date: '', fixed_rate_expiry: '',
  mortgage_type: '', linked_asset_id: '', to_be_refinanced: false, to_be_paid_out: false, card_type: '',
});

const getLiabilityIcon = (type: string): IconName => {
  switch (type) {
    case 'Mortgage': return 'Landmark';
    case 'Credit Card': return 'CreditCard';
    case 'Vehicle Loan': return 'Car' as IconName;
    case 'Student Loan': return 'BookKey';
    case 'Tax Debt': return 'Scale';
    default: return 'DollarSign';
  }
};

const liabilityMonthlyFrom = (amount: number, freq: string): number => {
  if (freq === 'Weekly') return (amount * 52) / 12;
  if (freq === 'Fortnightly') return (amount * 26) / 12;
  return amount;
};

const liabilityToForm = (l: Liability) => ({
  ...emptyLiabilityForm(),
  liability_type: ((l.liability_type as LiabilityType) || 'Mortgage') as LiabilityType,
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

const buildLiabilityPayload = (form: ReturnType<typeof emptyLiabilityForm>): Partial<Liability> => {
  const t = form.liability_type;
  const payload: Partial<Liability> & Record<string, unknown> = { liability_type: t };
  const num = (v: string) => (v === '' ? undefined : Number(v) || 0);
  payload.lender = form.lender || undefined;
  payload.account_number = form.account_number || undefined;
  payload.current_balance = num(form.current_balance);
  if (t === 'Mortgage' || t === 'Personal Loan' || t === 'Vehicle Loan' || t === 'Student Loan' || t === 'Tax Debt' || t === 'Other') {
    payload.original_limit = num(form.original_limit);
    payload.interest_rate = num(form.interest_rate);
    payload.repayment_amount = num(form.repayment_amount);
    payload.repayment_frequency = form.repayment_frequency;
    payload.repayment_type = t === 'Mortgage' ? form.repayment_type || undefined : undefined;
    payload.loan_term_end_date = form.loan_term_end_date || undefined;
    if (t === 'Mortgage') {
      payload.fixed_rate_expiry = form.fixed_rate_expiry || undefined;
      payload.mortgage_type = form.mortgage_type || undefined;
      payload.linked_asset_id = form.linked_asset_id || undefined;
    }
    if (t === 'Vehicle Loan') payload.linked_asset_id = form.linked_asset_id || undefined;
  } else if (t === 'Credit Card') {
    payload.card_type = form.card_type || undefined;
    payload.card_limit = num(form.original_limit);
    payload.current_balance = num(form.current_balance);
  }
  payload.to_be_paid_out = form.to_be_paid_out;
  payload.to_be_refinanced = form.to_be_refinanced;
  payload.monthly_repayment = liabilityMonthlyFrom(num(form.repayment_amount) || 0, form.repayment_frequency);
  return payload;
};

interface LiabilitiesTabProps {
  application: Application;
  currentUser: { id?: string } | null;
  assets: Asset[];
  onUpdate: () => void;
}

const LiabilitiesTab: React.FC<LiabilitiesTabProps> = ({ application, assets, onUpdate }) => {
  const toast = useToast();
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [liabilitiesLoading, setLiabilitiesLoading] = useState(false);
  const [showLiabilityModal, setShowLiabilityModal] = useState(false);
  const [editingLiability, setEditingLiability] = useState<Liability | null>(null);
  const [liabilityFormError, setLiabilityFormError] = useState<string | null>(null);
  const [submittingLiability, setSubmittingLiability] = useState(false);
  const [deletingLiabilityId, setDeletingLiabilityId] = useState<string | null>(null);
  const [liabilityForm, setLiabilityForm] = useState(emptyLiabilityForm());

  useEffect(() => {
    if (!application.id) return;
    setLiabilitiesLoading(true);
    applicationService.getLiabilities(application.id)
      .then((data) => setLiabilities(data || []))
      .catch(() => setLiabilities([]))
      .finally(() => setLiabilitiesLoading(false));
  }, [application.id]);

  const handleSaveLiabilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liabilityForm.liability_type) { setLiabilityFormError('Liability type is required.'); return; }
    setSubmittingLiability(true);
    setLiabilityFormError(null);
    try {
      const payload = buildLiabilityPayload(liabilityForm);
      if (editingLiability) {
        await applicationService.updateLiability(editingLiability.id, payload);
      } else {
        await applicationService.createLiability(application.id, payload);
      }
      const successMsg = editingLiability ? 'Liability updated' : 'Liability added';
      setShowLiabilityModal(false);
      setEditingLiability(null);
      setLiabilityForm(emptyLiabilityForm());
      const data = await applicationService.getLiabilities(application.id);
      setLiabilities(data || []);
      onUpdate();
      toast.success(successMsg);
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : err instanceof Error ? err.message : 'Failed to save liability.';
      setLiabilityFormError(msg);
    } finally {
      setSubmittingLiability(false);
    }
  };

  const handleDeleteLiability = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this liability?')) return;
    setDeletingLiabilityId(id);
    try {
      await applicationService.deleteLiability(id);
      const data = await applicationService.getLiabilities(application.id);
      setLiabilities(data || []);
      onUpdate();
      toast.success('Liability removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove liability');
    } finally {
      setDeletingLiabilityId(null);
    }
  };

  if (liabilitiesLoading) {
    return <div className="flex justify-center items-center py-24"><Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" /></div>;
  }

  const totalBalance = liabilities.reduce((sum, l) => sum + Number((l.current_balance as number) || 0), 0);
  const totalMonthly = liabilities.reduce((sum, l) => sum + liabilityMonthlyFrom(Number((l as any).repayment_amount) || 0, ((l as any).repayment_frequency as string) || 'Monthly'), 0);

  const lf = liabilityForm;
  const setLf = setLiabilityForm;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Liabilities</h3>
        <Button leftIcon="PlusCircle" type="button" onClick={() => { setEditingLiability(null); setLiabilityForm(emptyLiabilityForm()); setLiabilityFormError(null); setShowLiabilityModal(true); }}>
          Add Liability
        </Button>
      </div>

      {liabilities.length === 0 ? (
        <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">No liabilities recorded yet. Click &quot;Add Liability&quot; to add one.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {liabilities.map((l) => (
            <Card key={l.id} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary-50 dark:bg-primary-900/30 p-2">
                    <Icon name={getLiabilityIcon(l.liability_type)} className="h-4 w-4 text-primary-600 dark:text-primary-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{l.liability_type || 'Liability'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{l.lender || '—'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Balance: ${Number((l.current_balance as number) || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Monthly repayment: ${liabilityMonthlyFrom(Number((l as any).repayment_amount) || 0, ((l as any).repayment_frequency as string) || 'Monthly').toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" leftIcon="Pencil" onClick={() => { setEditingLiability(l); setLiabilityForm(liabilityToForm(l)); setLiabilityFormError(null); setShowLiabilityModal(true); }}>Edit</Button>
                  <Button type="button" variant="ghost" size="sm" leftIcon="Trash2" onClick={() => handleDeleteLiability(l.id)} disabled={deletingLiabilityId === l.id} isLoading={deletingLiabilityId === l.id}>Delete</Button>
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
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total balance and monthly repayments across all liabilities.</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Balance</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">${totalBalance.toLocaleString()}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Monthly Repayments</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">${totalMonthly.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {showLiabilityModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editingLiability ? 'Edit Liability' : 'Add Liability'}</h3>
              <button type="button" onClick={() => { setShowLiabilityModal(false); setEditingLiability(null); setLiabilityForm(emptyLiabilityForm()); setLiabilityFormError(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <Icon name="X" className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveLiabilitySubmit} className="flex flex-col min-h-0">
              <div className="overflow-y-auto p-4 flex-1 space-y-4">
                {liabilityFormError && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">{liabilityFormError}</p>}

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Liability Type</label>
                  <select value={lf.liability_type} onChange={(e) => setLf((f) => ({ ...f, liability_type: e.target.value as LiabilityType }))} className={inputClasses}>
                    <option value="Mortgage">Mortgage</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Personal Loan">Personal Loan</option>
                    <option value="Vehicle Loan">Vehicle Loan</option>
                    <option value="Student Loan">Student Loan</option>
                    <option value="Tax Debt">Tax Debt</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {lf.liability_type === 'Mortgage' && (
                  <FormSection title="Mortgage Details">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Lender</label><input type="text" value={lf.lender} onChange={(e) => setLf((f) => ({ ...f, lender: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account Number</label><input type="text" value={lf.account_number} onChange={(e) => setLf((f) => ({ ...f, account_number: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Original Limit</label><input type="number" min={0} value={lf.original_limit} onChange={(e) => setLf((f) => ({ ...f, original_limit: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Balance</label><input type="number" min={0} value={lf.current_balance} onChange={(e) => setLf((f) => ({ ...f, current_balance: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Interest Rate (%)</label><input type="number" min={0} step={0.01} value={lf.interest_rate} onChange={(e) => setLf((f) => ({ ...f, interest_rate: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Repayment Amount</label><input type="number" min={0} value={lf.repayment_amount} onChange={(e) => setLf((f) => ({ ...f, repayment_amount: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Repayment Frequency</label><select value={lf.repayment_frequency} onChange={(e) => setLf((f) => ({ ...f, repayment_frequency: e.target.value }))} className={inputClasses}>{FREQUENCIES.map((fq) => <option key={fq} value={fq}>{fq}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Repayment Type</label><select value={lf.repayment_type} onChange={(e) => setLf((f) => ({ ...f, repayment_type: e.target.value }))} className={inputClasses}><option value="">—</option><option>Principal &amp; Interest</option><option>Interest Only</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Loan Term End Date</label><input type="date" value={lf.loan_term_end_date} onChange={(e) => setLf((f) => ({ ...f, loan_term_end_date: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fixed Rate Expiry</label><input type="date" value={lf.fixed_rate_expiry} onChange={(e) => setLf((f) => ({ ...f, fixed_rate_expiry: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Mortgage Type</label><select value={lf.mortgage_type} onChange={(e) => setLf((f) => ({ ...f, mortgage_type: e.target.value }))} className={inputClasses}><option value="">—</option><option>Owner Occupied</option><option>Investment</option><option>Construction</option></select></div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Linked Asset</label>
                      <select value={lf.linked_asset_id} onChange={(e) => setLf((f) => ({ ...f, linked_asset_id: e.target.value }))} className={inputClasses}>
                        <option value="">—</option>
                        {assets.filter((a) => a.asset_type === 'Property').map((a) => <option key={a.id} value={a.id}>{(a as any).property_address || 'Property'}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2"><input type="checkbox" id="mortgage_to_be_refinanced" checked={lf.to_be_refinanced} onChange={(e) => setLf((f) => ({ ...f, to_be_refinanced: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="mortgage_to_be_refinanced" className="text-sm text-gray-700 dark:text-gray-300">To Be Refinanced</label></div>
                    <div className="flex items-center gap-2"><input type="checkbox" id="mortgage_to_be_paid_out" checked={lf.to_be_paid_out} onChange={(e) => setLf((f) => ({ ...f, to_be_paid_out: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="mortgage_to_be_paid_out" className="text-sm text-gray-700 dark:text-gray-300">To Be Paid Out</label></div>
                  </FormSection>
                )}

                {lf.liability_type === 'Credit Card' && (
                  <FormSection title="Credit Card">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Lender</label><input type="text" value={lf.lender} onChange={(e) => setLf((f) => ({ ...f, lender: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Card Type</label><select value={lf.card_type} onChange={(e) => setLf((f) => ({ ...f, card_type: e.target.value }))} className={inputClasses}><option value="">—</option><option>Visa</option><option>Mastercard</option><option>Amex</option><option>Other</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account Number</label><input type="text" value={lf.account_number} onChange={(e) => setLf((f) => ({ ...f, account_number: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Card Limit</label><input type="number" min={0} value={lf.original_limit} onChange={(e) => setLf((f) => ({ ...f, original_limit: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Balance</label><input type="number" min={0} value={lf.current_balance} onChange={(e) => setLf((f) => ({ ...f, current_balance: e.target.value }))} className={inputClasses} /></div>
                    <div className="flex items-center gap-2"><input type="checkbox" id="cc_to_be_paid_out" checked={lf.to_be_paid_out} onChange={(e) => setLf((f) => ({ ...f, to_be_paid_out: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="cc_to_be_paid_out" className="text-sm text-gray-700 dark:text-gray-300">To Be Paid Out</label></div>
                    <div className="flex items-center gap-2"><input type="checkbox" id="cc_to_be_refinanced" checked={lf.to_be_refinanced} onChange={(e) => setLf((f) => ({ ...f, to_be_refinanced: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="cc_to_be_refinanced" className="text-sm text-gray-700 dark:text-gray-300">To Be Refinanced</label></div>
                  </FormSection>
                )}

                {(lf.liability_type === 'Personal Loan' || lf.liability_type === 'Vehicle Loan' || lf.liability_type === 'Student Loan' || lf.liability_type === 'Tax Debt' || lf.liability_type === 'Other') && (
                  <FormSection title="Loan Details">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Lender</label><input type="text" value={lf.lender} onChange={(e) => setLf((f) => ({ ...f, lender: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account Number</label><input type="text" value={lf.account_number} onChange={(e) => setLf((f) => ({ ...f, account_number: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Original Limit</label><input type="number" min={0} value={lf.original_limit} onChange={(e) => setLf((f) => ({ ...f, original_limit: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Balance</label><input type="number" min={0} value={lf.current_balance} onChange={(e) => setLf((f) => ({ ...f, current_balance: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Interest Rate (%)</label><input type="number" min={0} step={0.01} value={lf.interest_rate} onChange={(e) => setLf((f) => ({ ...f, interest_rate: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Repayment Amount</label><input type="number" min={0} value={lf.repayment_amount} onChange={(e) => setLf((f) => ({ ...f, repayment_amount: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Repayment Frequency</label><select value={lf.repayment_frequency} onChange={(e) => setLf((f) => ({ ...f, repayment_frequency: e.target.value }))} className={inputClasses}>{FREQUENCIES.map((fq) => <option key={fq} value={fq}>{fq}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Loan Term End Date</label><input type="date" value={lf.loan_term_end_date} onChange={(e) => setLf((f) => ({ ...f, loan_term_end_date: e.target.value }))} className={inputClasses} /></div>
                    {lf.liability_type === 'Vehicle Loan' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Linked Asset</label>
                        <select value={lf.linked_asset_id} onChange={(e) => setLf((f) => ({ ...f, linked_asset_id: e.target.value }))} className={inputClasses}>
                          <option value="">—</option>
                          {assets.filter((a) => a.asset_type === 'Vehicle').map((a) => <option key={a.id} value={a.id}>{(a as any).vehicle_make || 'Vehicle'}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-2"><input type="checkbox" id="loan_to_be_paid_out" checked={lf.to_be_paid_out} onChange={(e) => setLf((f) => ({ ...f, to_be_paid_out: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="loan_to_be_paid_out" className="text-sm text-gray-700 dark:text-gray-300">To Be Paid Out</label></div>
                    <div className="flex items-center gap-2"><input type="checkbox" id="loan_to_be_refinanced" checked={lf.to_be_refinanced} onChange={(e) => setLf((f) => ({ ...f, to_be_refinanced: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="loan_to_be_refinanced" className="text-sm text-gray-700 dark:text-gray-300">To Be Refinanced</label></div>
                  </FormSection>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                <Button type="button" variant="secondary" onClick={() => { setShowLiabilityModal(false); setEditingLiability(null); setLiabilityForm(emptyLiabilityForm()); setLiabilityFormError(null); }}>Cancel</Button>
                <Button type="submit" isLoading={submittingLiability}>{editingLiability ? 'Save changes' : 'Add Liability'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiabilitiesTab;
