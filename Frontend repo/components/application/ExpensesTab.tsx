import React, { useState, useEffect } from 'react';
import { applicationService, type Expense } from '../../services/api';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';

const inputClasses = 'block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2';

const EXPENSE_CATEGORIES: { key: string; label: string; group: string }[] = [
  { key: 'food_groceries', label: 'Food & Groceries', group: 'discretionary' },
  { key: 'dining_takeaway', label: 'Dining & Takeaway', group: 'discretionary' },
  { key: 'alcohol_tobacco', label: 'Alcohol & Tobacco', group: 'discretionary' },
  { key: 'entertainment', label: 'Entertainment', group: 'discretionary' },
  { key: 'holidays_travel', label: 'Holidays & Travel', group: 'discretionary' },
  { key: 'clothing_personal', label: 'Clothing & Personal', group: 'discretionary' },
  { key: 'grooming_beauty', label: 'Grooming & Beauty', group: 'discretionary' },
  { key: 'phone_internet', label: 'Phone & Internet', group: 'discretionary' },
  { key: 'streaming_subscriptions', label: 'Streaming & Subscriptions', group: 'discretionary' },
  { key: 'gifts_donations', label: 'Gifts & Donations', group: 'discretionary' },
  { key: 'pets', label: 'Pets', group: 'discretionary' },
  { key: 'other_discretionary', label: 'Other Discretionary', group: 'discretionary' },
  { key: 'childcare', label: 'Childcare', group: 'essential' },
  { key: 'school_fees_public', label: 'School Fees (Public)', group: 'essential' },
  { key: 'school_fees_private', label: 'School Fees (Private)', group: 'essential' },
  { key: 'tertiary_education', label: 'Tertiary Education', group: 'essential' },
  { key: 'health_insurance', label: 'Health Insurance', group: 'essential' },
  { key: 'medical_dental', label: 'Medical & Dental', group: 'essential' },
  { key: 'gym_sports', label: 'Gym & Sports', group: 'essential' },
  { key: 'life_insurance', label: 'Life Insurance', group: 'essential' },
  { key: 'income_protection', label: 'Income Protection', group: 'essential' },
  { key: 'vehicle_running_costs', label: 'Vehicle Running Costs', group: 'essential' },
  { key: 'vehicle_insurance', label: 'Vehicle Insurance', group: 'essential' },
  { key: 'public_transport', label: 'Public Transport', group: 'essential' },
  { key: 'rates', label: 'Rates', group: 'essential' },
  { key: 'body_corporate', label: 'Body Corporate', group: 'essential' },
  { key: 'home_insurance', label: 'Home Insurance', group: 'essential' },
  { key: 'utilities', label: 'Utilities', group: 'essential' },
  { key: 'rent_board', label: 'Rent / Board', group: 'essential' },
  { key: 'property_maintenance', label: 'Property Maintenance', group: 'essential' },
  { key: 'child_support', label: 'Child Support', group: 'essential' },
  { key: 'spousal_maintenance', label: 'Spousal Maintenance', group: 'essential' },
  { key: 'other_regular_commitments', label: 'Other Regular Commitments', group: 'essential' },
];

type ExpenseForm = Record<string, number | string>;

function toForm(exp: Expense | null): ExpenseForm {
  const f: ExpenseForm = { household_name: '' };
  EXPENSE_CATEGORIES.forEach(c => { f[c.key] = (exp as any)?.[c.key] ?? ''; });
  if (exp) f.household_name = exp.household_name ?? '';
  return f;
}

function computeTotals(form: ExpenseForm) {
  let totalEssential = 0, totalDiscretionary = 0;
  EXPENSE_CATEGORIES.forEach(c => {
    const v = Number(form[c.key]) || 0;
    if (c.group === 'essential') totalEssential += v;
    else totalDiscretionary += v;
  });
  return { totalEssential, totalDiscretionary, totalMonthly: totalEssential + totalDiscretionary };
}

interface ExpensesTabProps {
  applicationId: string;
}

export const ExpensesTab: React.FC<ExpensesTabProps> = ({ applicationId }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetch = () => applicationService.getExpenses(applicationId).then(setExpenses).finally(() => setIsLoading(false));

  useEffect(() => { fetch(); }, [applicationId]);

  const total = expenses.reduce((s, e) => s + (Number(e.total_monthly) || 0), 0);

  if (isLoading) return <div className="flex justify-center py-8"><Icon name="Loader" className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Monthly Expenses</h4>
        <div className="text-sm font-medium text-primary-600">Total: ${total.toLocaleString()}/mo</div>
      </div>
      <Button size="sm" leftIcon="Plus" onClick={() => setShowAddForm(true)} disabled={showAddForm}>Add Expense Record</Button>

      {expenses.map(e => (
        <div key={e.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <button className="flex-1 flex items-center justify-between text-left" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
              <div>
                <div className="font-medium">{e.household_name || 'Household'}</div>
                <div className="text-sm text-gray-500">Total: ${(e.total_monthly || 0).toLocaleString()}/mo</div>
              </div>
              <Icon name={expandedId === e.id ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
            </button>
            <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
              <Button variant="ghost" size="sm" onClick={() => setEditingId(e.id)}><Icon name="Pencil" className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Delete?')) { await applicationService.deleteExpense(e.id); fetch(); } }}><Icon name="Trash2" className="h-4 w-4 text-red-500" /></Button>
            </div>
          </div>
          {expandedId === e.id && (
            <div className="p-4 pt-0 border-t dark:border-gray-700">
              <ExpenseBreakdown expense={e} />
            </div>
          )}
        </div>
      ))}

      {showAddForm && <ExpenseFormModal applicationId={applicationId} onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); fetch(); }} />}
      {editingId && <ExpenseFormModal applicationId={applicationId} expense={expenses.find(x => x.id === editingId)!} onClose={() => setEditingId(null)} onSaved={() => { setEditingId(null); fetch(); }} />}
    </div>
  );
};

const ExpenseBreakdown: React.FC<{ expense: Expense }> = ({ expense }) => {
  const essential = EXPENSE_CATEGORIES.filter(c => c.group === 'essential');
  const discretionary = EXPENSE_CATEGORIES.filter(c => c.group === 'discretionary');
  const renderRow = (c: typeof EXPENSE_CATEGORIES[0]) => {
    const v = Number(expense[c.key]) || 0;
    if (!v) return null;
    return <div key={c.key} className="flex justify-between text-sm py-1"><span className="text-gray-600 dark:text-gray-400">{c.label}</span><span>${v.toLocaleString()}</span></div>;
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div>
        <h6 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Essential</h6>
        {essential.map(renderRow).filter(Boolean).length ? essential.map(renderRow) : <p className="text-gray-500">—</p>}
      </div>
      <div>
        <h6 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Discretionary</h6>
        {discretionary.map(renderRow).filter(Boolean).length ? discretionary.map(renderRow) : <p className="text-gray-500">—</p>}
      </div>
    </div>
  );
};

const ExpenseFormModal: React.FC<{ applicationId: string; expense?: Expense; onClose: () => void; onSaved: () => void }> = ({ applicationId, expense, onClose, onSaved }) => {
  const [form, setForm] = useState<ExpenseForm>(() => toForm(expense || null));
  const [saving, setSaving] = useState(false);
  const [discretionaryOpen, setDiscretionaryOpen] = useState(true);
  const [essentialOpen, setEssentialOpen] = useState(true);
  const { totalEssential, totalDiscretionary, totalMonthly } = computeTotals(form);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<Expense> = {
        household_name: String(form.household_name || 'Household'),
        total_monthly: totalMonthly,
        total_essential: totalEssential,
        total_discretionary: totalDiscretionary,
        expense_frequency: 'monthly',
      };
      EXPENSE_CATEGORIES.forEach(c => { (payload as any)[c.key] = Number(form[c.key]) || null; });
      if (expense) await applicationService.updateExpense(expense.id, payload);
      else await applicationService.createExpense(applicationId, payload);
      onSaved();
    } catch (e: any) {
      alert(e?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <h5 className="font-semibold mb-4">{expense ? 'Edit Expense' : 'Add Expense Record'}</h5>
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Household Name</label>
          <input className={inputClasses} value={form.household_name} onChange={e => setForm({ ...form, household_name: e.target.value })} placeholder="e.g. Joint" />
        </div>

        <div className="border dark:border-gray-700 rounded-lg mb-4">
          <button className="w-full flex justify-between p-3 text-left font-medium" onClick={() => setDiscretionaryOpen(!discretionaryOpen)}>
            Discretionary Expenses
            <Icon name={discretionaryOpen ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
          </button>
          {discretionaryOpen && (
            <div className="p-3 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXPENSE_CATEGORIES.filter(c => c.group === 'discretionary').map(c => (
                <div key={c.key}>
                  <label className="block text-xs text-gray-500">{c.label}</label>
                  <input type="number" className={inputClasses} value={form[c.key]} onChange={e => setForm({ ...form, [c.key]: e.target.value })} placeholder="0" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border dark:border-gray-700 rounded-lg mb-4">
          <button className="w-full flex justify-between p-3 text-left font-medium" onClick={() => setEssentialOpen(!essentialOpen)}>
            Essential Expenses
            <Icon name={essentialOpen ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
          </button>
          {essentialOpen && (
            <div className="p-3 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXPENSE_CATEGORIES.filter(c => c.group === 'essential').map(c => (
                <div key={c.key}>
                  <label className="block text-xs text-gray-500">{c.label}</label>
                  <input type="number" className={inputClasses} value={form[c.key]} onChange={e => setForm({ ...form, [c.key]: e.target.value })} placeholder="0" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg mb-4">
          <div className="flex justify-between text-sm"><span>Essential:</span><span>${totalEssential.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span>Discretionary:</span><span>${totalDiscretionary.toLocaleString()}</span></div>
          <div className="flex justify-between font-semibold mt-2 pt-2 border-t dark:border-gray-700"><span>Total Monthly:</span><span className="text-primary-600">${totalMonthly.toLocaleString()}</span></div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} isLoading={saving}>Save</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
