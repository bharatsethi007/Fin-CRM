import { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Trash2, Check, ChevronDown, Building2, AlertCircle, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Aggregator {
  id: string;
  name: string;
  fap_licence_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

interface Props {
  firmId: string;
  supabase: any; // pass in the supabase client so no import path issues
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AggregatorSettings({ firmId, supabase }: Props) {
  const [aggregators, setAggregators] = useState<Aggregator[]>([]);
  const [currentAggregatorId, setCurrentAggregatorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: '', fap_licence_number: '', email: '', phone: '', website: '',
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { loadData(); }, [firmId]);

  async function loadData() {
    setLoading(true);
    const [{ data: firm }, { data: aggs }] = await Promise.all([
      supabase.from('firms').select('aggregator_id').eq('id', firmId).maybeSingle(),
      supabase.from('aggregators').select('id, name, fap_licence_number, email, phone, website').eq('is_active', true).order('name'),
    ]);
    setCurrentAggregatorId(firm?.aggregator_id ?? null);
    setAggregators(aggs ?? []);
    setLoading(false);
  }

  async function saveAggregator(aggregatorId: string | null) {
    setSaving(true);
    await supabase.from('firms').update({ aggregator_id: aggregatorId }).eq('id', firmId);
    setCurrentAggregatorId(aggregatorId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function createAggregator() {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    setCreating(true);
    setFormError('');
    const { data, error } = await supabase
      .from('aggregators')
      .insert({ name: form.name.trim(), fap_licence_number: form.fap_licence_number || null, email: form.email || null, phone: form.phone || null, website: form.website || null })
      .select()
      .single();
    if (error) { setFormError(error.message); setCreating(false); return; }
    setAggregators(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setShowCreate(false);
    setForm({ name: '', fap_licence_number: '', email: '', phone: '', website: '' });
    setCreating(false);
    await saveAggregator(data.id);
  }

  const current = aggregators.find(a => a.id === currentAggregatorId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading aggregator settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30">
          <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Aggregator / Dealer Group</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Link your firm to an aggregator for compliance review before lender submission.
          </p>
        </div>
      </div>

      {/* Current selection */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">

        {/* Dropdown */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            Linked Aggregator
          </label>
          <div className="relative">
            <select
              value={currentAggregatorId ?? ''}
              onChange={e => saveAggregator(e.target.value || null)}
              disabled={saving}
              className="w-full appearance-none pl-9 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 transition cursor-pointer"
            >
              <option value="">— No aggregator —</option>
              {aggregators.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Current aggregator details */}
        {current && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {current.fap_licence_number && (
              <div>
                <p className="text-xs text-gray-400">FAP Licence</p>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{current.fap_licence_number}</p>
              </div>
            )}
            {current.email && (
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{current.email}</p>
              </div>
            )}
            {current.phone && (
              <div>
                <p className="text-xs text-gray-400">Phone</p>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{current.phone}</p>
              </div>
            )}
            {current.website && (
              <div>
                <p className="text-xs text-gray-400">Website</p>
                <a href={current.website} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">{current.website}</a>
              </div>
            )}
          </div>
        )}

        {/* Save feedback */}
        {saved && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Aggregator updated
          </div>
        )}

        {/* No aggregator warning */}
        {!currentAggregatorId && (
          <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            No aggregator linked. Applications can be submitted directly to lenders without compliance review.
          </div>
        )}
      </div>

      {/* Add new aggregator */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add new aggregator
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">New Aggregator</p>
            <button onClick={() => { setShowCreate(false); setFormError(''); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Cancel</button>
          </div>

          {/* Form fields */}
          {[
            { key: 'name', label: 'Name *', placeholder: 'e.g. NZFSG' },
            { key: 'fap_licence_number', label: 'FAP Licence Number', placeholder: 'e.g. FSP123456' },
            { key: 'email', label: 'Email', placeholder: 'compliance@aggregator.co.nz' },
            { key: 'phone', label: 'Phone', placeholder: '+64 9 000 0000' },
            { key: 'website', label: 'Website', placeholder: 'https://aggregator.co.nz' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
              <input
                value={form[key as keyof typeof form]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          ))}

          {formError && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> {formError}
            </p>
          )}

          <button
            onClick={createAggregator}
            disabled={creating}
            className="w-full py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creating ? 'Creating…' : 'Create & Link Aggregator'}
          </button>
        </div>
      )}
    </div>
  );
}
