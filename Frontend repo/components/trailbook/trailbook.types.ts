export interface SettledLoan {
  id: string;
  client_id: string;
  lender_name: string;
  loan_amount: number;
  property_address: string;
  settlement_date: string;
  current_interest_rate: number;
  current_rate_type: string;
  current_rate_expiry_date: string;
  repayment_amount: number;
  repayment_frequency: string;
  trail_commission_rate: number;
  trail_commission_active: boolean;
  annual_review_due_date: string;
  status: string;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  retention_scores: Array<{
    retention_score: number;
    risk_level: string;
    recommended_action: string;
    rate_differential_bps: number;
    days_until_rate_expiry: number;
    scored_at: string;
  }>;
}

export type RiskLevel = 'all' | 'critical' | 'high' | 'medium' | 'low';

export const RISK_CONFIG = {
  critical: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Critical', dot: '🔴' },
  high:     { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: 'High',     dot: '🟡' },
  medium:   { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', label: 'Medium',   dot: '🔵' },
  low:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Low',      dot: '🟢' },
};

export const ACTION_LABELS: Record<string, string> = {
  monitor:          'Monitor',
  schedule_review:  'Schedule Review',
  contact_urgently: 'Contact Urgently',
  reprice_now:      'Reprice Now',
  refinance_alert:  'Refinance Alert',
};

