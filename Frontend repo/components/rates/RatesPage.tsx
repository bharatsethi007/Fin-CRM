import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

interface MarketRate {
  id: string;
  lender_name: string;
  rate_type: string;
  rate_percent: number;
  cashback_amount: number;
  owner_occupied: boolean;
  investment: boolean;
  effective_date: string;
  is_current: boolean;
  updated_at: string;
}

const LABELS: Record<string, string> = {
  fixed_6m: '6 Mth',
  fixed_1yr: '1 Yr',
  fixed_2yr: '2 Yr',
  fixed_3yr: '3 Yr',
  fixed_5yr: '5 Yr',
  floating: 'Float',
};

const TYPES = ['fixed_6m', 'fixed_1yr', 'fixed_2yr', 'fixed_3yr', 'fixed_5yr', 'floating'];
const LENDERS = ['ANZ', 'ASB', 'BNZ', 'Westpac', 'Kiwibank', 'SBS Bank', 'Heartland', 'Liberty', 'Resimac'];

function getBest(rates: MarketRate[], type: string): number | null {
  const m = rates.filter(r => r.rate_type === type && r.rate_percent > 0);
  if (m.length === 0) return null;
  return Math.min(...m.map(r => r.rate_percent));
}

function getRate(rates: MarketRate[], lender: string, type: string): MarketRate | undefined {
  return rates.find(r => r.lender_name === lender && r.rate_type === type);
}

interface CellProps {
  rates: MarketRate[];
  lender: string;
  type: string;
  editingId: string | null;
  editValue: string;
  onEditStart: (rate: MarketRate) => void;
  onEditChange: (v: string) => void;
  onEditSave: (rate: MarketRate, v: string) => void;
  onEditCancel: () => void;
  onAdd: (lender: string, type: string) => void;
}

function RateCell(props: CellProps) {
  const { rates, lender, type, editingId, editValue } = props;
  const rate = getRate(rates, lender, type);
  const best = getBest(rates, type);
  const isBest = rate != null && best != null && rate.rate_percent === best;
  const isEditing = rate != null && editingId === rate.id;

  if (isEditing) {
    return (
      <td style={{ padding: '6px 8px', textAlign: 'center', background: '#eff6ff' }}>
        <input
          autoFocus
          value={editValue}
          onChange={e => props.onEditChange(e.target.value)}
          onBlur={() => { if (rate) props.onEditSave(rate, editValue); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && rate) props.onEditSave(rate, editValue);
            if (e.key === 'Escape') props.onEditCancel();
          }}
          style={{ width: 60, padding: '3px 6px', border: '1px solid #6366f1', borderRadius: 4, fontSize: 12, textAlign: 'center', outline: 'none' }}
        />
      </td>
    );
  }

  if (!rate || !rate.rate_percent) {
    return (
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <button
          onClick={() => props.onAdd(lender, type)}
          style={{ fontSize: 11, color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          +
        </button>
      </td>
    );
  }

  const rateColor = isBest ? '#16a34a' : '#374151';
  const rateBg = isBest ? '#f0fdf4' : 'transparent';

  return (
    <td
      onClick={() => props.onEditStart(rate)}
      style={{ padding: '6px 8px', textAlign: 'center', cursor: 'pointer', background: rateBg }}
      title="Click to edit"
    >
      <span style={{ fontSize: 13, fontWeight: isBest ? 700 : 400, color: rateColor }}>
        {rate.rate_percent.toFixed(2)}%
      </span>
      {isBest && <span style={{ fontSize: 9, color: '#16a34a', marginLeft: 3 }}>star</span>}
      {rate.cashback_amount > 0 && (
        <span style={{ fontSize: 9, color: '#6366f1', display: 'block' }}>
          ${(rate.cashback_amount / 1000).toFixed(0)}k cb
        </span>
      )}
    </td>
  );
}

export const RatesPage: React.FC = () => {
  const toast = useToast();
  const [rates, setRates] = useState<MarketRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'owner_occupied' | 'investment'>('owner_occupied');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => { loadRates(); }, [filter]);

  async function loadRates() {
    setLoading(true);
    const col = filter === 'owner_occupied' ? 'owner_occupied' : 'investment';
    const { data } = await supabase
      .from('market_rates')
      .select('*')
      .eq('is_current', true)
      .eq(col, true)
      .order('lender_name')
      .order('rate_type');
    setRates(data || []);
    if (data && data.length > 0) {
      const latest = data.reduce((a, b) => a.updated_at > b.updated_at ? a : b);
      setLastUpdated(latest.updated_at);
    }
    setLoading(false);
  }

  async function saveRate(rate: MarketRate, newValue: string) {
    const parsed = parseFloat(newValue);
    if (isNaN(parsed) || parsed <= 0 || parsed > 20) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    const { error: err } = await supabase
      .from('market_rates')
      .update({ rate_percent: parsed, updated_at: new Date().toISOString() })
      .eq('id', rate.id);
    setEditingId(null);
    if (err) {
      toast.error('Failed to save rate: ' + err.message);
    } else {
      await loadRates();
      toast.success('Rate updated');
    }
    setSaving(false);
  }

  async function addRate(lender: string, type: string) {
    const label = LABELS[type] || type;
    const value = prompt('Enter rate % for ' + lender + ' ' + label + ':');
    if (!value) return;
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return;
    const col = filter === 'owner_occupied' ? 'owner_occupied' : 'investment';
    const { error: err } = await supabase.from('market_rates').insert({
      lender_name: lender,
      rate_type: type,
      rate_percent: parsed,
      owner_occupied: col === 'owner_occupied',
      investment: col === 'investment',
      is_current: true,
      effective_date: new Date().toISOString().split('T')[0],
    });
    if (err) {
      toast.error('Failed to add rate: ' + err.message);
    } else {
      await loadRates();
      toast.success('Rate added');
    }
  }

  const cellProps = {
    rates,
    editingId,
    editValue,
    onEditStart: (rate: MarketRate) => { setEditingId(rate.id); setEditValue(String(rate.rate_percent)); },
    onEditChange: (v: string) => setEditValue(v),
    onEditSave: saveRate,
    onEditCancel: () => setEditingId(null),
    onAdd: addRate,
  };

  const btnBase = { fontSize: 12, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', fontWeight: 600 } as const;
  const btnActive = { ...btnBase, border: '1px solid #6366f1', background: '#6366f1', color: 'white' };
  const btnInactive = { ...btnBase, border: '1px solid #e5e7eb', background: 'white', color: '#374151' };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>Market Rates</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
            {'Click any rate to edit · star = market best · cb = cashback'}
            {lastUpdated ? ' · Updated ' + new Date(lastUpdated).toLocaleDateString('en-NZ') : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setFilter('owner_occupied')} style={filter === 'owner_occupied' ? btnActive : btnInactive}>
            Owner-Occupied
          </button>
          <button onClick={() => setFilter('investment')} style={filter === 'investment' ? btnActive : btnInactive}>
            Investment
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 40 }}>
          <div style={{ width: 16, height: 16, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: '#6b7280', fontSize: 13 }}>Loading rates...</span>
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151' }}>Lender</th>
                {TYPES.map(type => (
                  <th key={type} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#374151', minWidth: 70 }}>
                    {LABELS[type]}
                  </th>
                ))}
              </tr>
              <tr style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                <td style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#16a34a' }}>
                  Best Rate
                </td>
                {TYPES.map(type => {
                  const b = getBest(rates, type);
                  return (
                    <td key={type} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#16a34a' }}>
                      {b != null ? b.toFixed(2) + '%' : '—'}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {LENDERS.map((lender, idx) => (
                <tr key={lender} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {lender}
                  </td>
                  {TYPES.map(type => (
                    <RateCell key={lender + type} lender={lender} type={type} {...cellProps} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 11, color: '#9ca3af', margin: '10px 0 0', textAlign: 'right' }}>
        {saving ? 'Saving...' : 'Click any cell to update · Changes save immediately'}
      </p>
    </div>
  );
};
