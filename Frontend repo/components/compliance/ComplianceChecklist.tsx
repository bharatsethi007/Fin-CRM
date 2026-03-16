import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Props {
  applicationId: string;
}

const CheckItem: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  date?: string;
  onDateChange?: (v: string) => void;
  dateLabel?: string;
  note?: string;
}> = ({ label, checked, onChange, date, onDateChange, dateLabel, note }) => (
  <div className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="mt-0.5 rounded border-gray-300 text-blue-600 h-4 w-4 flex-shrink-0"
    />
    <div className="flex-1">
      <span
        className={`text-sm ${
          checked ? 'text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        {label}
      </span>
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
      {checked && onDateChange && (
        <div className="mt-1 flex items-center gap-2">
          <label className="text-xs text-gray-400">{dateLabel || 'Date:'}</label>
          <input
            type="date"
            value={date || ''}
            onChange={e => onDateChange(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 dark:bg-gray-700 dark:text-white"
          />
        </div>
      )}
    </div>
    {checked && <span className="text-green-500 text-xs flex-shrink-0">✓</span>}
  </div>
);

export const ComplianceChecklist: React.FC<Props> = ({ applicationId }) => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [score, setScore] = useState(0);
  const [form, setForm] = useState({
    kyc_identity_verified: false,
    kyc_identity_verified_date: '',
    kyc_identity_method: '',
    kyc_address_verified: false,
    kyc_source_of_funds_verified: false,
    kyc_aml_checked: false,
    kyc_pep_checked: false,
    kyc_notes: '',
    cccfa_affordability_assessed: false,
    cccfa_expenses_verified: false,
    cccfa_income_verified: false,
    cccfa_credit_checked: false,
    cccfa_hardship_discussed: false,
    cccfa_notes: '',
    disclosure_statement_provided: false,
    disclosure_statement_date: '',
    disclosure_signed: false,
    disclosure_signed_date: '',
    needs_objectives_completed: false,
    soa_prepared: false,
    soa_date: '',
    soa_approved_by_client: false,
    client_authority_obtained: false,
    lender_application_submitted: false,
    lender_submission_date: '',
    lender_name: '',
    settlement_confirmed: false,
    settlement_date: '',
    post_settlement_review_scheduled: false,
    notes: '',
  });

  const calculateScore = (f: typeof form) => {
    const checks = [
      f.kyc_identity_verified,
      f.kyc_address_verified,
      f.kyc_aml_checked,
      f.cccfa_affordability_assessed,
      f.cccfa_income_verified,
      f.cccfa_expenses_verified,
      f.disclosure_statement_provided,
      f.needs_objectives_completed,
      f.soa_prepared,
    ];
    return Math.round((checks.filter(Boolean).length * 100) / checks.length);
  };

  useEffect(() => {
    setScore(calculateScore(form));
  }, [form]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('compliance_checklists')
        .select('*')
        .eq('application_id', applicationId)
        .maybeSingle();
      if (data) {
        const { compliance_score: _s, ...rest } = data as Record<string, unknown> & { compliance_score?: number };
        setForm(f => ({ ...f, ...rest }));
      }
    };
    load();
  }, [applicationId]);

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data: advisor } = await supabase
        .from('advisors')
        .select('firm_id')
        .eq('id', user.id)
        .single();

      if (!advisor) {
        throw new Error('Advisor not found');
      }

      // Convert empty strings to null for date fields; exclude calculated compliance_score
      const sanitised = Object.fromEntries(
        Object.entries(form)
          .filter(([key]) => key !== 'compliance_score')
          .map(([key, val]) => {
            const dateFields = [
              'kyc_identity_verified_date',
              'disclosure_statement_date',
              'disclosure_signed_date',
              'soa_date',
              'lender_submission_date',
              'settlement_date',
            ];
            if (dateFields.includes(key) && val === '') return [key, null];
            return [key, val];
          })
      );

      const { error } = await supabase
        .from('compliance_checklists')
        .upsert(
          {
            application_id: applicationId,
            firm_id: (advisor as any).firm_id,
            advisor_id: user.id,
            ...sanitised,
          },
          { onConflict: 'application_id' }
        );

      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert('Error saving: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const scoreColor =
    score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const scoreBg =
    score >= 80 ? 'bg-green-100' : score >= 50 ? 'bg-yellow-100' : 'bg-red-100';

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className={`${scoreBg} rounded-xl p-4 flex items-center justify-between`}>
        <div>
          <p className="text-sm font-medium text-gray-700">Compliance Score</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Based on 9 key compliance items
          </p>
        </div>
        <div className={`text-4xl font-bold ${scoreColor}`}>{score}%</div>
      </div>

      {/* KYC */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          KYC & AML Verification
        </h3>
        <p className="text-xs text-gray-400 mb-4">Required under AML/CFT Act 2009</p>
        <CheckItem
          label="Identity verified"
          checked={form.kyc_identity_verified}
          onChange={v => set('kyc_identity_verified', v)}
          date={form.kyc_identity_verified_date}
          onDateChange={v => set('kyc_identity_verified_date', v)}
          dateLabel="Verified date:"
        />
        <CheckItem
          label="Address verified"
          checked={form.kyc_address_verified}
          onChange={v => set('kyc_address_verified', v)}
        />
        <CheckItem
          label="Source of funds verified"
          checked={form.kyc_source_of_funds_verified}
          onChange={v => set('kyc_source_of_funds_verified', v)}
        />
        <CheckItem
          label="AML check completed"
          checked={form.kyc_aml_checked}
          onChange={v => set('kyc_aml_checked', v)}
        />
        <CheckItem
          label="PEP (Politically Exposed Person) check completed"
          checked={form.kyc_pep_checked}
          onChange={v => set('kyc_pep_checked', v)}
        />
        <div className="mt-3">
          <label className="text-xs text-gray-500 uppercase font-medium">KYC Notes</label>
          <textarea
            value={form.kyc_notes}
            onChange={e => set('kyc_notes', e.target.value)}
            rows={2}
            className="mt-1 w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      {/* CCCFA */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          CCCFA Compliance
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Credit Contracts and Consumer Finance Act 2003
        </p>
        <CheckItem
          label="Affordability assessment completed"
          checked={form.cccfa_affordability_assessed}
          onChange={v => set('cccfa_affordability_assessed', v)}
          note="Income vs expenses vs proposed repayments"
        />
        <CheckItem
          label="Income verified with documentation"
          checked={form.cccfa_income_verified}
          onChange={v => set('cccfa_income_verified', v)}
        />
        <CheckItem
          label="Expenses verified (HEM or actual)"
          checked={form.cccfa_expenses_verified}
          onChange={v => set('cccfa_expenses_verified', v)}
        />
        <CheckItem
          label="Credit history checked"
          checked={form.cccfa_credit_checked}
          onChange={v => set('cccfa_credit_checked', v)}
        />
        <CheckItem
          label="Hardship provisions discussed"
          checked={form.cccfa_hardship_discussed}
          onChange={v => set('cccfa_hardship_discussed', v)}
        />
        <div className="mt-3">
          <label className="text-xs text-gray-500 uppercase font-medium">
            CCCFA Notes
          </label>
          <textarea
            value={form.cccfa_notes}
            onChange={e => set('cccfa_notes', e.target.value)}
            rows={2}
            className="mt-1 w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      {/* Disclosure */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          Disclosure & Advice
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Financial Markets Conduct Act 2013
        </p>
        <CheckItem
          label="Disclosure statement provided to client"
          checked={form.disclosure_statement_provided}
          onChange={v => set('disclosure_statement_provided', v)}
          date={form.disclosure_statement_date}
          onDateChange={v => set('disclosure_statement_date', v)}
        />
        <CheckItem
          label="Disclosure statement signed by client"
          checked={form.disclosure_signed}
          onChange={v => set('disclosure_signed', v)}
          date={form.disclosure_signed_date}
          onDateChange={v => set('disclosure_signed_date', v)}
        />
        <CheckItem
          label="Needs & objectives completed"
          checked={form.needs_objectives_completed}
          onChange={v => set('needs_objectives_completed', v)}
        />
        <CheckItem
          label="Statement of Advice (SOA) prepared"
          checked={form.soa_prepared}
          onChange={v => set('soa_prepared', v)}
          date={form.soa_date}
          onDateChange={v => set('soa_date', v)}
        />
        <CheckItem
          label="SOA approved by client"
          checked={form.soa_approved_by_client}
          onChange={v => set('soa_approved_by_client', v)}
        />
        <CheckItem
          label="Client authority to proceed obtained"
          checked={form.client_authority_obtained}
          onChange={v => set('client_authority_obtained', v)}
        />
      </div>

      {/* Submission & Settlement */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Submission & Settlement
        </h3>
        <CheckItem
          label="Application submitted to lender"
          checked={form.lender_application_submitted}
          onChange={v => set('lender_application_submitted', v)}
          date={form.lender_submission_date}
          onDateChange={v => set('lender_submission_date', v)}
        />
        {form.lender_application_submitted && (
          <input
            value={form.lender_name}
            onChange={e => set('lender_name', e.target.value)}
            placeholder="Lender name"
            className="mt-2 w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
          />
        )}
        <CheckItem
          label="Settlement confirmed"
          checked={form.settlement_confirmed}
          onChange={v => set('settlement_confirmed', v)}
          date={form.settlement_date}
          onDateChange={v => set('settlement_date', v)}
        />
        <CheckItem
          label="Post-settlement review scheduled"
          checked={form.post_settlement_review_scheduled}
          onChange={v => set('post_settlement_review_scheduled', v)}
        />
      </div>

      {/* Notes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
          Compliance Notes
        </h3>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={4}
          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Compliance Record'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
};

