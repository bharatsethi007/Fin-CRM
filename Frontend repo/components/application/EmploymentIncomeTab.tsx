import React, { useState, useEffect } from 'react';
import { applicationService, type Employment, type Income } from '../../services/api';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { NZ_REGIONS } from '../../constants';

const inputClasses = 'block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2';

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Casual', 'Contract', 'Self-employed', 'Contractor', 'Other'];
const INCOME_TYPES = ['Salary/Wages', 'Self-employed', 'Rental', 'Investment', 'Government benefit', 'Other'];

interface EmploymentIncomeTabProps {
  applicationId: string;
}

export const EmploymentIncomeTab: React.FC<EmploymentIncomeTabProps> = ({ applicationId }) => {
  const [applicants, setApplicants] = useState<{ id: string; first_name: string; surname: string }[]>([]);
  const [employmentByApplicant, setEmploymentByApplicant] = useState<Record<string, Employment[]>>({});
  const [incomeByApplicant, setIncomeByApplicant] = useState<Record<string, Income[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [addEmploymentFor, setAddEmploymentFor] = useState<string | null>(null);
  const [editEmployment, setEditEmployment] = useState<Employment | null>(null);
  const [addIncomeFor, setAddIncomeFor] = useState<string | null>(null);
  const [editIncome, setEditIncome] = useState<Income | null>(null);

  const fetch = async () => {
    setIsLoading(true);
    const apps = await applicationService.getApplicants(applicationId);
    setApplicants(apps);
    const emp: Record<string, Employment[]> = {};
    const inc: Record<string, Income[]> = {};
    for (const a of apps) {
      emp[a.id] = await applicationService.getEmployment(a.id);
      inc[a.id] = await applicationService.getIncome(a.id);
    }
    setEmploymentByApplicant(emp);
    setIncomeByApplicant(inc);
    setIsLoading(false);
  };

  useEffect(() => { fetch(); }, [applicationId]);

  const totalIncome = (Object.values(incomeByApplicant).flat() as Income[]).reduce((sum, i) => sum + (Number(i.annual_gross_total) || 0), 0);

  if (isLoading) return <div className="flex justify-center py-8"><Icon name="Loader" className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Employment & Income</h4>
        <div className="text-sm font-medium text-primary-600">Total Annual Income: ${totalIncome.toLocaleString()}</div>
      </div>
      {applicants.map(app => (
        <div key={app.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30" onClick={() => setExpanded(e => ({ ...e, [app.id]: !e[app.id] }))}>
            <span className="font-medium">{[app.first_name, app.surname].filter(Boolean).join(' ')}</span>
            <Icon name={expanded[app.id] ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
          </button>
          {expanded[app.id] && (
            <div className="p-4 pt-0 border-t dark:border-gray-700 space-y-4">
              <div>
                <h5 className="text-sm font-medium mb-2">Employment ({employmentByApplicant[app.id]?.length || 0})</h5>
                {(employmentByApplicant[app.id] || []).map(e => (
                  <div key={e.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded mb-2 text-sm flex justify-between items-start">
                    <div>
                      <div className="font-medium">{e.employer_name || 'Employer'}</div>
                      <div className="text-gray-500">{e.occupation} • {e.employment_type}</div>
                      {e.start_date && <div className="text-xs text-gray-400">{e.start_date} – {e.end_date || 'Current'}</div>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditEmployment(e)}><Icon name="Pencil" className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Delete?')) { await applicationService.deleteEmployment(e.id); fetch(); } }}><Icon name="Trash2" className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="secondary" leftIcon="Plus" className="mt-2" onClick={() => setAddEmploymentFor(app.id)}>Add Employment</Button>
              </div>
              <div>
                <h5 className="text-sm font-medium mb-2">Income ({incomeByApplicant[app.id]?.length || 0})</h5>
                {(incomeByApplicant[app.id] || []).map(i => (
                  <div key={i.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded mb-2 text-sm flex justify-between items-center">
                    <span>{i.income_type}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">${(i.annual_gross_total || 0).toLocaleString()}/yr</span>
                      <Button variant="ghost" size="sm" onClick={() => setEditIncome(i)}><Icon name="Pencil" className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Delete?')) { await applicationService.deleteIncome(i.id); fetch(); } }}><Icon name="Trash2" className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="secondary" leftIcon="Plus" className="mt-2" onClick={() => setAddIncomeFor(app.id)}>Add Income</Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {addEmploymentFor && (
        <EmploymentForm applicantId={addEmploymentFor} onClose={() => setAddEmploymentFor(null)} onSaved={() => { setAddEmploymentFor(null); fetch(); }} />
      )}
      {editEmployment && (
        <EmploymentForm applicantId={editEmployment.applicant_id} employment={editEmployment} onClose={() => setEditEmployment(null)} onSaved={() => { setEditEmployment(null); fetch(); }} />
      )}
      {addIncomeFor && (
        <IncomeForm applicantId={addIncomeFor} onClose={() => setAddIncomeFor(null)} onSaved={() => { setAddIncomeFor(null); fetch(); }} />
      )}
      {editIncome && (
        <IncomeForm applicantId={editIncome.applicant_id} income={editIncome} onClose={() => setEditIncome(null)} onSaved={() => { setEditIncome(null); fetch(); }} />
      )}
    </div>
  );
};

const EmploymentForm: React.FC<{ applicantId: string; employment?: Employment; onClose: () => void; onSaved: () => void }> = ({ applicantId, employment, onClose, onSaved }) => {
  const [form, setForm] = useState({
    employment_type: employment?.employment_type || '',
    employer_name: employment?.employer_name || '',
    occupation: employment?.occupation || '',
    job_title: employment?.job_title || '',
    start_date: employment?.start_date || '',
    end_date: employment?.end_date || '',
    employer_region: employment?.employer_region || '',
  });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    try {
      if (employment) await applicationService.updateEmployment(employment.id, form);
      else await applicationService.createEmployment(applicantId, form);
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
        <h5 className="font-semibold mb-4">{employment ? 'Edit Employment' : 'Add Employment'}</h5>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Employment Type</label>
            <select className={inputClasses} value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}>
              <option value="">—</option>
              {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Employer Name *</label>
            <input className={inputClasses} value={form.employer_name} onChange={e => setForm({ ...form, employer_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Occupation</label>
              <input className={inputClasses} value={form.occupation} onChange={e => setForm({ ...form, occupation: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Job Title</label>
              <input className={inputClasses} value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input type="date" className={inputClasses} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input type="date" className={inputClasses} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Region</label>
            <select className={inputClasses} value={form.employer_region} onChange={e => setForm({ ...form, employer_region: e.target.value })}>
              <option value="">—</option>
              {NZ_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
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

const IncomeForm: React.FC<{ applicantId: string; income?: Income; onClose: () => void; onSaved: () => void }> = ({ applicantId, income, onClose, onSaved }) => {
  const [form, setForm] = useState({
    income_type: income?.income_type || 'Salary/Wages',
    gross_salary: income?.gross_salary ?? '',
    annual_gross_total: income?.annual_gross_total ?? '',
    salary_frequency: income?.salary_frequency || 'annual',
    rental_gross_monthly: income?.rental_gross_monthly ?? '',
    rental_ownership_percent: income?.rental_ownership_percent ?? '',
    other_income_description: income?.other_income_description || '',
    other_income_amount: income?.other_income_amount ?? '',
    other_income_frequency: income?.other_income_frequency || 'monthly',
  });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<Income> = {
        income_type: form.income_type,
        annual_gross_total: Number(form.annual_gross_total) || (form.income_type === 'Salary/Wages' && form.gross_salary ? Number(form.gross_salary) : null),
        salary_frequency: form.salary_frequency,
        gross_salary: form.gross_salary ? Number(form.gross_salary) : undefined,
        rental_gross_monthly: form.rental_gross_monthly ? Number(form.rental_gross_monthly) : undefined,
        rental_ownership_percent: form.rental_ownership_percent ? Number(form.rental_ownership_percent) : undefined,
        other_income_description: form.other_income_description || undefined,
        other_income_amount: form.other_income_amount ? Number(form.other_income_amount) : undefined,
        other_income_frequency: form.other_income_frequency,
      };
      if (form.income_type === 'Rental' && form.rental_gross_monthly) {
        payload.annual_gross_total = Number(form.rental_gross_monthly) * 12 * (Number(form.rental_ownership_percent) || 100) / 100;
      } else if (form.income_type === 'Other' && form.other_income_amount) {
        const mult = form.other_income_frequency === 'annual' ? 1 : form.other_income_frequency === 'monthly' ? 12 : 52;
        payload.annual_gross_total = Number(form.other_income_amount) * mult;
      }
      if (income) await applicationService.updateIncome(income.id, payload);
      else await applicationService.createIncome(applicantId, payload);
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
        <h5 className="font-semibold mb-4">{income ? 'Edit Income' : 'Add Income'}</h5>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Income Type</label>
            <select className={inputClasses} value={form.income_type} onChange={e => setForm({ ...form, income_type: e.target.value })}>
              {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {form.income_type === 'Salary/Wages' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Gross Salary / Annual Total</label>
                <input type="number" className={inputClasses} placeholder="Annual gross" value={form.annual_gross_total} onChange={e => setForm({ ...form, annual_gross_total: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                <select className={inputClasses} value={form.salary_frequency} onChange={e => setForm({ ...form, salary_frequency: e.target.value })}>
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </>
          )}
          {form.income_type === 'Rental' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Gross Monthly Rental</label>
                <input type="number" className={inputClasses} value={form.rental_gross_monthly} onChange={e => setForm({ ...form, rental_gross_monthly: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ownership %</label>
                <input type="number" className={inputClasses} min={0} max={100} value={form.rental_ownership_percent} onChange={e => setForm({ ...form, rental_ownership_percent: e.target.value })} />
              </div>
            </>
          )}
          {form.income_type === 'Other' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input className={inputClasses} value={form.other_income_description} onChange={e => setForm({ ...form, other_income_description: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount</label>
                <input type="number" className={inputClasses} value={form.other_income_amount} onChange={e => setForm({ ...form, other_income_amount: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                <select className={inputClasses} value={form.other_income_frequency} onChange={e => setForm({ ...form, other_income_frequency: e.target.value })}>
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2 mt-6">
          <Button size="sm" onClick={handleSave} isLoading={saving}>Save</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
