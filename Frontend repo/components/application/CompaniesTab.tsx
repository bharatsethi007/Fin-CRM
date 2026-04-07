import React, { useState, useEffect } from 'react';
import { applicationService, type Company } from '../../services/api';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { NZ_REGIONS } from '../../constants';

const inputClasses = 'block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2';

const ENTITY_TYPES = ['Company', 'Partnership', 'Trust', 'Sole Trader', 'LLP', 'Other'];

interface CompaniesTabProps {
  applicationId: string;
}

export const CompaniesTab: React.FC<CompaniesTabProps> = ({ applicationId }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetch = () => applicationService.getCompanies(applicationId).then(setCompanies).finally(() => setIsLoading(false));

  useEffect(() => { fetch(); }, [applicationId]);

  if (isLoading) return <div className="flex justify-center py-8"><Icon name="Loader" className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Business Entities</h4>
        <Button size="sm" leftIcon="Plus" onClick={() => setShowAddForm(true)} disabled={showAddForm}>Add Company</Button>
      </div>

      {companies.length === 0 && !showAddForm ? (
        <p className="text-sm text-gray-500 text-center py-8">No companies recorded. Add if self-employed.</p>
      ) : (
        companies.map(c => (
          <div key={c.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <button className="flex-1 flex items-center justify-between text-left" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                <div>
                  <div className="font-medium">{c.entity_name}</div>
                  <div className="text-sm text-gray-500">{c.entity_type} • {c.trading_name || '—'}</div>
                </div>
                <Icon name={expandedId === c.id ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
              </button>
              <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
                <Button variant="ghost" size="sm" onClick={() => setEditingId(c.id)}><Icon name="Pencil" className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={async () => { if (confirm('Delete?')) { await applicationService.deleteCompany(c.id); fetch(); } }}><Icon name="Trash2" className="h-4 w-4 text-red-500" /></Button>
              </div>
            </div>
            {expandedId === c.id && (
              <div className="p-4 pt-0 border-t dark:border-gray-700">
                <CompanyDetail company={c} />
              </div>
            )}
          </div>
        ))
      )}

      {showAddForm && <CompanyFormModal applicationId={applicationId} onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); fetch(); }} />}
      {editingId && <CompanyFormModal applicationId={applicationId} company={companies.find(x => x.id === editingId)!} onClose={() => setEditingId(null)} onSaved={() => { setEditingId(null); fetch(); }} />}
    </div>
  );
};

const CompanyDetail: React.FC<{ company: Company }> = ({ company }) => (
  <div className="grid grid-cols-2 gap-2 text-sm">
    {company.nzbn && <div><span className="text-gray-500">NZBN:</span> {company.nzbn}</div>}
    {company.company_number && <div><span className="text-gray-500">Company #:</span> {company.company_number}</div>}
    {company.gst_registered && <div><span className="text-gray-500">GST Registered</span></div>}
    {company.gst_number && <div><span className="text-gray-500">GST #:</span> {company.gst_number}</div>}
    {company.incorporation_date && <div><span className="text-gray-500">Incorporation:</span> {company.incorporation_date}</div>}
    {company.industry && <div><span className="text-gray-500">Industry:</span> {company.industry}</div>}
    {company.business_address && <div className="col-span-2"><span className="text-gray-500">Address:</span> {company.business_address}</div>}
    {company.contact_email && <div><span className="text-gray-500">Email:</span> {company.contact_email}</div>}
    {company.contact_phone && <div><span className="text-gray-500">Phone:</span> {company.contact_phone}</div>}
  </div>
);

const CompanyFormModal: React.FC<{ applicationId: string; company?: Company; onClose: () => void; onSaved: () => void }> = ({ applicationId, company, onClose, onSaved }) => {
  const [form, setForm] = useState({
    entity_name: company?.entity_name || '',
    trading_name: company?.trading_name || '',
    entity_type: company?.entity_type || '',
    nzbn: company?.nzbn || '',
    company_number: company?.company_number || '',
    gst_registered: company?.gst_registered ?? false,
    gst_number: company?.gst_number || '',
    incorporation_date: company?.incorporation_date || '',
    registration_date: company?.registration_date || '',
    industry: company?.industry || '',
    industry_code: company?.industry_code || '',
    business_description: company?.business_description || '',
    number_of_employees: company?.number_of_employees ?? '',
    is_trust: company?.is_trust ?? false,
    trust_name: company?.trust_name || '',
    contact_phone: company?.contact_phone || '',
    contact_email: company?.contact_email || '',
    website: company?.website || '',
    business_address: company?.business_address || '',
    business_suburb: company?.business_suburb || '',
    business_city: company?.business_city || '',
    business_region: company?.business_region || '',
    business_postcode: company?.business_postcode || '',
    notes: company?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [addressOpen, setAddressOpen] = useState(false);

  const handleSave = async () => {
    if (!form.entity_name) {
      alert('Entity name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Company> = {
        ...form,
        number_of_employees: form.number_of_employees ? Number(form.number_of_employees) : undefined,
      };
      if (company) await applicationService.updateCompany(company.id, payload);
      else await applicationService.createCompany(applicationId, payload);
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
        <h5 className="font-semibold mb-4">{company ? 'Edit Company' : 'Add Company'}</h5>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Entity Name *</label>
            <input className={inputClasses} value={form.entity_name} onChange={e => setForm({ ...form, entity_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Trading Name</label>
            <input className={inputClasses} value={form.trading_name} onChange={e => setForm({ ...form, trading_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Entity Type</label>
            <select className={inputClasses} value={form.entity_type} onChange={e => setForm({ ...form, entity_type: e.target.value })}>
              <option value="">—</option>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="border dark:border-gray-700 rounded-lg mb-4">
          <button className="w-full flex justify-between p-3 text-left font-medium" onClick={() => setDetailsOpen(!detailsOpen)}>
            Registration & Details
            <Icon name={detailsOpen ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
          </button>
          {detailsOpen && (
            <div className="p-3 pt-0 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">NZBN</label><input className={inputClasses} value={form.nzbn} onChange={e => setForm({ ...form, nzbn: e.target.value })} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Company Number</label><input className={inputClasses} value={form.company_number} onChange={e => setForm({ ...form, company_number: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="gst" checked={form.gst_registered} onChange={e => setForm({ ...form, gst_registered: e.target.checked })} />
                <label htmlFor="gst">GST Registered</label>
              </div>
              {form.gst_registered && <div><label className="block text-xs text-gray-500 mb-1">GST Number</label><input className={inputClasses} value={form.gst_number} onChange={e => setForm({ ...form, gst_number: e.target.value })} /></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">Incorporation Date</label><input type="date" className={inputClasses} value={form.incorporation_date} onChange={e => setForm({ ...form, incorporation_date: e.target.value })} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Registration Date</label><input type="date" className={inputClasses} value={form.registration_date} onChange={e => setForm({ ...form, registration_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">Industry</label><input className={inputClasses} value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} /></div>
                <div><label className="block text-xs text-gray-500 mb-1"># Employees</label><input type="number" className={inputClasses} value={form.number_of_employees} onChange={e => setForm({ ...form, number_of_employees: e.target.value })} /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Business Description</label><textarea className={inputClasses} rows={2} value={form.business_description} onChange={e => setForm({ ...form, business_description: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="trust" checked={form.is_trust} onChange={e => setForm({ ...form, is_trust: e.target.checked })} />
                <label htmlFor="trust">Is Trust</label>
              </div>
              {form.is_trust && <div><label className="block text-xs text-gray-500 mb-1">Trust Name</label><input className={inputClasses} value={form.trust_name} onChange={e => setForm({ ...form, trust_name: e.target.value })} /></div>}
            </div>
          )}
        </div>

        <div className="border dark:border-gray-700 rounded-lg mb-4">
          <button className="w-full flex justify-between p-3 text-left font-medium" onClick={() => setAddressOpen(!addressOpen)}>
            Contact & Address
            <Icon name={addressOpen ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4" />
          </button>
          {addressOpen && (
            <div className="p-3 pt-0 space-y-3">
              <div><label className="block text-xs text-gray-500 mb-1">Business Address</label><input className={inputClasses} value={form.business_address} onChange={e => setForm({ ...form, business_address: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block text-xs text-gray-500 mb-1">Suburb</label><input className={inputClasses} value={form.business_suburb} onChange={e => setForm({ ...form, business_suburb: e.target.value })} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">City</label><input className={inputClasses} value={form.business_city} onChange={e => setForm({ ...form, business_city: e.target.value })} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Region</label><select className={inputClasses} value={form.business_region} onChange={e => setForm({ ...form, business_region: e.target.value })}><option value="">—</option>{NZ_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">Phone</label><input className={inputClasses} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" className={inputClasses} value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Website</label><input className={inputClasses} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Notes</label>
          <textarea className={inputClasses} rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} isLoading={saving}>Save</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
