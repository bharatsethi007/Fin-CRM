import React from 'react';
import { PdfPreview } from '../../hooks/usePdfGenerator';
import { AIFeedbackRating } from '../common/AIFeedbackRating';

interface Props {
  preview: PdfPreview;
  generating: boolean;
  onClose: () => void;
  onApprove: (docId: string) => Promise<void>;
  onDownload: () => void;
  onRegenerate: () => void;
  feedbackMeta?: { firmId: string; advisorId: string; applicationId: string; feature: string };
}

export const PdfPreviewModal: React.FC<Props> = ({
  preview, generating, onClose, onApprove, onDownload, onRegenerate, feedbackMeta
}) => {
  const [approving, setApproving] = React.useState(false);
  const [approved, setApproved] = React.useState(false);

  async function handleApprove() {
    if (!preview.docId) return;
    setApproving(true);
    await onApprove(preview.docId);
    setApproved(true);
    setApproving(false);
  }

  const docTitles: Record<string, string> = {
    soa_full: 'Statement of Advice',
    disclosure_statement: 'Disclosure Statement',
    needs_objectives: 'Needs and Objectives',
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 960,
          height: '92vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f8fafc', flexShrink: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>📄</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {docTitles[preview.docType] || preview.title}
              </p>
              <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
                {preview.cached
                  ? `Cached · Generated ${new Date(preview.generatedAt).toLocaleString('en-NZ')}`
                  : `Just generated · ${new Date().toLocaleString('en-NZ')}`}
                {' · '}{preview.data.client_name}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Cached badge */}
            {preview.cached && !approved && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb',
                background: '#eff6ff', border: '1px solid #bfdbfe',
                padding: '3px 10px', borderRadius: 20 }}>
                Cached ✓
              </span>
            )}
            {/* Regenerate */}
            <button
              onClick={onRegenerate}
              disabled={generating}
              style={{ fontSize: 12, color: '#64748b', background: 'white',
                border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}
            >
              {generating ? 'Regenerating...' : '↻ Regenerate'}
            </button>
            {/* Download */}
            <button
              onClick={onDownload}
              style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5',
                background: '#eef2ff', border: '1px solid #c7d2fe',
                borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}
            >
              ↓ Download PDF
            </button>
            {/* Approve */}
            {!approved ? (
              <button
                onClick={handleApprove}
                disabled={approving || !preview.docId}
                style={{ fontSize: 12, fontWeight: 700, color: 'white',
                  background: approving ? '#e2e8f0' : '#059669',
                  border: 'none', borderRadius: 7, padding: '7px 18px', cursor: 'pointer' }}
              >
                {approving ? 'Approving...' : '✓ Approve Document'}
              </button>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#059669',
                background: '#f0fdf4', border: '1px solid #a7f3d0',
                padding: '6px 14px', borderRadius: 7 }}>
                ✓ Approved
              </span>
            )}
            <button
              onClick={onClose}
              style={{ fontSize: 18, color: '#94a3b8', background: 'none',
                border: 'none', cursor: 'pointer', padding: '0 4px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Approval notice */}
        {!approved && (
          <div style={{ padding: '8px 20px', background: '#fffbeb',
            borderBottom: '1px solid #fde68a', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ fontSize: 13 }}>⚠️</span>
            <span style={{ fontSize: 12, color: '#92400e' }}>
              <strong>Review before approving.</strong> This document was AI-assisted.
              As the licensed adviser, you take responsibility for its content.
              Approve only after verifying all details are accurate.
            </span>
          </div>
        )}

        {approved && feedbackMeta && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, background: '#f8fafc' }}>
            <AIFeedbackRating
              firmId={feedbackMeta.firmId}
              advisorId={feedbackMeta.advisorId}
              applicationId={feedbackMeta.applicationId}
              feature={feedbackMeta.feature}
            />
          </div>
        )}

        {/* PDF iframe preview */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#475569' }}>
          <iframe
            src={preview.pdfDataUrl + '#toolbar=1&navpanes=0'}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="PDF Preview"
          />
        </div>
      </div>
    </div>
  );
};
