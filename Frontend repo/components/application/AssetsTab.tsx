import React, { useState, useEffect } from 'react';
import { applicationService, type Asset, type AssetOwnership } from '../../services/applicationService';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { NZ_REGIONS, NZ_BANKS, NZ_KIWISAVER_PROVIDERS } from '../../constants';

const inputClasses = 'block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2';

const ASSET_TYPES = ['property', 'vehicle', 'bank_account', 'kiwisaver', 'investment', 'other'] as const;

interface AssetsTabProps {
  applicationId: string;
}

export const AssetsTab: React.FC<AssetsTabProps> = ({ applicationId }) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [ownershipByAsset, setOwnershipByAsset] = useState<Record<string, AssetOwnership[]>>({});
  const [applicants, setApplicants] = useState<{ id: string; first_name: string; surname: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetch = async () => {
    setIsLoading(true);
    const [assetList, appList] = await Promise.all([
      applicationService.getAssets(applicationId),
      applicationService.getApplicants(applicationId),
    ]);
    setAssets(assetList);
    setApplicants(appList);
    const ownership: Record<string, AssetOwnership[]> = {};
    for (const a of assetList) {
      ownership[a.id] = await applicationService.getAssetOwnership(a.id);
    }
    setOwnershipByAsset(ownership);
    setIsLoading(false);
  };

  useEffect(() => { fetch(); }, [applicationId]);

  const getValue = (a: Asset) => Number(a.property_value || a.vehicle_value || a.account_balance || a.kiwisaver_balance || a.investment_value || a.estimated_value || a.other_value || 0);
  const total = assets.reduce((s, a) => s + getValue(a), 0);

  if (isLoading) return <div className="flex justify-center py-8"><Icon name="Loader" className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Assets</h4>
        <div className="text-sm font-medium text-primary-600">Total: ${total.toLocaleString()}</div>
      </div>
      <Button size="sm" leftIcon="Plus" onClick={() => setShowAddForm(true)} disabled={showAddForm}>Add Asset</Button>

      {assets.map(a => (
        <div key={a.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <button className="flex-1 flex items-center justify-between text-left" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
              <div>
                <div className="font-medium capitalize">{String(a.asset_type).replace(/_/g, ' ')}</div>
                <div className="text-sm text-gray-500">{a.property_address || a.bank_name || a.kiwisaver_provider || a.vehicle_make || '—'}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">${getValue(a).toLocaleString()}</span>
                <Icon name={expandedId === a.id ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
              </div>
            </button>
            <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
              <Button variant="ghost" size="sm" onClick={() => setEditingId(a.id)}><Icon name="Pencil" className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Delete?')) { await applicationService.deleteAsset(a.id); fetch(); } }}><Icon name="Trash2" className="h-4 w-4 text-red-500" /></Button>
            </div>
          </div>
          {expandedId === a.id && (
            <div className="p-4 pt-0 border-t dark:border-gray-700 space-y-3">
              <AssetOwnershipEditor assetId={a.id} applicants={applicants} ownerships={ownershipByAsset[a.id] || []} onSaved={fetch} />
            </div>
          )}
        </div>
      ))}

      {showAddForm && <AssetFormModal applicationId={applicationId} applicants={applicants} onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); fetch(); }} />}
      {editingId && <AssetFormModal applicationId={applicationId} applicants={applicants} asset={assets.find(x => x.id === editingId)!} onClose={() => setEditingId(null)} onSaved={() => { setEditingId(null); fetch(); }} />}
    </div>
  );
};

const AssetOwnershipEditor: React.FC<{ assetId: string; applicants: { id: string; first_name: string; surname: string }[]; ownerships: AssetOwnership[]; onSaved: () => void }> = ({ assetId, applicants, ownerships, onSaved }) => {
  const [rows, setRows] = useState<{ applicant_id: string; ownership_percent: number }[]>(() => {
    if (ownerships.length) return ownerships.map(o => ({ applicant_id: o.applicant_id, ownership_percent: Number(o.ownership_percent) }));
    return applicants.map(a => ({ applicant_id: a.id, ownership_percent: applicants.length === 1 ? 100 : 0 }));
  });
  const [saving, setSaving] = useState(false);
  const total = rows.reduce((s, r) => s + r.ownership_percent, 0);

  const handleSave = async () => {
    if (Math.abs(total - 100) > 0.01) {
      alert('Ownership percentages must total 100%');
      return;
    }
    setSaving(true);
    try {
      await applicationService.setAssetOwnership(assetId, rows.filter(r => r.ownership_percent > 0));
      onSaved();
    } catch (e: any) {
      alert(e?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
      <h6 className="font-medium text-sm mb-2">Ownership Split</h6>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.applicant_id} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{applicants.find(a => a.id === r.applicant_id)?.first_name} {applicants.find(a => a.id === r.applicant_id)?.surname}</span>
            <input type="number" min={0} max={100} step={1} className="w-20 p-1.5 text-sm rounded border dark:border-gray-600 bg-white dark:bg-gray-800" value={r.ownership_percent} onChange={e => {
              const v = Number(e.target.value) || 0;
              const next = [...rows];
              next[i] = { ...next[i], ownership_percent: v };
              setRows(next);
            }} />
            <span className="text-xs text-gray-500">%</span>
          </div>
        ))}
        <div className="flex justify-between text-sm pt-2 border-t dark:border-gray-700">
          <span>Total</span>
          <span className={total === 100 ? 'text-green-600' : 'text-amber-600'}>{total}%</span>
        </div>
        <Button size="sm" onClick={handleSave} isLoading={saving}>Save Ownership</Button>
      </div>
    </div>
  );
};

const AssetFormModal: React.FC<{
  applicationId: string;
  applicants: { id: string; first_name: string; surname: string }[];
  asset?: Asset;
  onClose: () => void;
  onSaved: () => void;
}> = ({ applicationId, applicants, asset, onClose, onSaved }) => {
  const [assetType, setAssetType] = useState(asset?.asset_type || 'property');
  const [form, setForm] = useState<Record<string, any>>(() => ({
    asset_type: asset?.asset_type || 'property',
    property_address: asset?.property_address || '',
    property_value: asset?.property_value ?? '',
    property_region: asset?.property_region || '',
    property_type: asset?.property_type || '',
    vehicle_make: asset?.vehicle_make || '',
    vehicle_model: asset?.vehicle_model || '',
    vehicle_year: asset?.vehicle_year ?? '',
    vehicle_value: asset?.vehicle_value ?? '',
    bank_name: asset?.bank_name || '',
    account_type: asset?.account_type || '',
    account_balance: asset?.account_balance ?? '',
    kiwisaver_provider: asset?.kiwisaver_provider || '',
    kiwisaver_balance: asset?.kiwisaver_balance ?? '',
    investment_description: asset?.investment_description || '',
    investment_value: asset?.investment_value ?? '',
    other_description: asset?.other_description || '',
    other_value: asset?.other_value ?? '',
    estimated_value: asset?.estimated_value ?? '',
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(f => ({ ...f, asset_type: assetType }));
  }, [assetType]);

  const getPayloadValue = () => {
    switch (assetType) {
      case 'property': return Number(form.property_value) || 0;
      case 'vehicle': return Number(form.vehicle_value) || 0;
      case 'bank_account': return Number(form.account_balance) || 0;
      case 'kiwisaver': return Number(form.kiwisaver_balance) || 0;
      case 'investment': return Number(form.investment_value) || 0;
      default: return Number(form.other_value) || Number(form.estimated_value) || 0;
    }
  };

  const handleSave = async () => {
    if (!getPayloadValue() && assetType !== 'other') {
      alert('Please enter a value');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Asset> = {
        asset_type: assetType,
        property_address: form.property_address || undefined,
        property_value: form.property_value ? Number(form.property_value) : undefined,
        property_region: form.property_region || undefined,
        property_type: form.property_type || undefined,
        vehicle_make: form.vehicle_make || undefined,
        vehicle_model: form.vehicle_model || undefined,
        vehicle_year: form.vehicle_year ? Number(form.vehicle_year) : undefined,
        vehicle_value: form.vehicle_value ? Number(form.vehicle_value) : undefined,
        bank_name: form.bank_name || undefined,
        account_type: form.account_type || undefined,
        account_balance: form.account_balance ? Number(form.account_balance) : undefined,
        kiwisaver_provider: form.kiwisaver_provider || undefined,
        kiwisaver_balance: form.kiwisaver_balance ? Number(form.kiwisaver_balance) : undefined,
        investment_description: form.investment_description || undefined,
        investment_value: form.investment_value ? Number(form.investment_value) : undefined,
        other_description: form.other_description || undefined,
        other_value: form.other_value ? Number(form.other_value) : undefined,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : undefined,
      };
      if (asset) await applicationService.updateAsset(asset.id, payload);
      else await applicationService.createAsset(applicationId, payload);
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
        <h5 className="font-semibold mb-4">{asset ? 'Edit Asset' : 'Add Asset'}</h5>
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Asset Type</label>
          <select className={inputClasses} value={assetType} onChange={e => setAssetType(e.target.value as any)}>
            {ASSET_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {assetType === 'property' && (
          <div className="space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Address</label><input className={inputClasses} value={form.property_address} onChange={e => setForm({ ...form, property_address: e.target.value })} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Region</label><select className={inputClasses} value={form.property_region} onChange={e => setForm({ ...form, property_region: e.target.value })}><option value="">—</option>{NZ_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Property Type</label><input className={inputClasses} value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })} placeholder="House, Unit, etc." /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Value ($)</label><input type="number" className={inputClasses} value={form.property_value} onChange={e => setForm({ ...form, property_value: e.target.value })} /></div>
          </div>
        )}
        {assetType === 'vehicle' && (
          <div className="space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Make</label><input className={inputClasses} value={form.vehicle_make} onChange={e => setForm({ ...form, vehicle_make: e.target.value })} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Model</label><input className={inputClasses} value={form.vehicle_model} onChange={e => setForm({ ...form, vehicle_model: e.target.value })} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Year</label><input type="number" className={inputClasses} value={form.vehicle_year} onChange={e => setForm({ ...form, vehicle_year: e.target.value })} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Value ($)</label><input type="number" className={inputClasses} value={form.vehicle_value} onChange={e => setForm({ ...form, vehicle_value: e.target.value })} /></div>
          </div>
        )}
        {assetType === 'bank_account' && (
          <div className="space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Bank</label><select className={inputClasses} value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })}><option value="">—</option>{NZ_BANKS.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Account Type</label><input className={inputClasses} value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} placeholder="Savings, Cheque, etc." /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Balance ($)</label><input type="number" className={inputClasses} value={form.account_balance} onChange={e => setForm({ ...form, account_balance: e.target.value })} /></div>
          </div>
        )}
        {assetType === 'kiwisaver' && (
          <div className="space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Provider</label><select className={inputClasses} value={form.kiwisaver_provider} onChange={e => setForm({ ...form, kiwisaver_provider: e.target.value })}><option value="">—</option>{NZ_KIWISAVER_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Balance ($)</label><input type="number" className={inputClasses} value={form.kiwisaver_balance} onChange={e => setForm({ ...form, kiwisaver_balance: e.target.value })} /></div>
          </div>
        )}
        {assetType === 'investment' && (
          <div className="space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Description</label><input className={inputClasses} value={form.investment_description} onChange={e => setForm({ ...form, investment_description: e.target.value })} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Value ($)</label><input type="number" className={inputClasses} value={form.investment_value} onChange={e => setForm({ ...form, investment_value: e.target.value })} /></div>
          </div>
        )}
        {assetType === 'other' && (
          <div className="space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Description</label><input className={inputClasses} value={form.other_description} onChange={e => setForm({ ...form, other_description: e.target.value })} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Value ($)</label><input type="number" className={inputClasses} value={form.other_value || form.estimated_value} onChange={e => setForm({ ...form, other_value: e.target.value, estimated_value: e.target.value })} /></div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <Button size="sm" onClick={handleSave} isLoading={saving}>Save</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
