import React from 'react';
import { SettledLoan, RISK_CONFIG, ACTION_LABELS } from './trailbook.types';

interface Props {
  loan: SettledLoan;
  onRescore: (loanId: string) => void;
  rescoring: boolean;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString('en-NZ');
}

export const TrailBookCard: React.FC<Props> = ({ loan, onRescore, rescoring }) => {
  const score = loan.retention_scores?.[0];
  const risk = score?.risk_level || 'low';
  const cfg = RISK_CONFIG[risk as keyof typeof RISK_CONFIG] || RISK_CONFIG.low;
  const daysToExpiry = daysUntil(loan.current_rate_expiry_date);
  const daysToReview = daysUntil(loan.annual_review_due_date);
  const clientName = loan.clients
    ? loan.clients.first_name + ' ' + loan.clients.last_name
    : 'Unknown Client';
  const trailMonthly = loan.loan_amount && loan.trail_commission_rate
    ? (loan.loan_amount * (loan.trail_commission_rate / 100)) / 12
    : null;

  return (
    <div style={{ border: '1px solid ' + cfg.border, borderLeft: '4px solid ' + cfg.color, borderRadius: 10, background: 'white', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 15 }}>{cfg.dot}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{clientName}</span>
            {score && (
              <span style={{ fontSize: 11, background: cfg.bg, color: cfg.color, border: '1px solid ' + cfg.border, borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>
                {cfg.label} · {score.retention_score}/100
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
            {loan.lender_name} · {fmt(loan.loan_amount)} · {loan.current_rate_type === 'fixed' ? 'Fixed' : 'Floating'} {loan.current_interest_rate}%
          </p>
        </div>
        <button onClick={() => onRescore(loan.id)} disabled={rescoring}
          style={{ fontSize: 11, color: '#6b7280', background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {rescoring ? '...' : '↻ Rescore'}
        </button>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <MetricBox
          label="Rate Expiry"
          value={daysToExpiry == null ? '—' : daysToExpiry < 0 ? 'Expired' : daysToExpiry + ' days'}
          color={daysToExpiry != null && daysToExpiry < 30 ? '#dc2626' : daysToExpiry != null && daysToExpiry < 90 ? '#d97706' : '#374151'}
        />
        <MetricBox
          label="Review Due"
          value={daysToReview == null ? '—' : daysToReview < 0 ? 'Overdue' : daysToReview + ' days'}
          color={daysToReview != null && daysToReview < 0 ? '#dc2626' : '#374151'}
        />
        <MetricBox
          label="Trail/Month"
          value={trailMonthly ? fmt(trailMonthly) : '—'}
          color="#374151"
        />
        <MetricBox
          label="Rate Diff"
          value={score?.rate_differential_bps != null ? (score.rate_differential_bps > 0 ? '+' : '') + score.rate_differential_bps + ' bps' : '—'}
          color={score?.rate_differential_bps != null && score.rate_differential_bps > 50 ? '#dc2626' : '#374151'}
        />
      </div>

      {/* Action row */}
      {score && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #f3f4f6' }}>
          <span style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>
            Recommended: {ACTION_LABELS[score.recommended_action] || score.recommended_action}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {loan.clients?.email && (
              <a href={'mailto:' + loan.clients.email}
                style={{ fontSize: 11, color: '#6366f1', padding: '4px 10px', border: '1px solid #e0e7ff', borderRadius: 6, textDecoration: 'none', fontWeight: 500 }}>
                📧 Email
              </a>
            )}
            {loan.clients?.phone && (
              <a href={'tel:' + loan.clients.phone}
                style={{ fontSize: 11, color: '#16a34a', padding: '4px 10px', border: '1px solid #bbf7d0', borderRadius: 6, textDecoration: 'none', fontWeight: 500 }}>
                📞 Call
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MetricBox = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#fafafa', borderRadius: 7, padding: '6px 10px' }}>
    <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>{label}</p>
    <p style={{ fontSize: 13, fontWeight: 700, color, margin: 0 }}>{value}</p>
  </div>
);

