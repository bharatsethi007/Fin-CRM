import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

const PRESETS = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#0f172a'];

export const BrandingSettings: React.FC = () => {
  const toast = useToast();
  const [firm, setFirm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: adv } = await supabase.from('advisors').select('firm_id').eq('id', user.id).single();
    if (adv) {
      const { data: f } = await supabase.from('firms').select('id,name,brand_color,brand_color_secondary').eq('id', adv.firm_id).single();
      if (f) setFirm(f);
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const { error: err } = await supabase.from('firms').update({
      brand_color: firm.brand_color,
      brand_color_secondary: firm.brand_color_secondary,
      updated_at: new Date().toISOString(),
    }).eq('id', firm.id);
    if (err) {
      toast.error('Failed to save: ' + err.message);
    } else {
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast.success('Branding saved');
    }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;

  const brand = firm.brand_color || '#4f46e5';

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">Branding</h2>
        <p className="text-sm text-gray-500">Customise colours used across documents and the interface.</p>
      </div>

      {/* Primary colour */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wide">Primary Brand Colour</h3>
        <p className="text-xs text-gray-400 mb-4">Used on PDF headers, section titles, metric cards, and document accents.</p>
        <div className="flex items-center gap-5 mb-5">
          <input type="color" value={brand}
            onChange={e => setFirm((p: any) => ({ ...p, brand_color: e.target.value }))}
            className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer p-1" />
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{brand}</p>
            <p className="text-xs text-gray-400">Click to change</p>
          </div>
          {/* Live preview chip */}
          <div className="ml-auto px-4 py-2 rounded-lg text-white text-sm font-bold"
            style={{ background: brand }}>
            {firm.name || 'Your Firm'}
          </div>
        </div>

        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Quick Presets</p>
        <div className="flex gap-2">
          {PRESETS.map(c => (
            <button key={c} onClick={() => setFirm((p: any) => ({ ...p, brand_color: c }))}
              style={{ background: c }}
              className={`w-8 h-8 rounded-lg border-2 transition-all ${brand === c ? 'border-gray-800 scale-110' : 'border-transparent'}`} />
          ))}
        </div>
      </section>

      {/* Document preview */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Document Header Preview</h3>
        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center px-5 py-3" style={{ background: '#0f172a' }}>
            <span className="text-white text-sm font-bold">{firm.name || 'Your Firm'}</span>
            <span className="text-gray-400 text-xs">Statement of Advice</span>
            <span className="text-gray-400 text-xs">CONFIDENTIAL</span>
          </div>
          <div className="h-1" style={{ background: brand }} />
          <div className="p-4 bg-white space-y-2">
            <div className="h-2.5 rounded-full w-1/3" style={{ background: brand + '30' }} />
            <div className="h-2 bg-gray-100 rounded-full" />
            <div className="h-2 bg-gray-100 rounded-full w-4/5" />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {['Income','Expenses','DTI','LVR'].map(m => (
                <div key={m} className="rounded-lg p-2" style={{ background: brand + '15' }}>
                  <p className="text-xs font-bold" style={{ color: brand }}>{m}</p>
                  <p className="text-sm font-bold text-gray-700 mt-0.5">—</p>
                </div>
              ))}
            </div>
          </div>
          <div className="px-5 py-2 border-t border-gray-100 flex justify-between">
            <p className="text-xs text-gray-400">Prepared by Adviser · {new Date().toLocaleDateString('en-NZ')}</p>
            <p className="text-xs text-gray-400">Page 1 of 5</p>
          </div>
        </div>
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
