import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Props {
  advisorId: string;
  firmId: string;
}

export const DisclosureStatement: React.FC<Props> = ({ advisorId, firmId }) => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    adviser_name: '',
    adviser_email: '',
    adviser_phone: '',
    fsp_number: '',
    fap_name: '',
    fap_licence_number: '',
    services_mortgage_advice: true,
    services_insurance_advice: false,
    services_investment_advice: false,
    services_other: '',
    fee_type: 'Commission Only',
    fee_amount: '' as number | '',
    fee_description: '',
    commission_upfront_percent: '' as number | '',
    commission_trail_percent: '' as number | '',
    commission_disclosure_text: '',
    conflicts_of_interest: '',
    complaints_contact_name: '',
    complaints_contact_email: '',
    complaints_contact_phone: '',
    complaints_external_body: 'Financial Services Complaints Ltd (FSCL)',
    complaints_external_url: 'https://www.fscl.org.nz',
    duties_text: 'I am required to give priority to your interests. I must exercise the care, diligence, and skill that a prudent person engaged in the same occupation would exercise in the same circumstances.',
    effective_date: '',
    status: 'draft',
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('disclosure_statements').select('*').eq('advisor_id', advisorId).eq('status', 'active').maybeSingle();
      if (data) setForm(f => ({ ...f, ...data }));
    };
    load();
  }, [advisorId]);

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('disclosure_statements').upsert({
        advisor_id: advisorId,
        firm_id: firmId,
        ...form,
        fee_amount: form.fee_amount === '' ? null : Number(form.fee_amount),
        commission_upfront_percent: form.commission_upfront_percent === '' ? null : Number(form.commission_upfront_percent),
        commission_trail_percent: form.commission_trail_percent === '' ? null : Number(form.commission_trail_percent),
        effective_date: form.effective_date || null,
        status: publish ? 'active' : 'draft',
      }, { onConflict: 'advisor_id' });
      if (error) throw error;
      if (publish) setForm(f => ({ ...f, status: 'active' }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className={`rounded-xl p-4 flex items-center justify-between ${form.status === 'active' ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <div>
          <p className={`text-sm font-medium ${form.status === 'active' ? 'text-green-700' : 'text-yellow-700'}`}>
            {form.status === 'active' ? '✓ Active Disclosure Statement' : '⚠ Draft — not yet published to clients'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Required under Financial Markets Conduct Act 2013</p>
        </div>
        {form.status === 'draft' && (
          <button onClick={() => handleSave(true)} disabled={saving}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
            Publish
          </button>
        )}
      </div>

      {/* Adviser Details */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Adviser Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Full Name</label>
            <input value={form.adviser_name} onChange={e => set('adviser_name', e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Email</label>
            <input value={form.adviser_email} onChange={e => set('adviser_email', e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Phone</label>
            <input value={form.adviser_phone} onChange={e => set('adviser_phone', e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">FSP Number</label>
            <input value={form.fsp_number} onChange={e => set('fsp_number', e.target.value)} placeholder="FSP123456" className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">FAP Name</label>
            <input value={form.fap_name} onChange={e => set('fap_name', e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">FAP Licence Number</label>
            <input value={form.fap_licence_number} onChange={e => set('fap_licence_number', e.target.value)} className={inputClass} /></div>
        </div>
      </div>

      {/* Services */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Services Provided</h3>
        <div className="space-y-2">
          {[['services_mortgage_advice','Mortgage & home loan advice'],['services_insurance_advice','Insurance advice'],['services_investment_advice','Investment advice']].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={!!(form as Record<string, unknown>)[key]} onChange={e => set(key, e.target.checked)} className="rounded border-gray-300 text-blue-600" />
              {label}
            </label>
          ))}
          <input value={form.services_other} onChange={e => set('services_other', e.target.value)} placeholder="Other services..." className={inputClass + ' mt-2'} />
        </div>
      </div>

      {/* Fees */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Fees & Commissions</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Fee Structure</label>
            <select value={form.fee_type} onChange={e => set('fee_type', e.target.value)} className={inputClass}>
              <option>Commission Only</option><option>Fee + Commission</option><option>Fee Only</option>
            </select></div>
          {form.fee_type !== 'Commission Only' && (
            <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Fee Amount ($)</label>
              <input type="number" value={form.fee_amount} onChange={e => set('fee_amount', e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} /></div>
          )}
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Upfront Commission %</label>
            <input type="number" value={form.commission_upfront_percent} onChange={e => set('commission_upfront_percent', e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Trail Commission %</label>
            <input type="number" value={form.commission_trail_percent} onChange={e => set('commission_trail_percent', e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} /></div>
          <div className="col-span-2"><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Commission Disclosure Text</label>
            <textarea value={form.commission_disclosure_text} onChange={e => set('commission_disclosure_text', e.target.value)} rows={3} className={inputClass} /></div>
        </div>
      </div>

      {/* Conflicts */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Conflicts of Interest</h3>
        <textarea value={form.conflicts_of_interest} onChange={e => set('conflicts_of_interest', e.target.value)} rows={3}
          placeholder="Describe any conflicts of interest, or 'None identified'" className={inputClass} />
      </div>

      {/* Complaints */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Complaints Process</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Internal Contact Name</label>
            <input value={form.complaints_contact_name} onChange={e => set('complaints_contact_name', e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Contact Email</label>
            <input value={form.complaints_contact_email} onChange={e => set('complaints_contact_email', e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">External Disputes Body</label>
            <input value={form.complaints_external_body} onChange={e => set('complaints_external_body', e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-500 uppercase mb-1 block">External Body URL</label>
            <input value={form.complaints_external_url} onChange={e => set('complaints_external_url', e.target.value)} className={inputClass} /></div>
        </div>
      </div>

      {/* Duties */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Duties to Client</h3>
        <textarea value={form.duties_text} onChange={e => set('duties_text', e.target.value)} rows={4} className={inputClass} />
      </div>

      {/* Effective date */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Effective Date</label>
        <input type="date" value={form.effective_date} onChange={e => set('effective_date', e.target.value)} className="w-48 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
      </div>

      <div className="flex items-center gap-4">
        <button onClick={() => handleSave(false)} disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button onClick={() => handleSave(true)} disabled={saving}
          className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          Publish
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
};
