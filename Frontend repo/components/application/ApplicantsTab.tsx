import React, { useState, useEffect } from 'react';
import { applicationService, type Applicant } from '../../services/applicationService';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { NZ_REGIONS, NZ_RESIDENCY_STATUS } from '../../constants';

const inputClasses = 'block w-full text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:border-primary-500 focus:ring-primary-500 p-2';

interface ApplicantsTabProps {
  applicationId: string;
}

export const ApplicantsTab: React.FC<ApplicantsTabProps> = ({ applicationId }) => {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Applicant>>({ first_name: '', surname: '', applicant_type: 'primary' });

  const fetch = async () => {
    setIsLoading(true);
    try {
      const data = await applicationService.getApplicants(applicationId);
      setApplicants(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [applicationId]);

  const handleAdd = async () => {
    if (!formData.first_name || !formData.surname) return;
    try {
      await applicationService.createApplicant(applicationId, formData);
      setShowAddForm(false);
      setFormData({ first_name: '', surname: '', applicant_type: 'primary' });
      fetch();
    } catch (e: any) {
      alert(e?.message || 'Failed to add applicant');
    }
  };

  const handleUpdate = async (id: string, payload: Partial<Applicant>) => {
    try {
      await applicationService.updateApplicant(id, payload);
      setEditingId(null);
      fetch();
    } catch (e: any) {
      alert(e?.message || 'Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this applicant?')) return;
    try {
      await applicationService.deleteApplicant(id);
      fetch();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete');
    }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Icon name="Loader" className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Applicants ({applicants.length})</h4>
        <Button size="sm" leftIcon="Plus" onClick={() => setShowAddForm(true)} disabled={showAddForm}>Add Applicant</Button>
      </div>

      {showAddForm && (
        <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/30 space-y-3">
          <h5 className="font-medium text-sm">New Applicant</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">First Name *</label>
              <input className={inputClasses} value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Surname *</label>
              <input className={inputClasses} value={formData.surname} onChange={e => setFormData({ ...formData, surname: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select className={inputClasses} value={formData.applicant_type} onChange={e => setFormData({ ...formData, applicant_type: e.target.value })}>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="guarantor">Guarantor</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd}>Save</Button>
            <Button variant="secondary" size="sm" onClick={() => { setShowAddForm(false); setFormData({ first_name: '', surname: '', applicant_type: 'primary' }); }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {applicants.map(app => (
          <div key={app.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30"
              onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
            >
              <div className="flex items-center gap-3">
                <Icon name={expandedId === app.id ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4 text-gray-500" />
                <span className="font-medium">{[app.first_name, app.surname].filter(Boolean).join(' ') || 'Unnamed'}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600">{app.applicant_type}</span>
              </div>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                {editingId !== app.id ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(app.id)}><Icon name="Pencil" className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(app.id)}><Icon name="Trash2" className="h-4 w-4 text-red-500" /></Button>
                  </>
                ) : null}
              </div>
            </button>
            {expandedId === app.id && (
              <div className="p-4 pt-0 border-t dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                {editingId === app.id ? (
                  <ApplicantEditForm applicant={app} onSave={p => handleUpdate(app.id, p)} onCancel={() => setEditingId(null)} />
                ) : (
                  <ApplicantDetailView applicant={app} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {applicants.length === 0 && !showAddForm && (
        <p className="text-sm text-gray-500 text-center py-8">No applicants yet. Click Add Applicant to get started.</p>
      )}
    </div>
  );
};

const ApplicantDetailView: React.FC<{ applicant: Applicant }> = ({ applicant }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
    <div><span className="text-gray-500">Email:</span> {applicant.email_primary || '—'}</div>
    <div><span className="text-gray-500">Mobile:</span> {applicant.mobile_phone || '—'}</div>
    <div><span className="text-gray-500">DOB:</span> {applicant.date_of_birth || '—'}</div>
    <div><span className="text-gray-500">Region:</span> {applicant.current_region || '—'}</div>
    <div><span className="text-gray-500">Residency:</span> {applicant.residency_status || '—'}</div>
  </div>
);

const ApplicantEditForm: React.FC<{ applicant: Applicant; onSave: (p: Partial<Applicant>) => void; onCancel: () => void }> = ({ applicant, onSave, onCancel }) => {
  const [form, setForm] = useState({
    title: applicant.title || '',
    first_name: applicant.first_name || '',
    middle_name: applicant.middle_name || '',
    surname: applicant.surname || '',
    preferred_name: applicant.preferred_name || '',
    date_of_birth: applicant.date_of_birth || '',
    mobile_phone: applicant.mobile_phone || '',
    email_primary: applicant.email_primary || '',
    current_region: applicant.current_region || '',
    residency_status: applicant.residency_status || '',
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">Title</label><input className={inputClasses} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Mr, Mrs, Ms" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">First Name *</label><input className={inputClasses} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Middle Name</label><input className={inputClasses} value={form.middle_name} onChange={e => setForm({ ...form, middle_name: e.target.value })} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Surname *</label><input className={inputClasses} value={form.surname} onChange={e => setForm({ ...form, surname: e.target.value })} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Preferred Name</label><input className={inputClasses} value={form.preferred_name} onChange={e => setForm({ ...form, preferred_name: e.target.value })} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Date of Birth</label><input type="date" className={inputClasses} value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Mobile</label><input className={inputClasses} value={form.mobile_phone} onChange={e => setForm({ ...form, mobile_phone: e.target.value })} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" className={inputClasses} value={form.email_primary} onChange={e => setForm({ ...form, email_primary: e.target.value })} /></div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Region</label>
          <select className={inputClasses} value={form.current_region} onChange={e => setForm({ ...form, current_region: e.target.value })}>
            <option value="">—</option>
            {NZ_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Residency Status</label>
          <select className={inputClasses} value={form.residency_status} onChange={e => setForm({ ...form, residency_status: e.target.value })}>
            <option value="">—</option>
            {NZ_RESIDENCY_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)}>Save</Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};
