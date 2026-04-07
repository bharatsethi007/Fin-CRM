import React, { useState, useEffect } from 'react';
import type { Application } from '../../../types';
import { Button } from '../../common/Button';
import { Icon, IconName } from '../../common/Icon';
import { Card } from '../../common/Card';
import { applicationService, type Asset } from '../../../services/api';
import { useToast } from '../../../hooks/useToast';

const inputClasses =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-4">
    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-600">{title}</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

type AssetType = 'Property' | 'Vehicle' | 'Bank Account' | 'KiwiSaver' | 'Investment' | 'Other';

const emptyAssetForm = () => ({
  asset_type: 'Property' as AssetType,
  property_address: '', property_suburb: '', property_city: '', property_region: '', property_postcode: '',
  property_type: '', zoning: '', property_value: '', valuation_type: '', valuation_date: '',
  monthly_rental_income: '', to_be_sold: false, will_become_investment: false,
  vehicle_type: '', vehicle_make: '', vehicle_model: '', vehicle_year: '', vehicle_value: '', vehicle_rego: '',
  bank_name: '', account_type: '', account_number: '', account_balance: '', is_direct_debit: false,
  kiwisaver_provider: '', kiwisaver_member_number: '', kiwisaver_balance: '', kiwisaver_contribution_rate: '',
  investment_description: '', investment_value: '',
  other_description: '', other_value: '',
});

const getAssetIcon = (type: string): IconName => {
  switch (type) {
    case 'Property': return 'Home';
    case 'Vehicle': return 'Car' as IconName;
    case 'Bank Account': return 'Banknote';
    case 'KiwiSaver': return 'PiggyBank';
    case 'Investment': return 'DollarSign';
    default: return 'Wallet';
  }
};

const getAssetDisplayValue = (a: Asset): number => {
  if (a.asset_type === 'Property' && a.property_value != null) return Number(a.property_value);
  if (a.asset_type === 'Vehicle' && a.vehicle_value != null) return Number(a.vehicle_value);
  if (a.asset_type === 'Bank Account' && a.account_balance != null) return Number(a.account_balance);
  if (a.asset_type === 'KiwiSaver' && a.kiwisaver_balance != null) return Number(a.kiwisaver_balance);
  if (a.asset_type === 'Investment' && (a as any).investment_value != null) return Number((a as any).investment_value);
  if (a.asset_type === 'Other' && (a as any).other_value != null) return Number((a as any).other_value);
  if (a.estimated_value != null) return Number(a.estimated_value);
  return 0;
};

const assetToForm = (a: Asset) => ({
  ...emptyAssetForm(),
  asset_type: ((a.asset_type as AssetType) || 'Property') as AssetType,
  property_address: (a as any).property_address || '', property_suburb: (a as any).property_suburb || '',
  property_city: (a as any).property_city || '', property_region: (a as any).property_region || '',
  property_postcode: (a as any).property_postcode || '', property_type: (a as any).property_type || '',
  zoning: (a as any).zoning || '',
  property_value: (a as any).property_value != null ? String((a as any).property_value) : '',
  valuation_type: (a as any).valuation_type || '', valuation_date: (a as any).valuation_date || '',
  monthly_rental_income: (a as any).monthly_rental_income != null ? String((a as any).monthly_rental_income) : '',
  to_be_sold: Boolean((a as any).to_be_sold), will_become_investment: Boolean((a as any).will_become_investment),
  vehicle_type: (a as any).vehicle_type || '', vehicle_make: (a as any).vehicle_make || '',
  vehicle_model: (a as any).vehicle_model || '',
  vehicle_year: (a as any).vehicle_year != null ? String((a as any).vehicle_year) : '',
  vehicle_value: (a as any).vehicle_value != null ? String((a as any).vehicle_value) : '',
  vehicle_rego: (a as any).vehicle_rego || '', bank_name: (a as any).bank_name || '',
  account_type: (a as any).account_type || '', account_number: (a as any).account_number || '',
  account_balance: (a as any).account_balance != null ? String((a as any).account_balance) : '',
  is_direct_debit: Boolean((a as any).is_direct_debit),
  kiwisaver_provider: (a as any).kiwisaver_provider || '',
  kiwisaver_member_number: (a as any).kiwisaver_member_number || '',
  kiwisaver_balance: (a as any).kiwisaver_balance != null ? String((a as any).kiwisaver_balance) : '',
  kiwisaver_contribution_rate: (a as any).kiwisaver_contribution_rate != null ? String((a as any).kiwisaver_contribution_rate) : '',
  investment_description: (a as any).investment_description || '',
  investment_value: (a as any).investment_value != null ? String((a as any).investment_value) : '',
  other_description: (a as any).other_description || '',
  other_value: (a as any).other_value != null ? String((a as any).other_value) : '',
});

const buildAssetPayload = (assetForm: ReturnType<typeof emptyAssetForm>): Partial<Asset> => {
  const t = assetForm.asset_type;
  const payload: Partial<Asset> & Record<string, unknown> = { asset_type: t };
  if (t === 'Property') {
    payload.property_address = assetForm.property_address || undefined;
    payload.property_suburb = assetForm.property_suburb || undefined;
    payload.property_city = assetForm.property_city || undefined;
    payload.property_region = assetForm.property_region || undefined;
    payload.property_postcode = assetForm.property_postcode || undefined;
    payload.property_type = assetForm.property_type || undefined;
    payload.zoning = assetForm.zoning || undefined;
    payload.property_value = assetForm.property_value ? Number(assetForm.property_value) || 0 : undefined;
    payload.valuation_type = assetForm.valuation_type || undefined;
    payload.valuation_date = assetForm.valuation_date || undefined;
    payload.monthly_rental_income = assetForm.monthly_rental_income ? Number(assetForm.monthly_rental_income) || 0 : undefined;
    payload.to_be_sold = assetForm.to_be_sold;
    payload.will_become_investment = assetForm.will_become_investment;
  } else if (t === 'Vehicle') {
    payload.vehicle_type = assetForm.vehicle_type || undefined;
    payload.vehicle_make = assetForm.vehicle_make || undefined;
    payload.vehicle_model = assetForm.vehicle_model || undefined;
    payload.vehicle_year = assetForm.vehicle_year ? Number(assetForm.vehicle_year) || undefined : undefined;
    payload.vehicle_value = assetForm.vehicle_value ? Number(assetForm.vehicle_value) || 0 : undefined;
    payload.vehicle_rego = assetForm.vehicle_rego || undefined;
  } else if (t === 'Bank Account') {
    payload.bank_name = assetForm.bank_name || undefined;
    payload.account_type = assetForm.account_type || undefined;
    payload.account_number = assetForm.account_number || undefined;
    payload.account_balance = assetForm.account_balance ? Number(assetForm.account_balance) || 0 : undefined;
    payload.is_direct_debit = assetForm.is_direct_debit;
  } else if (t === 'KiwiSaver') {
    payload.kiwisaver_provider = assetForm.kiwisaver_provider || undefined;
    payload.kiwisaver_member_number = assetForm.kiwisaver_member_number || undefined;
    payload.kiwisaver_balance = assetForm.kiwisaver_balance ? Number(assetForm.kiwisaver_balance) || 0 : undefined;
    payload.kiwisaver_contribution_rate = assetForm.kiwisaver_contribution_rate ? Number(assetForm.kiwisaver_contribution_rate) || 0 : undefined;
  } else if (t === 'Investment') {
    payload.investment_description = assetForm.investment_description || undefined;
    payload.investment_value = assetForm.investment_value ? Number(assetForm.investment_value) || 0 : undefined;
  } else if (t === 'Other') {
    payload.other_description = assetForm.other_description || undefined;
    payload.other_value = assetForm.other_value ? Number(assetForm.other_value) || 0 : undefined;
    if (payload.other_value != null) payload.estimated_value = payload.other_value as number;
  }
  return payload;
};

interface AssetsTabProps {
  application: Application;
  currentUser: { id?: string } | null;
  onUpdate: () => void;
}

const AssetsTab: React.FC<AssetsTabProps> = ({ application, onUpdate }) => {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetFormError, setAssetFormError] = useState<string | null>(null);
  const [submittingAsset, setSubmittingAsset] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState(emptyAssetForm());

  useEffect(() => {
    if (!application.id) return;
    setAssetsLoading(true);
    applicationService.getAssets(application.id)
      .then((data) => setAssets(data || []))
      .catch(() => setAssets([]))
      .finally(() => setAssetsLoading(false));
  }, [application.id]);

  const handleSaveAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetForm.asset_type) { setAssetFormError('Asset type is required.'); return; }
    setSubmittingAsset(true);
    setAssetFormError(null);
    try {
      const payload = buildAssetPayload(assetForm);
      if (editingAsset) {
        await applicationService.updateAsset(editingAsset.id, payload);
      } else {
        await applicationService.createAsset(application.id, payload);
      }
      const successMsg = editingAsset ? 'Asset updated' : 'Asset added';
      setShowAssetModal(false);
      setEditingAsset(null);
      setAssetForm(emptyAssetForm());
      const data = await applicationService.getAssets(application.id);
      setAssets(data || []);
      onUpdate();
      toast.success(successMsg);
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : err instanceof Error ? err.message : 'Failed to save asset.';
      setAssetFormError(msg);
    } finally {
      setSubmittingAsset(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this asset?')) return;
    setDeletingAssetId(id);
    try {
      await applicationService.deleteAsset(id);
      const data = await applicationService.getAssets(application.id);
      setAssets(data || []);
      onUpdate();
      toast.success('Asset removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove asset');
    } finally {
      setDeletingAssetId(null);
    }
  };

  if (assetsLoading) {
    return <div className="flex justify-center items-center py-24"><Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500 dark:text-primary-400" /></div>;
  }

  const totalAssets = assets.reduce((sum, a) => sum + getAssetDisplayValue(a), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Assets</h3>
        <Button leftIcon="PlusCircle" type="button" onClick={() => { setEditingAsset(null); setAssetForm(emptyAssetForm()); setAssetFormError(null); setShowAssetModal(true); }}>
          Add Asset
        </Button>
      </div>

      {assets.length === 0 ? (
        <Card className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">No assets recorded yet. Click &quot;Add Asset&quot; to add one.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <Card key={asset.id} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary-50 dark:bg-primary-900/30 p-2">
                    <Icon name={getAssetIcon(asset.asset_type)} className="h-4 w-4 text-primary-600 dark:text-primary-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{asset.asset_type || 'Asset'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${getAssetDisplayValue(asset).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" leftIcon="Pencil" onClick={() => { setEditingAsset(asset); setAssetForm(assetToForm(asset)); setAssetFormError(null); setShowAssetModal(true); }}>Edit</Button>
                  <Button type="button" variant="ghost" size="sm" leftIcon="Trash2" onClick={() => handleDeleteAsset(asset.id)} disabled={deletingAssetId === asset.id} isLoading={deletingAssetId === asset.id}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Total Assets</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sum of all recorded asset values.</p>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">${totalAssets.toLocaleString()}</p>
        </div>
      </Card>

      {showAssetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editingAsset ? 'Edit Asset' : 'Add Asset'}</h3>
              <button type="button" onClick={() => { setShowAssetModal(false); setEditingAsset(null); setAssetForm(emptyAssetForm()); setAssetFormError(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <Icon name="X" className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAssetSubmit} className="flex flex-col min-h-0">
              <div className="overflow-y-auto p-4 flex-1 space-y-4">
                {assetFormError && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">{assetFormError}</p>}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Asset Type</label>
                  <select value={assetForm.asset_type} onChange={(e) => setAssetForm((f) => ({ ...f, asset_type: e.target.value as AssetType }))} className={inputClasses}>
                    <option value="Property">Property</option>
                    <option value="Vehicle">Vehicle</option>
                    <option value="Bank Account">Bank Account</option>
                    <option value="KiwiSaver">KiwiSaver</option>
                    <option value="Investment">Investment</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {assetForm.asset_type === 'Property' && (
                  <FormSection title="Property Details">
                    <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Property Address</label><input type="text" value={assetForm.property_address} onChange={(e) => setAssetForm((f) => ({ ...f, property_address: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Suburb</label><input type="text" value={assetForm.property_suburb} onChange={(e) => setAssetForm((f) => ({ ...f, property_suburb: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">City</label><input type="text" value={assetForm.property_city} onChange={(e) => setAssetForm((f) => ({ ...f, property_city: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Region</label><input type="text" value={assetForm.property_region} onChange={(e) => setAssetForm((f) => ({ ...f, property_region: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Postcode</label><input type="text" value={assetForm.property_postcode} onChange={(e) => setAssetForm((f) => ({ ...f, property_postcode: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Property Type</label><select value={assetForm.property_type} onChange={(e) => setAssetForm((f) => ({ ...f, property_type: e.target.value }))} className={inputClasses}><option value="">—</option><option>House and Land</option><option>Apartment/Unit/Flat</option><option>Townhouse</option><option>Section/Land</option><option>Commercial</option><option>Rural</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Zoning</label><select value={assetForm.zoning} onChange={(e) => setAssetForm((f) => ({ ...f, zoning: e.target.value }))} className={inputClasses}><option value="">—</option><option>Residential</option><option>Investment</option><option>Commercial</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Property Value</label><input type="number" min={0} value={assetForm.property_value} onChange={(e) => setAssetForm((f) => ({ ...f, property_value: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Valuation Type</label><select value={assetForm.valuation_type} onChange={(e) => setAssetForm((f) => ({ ...f, valuation_type: e.target.value }))} className={inputClasses}><option value="">—</option><option>Applicant Estimate</option><option>Registered Valuation</option><option>CV/RV</option><option>CoreLogic</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Valuation Date</label><input type="date" value={assetForm.valuation_date} onChange={(e) => setAssetForm((f) => ({ ...f, valuation_date: e.target.value }))} className={inputClasses} /></div>
                    {assetForm.zoning === 'Investment' && <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Monthly Rental Income</label><input type="number" min={0} value={assetForm.monthly_rental_income} onChange={(e) => setAssetForm((f) => ({ ...f, monthly_rental_income: e.target.value }))} className={inputClasses} /></div>}
                    <div className="flex items-center gap-2"><input type="checkbox" id="to_be_sold" checked={assetForm.to_be_sold} onChange={(e) => setAssetForm((f) => ({ ...f, to_be_sold: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="to_be_sold" className="text-sm text-gray-700 dark:text-gray-300">To Be Sold</label></div>
                    <div className="flex items-center gap-2"><input type="checkbox" id="will_become_investment" checked={assetForm.will_become_investment} onChange={(e) => setAssetForm((f) => ({ ...f, will_become_investment: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="will_become_investment" className="text-sm text-gray-700 dark:text-gray-300">Will Become Investment After Settlement</label></div>
                  </FormSection>
                )}

                {assetForm.asset_type === 'Vehicle' && (
                  <FormSection title="Vehicle Details">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Vehicle Type</label><select value={assetForm.vehicle_type} onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_type: e.target.value }))} className={inputClasses}><option value="">—</option><option>Car</option><option>Motorbike</option><option>Boat</option><option>Caravan</option><option>Other</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Make</label><input type="text" value={assetForm.vehicle_make} onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_make: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Model</label><input type="text" value={assetForm.vehicle_model} onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_model: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Year</label><input type="number" min={1900} max={2100} value={assetForm.vehicle_year} onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_year: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Value</label><input type="number" min={0} value={assetForm.vehicle_value} onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_value: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rego</label><input type="text" value={assetForm.vehicle_rego} onChange={(e) => setAssetForm((f) => ({ ...f, vehicle_rego: e.target.value }))} className={inputClasses} /></div>
                  </FormSection>
                )}

                {assetForm.asset_type === 'Bank Account' && (
                  <FormSection title="Bank Account">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bank Name</label><input type="text" value={assetForm.bank_name} onChange={(e) => setAssetForm((f) => ({ ...f, bank_name: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account Type</label><select value={assetForm.account_type} onChange={(e) => setAssetForm((f) => ({ ...f, account_type: e.target.value }))} className={inputClasses}><option value="">—</option><option>Transaction</option><option>Savings</option><option>Term Deposit</option><option>Other</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Account Number</label><input type="text" value={assetForm.account_number} onChange={(e) => setAssetForm((f) => ({ ...f, account_number: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Balance</label><input type="number" min={0} value={assetForm.account_balance} onChange={(e) => setAssetForm((f) => ({ ...f, account_balance: e.target.value }))} className={inputClasses} /></div>
                    <div className="flex items-center gap-2"><input type="checkbox" id="is_direct_debit" checked={assetForm.is_direct_debit} onChange={(e) => setAssetForm((f) => ({ ...f, is_direct_debit: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><label htmlFor="is_direct_debit" className="text-sm text-gray-700 dark:text-gray-300">Is Direct Debit</label></div>
                  </FormSection>
                )}

                {assetForm.asset_type === 'KiwiSaver' && (
                  <FormSection title="KiwiSaver">
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Provider</label><input type="text" value={assetForm.kiwisaver_provider} onChange={(e) => setAssetForm((f) => ({ ...f, kiwisaver_provider: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Member Number</label><input type="text" value={assetForm.kiwisaver_member_number} onChange={(e) => setAssetForm((f) => ({ ...f, kiwisaver_member_number: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Balance</label><input type="number" min={0} value={assetForm.kiwisaver_balance} onChange={(e) => setAssetForm((f) => ({ ...f, kiwisaver_balance: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contribution Rate (%)</label><input type="number" min={0} max={100} value={assetForm.kiwisaver_contribution_rate} onChange={(e) => setAssetForm((f) => ({ ...f, kiwisaver_contribution_rate: e.target.value }))} className={inputClasses} /></div>
                  </FormSection>
                )}

                {assetForm.asset_type === 'Investment' && (
                  <FormSection title="Investment">
                    <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label><input type="text" value={assetForm.investment_description} onChange={(e) => setAssetForm((f) => ({ ...f, investment_description: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Value</label><input type="number" min={0} value={assetForm.investment_value} onChange={(e) => setAssetForm((f) => ({ ...f, investment_value: e.target.value }))} className={inputClasses} /></div>
                  </FormSection>
                )}

                {assetForm.asset_type === 'Other' && (
                  <FormSection title="Other Asset">
                    <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label><input type="text" value={assetForm.other_description} onChange={(e) => setAssetForm((f) => ({ ...f, other_description: e.target.value }))} className={inputClasses} /></div>
                    <div><label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Value</label><input type="number" min={0} value={assetForm.other_value} onChange={(e) => setAssetForm((f) => ({ ...f, other_value: e.target.value }))} className={inputClasses} /></div>
                  </FormSection>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
                <Button type="button" variant="secondary" onClick={() => { setShowAssetModal(false); setEditingAsset(null); setAssetForm(emptyAssetForm()); setAssetFormError(null); }}>Cancel</Button>
                <Button type="submit" isLoading={submittingAsset}>{editingAsset ? 'Save changes' : 'Add Asset'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetsTab;
