import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';

interface Props {
  applicationId: string;
  firmId: string;
}

const TriButton: React.FC<{
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}> = ({ label, options, value, onChange }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    <div className="flex gap-1">
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)}
          className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${value === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const YesNo: React.FC<{
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <div className="py-2 border-b border-gray-100 dark:border-gray-700">
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <div className="flex gap-2">
        {[true, false].map(v => (
          <button key={String(v)} onClick={() => onChange(v)}
            className={`px-3 py-1 text-xs rounded-full font-medium ${value === v ? (v ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {v ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
    {children}
  </div>
);

export const NeedsObjectivesTab: React.FC<Props> = ({ applicationId, firmId }) => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    loan_purpose_owner_occupied: false,
    loan_purpose_investment: false,
    loan_purpose_purchase: false,
    loan_purpose_construction: false,
    loan_purpose_renovation: false,
    loan_purpose_refinance: false,
    loan_purpose_debt_consolidation: false,
    loan_purpose_other: false,
    loan_purpose_other_text: '',
    immediate_needs: '',
    long_term_goals: '',
    adverse_changes: null as boolean | null,
    adverse_changes_details: '',
    beneficial_changes: null as boolean | null,
    beneficial_changes_details: '',
    exit_strategy_retirement_age: '' as number | '',
    exit_strategy_repay_before_retirement: false,
    exit_strategy_downsize: false,
    exit_strategy_sell_assets: false,
    exit_strategy_super_income: false,
    exit_strategy_other: false,
    exit_strategy_other_text: '',
    financial_experience: '',
    interest_rate_concern: '',
    loan_flexibility_importance: '',
    job_security_concern: '',
    property_value_concern: '',
    has_emergency_fund: null as boolean | null,
    can_maintain_lifestyle: null as boolean | null,
    has_adequate_insurance: null as boolean | null,
    insurance_comments: '',
    has_will: null as boolean | null,
    no_payment_issues: null as boolean | null,
    not_officer_liquidator: null as boolean | null,
    no_unsatisfied_judgements: null as boolean | null,
    no_simultaneous_applications: null as boolean | null,
    bankruptcy_details: '',
    priority_lowest_cost: '',
    priority_approved_quickly: '',
    priority_loan_features: '',
    priority_lender_capacity: '',
    priority_comments: '',
    additional_notes: '',
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('needs_objectives')
        .select('*')
        .eq('application_id', applicationId)
        .maybeSingle();
      if (data) setForm(f => ({ ...f, ...data }));
    };
    load();
  }, [applicationId]);

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get current advisor's firm_id directly
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: advisor } = await supabase
        .from('advisors')
        .select('firm_id')
        .eq('id', user.id)
        .single();

      if (!advisor) throw new Error('Advisor not found');

      const payload = {
        ...form,
        exit_strategy_retirement_age:
          form.exit_strategy_retirement_age === '' ? null : Number(form.exit_strategy_retirement_age),
      };

      const { error } = await supabase
        .from('needs_objectives')
        .upsert(
          {
            application_id: applicationId,
            firm_id: advisor.firm_id,
            ...payload,
          },
          { onConflict: 'application_id' }
        );

      if (error) {
        logger.error('Save error:', error);
        alert('Error saving: ' + error.message);
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      logger.error('Unexpected error:', e);
      alert('Error: ' + (e instanceof Error ? e.message : 'Unexpected error saving'));
    } finally {
      setSaving(false);
    }
  };

  const cb = (key: string) => (
    <input type="checkbox" checked={!!(form as any)[key]}
      onChange={e => set(key, e.target.checked)}
      className="rounded border-gray-300 text-blue-600" />
  );

  return (
    <div className="space-y-6">
      {/* Loan Purpose */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Loan Purpose</h3>
        <div className="grid grid-cols-2 gap-3">
          {[['loan_purpose_owner_occupied','Owner Occupied'],['loan_purpose_investment','Investment'],['loan_purpose_purchase','Purchase'],['loan_purpose_construction','Construction'],['loan_purpose_renovation','Renovation'],['loan_purpose_refinance','Refinance'],['loan_purpose_debt_consolidation','Debt Consolidation'],['loan_purpose_other','Other']].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              {cb(key)} {label}
            </label>
          ))}
        </div>
        {form.loan_purpose_other && (
          <input value={form.loan_purpose_other_text} onChange={e => set('loan_purpose_other_text', e.target.value)}
            placeholder="Describe other purpose..." className="mt-3 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
        )}
      </div>

      {/* Needs & Objectives */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Needs & Objectives</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Immediate Needs</label>
            <textarea value={form.immediate_needs} onChange={e => set('immediate_needs', e.target.value)} rows={3}
              placeholder="What does the client need right now?" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Long Term Goals</label>
            <textarea value={form.long_term_goals} onChange={e => set('long_term_goals', e.target.value)} rows={3}
              placeholder="What are the client's long term financial goals?" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
          </div>
        </div>
      </div>

      {/* Future Changes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Future Financial Changes</h3>
        <YesNo label="Are there any anticipated ADVERSE changes to financial situation?" value={form.adverse_changes} onChange={v => set('adverse_changes', v)}>
          {form.adverse_changes && <textarea value={form.adverse_changes_details} onChange={e => set('adverse_changes_details', e.target.value)} rows={2} placeholder="Details..." className="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />}
        </YesNo>
        <YesNo label="Are there any anticipated BENEFICIAL changes to financial situation?" value={form.beneficial_changes} onChange={v => set('beneficial_changes', v)}>
          {form.beneficial_changes && <textarea value={form.beneficial_changes_details} onChange={e => set('beneficial_changes_details', e.target.value)} rows={2} placeholder="Details..." className="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />}
        </YesNo>
      </div>

      {/* Exit Strategy */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Exit Strategy</h3>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Planned Retirement Age</label>
          <input type="number" value={form.exit_strategy_retirement_age} onChange={e => set('exit_strategy_retirement_age', e.target.value === '' ? '' : Number(e.target.value))}
            className="w-32 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
        </div>
        <p className="text-xs font-medium text-gray-500 uppercase mb-2">How will the loan be repaid?</p>
        <div className="grid grid-cols-2 gap-2">
          {[['exit_strategy_repay_before_retirement','Repay before retirement'],['exit_strategy_downsize','Downsize home'],['exit_strategy_sell_assets','Sale of assets'],['exit_strategy_super_income','KiwiSaver/Super income'],['exit_strategy_other','Other']].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">{cb(key)} {label}</label>
          ))}
        </div>
        {form.exit_strategy_other && (
          <input value={form.exit_strategy_other_text} onChange={e => set('exit_strategy_other_text', e.target.value)}
            placeholder="Other exit strategy..." className="mt-3 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
        )}
      </div>

      {/* Financial Profile */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Financial Profile</h3>
        <TriButton label="Financial experience level" options={['Low','Medium','High']} value={form.financial_experience} onChange={v => set('financial_experience', v)} />
        <TriButton label="Concern about interest rate movements" options={['Low','Medium','High']} value={form.interest_rate_concern} onChange={v => set('interest_rate_concern', v)} />
        <TriButton label="Importance of loan flexibility" options={['Low','Medium','High']} value={form.loan_flexibility_importance} onChange={v => set('loan_flexibility_importance', v)} />
        <TriButton label="Concern about job security" options={['Low','Medium','High']} value={form.job_security_concern} onChange={v => set('job_security_concern', v)} />
        <TriButton label="Concern about property value fluctuations" options={['Low','Medium','High']} value={form.property_value_concern} onChange={v => set('property_value_concern', v)} />
      </div>

      {/* Protection & Insurance */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Protection & Insurance</h3>
        <YesNo label="Has emergency fund or liquid assets?" value={form.has_emergency_fund} onChange={v => set('has_emergency_fund', v)} />
        <YesNo label="Can maintain lifestyle if partner unable to earn?" value={form.can_maintain_lifestyle} onChange={v => set('can_maintain_lifestyle', v)} />
        <YesNo label="Has adequate insurance (life, income protection)?" value={form.has_adequate_insurance} onChange={v => set('has_adequate_insurance', v)}>
          {form.has_adequate_insurance === false && (
            <textarea value={form.insurance_comments} onChange={e => set('insurance_comments', e.target.value)} rows={2}
              placeholder="Comments on insurance gaps..." className="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
          )}
        </YesNo>
        <YesNo label="Has a will?" value={form.has_will} onChange={v => set('has_will', v)} />
      </div>

      {/* Credit History */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Credit History</h3>
        <YesNo label="No payment problems with fixed commitments?" value={form.no_payment_issues} onChange={v => set('no_payment_issues', v)} />
        <YesNo label="Not an officer of a company under liquidation?" value={form.not_officer_liquidator} onChange={v => set('not_officer_liquidator', v)} />
        <YesNo label="No unsatisfied judgements in court?" value={form.no_unsatisfied_judgements} onChange={v => set('no_unsatisfied_judgements', v)} />
        <YesNo label="No simultaneous applications with other lenders?" value={form.no_simultaneous_applications} onChange={v => set('no_simultaneous_applications', v)} />
        <div className="pt-2">
          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Bankruptcy Details (leave blank if none)</label>
          <input value={form.bankruptcy_details} onChange={e => set('bankruptcy_details', e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
        </div>
      </div>

      {/* Priorities */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">What Is Most Important?</h3>
        <TriButton label="Lowest overall loan cost" options={['Most Important','Somewhat Important','Least Important']} value={form.priority_lowest_cost} onChange={v => set('priority_lowest_cost', v)} />
        <TriButton label="Loan approved quickly" options={['Most Important','Somewhat Important','Least Important']} value={form.priority_approved_quickly} onChange={v => set('priority_approved_quickly', v)} />
        <TriButton label="Specific loan features" options={['Most Important','Somewhat Important','Least Important']} value={form.priority_loan_features} onChange={v => set('priority_loan_features', v)} />
        <TriButton label="Lender borrowing capacity" options={['Most Important','Somewhat Important','Least Important']} value={form.priority_lender_capacity} onChange={v => set('priority_lender_capacity', v)} />
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Comments</label>
          <textarea value={form.priority_comments} onChange={e => set('priority_comments', e.target.value)} rows={2}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
        </div>
      </div>

      {/* Additional Notes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Additional Notes</h3>
        <textarea value={form.additional_notes} onChange={e => set('additional_notes', e.target.value)} rows={4}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Needs & Objectives'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
      </div>
    </div>
  );
};

