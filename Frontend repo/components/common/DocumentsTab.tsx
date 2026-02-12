import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Document, DocumentFolder } from '../../types';
import { DOCUMENT_CATEGORIES } from '../../types';
import { crmService } from '../../services/crmService';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { Button } from './Button';

interface DocumentsTabProps {
  clientId: string;
  clientEmail: string;
  onDocumentsUpdated?: () => void;
}

const UNFILED_KEY = '__unfiled__';
const groupDocumentsByCategory = (docs: Document[]) => {
  const groups: Record<string, Document[]> = {};
  for (const cat of DOCUMENT_CATEGORIES) {
    groups[cat] = docs.filter(d => d.category === cat);
  }
  const other = docs.filter(d => !DOCUMENT_CATEGORIES.includes(d.category as typeof DOCUMENT_CATEGORIES[number]));
  if (other.length > 0) {
    groups['Other'] = other;
  }
  return groups;
};

const groupDocumentsByFolder = (docs: Document[], folders: DocumentFolder[]) => {
  const groups: { key: string; label: string; docs: Document[] }[] = [];
  const unfiled = docs.filter(d => !d.folderId);
  groups.push({ key: UNFILED_KEY, label: 'Unfiled', docs: unfiled });
  for (const folder of folders) {
    groups.push({
      key: folder.id,
      label: folder.name,
      docs: docs.filter(d => d.folderId === folder.id),
    });
  }
  return groups;
};

const DocumentsTab: React.FC<DocumentsTabProps> = ({ clientId, clientEmail, onDocumentsUpdated }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(DOCUMENT_CATEGORIES[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<Document | null>(null);
  const [shareDocs, setShareDocs] = useState<Document[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmails, setShareEmails] = useState<string[]>([]);
  const [shareSubject, setShareSubject] = useState('');
  const [shareBody, setShareBody] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedForShare, setSelectedForShare] = useState<Set<string>>(new Set());
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState<string | null>(null);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [renameDocName, setRenameDocName] = useState('');
  const [changeCategoryDocId, setChangeCategoryDocId] = useState<string | null>(null);
  const [changeCategoryValue, setChangeCategoryValue] = useState('');
  const [uploadToFolderId, setUploadToFolderId] = useState<string | null>(null);
  const [folderMenuPosition, setFolderMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [fileMenuPosition, setFileMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const fetchDocuments = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      crmService.getDocuments(clientId),
      crmService.getFolders(clientId),
    ]).then(([docs, foldersList]) => {
      setDocuments(docs);
      setFolders(foldersList);
      setIsLoading(false);
    });
  }, [clientId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const folderGroups = useMemo(() => groupDocumentsByFolder(documents, folders), [documents, folders]);

  useEffect(() => {
    const keys = folderGroups.map(g => g.key);
    if (keys.length > 0) {
      setExpandedGroups(prev => {
        if (prev.size === 0) return new Set(keys);
        const next = new Set(prev);
        keys.forEach(k => next.add(k));
        return next;
      });
    }
  }, [folderGroups]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf' || f.name.match(/\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png|gif)$/i));
    if (files.length > 0) {
      setPendingFiles(files);
      setShowCategoryModal(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      setPendingFiles(files);
      setShowCategoryModal(true);
    }
    e.target.value = '';
  };

  const handleConfirmUpload = async () => {
    if (pendingFiles.length === 0) return;
    setIsUploading(true);
    try {
      const folderId = uploadToFolderId;
      for (const file of pendingFiles) {
        await crmService.addDocument(clientId, file, selectedCategory, folderId);
      }
      setPendingFiles([]);
      setShowCategoryModal(false);
      setUploadToFolderId(null);
      fetchDocuments();
      onDocumentsUpdated?.();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload documents. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setPendingFiles([]);
    setShowCategoryModal(false);
    setUploadToFolderId(null);
  };

  const formatTimestamp = (createdAt?: string) => {
    if (!createdAt) return '—';
    const d = new Date(createdAt);
    return d.toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const openViewer = (doc: Document) => setViewerDoc(doc);
  const closeViewer = () => setViewerDoc(null);

  const openShareModal = (docs: Document[]) => {
    setShareDocs(docs);
    setShareEmails(clientEmail ? [clientEmail] : []);
    setShareSubject('');
    setShareBody('');
    setShowShareModal(true);
    setSelectedForShare(new Set());
  };

  const toggleSelectForShare = (docId: string) => {
    setSelectedForShare(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const openShareSelected = () => {
    const docs = documents.filter(d => selectedForShare.has(d.id));
    if (docs.length > 0) openShareModal(docs);
  };

  const openMoveModal = () => {
    setMoveTargetFolderId(null);
    setShowMoveModal(true);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setIsCreatingFolder(true);
    try {
      await crmService.createFolder(clientId, name);
      setNewFolderName('');
      setShowNewFolderModal(false);
      fetchDocuments();
    } catch (err) {
      console.error('Failed to create folder:', err);
      alert('Failed to create folder. Please try again.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleMoveToFolder = async () => {
    const ids = Array.from(selectedForShare);
    if (ids.length === 0) return;
    setIsMoving(true);
    try {
      await crmService.moveDocumentsToFolder(ids, moveTargetFolderId);
      setShowMoveModal(false);
      setSelectedForShare(new Set());
      fetchDocuments();
      onDocumentsUpdated?.();
    } catch (err) {
      console.error('Failed to move documents:', err);
      alert('Failed to move documents. Please try again.');
    } finally {
      setIsMoving(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!renameFolderId) return;
    const name = renameFolderName.trim();
    if (!name) return;
    try {
      await crmService.renameFolder(renameFolderId, name);
      setRenameFolderId(null);
      setRenameFolderName('');
      fetchDocuments();
    } catch (err) {
      console.error('Failed to rename folder:', err);
      alert('Failed to rename folder.');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Delete this folder? Documents inside will be moved to Unfiled.')) return;
    setFolderMenuOpen(null);
    setFolderMenuPosition(null);
    try {
      await crmService.deleteFolder(folderId);
      fetchDocuments();
    } catch (err) {
      console.error('Failed to delete folder:', err);
      alert('Failed to delete folder.');
    }
  };

  const handleUploadToFolder = (folderId: string) => {
    setUploadToFolderId(folderId === UNFILED_KEY ? null : folderId);
    setFolderMenuOpen(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,image/*';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files?.length) return;
      setPendingFiles(Array.from(files));
      setSelectedCategory(DOCUMENT_CATEGORIES[0]);
      setShowCategoryModal(true);
    };
    input.click();
  };

  const handleCreateSubfolder = (currentFolderKey: string) => {
    setFolderMenuOpen(null);
    setNewFolderName('');
    setShowNewFolderModal(true);
  };

  const handleRenameDoc = async () => {
    if (!renameDocId) return;
    const name = renameDocName.trim();
    if (!name) return;
    try {
      await crmService.updateDocument(renameDocId, { name });
      setRenameDocId(null);
      setRenameDocName('');
      fetchDocuments();
    } catch (err) {
      console.error('Failed to rename document:', err);
      alert('Failed to rename document.');
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Delete this document?')) return;
    setFileMenuOpen(null);
    try {
      await crmService.deleteDocument(docId);
      fetchDocuments();
    } catch (err) {
      console.error('Failed to delete document:', err);
      alert('Failed to delete document.');
    }
  };

  const handleChangeCategory = async () => {
    if (!changeCategoryDocId) return;
    try {
      await crmService.updateDocument(changeCategoryDocId, { category: changeCategoryValue });
      setChangeCategoryDocId(null);
      setChangeCategoryValue('');
      fetchDocuments();
    } catch (err) {
      console.error('Failed to update category:', err);
      alert('Failed to update category.');
    }
  };

  const addShareEmail = () => setShareEmails(prev => [...prev, '']);
  const updateShareEmail = (i: number, v: string) => setShareEmails(prev => prev.map((e, j) => (j === i ? v : e)));
  const removeShareEmail = (i: number) => setShareEmails(prev => prev.filter((_, j) => j !== i));

  const handleShareSubmit = () => {
    const validEmails = shareEmails.filter(e => e.trim());
    if (validEmails.length === 0) {
      alert('Please add at least one email address.');
      return;
    }
    const mailto = `mailto:${validEmails.join(',')}?subject=${encodeURIComponent(shareSubject)}&body=${encodeURIComponent(shareBody + '\n\nShared documents:\n' + shareDocs.map(d => d.url).join('\n'))}`;
    window.location.href = mailto;
    setShowShareModal(false);
  };

  const isViewableInFrame = (url: string) => url.match(/\.(pdf|jpg|jpeg|png|gif)$/i);

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }`}
      >
        <Icon name="FilePlus2" className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Drag and drop documents here, or
        </p>
        <label className="mt-2 inline-block">
          <span className="cursor-pointer text-primary-600 dark:text-primary-400 hover:underline font-medium">
            browse to upload
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold">Uploaded Documents</h4>
          <Button
            size="sm"
            variant="secondary"
            leftIcon="FolderPlus"
            onClick={() => {
              setNewFolderName('');
              setShowNewFolderModal(true);
            }}
          >
            New Folder
          </Button>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Icon name="Loader" className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {selectedForShare.size > 0 && (
              <div className="mb-3 flex flex-wrap gap-2 items-center">
                <Button size="sm" onClick={openShareSelected} leftIcon="Share2">
                  Share {selectedForShare.size} selected
                </Button>
                <Button size="sm" variant="secondary" leftIcon="Folder" onClick={openMoveModal}>
                  Move to folder
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedForShare(new Set())}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
            )}
            {folderGroups.map(({ key, label, docs }) => {
              const isExpanded = expandedGroups.has(key);
              const isUnfiled = key === UNFILED_KEY;
              const isRenaming = renameFolderId === key;
              return (
                <div key={key} className="border dark:border-gray-600 rounded-lg overflow-hidden">
                  <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <button
                      type="button"
                      onClick={() => toggleGroup(key)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      <Icon name="Folder" className="h-4 w-4 text-[#007AFF] flex-shrink-0" />
                      {isRenaming ? (
                        <input
                          type="text"
                          value={renameFolderName}
                          onChange={e => setRenameFolderName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameFolder();
                            if (e.key === 'Escape') { setRenameFolderId(null); setRenameFolderName(''); }
                          }}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                          autoFocus
                        />
                      ) : (
                        <>
                          <span className="font-medium text-sm truncate">{label}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">({docs.length})</span>
                        </>
                      )}
                      <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    </button>
                    {isRenaming ? (
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        <button type="button" onClick={handleRenameFolder} className="text-xs text-primary-600 hover:underline">Save</button>
                        <button type="button" onClick={() => { setRenameFolderId(null); setRenameFolderName(''); }} className="text-xs text-gray-500 hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <div className="relative flex-shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const btn = e.currentTarget;
                            if (folderMenuOpen === key) {
                              setFolderMenuOpen(null);
                              setFolderMenuPosition(null);
                            } else {
                              const rect = btn.getBoundingClientRect();
                              setFolderMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 192) });
                              setFolderMenuOpen(key);
                            }
                            setFileMenuOpen(null);
                          }}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                        >
                          <Icon name="MoreVertical" className="h-4 w-4" />
                        </button>
                        {folderMenuOpen === key && folderMenuPosition &&
                          createPortal(
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => { setFolderMenuOpen(null); setFolderMenuPosition(null); }} aria-hidden="true" />
                              <div
                                className="fixed z-20 w-48 py-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg"
                                style={{ top: folderMenuPosition.top, left: folderMenuPosition.left }}
                              >
                                {!isUnfiled && (
                                  <button type="button" onClick={e => { e.stopPropagation(); setRenameFolderName(label); setRenameFolderId(key); setFolderMenuOpen(null); setFolderMenuPosition(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <Icon name="Pencil" className="h-4 w-4" /> Rename
                                  </button>
                                )}
                                <button type="button" onClick={e => { e.stopPropagation(); handleUploadToFolder(key); setFolderMenuOpen(null); setFolderMenuPosition(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700">
                                  <Icon name="Upload" className="h-4 w-4" /> Upload file
                                </button>
                                <button type="button" onClick={e => { e.stopPropagation(); handleCreateSubfolder(key); setFolderMenuOpen(null); setFolderMenuPosition(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700">
                                  <Icon name="FolderPlus" className="h-4 w-4" /> Create subfolder
                                </button>
                                {!isUnfiled && (
                                  <button type="button" onClick={e => { e.stopPropagation(); handleDeleteFolder(key); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <Icon name="Trash2" className="h-4 w-4" /> Delete
                                  </button>
                                )}
                              </div>
                            </>,
                            document.body
                          )}
                      </div>
                    )}
                  </div>
                  {isExpanded && (() => {
                    const catGroups = groupDocumentsByCategory(docs);
                    const categoriesWithDocs = DOCUMENT_CATEGORIES.filter(cat => (catGroups[cat]?.length ?? 0) > 0)
                      .concat(Object.keys(catGroups).filter(cat => !DOCUMENT_CATEGORIES.includes(cat)));
                    return (
                    <div className="border-t border-gray-200 dark:border-gray-600">
                      {categoriesWithDocs.map(category => {
                        const categoryDocs = catGroups[category] ?? [];
                        return (
                          <div key={category} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                            <div className="px-4 py-2 bg-gray-50/50 dark:bg-gray-800/50 text-xs font-medium text-gray-600 dark:text-gray-400">
                              {category} ({categoryDocs.length})
                            </div>
                            <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                              {categoryDocs.map(doc => {
                        const isDocRenaming = renameDocId === doc.id;
                        const isDocChangingCategory = changeCategoryDocId === doc.id;
                        return (
                          <li
                            key={doc.id}
                            className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <input
                              type="checkbox"
                              checked={selectedForShare.has(doc.id)}
                              onChange={e => { e.stopPropagation(); toggleSelectForShare(doc.id); }}
                              onClick={e => e.stopPropagation()}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
                            />
                            <div
                              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                              onClick={() => !isDocRenaming && !isDocChangingCategory && openViewer(doc)}
                            >
                              <Icon name="FileText" className="h-5 w-5 text-gray-400 flex-shrink-0" />
                              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                {isDocRenaming ? (
                                  <input
                                    type="text"
                                    value={renameDocName}
                                    onChange={e => setRenameDocName(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleRenameDoc();
                                      if (e.key === 'Escape') { setRenameDocId(null); setRenameDocName(''); }
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    className="flex-1 min-w-[120px] px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                                    autoFocus
                                  />
                                ) : (
                                  <p className="font-medium text-sm truncate">{doc.name}</p>
                                )}
                                {isDocRenaming && (
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button type="button" onClick={e => { e.stopPropagation(); handleRenameDoc(); }} className="text-xs text-primary-600 hover:underline">Save</button>
                                    <button type="button" onClick={e => { e.stopPropagation(); setRenameDocId(null); setRenameDocName(''); }} className="text-xs text-gray-500 hover:underline">Cancel</button>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-1">{formatTimestamp(doc.createdAt)}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); openShareModal([doc]); }}
                                className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                                title="Share"
                              >
                                <Icon name="Share2" className="h-4 w-4" />
                              </button>
                              <a
                                href={doc.url}
                                download={doc.name}
                                onClick={e => e.stopPropagation()}
                                className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                                title="Download"
                              >
                                <Icon name="Download" className="h-4 w-4" />
                              </a>
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const btn = e.currentTarget;
                                    if (fileMenuOpen === doc.id) {
                                      setFileMenuOpen(null);
                                      setFileMenuPosition(null);
                                    } else {
                                      const rect = btn.getBoundingClientRect();
                                      setFileMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 192) });
                                      setFileMenuOpen(doc.id);
                                    }
                                    setFolderMenuOpen(null);
                                  }}
                                  className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                                  title="More options"
                                >
                                  <Icon name="MoreVertical" className="h-4 w-4" />
                                </button>
                                {fileMenuOpen === doc.id && fileMenuPosition &&
                                  createPortal(
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => { setFileMenuOpen(null); setFileMenuPosition(null); }} aria-hidden="true" />
                                      <div
                                        className="fixed z-20 w-48 py-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg"
                                        style={{ top: fileMenuPosition.top, left: fileMenuPosition.left }}
                                      >
                                        <button type="button" onClick={e => { e.stopPropagation(); setRenameDocName(doc.name); setRenameDocId(doc.id); setFileMenuOpen(null); setFileMenuPosition(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700">
                                          <Icon name="Pencil" className="h-4 w-4" /> Rename
                                        </button>
                                        <button type="button" onClick={e => { e.stopPropagation(); setChangeCategoryDocId(doc.id); setChangeCategoryValue(doc.category); setFileMenuOpen(null); setFileMenuPosition(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700">
                                          <Icon name="Filter" className="h-4 w-4" /> Change category
                                        </button>
                                        <button type="button" onClick={e => { e.stopPropagation(); handleDeleteDoc(doc.id); setFileMenuOpen(null); setFileMenuPosition(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                                          <Icon name="Trash2" className="h-4 w-4" /> Delete
                                        </button>
                                      </div>
                                    </>,
                                    document.body
                                  )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Document viewer modal */}
      {viewerDoc && (
        <Modal isOpen={true} onClose={closeViewer} title={viewerDoc.name}>
          <div className="space-y-4">
            <div className="h-[60vh] bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              {isViewableInFrame(viewerDoc.url) ? (
                viewerDoc.url.match(/\.pdf$/i) ? (
                  <iframe src={viewerDoc.url} className="w-full h-full" title={viewerDoc.name} />
                ) : (
                  <img src={viewerDoc.url} alt={viewerDoc.name} className="w-full h-full object-contain" />
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Icon name="FileText" className="h-16 w-16 mb-4" />
                  <p>Preview not available for this file type.</p>
                  <a href={viewerDoc.url} download={viewerDoc.name} className="mt-4 text-primary-600 hover:underline">
                    Download to view
                  </a>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeViewer}>Close</Button>
              <a href={viewerDoc.url} download={viewerDoc.name}>
                <Button leftIcon="Download">Download</Button>
              </a>
            </div>
          </div>
        </Modal>
      )}

      {/* Share modal */}
      {showShareModal && (
        <Modal isOpen={true} onClose={() => setShowShareModal(false)} title="Share Documents">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Documents to share ({shareDocs.length})
              </p>
              <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1 mb-4">
                {shareDocs.map(d => (
                  <li key={d.id}>• {d.name}</li>
                ))}
              </ul>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Recipients
              </label>
              {shareEmails.map((email, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="email"
                    value={email}
                    onChange={e => updateShareEmail(i, e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeShareEmail(i)}
                    className="p-2 text-gray-500 hover:text-red-600"
                  >
                    <Icon name="X" className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addShareEmail} leftIcon="Plus">Add email</Button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Subject
              </label>
              <input
                type="text"
                value={shareSubject}
                onChange={e => setShareSubject(e.target.value)}
                placeholder="Email subject"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Message
              </label>
              <textarea
                value={shareBody}
                onChange={e => setShareBody(e.target.value)}
                placeholder="Add a message..."
                rows={4}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setShowShareModal(false)}>Cancel</Button>
              <Button onClick={handleShareSubmit}>Send via Email</Button>
            </div>
          </div>
        </Modal>
      )}

      {showNewFolderModal && (
        <Modal isOpen={true} onClose={() => setShowNewFolderModal(false)} title="New Folder">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Folder name
              </label>
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Enter folder name"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setShowNewFolderModal(false)}>Cancel</Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isCreatingFolder}>
                {isCreatingFolder ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showMoveModal && (
        <Modal isOpen={true} onClose={() => setShowMoveModal(false)} title="Move to Folder">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Move {selectedForShare.size} selected document(s) to:
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <label className="flex items-center gap-3 p-3 rounded-lg border dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <input
                  type="radio"
                  name="moveFolder"
                  checked={moveTargetFolderId === null}
                  onChange={() => setMoveTargetFolderId(null)}
                  className="h-4 w-4 text-primary-600"
                />
                <Icon name="Folder" className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Unfiled</span>
              </label>
              {folders.map(f => (
                <label key={f.id} className="flex items-center gap-3 p-3 rounded-lg border dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <input
                    type="radio"
                    name="moveFolder"
                    checked={moveTargetFolderId === f.id}
                    onChange={() => setMoveTargetFolderId(f.id)}
                    className="h-4 w-4 text-primary-600"
                  />
                  <Icon name="Folder" className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">{f.name}</span>
                </label>
              ))}
            </div>
            {folders.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No folders yet. Create one with &quot;New Folder&quot; first.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setShowMoveModal(false)}>Cancel</Button>
              <Button onClick={handleMoveToFolder} disabled={isMoving}>
                {isMoving ? 'Moving...' : 'Move'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {changeCategoryDocId && (
        <Modal isOpen={true} onClose={() => { setChangeCategoryDocId(null); setChangeCategoryValue(''); }} title="Change Category">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category</label>
              <select
                value={changeCategoryValue}
                onChange={e => setChangeCategoryValue(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                {DOCUMENT_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => { setChangeCategoryDocId(null); setChangeCategoryValue(''); }}>Cancel</Button>
              <Button onClick={handleChangeCategory}>Update</Button>
            </div>
          </div>
        </Modal>
      )}

      {showCategoryModal && (
        <Modal isOpen={true} onClose={handleCancelUpload} title={uploadToFolderId ? `Upload to ${folders.find(f => f.id === uploadToFolderId)?.name ?? 'folder'}` : 'Categorise Documents'}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {pendingFiles.length} file(s) selected. Choose a category:
            </p>
            <ul className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {pendingFiles.map((f, i) => (
                <li key={i} className="truncate">• {f.name}</li>
              ))}
            </ul>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                {DOCUMENT_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={handleCancelUpload}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUpload}
                disabled={isUploading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default DocumentsTab;
