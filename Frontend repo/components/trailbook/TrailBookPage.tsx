import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { TrailBookCard } from './TrailBookCard';
import { SettledLoan, RiskLevel, RISK_CONFIG } from './trailbook.types';
import { useToast } from '../../hooks/useToast';

export const TrailBookPage: React.FC = () => {
  const toast = useToast();
  const [loans, setLoans] = useState<SettledLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RiskLevel>('all');
  const [search, setSearch] = useState('');
  const [rescoring, setRescoring] = useState<string | null>(null);
  const [marketRate, setMarketRate] = useState<number>(6.5);
  const [sortBy, setSortBy] = useState<'risk' | 'expiry' | 'review' | 'trail'>('risk');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: rateData } = await supabase
        .from('market_rates')
        .select('rate_percent')
        .eq('rate_type', 'fixed_1yr')
        .eq('is_current', true)
        .order('rate_percent', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (rateData) setMarketRate(rateData.rate_percent);

      const { data } = await supabase
        .from('settled_loans')
        .select(`
          id, client_id, lender_name, loan_amount, property_address,
          settlement_date, current_interest_rate, current_rate_type,
          current_rate_expiry_date, repayment_amount, repayment_frequency,
          trail_commission_rate, trail_commission_active,
          annual_review_due_date, status,
          clients(first_name, last_name, email, phone),
          retention_scores(retention_score, risk_level, recommended_action, rate_differential_bps, days_until_rate_expiry, scored_at)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      setLoans(data || []);
    } catch (e) {
      logger.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function rescore(loanId: string) {
    setRescoring(loanId);
    try {
      const { error } = await supabase.rpc('calculate_retention_score', {
        p_settled_loan_id: loanId,
        p_market_best_rate: marketRate,
      });
      if (error) throw error;
      toast.success('Retention score calculated');
      await loadAll();
    } catch (e: any) {
      logger.error(e);
      toast.error('Error: ' + (e?.message || 'Failed to calculate retention score'));
    } finally {
      setRescoring(null);
    }
  }

  async function rescoreAll() {
    setRescoring('all');
    try {
      for (const loan of loans) {
        const { error } = await supabase.rpc('calculate_retention_score', {
          p_settled_loan_id: loan.id,
          p_market_best_rate: marketRate,
        });
        if (error) throw error;
      }
      toast.success('Retention scores calculated');
      await loadAll();
    } catch (e: any) {
      logger.error(e);
      toast.error('Error: ' + (e?.message || 'Failed to calculate retention scores'));
    } finally {
      setRescoring(null);
    }
  }

  const filtered = loans
    .filter(l => {
      const score = l.retention_scores?.[0];
      if (filter !== 'all' && score?.risk_level !== filter) return false;
      if (search) {
        const name = (l.clients?.first_name + ' ' + l.clients?.last_name).toLowerCase();
        const lender = (l.lender_name || '').toLowerCase();
        const addr = (l.property_address || '').toLowerCase();
        if (!name.includes(search.toLowerCase()) && !lender.includes(search.toLowerCase()) && !addr.includes(search.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const sa = a.retention_scores?.[0];
      const sb = b.retention_scores?.[0];
      if (sortBy === 'risk') return (sb?.retention_score || 0) - (sa?.retention_score || 0);
      if (sortBy === 'expiry') {
        const da = a.current_rate_expiry_date ? new Date(a.current_rate_expiry_date).getTime() : Infinity;
        const db = b.current_rate_expiry_date ? new Date(b.current_rate_expiry_date).getTime() : Infinity;
        return da - db;
      }
      if (sortBy === 'review') {
        const da = a.annual_review_due_date ? new Date(a.annual_review_due_date).getTime() : Infinity;
        const db = b.annual_review_due_date ? new Date(b.annual_review_due_date).getTime() : Infinity;
        return da - db;
      }
      if (sortBy === 'trail') return (b.loan_amount || 0) - (a.loan_amount || 0);
      return 0;
    });

  const counts = {
    critical: loans.filter(l => l.retention_scores?.[0]?.risk_level === 'critical').length,
    high:     loans.filter(l => l.retention_scores?.[0]?.risk_level === 'high').length,
    medium:   loans.filter(l => l.retention_scores?.[0]?.risk_level === 'medium').length,
    low:      loans.filter(l => l.retention_scores?.[0]?.risk_level === 'low').length,
  };
  const totalTrail = loans.reduce((s, l) => s + (l.loan_amount && l.trail_commission_rate ? (l.loan_amount * l.trail_commission_rate / 100) / 12 : 0), 0);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10 }}>
      <div style={{ width: 20, height: 20, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: '#6b7280', fontSize: 14 }}>Loading trail book...</span>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>Trail Book</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            {loans.length} active loans · Market best rate: {marketRate}% (1yr fixed)
          </p>
        </div>
        <button onClick={rescoreAll} disabled={!!rescoring}
          style={{ fontSize: 12, padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {rescoring === 'all' ? 'Rescoring...' : '↻ Rescore All'}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {(Object.keys(RISK_CONFIG) as Array<keyof typeof RISK_CONFIG>).map(level => (
          <div key={level} onClick={() => setFilter(filter === level ? 'all' : level)}
            style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid ' + (filter === level ? RISK_CONFIG[level].color : '#e5e7eb'), background: filter === level ? RISK_CONFIG[level].bg : 'white', cursor: 'pointer', textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: RISK_CONFIG[level].color, margin: '0 0 2px' }}>{counts[level]}</p>
            <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{RISK_CONFIG[level].label}</p>
          </div>
        ))}
        <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', textAlign: 'center' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#6366f1', margin: '0 0 2px' }}>${Math.round(totalTrail).toLocaleString('en-NZ')}</p>
          <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Trail/Month</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search client, lender, property..."
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer' }}>
          <option value="risk">Sort: Risk Score</option>
          <option value="expiry">Sort: Rate Expiry</option>
          <option value="review">Sort: Review Due</option>
          <option value="trail">Sort: Loan Size</option>
        </select>
      </div>

      {/* Loan cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <p style={{ fontSize: 48, margin: '0 0 12px' }}>📚</p>
          <p style={{ fontSize: 15, color: '#374151', fontWeight: 600, margin: '0 0 6px' }}>No settled loans found</p>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
            {search || filter !== 'all' ? 'Try adjusting your filters' : 'Settled loans will appear here once applications are settled'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(loan => (
            <TrailBookCard
              key={loan.id}
              loan={loan}
              onRescore={rescore}
              rescoring={rescoring === loan.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

