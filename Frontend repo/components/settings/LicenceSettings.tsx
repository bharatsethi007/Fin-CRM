import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

export const LicenceSettings: React.FC = () => {
  const toast = useToast();
  const [adv, setAdv] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('advisors').select('*').eq('id', user.id).single();
    if (data) setAdv(data);
    setLoading(false);
  }

  async function save() {
    setSaving(true); setError(null);
    const { error: err } = await supabase.from('advisors').update({
      title: adv.title,
      phone: adv.phone,
      mobile: adv.mobile,
      fsp_number: adv.fsp_number,
      fap_authorisation_number: adv.fap_authorisation_number,
      licence_status: adv.licence_status,
      licence_expiry: adv.licence_expiry || null,
      bio: adv.bio,
      updated_at: new Date().toISOString(),
    }).eq('id', adv.id);
    if (err) { setError(err.message); toast.error('Failed to save: ' + err.message); }
    else { await load(); setSaved(true); setTimeout(() => setSaved(false), 3000); toast.success('Licence details saved'); }
    setSaving(false);
  }

  function set(k: string) { return (v: string) => setAdv((p: any) => ({ ...p, [k]: v })); }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">Licence and Regulatory</h2>
        <p className="text-sm text-gray-500">Your adviser credentials — required on all disclosure statements and advice documents.</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Contact Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Title / Role" value={adv.title||''} onChange={set('title')} placeholder="Financial Adviser" />
          <div /> {/* spacer */}
          <Field label="Direct Phone" value={adv.phone||''} onChange={set('phone')} placeholder="09 123 4567" />
          <Field label="Mobile" value={adv.mobile||''} onChange={set('mobile')} placeholder="021 123 4567" />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Licence Details</h3>
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300 mb-4">
          These fields appear on every Disclosure Statement and Statement of Advice. Ensure they match your FSP register entry.
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="FSP Number" value={adv.fsp_number||''} onChange={set('fsp_number')}
            placeholder="FSP123456" hint="Your individual FSP registration" />
          <Field label="FAP Authorisation Number" value={adv.fap_authorisation_number||''} onChange={set('fap_authorisation_number')}
            placeholder="Auth12345" hint="Under your firm FAP licence" />
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Licence Status</label>
            <select value={adv.licence_status||'active'} onChange={e => set('licence_status')(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-primary-500">
              {['active','suspended','cancelled','pending'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <Field label="Licence Expiry" value={adv.licence_expiry||''} onChange={set('licence_expiry')} type="date" />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Professional Bio</h3>
        <p className="text-xs text-gray-400 mb-2">Appears on client-facing documents and disclosure statements.</p>
        <textarea value={adv.bio||''} onChange={e => set('bio')(e.target.value)} rows={4}
          placeholder="Brief professional bio — qualifications, years of experience, specialisations..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y" />
      </section>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={save} disabled={saving}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
};

function Field({ label, value, onChange, placeholder, type = 'text', hint }:
  { label: string; value: string; onChange: (v: string) => void;
    placeholder?: string; type?: string; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
          bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
