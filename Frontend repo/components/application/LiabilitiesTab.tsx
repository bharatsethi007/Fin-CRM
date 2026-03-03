import React, { useState, useEffect } from 'react';
import { applicationService, type Liability } from '../../services/applicationService';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { NZ_BANKS } from '../../constants';

const inputClasses = 'block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2';

const LIABILITY_TYPES = ['mortgage', 'personal_loan', 'credit_card', 'hire_purchase', 'overdraft', 'student_loan', 'other'] as const;

interface LiabilitiesTabProps {
  applicationId: string;
}

export const LiabilitiesTab: React.FC<LiabilitiesTabProps> = ({ applicationId }) => {
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetch = () => applicationService.getLiabilities(applicationId).then(setLiabilities).finally(() => setIsLoading(false));

  useEffect(() => { fetch(); }, [applicationId]);

  const total = liabilities.reduce((s, l) => s + (Number(l.current_balance) || 0), 0);

  if (isLoading) return <div className="flex justify-center py-8"><Icon name="Loader" className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Liabilities</h4>
        <div className="text-sm font-medium text-red-600">Total: ${total.toLocaleString()}</div>
      </div>
      <Button size="sm" leftIcon="Plus" onClick={() => setShowAddForm(true)} disabled={showAddForm}>Add Liability</Button>

      {liabilities.map(l => (
        <div key={l.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <button className="flex-1 flex items-center justify-between text-left" onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
              <div>
                <div className="font-medium capitalize">{String(l.liability_type).replace(/_/g, ' ')}</div>
                <div className="text-sm text-gray-500">{l.lender || '—'}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">${(Number(l.current_balance) || 0).toLocaleString()}</span>
                <Icon name={expandedId === l.id ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
              </div>
            </button>
            <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
              <Button variant="ghost" size="sm" onClick={() => setEditingId(l.id)}><Icon name="Pencil" className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Delete?')) { await applicationService.deleteLiability(l.id); fetch(); } }}><Icon name="Trash2" className="h-4 w-4 text-red-500" /></Button>
            </div>
          </div>
          {expandedId === l.id && (
            <div className="p-4 pt-0 border-t dark:border-gray-700">
              <LiabilityDetail liability={l} />
            </div>
          )}
        </div>
      ))}

      {showAddForm && <LiabilityFormModal applicationId={applicationId} onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); fetch(); }} />}
      {editingId && <LiabilityFormModal applicationId={applicationId} liability={liabilities.find(x => x.id === editingId)!} onClose={() => setEditingId(null)} onSaved={() => { setEditingId(null); fetch(); }} />}
    </div>
  );
};

const LiabilityDetail: React.FC<{ liability: Liability }> = ({ liability }) => (
  <div className="grid grid-cols-2 gap-2 text-sm">
    {liability.original_limit && <div><span className="text-gray-500">Original Limit:</span> ${Number(liability.original_limit).toLocaleString()}</div>}
    {liability.interest_rate != null && <div><span className="text-gray-500">Interest Rate:</span> {liability.interest_rate}%</div>}
    {liability.repayment_amount && <div><span className="text-gray-500">Repayment:</span> ${Number(liability.repayment_amount).toLocaleString()} {liability.repayment_frequency || ''}</div>}
    {liability.repayment_type && <div><span className="text-gray-500">Repayment Type:</span> {liability.repayment_type}</div>}
    {liability.to_be_refinanced && <div><span className="text-gray-500">To be refinanced</span></div>}
    {liability.to_be_paid_out && <div><span className="text-gray-500">To be paid out</span></div>}
    {liability.notes && <div className="col-span-2"><span className="text-gray-500">Notes:</span> {liability.notes}</div>}
  </div>
);

const LiabilityFormModal: React.FC<{ applicationId: string; liability?: Liability; onClose: () => void; onSaved: () => void }> = ({ applicationId, liability, onClose, onSaved }) => {
  const [liabilityType, setLiabilityType] = useState(liability?.liability_type || 'mortgage');
  const [form, setForm] = useState({
    liability_type: liability?.liability_type || 'mortgage',
    lender: liability?.lender || '',
    account_number: liability?.account_number || '',
    original_limit: liability?.original_limit ?? '',
    current_balance: liability?.current_balance ?? '',
    interest_rate: liability?.interest_rate ?? '',
    repayment_amount: liability?.repayment_amount ?? '',
    repayment_frequency: liability?.repayment_frequency || 'monthly',
    repayment_type: liability?.repayment_type || '',
    loan_term_end_date: liability?.loan_term_end_date || '',
    fixed_rate_expiry: liability?.fixed_rate_expiry || '',
    mortgage_type: liability?.mortgage_type || '',
    card_type: liability?.card_type || '',
    card_limit: liability?.card_limit ?? '',
    to_be_refinanced: liability?.to_be_refinanced ?? false,
    to_be_paid_out: liability?.to_be_paid_out ?? false,
    notes: liability?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.current_balance) {
      alert('Please enter current balance');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Liability> = {
        liability_type: liabilityType,
        lender: form.lender || undefined,
        account_number: form.account_number || undefined,
        original_limit: form.original_limit ? Number(form.original_limit) : undefined,
        current_balance: Number(form.current_balance),
        interest_rate: form.interest_rate ? Number(form.interest_rate) : undefined,
        repayment_amount: form.repayment_amount ? Number(form.repayment_amount) : undefined,
        repayment_frequency: form.repayment_frequency || undefined,
        repayment_type: form.repayment_type || undefined,
        loan_term_end_date: form.loan_term_end_date || undefined,
        fixed_rate_expiry: form.fixed_rate_expiry || undefined,
        mortgage_type: form.mortgage_type || undefined,
        card_type: form.card_type || undefined,
        card_limit: form.card_limit ? Number(form.card_limit) : undefined,
        to_be_refinanced: form.to_be_refinanced,
        to_be_paid_out: form.to_be_paid_out,
        notes: form.notes || undefined,
      };
      if (liability) await applicationService.updateLiability(liability.id, payload);
      else await applicationService.createLiability(applicationId, payload);
      onSaved();
    } catch (e: any) {
      alert(e?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        <h5 className="font-semibold mb-4">{liability ? 'Edit Liability' : 'Add Liability'}</h5>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Liability Type</label>
            <select className={inputClasses} value={liabilityType} onChange={e => setLiabilityType(e.target.value as any)}>
              {LIABILITY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lender</label>
            <select className={inputClasses} value={form.lender} onChange={e => setForm({ ...form, lender: e.target.value })}>
              <option value="">—</option>
              {NZ_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Current Balance ($) *</label>
            <input type="number" className={inputClasses} value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Original Limit ($)</label>
            <input type="number" className={inputClasses} value={form.original_limit} onChange={e => setForm({ ...form, original_limit: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Interest Rate %</label>
              <input type="number" step={0.01} className={inputClasses} value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Repayment Amount</label>
              <input type="number" className={inputClasses} value={form.repayment_amount} onChange={e => setForm({ ...form, repayment_amount: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Repayment Frequency</label>
            <select className={inputClasses} value={form.repayment_frequency} onChange={e => setForm({ ...form, repayment_frequency: e.target.value })}>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          {(liabilityType === 'mortgage' || liabilityType === 'personal_loan') && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mortgage/Loan Type</label>
                <input className={inputClasses} value={form.mortgage_type} onChange={e => setForm({ ...form, mortgage_type: e.target.value })} placeholder="Fixed, Floating, etc." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fixed Rate Expiry</label>
                  <input type="date" className={inputClasses} value={form.fixed_rate_expiry} onChange={e => setForm({ ...form, fixed_rate_expiry: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Loan Term End</label>
                  <input type="date" className={inputClasses} value={form.loan_term_end_date} onChange={e => setForm({ ...form, loan_term_end_date: e.target.value })} />
                </div>
              </div>
            </>
          )}
          {liabilityType === 'credit_card' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Card Limit ($)</label>
              <input type="number" className={inputClasses} value={form.card_limit} onChange={e => setForm({ ...form, card_limit: e.target.value })} />
            </div>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.to_be_refinanced} onChange={e => setForm({ ...form, to_be_refinanced: e.target.checked })} /> To be refinanced</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.to_be_paid_out} onChange={e => setForm({ ...form, to_be_paid_out: e.target.checked })} /> To be paid out</label>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea className={inputClasses} rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <Button size="sm" onClick={handleSave} isLoading={saving}>Save</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
