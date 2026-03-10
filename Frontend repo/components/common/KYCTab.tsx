import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { KYCDocument } from '../../types';
import { KYC_SECTION_LABELS, KYC_SECTIONS, REMINDER_OPTIONS } from '../../types';
import type { KYCSection } from '../../types';
import { crmService } from '../../services/api';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { Button } from './Button';

interface KYCTabProps {
  clientId: string;
  clientName?: string;
  onUpdated?: () => void;
}

const KYCTab: React.FC<KYCTabProps> = ({ clientId, clientName, onUpdated }) => {
  const [documents, setDocuments] = useState<KYCDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadSection, setUploadSection] = useState<KYCSection | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [reminderDays, setReminderDays] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingExpiryId, setEditingExpiryId] = useState<string | null>(null);
  const [editingExpiryValue, setEditingExpiryValue] = useState('');
  const [reminderModalDoc, setReminderModalDoc] = useState<KYCDocument | null>(null);
  const [reminderModalDays, setReminderModalDays] = useState<number | null>(null);
  const [viewerDoc, setViewerDoc] = useState<KYCDocument | null>(null);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renamingDocName, setRenamingDocName] = useState('');
  const [menuOpenDocId, setMenuOpenDocId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const fetchDocuments = useCallback(() => {
    setIsLoading(true);
    crmService.getKycDocuments(clientId).then(docs => {
      setDocuments(docs);
      setIsLoading(false);
    });
  }, [clientId]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const docsBySection = KYC_SECTIONS.reduce((acc, section) => {
    acc[section] = documents.filter(d => d.kycSection === section);
    return acc;
  }, {} as Record<KYCSection, KYCDocument[]>);

  const handleFileSelect = (section: KYCSection, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadSection(section);
      setPendingFile(file);
      setExpiryDate('');
      setReminderDays(null);
    }
    e.target.value = '';
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !uploadSection) return;
    setIsUploading(true);
    try {
      await crmService.addKycDocument(clientId, pendingFile, uploadSection, expiryDate || null, reminderDays);
      setPendingFile(null);
      setUploadSection(null);
      setExpiryDate('');
      setReminderDays(null);
      fetchDocuments();
      onUpdated?.();
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveExpiry = async () => {
    if (!editingExpiryId) return;
    try {
      await crmService.updateDocument(editingExpiryId, { expiryDate: editingExpiryValue || undefined });
      setEditingExpiryId(null);
      setEditingExpiryValue('');
      fetchDocuments();
    } catch (err) {
      console.error('Failed to update expiry:', err);
      alert('Failed to update expiry date.');
    }
  };

  const handleRename = async () => {
    if (!renamingDocId) return;
    const name = renamingDocName.trim();
    if (!name) return;
    try {
      await crmService.updateDocument(renamingDocId, { name });
      setRenamingDocId(null);
      setRenamingDocName('');
      fetchDocuments();
    } catch (err) {
      console.error('Failed to rename:', err);
      alert('Failed to rename document.');
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document?')) return;
    try {
      await crmService.deleteDocument(docId);
      fetchDocuments();
      onUpdated?.();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete document.');
    }
  };

  const handleSaveReminder = async () => {
    if (!reminderModalDoc) return;
    try {
      await crmService.updateKycDocument(reminderModalDoc.id, {
        expiryDate: reminderModalDoc.expiryDate,
        reminderDaysBefore: reminderModalDays ?? undefined,
      });
      setReminderModalDoc(null);
      setReminderModalDays(null);
      fetchDocuments();
    } catch (err) {
      console.error('Failed to set reminder:', err);
      alert('Failed to set reminder.');
    }
  };

  const getStatusBadge = (status?: KYCDocument['status']) => {
    if (!status) return null;
    const classes = {
      Valid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'Expiring Soon': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
      Expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${classes[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Icon name="Loader" className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        KYC_SECTIONS.map(section => (
          <div key={section} className="border dark:border-gray-600 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50">
              <h4 className="font-semibold text-sm">{KYC_SECTION_LABELS[section]}</h4>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg">
                  <Icon name="Upload" className="h-4 w-4" />
                  Upload / Add
                </span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,image/*"
                  className="hidden"
                  onChange={e => handleFileSelect(section, e)}
                />
              </label>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-600">
              {docsBySection[section]?.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  No documents yet. Upload or add one above.
                </div>
              ) : (
                docsBySection[section]?.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Icon name="FileText" className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => !renamingDocId && setViewerDoc(doc)}
                      >
                        {renamingDocId === doc.id ? (
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={renamingDocName}
                              onChange={e => setRenamingDocName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRename();
                                if (e.key === 'Escape') { setRenamingDocId(null); setRenamingDocName(''); }
                              }}
                              className="flex-1 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                              autoFocus
                            />
                            <button type="button" onClick={handleRename} className="text-xs text-primary-600 hover:underline">Save</button>
                            <button type="button" onClick={() => { setRenamingDocId(null); setRenamingDocName(''); }} className="text-xs text-gray-500 hover:underline">Cancel</button>
                          </div>
                        ) : (
                          <p className="font-medium text-sm truncate">{doc.name}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {editingExpiryId === doc.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={editingExpiryValue}
                                onChange={e => setEditingExpiryValue(e.target.value)}
                                className="px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                              />
                              <button type="button" onClick={handleSaveExpiry} className="text-xs text-primary-600 hover:underline">Save</button>
                              <button type="button" onClick={() => { setEditingExpiryId(null); setEditingExpiryValue(''); }} className="text-xs text-gray-500 hover:underline">Cancel</button>
                            </div>
                          ) : (
                            <>
                              {doc.expiryDate ? (
                                <>
                                  <span className="text-xs text-gray-600 dark:text-gray-400">
                                    Expires: {new Date(doc.expiryDate).toLocaleDateString('en-NZ')}
                                  </span>
                                  {getStatusBadge(doc.status)}
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setEditingExpiryId(doc.id); setEditingExpiryValue(''); }}
                                  className="text-xs text-primary-600 hover:underline"
                                >
                                  Enter expiry date
                                </button>
                              )}
                              {doc.reminderDaysBefore && (
                                <span className="text-xs text-gray-500">
                                  Reminder: {REMINDER_OPTIONS.find(r => r.value === doc.reminderDaysBefore)?.label}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a href={doc.url} download={doc.name} onClick={e => e.stopPropagation()} className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500" title="Download">
                        <Icon name="Download" className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setReminderModalDoc(doc); setReminderModalDays(doc.reminderDaysBefore ?? null); }}
                        className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                        title="Set reminder"
                      >
                        <Icon name="Calendar" className="h-4 w-4" />
                      </button>
                      {!doc.expiryDate && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setEditingExpiryId(doc.id); setEditingExpiryValue(''); }}
                          className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                          title="Enter expiry"
                        >
                          <Icon name="Pencil" className="h-4 w-4" />
                        </button>
                      )}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const btn = e.currentTarget;
                            if (menuOpenDocId === doc.id) {
                              setMenuOpenDocId(null);
                              setMenuPosition(null);
                            } else {
                              const rect = btn.getBoundingClientRect();
                              setMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 160) });
                              setMenuOpenDocId(doc.id);
                            }
                          }}
                          className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                          title="More options"
                        >
                          <Icon name="MoreVertical" className="h-4 w-4" />
                        </button>
                        {menuOpenDocId === doc.id && menuPosition &&
                          createPortal(
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => { setMenuOpenDocId(null); setMenuPosition(null); }} aria-hidden="true" />
                              <div
                                className="fixed z-20 w-40 py-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg"
                                style={{ top: menuPosition.top, left: menuPosition.left }}
                              >
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setRenamingDocId(doc.id); setRenamingDocName(doc.name); setMenuOpenDocId(null); setMenuPosition(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Icon name="Pencil" className="h-4 w-4" /> Rename
                                </button>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); handleDelete(doc.id); setMenuOpenDocId(null); setMenuPosition(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  <Icon name="Trash2" className="h-4 w-4" /> Delete
                                </button>
                              </div>
                            </>,
                            document.body
                          )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))
      )}

      {/* Upload modal */}
      {uploadSection && pendingFile && (
        <Modal isOpen={true} onClose={() => { setPendingFile(null); setUploadSection(null); }} title="Add KYC Document">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Uploading to <strong>{KYC_SECTION_LABELS[uploadSection]}</strong>
            </p>
            <p className="text-sm truncate">{pendingFile.name}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Expiry date (optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                If not detected from the document, enter manually.
              </p>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Reminder
              </label>
              <select
                value={reminderDays ?? ''}
                onChange={e => setReminderDays(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
              >
                <option value="">No reminder</option>
                {REMINDER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Shows in notifications when due.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => { setPendingFile(null); setUploadSection(null); }}>Cancel</Button>
              <Button onClick={handleConfirmUpload} disabled={isUploading}>
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reminder modal */}
      {reminderModalDoc && (
        <Modal isOpen={true} onClose={() => { setReminderModalDoc(null); setReminderModalDays(null); }} title="Set Reminder">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">{reminderModalDoc.name}</p>
            {!reminderModalDoc.expiryDate ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Enter an expiry date first to set a reminder.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  Expires: {new Date(reminderModalDoc.expiryDate).toLocaleDateString('en-NZ')}
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Remind me
                  </label>
                  <select
                    value={reminderModalDays ?? ''}
                    onChange={e => setReminderModalDays(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
                  >
                    <option value="">No reminder</option>
                    {REMINDER_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => { setReminderModalDoc(null); setReminderModalDays(null); }}>Cancel</Button>
              <Button onClick={handleSaveReminder} disabled={!reminderModalDoc.expiryDate}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Document viewer */}
      {viewerDoc && (
        <Modal isOpen={true} onClose={() => setViewerDoc(null)} title={viewerDoc.name}>
          <div className="space-y-4">
            <div className="h-[60vh] bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              {viewerDoc.url.match(/\.(pdf|jpg|jpeg|png|gif)$/i) ? (
                viewerDoc.url.match(/\.pdf$/i) ? (
                  <iframe src={viewerDoc.url} className="w-full h-full" title={viewerDoc.name} />
                ) : (
                  <img src={viewerDoc.url} alt={viewerDoc.name} className="w-full h-full object-contain" />
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Icon name="FileText" className="h-16 w-16 mb-4" />
                  <p>Preview not available.</p>
                  <a href={viewerDoc.url} download={viewerDoc.name} className="mt-4 text-primary-600 hover:underline">Download</a>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default KYCTab;

