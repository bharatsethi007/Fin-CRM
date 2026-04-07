import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

const ALL_LENDERS = ['ANZ','ASB','BNZ','Westpac','Kiwibank','SBS','Heartland','Liberty','Resimac','NZCU','Avanti'];

interface Props { advisorId?: string; firmId?: string; }
export const FirmProfileSettings: React.FC<Props> = ({ advisorId, firmId: firmIdProp }) => {
  const toast = useToast();
  const [firm, setFirm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      // Try prop first, then fall back to auth lookup
      let fid = firmIdProp;

      if (!fid) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data: adv } = await supabase
          .from('advisors').select('firm_id').eq('id', user.id).single();
        fid = adv?.firm_id;
      }

      if (!fid) {
        // Last resort — get first firm
        const { data: firms } = await supabase.from('firms').select('*').limit(1);
        if (firms?.[0]) { setFirm(firms[0]); setLoading(false); return; }
        setError('Could not find firm record');
        setLoading(false);
        return;
      }

      const { data: f } = await supabase.from('firms').select('*').eq('id', fid).single();
      if (f) setFirm(f);
      else {
        // Try fetching without ID filter as last resort
        const { data: fallback } = await supabase.from('firms').select('*').limit(1).single();
        if (fallback) setFirm(fallback);
      }
    } catch (e: any) {
      setError('Error: ' + e.message);
    }
    setLoading(false);
  }

  async function save() {
    if (!firm?.id) { setError('Could not load firm — please refresh the page'); setSaving(false); return; }
    setSaving(true); setError(null);
    if (!firm.name?.trim()) { setError('Firm name is required'); setSaving(false); return; }
    if (!firm.primary_email?.trim()) { setError('Primary email is required'); setSaving(false); return; }
    const { error: err } = await supabase.from('firms').update({
      name: firm.name, address: firm.address, suburb: firm.suburb,
      city: firm.city, postcode: firm.postcode, country: firm.country,
      primary_email: firm.primary_email, primary_phone: firm.primary_phone,
      website: firm.website, fsp_number: firm.fsp_number,
      fap_licence_number: firm.fap_licence_number, fap_name: firm.fap_name,
      complaints_body: firm.complaints_body, complaints_url: firm.complaints_url,
      pi_insurance_provider: firm.pi_insurance_provider,
      pi_insurance_expiry: firm.pi_insurance_expiry || null,
      lender_panel: firm.lender_panel,
      updated_at: new Date().toISOString(),
    }).eq('id', firm.id);
    if (err) { setError(err.message); toast.error('Failed to save: ' + err.message); }
    else { await load(); setSaved(true); setTimeout(() => setSaved(false), 3000); toast.success('Firm profile saved'); }
    setSaving(false);
  }

  async function uploadLogo(file: File) {
    if (!firm.id) return;
    const ext = file.name.split('.').pop();
    const path = `logos/${firm.id}/logo.${ext}`;
    const { error: err } = await supabase.storage.from('documents').upload(path, file, { upsert: true });
    if (err) {
      toast.error('Logo upload failed: ' + err.message);
    } else {
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);
      const updated = { ...firm, logo_url: publicUrl };
      setFirm(updated);
      const { error: updateErr } = await supabase.from('firms').update({ logo_url: publicUrl }).eq('id', firm.id);
      if (updateErr) toast.error('Failed to save logo: ' + updateErr.message);
      else { await load(); toast.success('Logo updated'); }
    }
  }

  function set(k: string) { return (v: string) => setFirm((p: any) => ({ ...p, [k]: v })); }
  function toggleLender(l: string) {
    const cur = firm.lender_panel || [];
    setFirm((p: any) => ({ ...p, lender_panel: cur.includes(l) ? cur.filter((x: string) => x !== l) : [...cur, l] }));
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">Firm Profile</h2>
        <p className="text-sm text-gray-500">These details appear on all generated documents and PDFs.</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      {/* Logo */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Logo</h3>
        <div className="flex items-center gap-4">
          {firm.logo_url
            ? <img src={firm.logo_url} alt="Logo" className="h-14 max-w-xs object-contain border border-gray-200 rounded-lg p-2 bg-white" />
            : <div className="h-14 w-40 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400">No logo</div>
          }
          <div className="space-y-1">
            <input ref={logoRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
            <button onClick={() => logoRef.current?.click()}
              className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Upload Logo
            </button>
            {firm.logo_url && (
              <button onClick={() => setFirm((p: any) => ({ ...p, logo_url: '' }))}
                className="block text-xs text-red-500 hover:text-red-700">Remove</button>
            )}
            <p className="text-xs text-gray-400">PNG or SVG · Max 2MB</p>
          </div>
        </div>
      </section>

      {/* Firm details */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Firm Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Firm Name *" value={firm.name||''} onChange={set('name')} placeholder="Kiwi Mortgages" />
          <Field label="FAP / Trading Name" value={firm.fap_name||''} onChange={set('fap_name')} placeholder="Same as firm name" />
          <Field label="Primary Email *" value={firm.primary_email||''} onChange={set('primary_email')} type="email" placeholder="admin@firm.co.nz" />
          <Field label="Primary Phone" value={firm.primary_phone||''} onChange={set('primary_phone')} placeholder="09 123 4567" />
          <Field label="Website" value={firm.website||''} onChange={set('website')} placeholder="https://firm.co.nz" className="col-span-2" />
        </div>
      </section>

      {/* Address */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Address</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Street Address" value={firm.address||''} onChange={set('address')} placeholder="123 Queen Street" className="col-span-2" />
          <Field label="Suburb" value={firm.suburb||''} onChange={set('suburb')} placeholder="CBD" />
          <Field label="City" value={firm.city||''} onChange={set('city')} placeholder="Auckland" />
          <Field label="Postcode" value={firm.postcode||''} onChange={set('postcode')} placeholder="1010" />
          <Field label="Country" value={firm.country||'New Zealand'} onChange={set('country')} placeholder="New Zealand" />
        </div>
      </section>

      {/* Regulatory */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Regulatory — FMC Act 2013</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="FSP Number" value={firm.fsp_number||''} onChange={set('fsp_number')} placeholder="FSP123456" hint="Financial Service Provider number" />
          <Field label="FAP Licence Number" value={firm.fap_licence_number||''} onChange={set('fap_licence_number')} placeholder="FAP12345" />
          <Field label="Disputes Resolution Scheme" value={firm.complaints_body||''} onChange={set('complaints_body')} placeholder="FSCL" className="col-span-2" />
          <Field label="Disputes Scheme URL" value={firm.complaints_url||''} onChange={set('complaints_url')} placeholder="https://www.fscl.org.nz" className="col-span-2" />
          <Field label="PI Insurance Provider" value={firm.pi_insurance_provider||''} onChange={set('pi_insurance_provider')} placeholder="QBE, Vero..." />
          <Field label="PI Insurance Expiry" value={firm.pi_insurance_expiry||''} onChange={set('pi_insurance_expiry')} type="date" />
        </div>
      </section>

      {/* Lender panel */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">Lender Panel</h3>
        <p className="text-xs text-gray-400 mb-3">Select all lenders your firm is accredited with</p>
        <div className="flex flex-wrap gap-2">
          {ALL_LENDERS.map(l => {
            const on = (firm.lender_panel || []).includes(l);
            return (
              <button key={l} onClick={() => toggleLender(l)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  on ? 'bg-primary-50 text-primary-700 border-primary-300' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}>
                {on ? '✓ ' : ''}{l}
              </button>
            );
          })}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={save} disabled={saving}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
      </div>
    </div>
  );
};

function Field({ label, value, onChange, placeholder, type = 'text', hint, className }:
  { label: string; value: string; onChange: (v: string) => void;
    placeholder?: string; type?: string; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
          bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
