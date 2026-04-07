import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useDuplicateDetection, checkAkahuDuplicates } from '../../hooks/useDuplicateDetection';
import { DuplicateWarningModal } from '../common/DuplicateWarningModal';
import { invokeFunction } from '../../src/lib/api';

function goToMfaSettings(e: React.MouseEvent) {
  e.preventDefault();
  window.history.pushState(null, '', '/settings?section=mfa');
  window.dispatchEvent(new Event('advflow:navigate'));
}

export interface AkahuConnectProps {
  applicationId: string;
  firmId: string;
  isMfaVerified: boolean;
  mfaGuardLoading: boolean;
  onSynced: () => Promise<void>;
  setParseResult: (msg: string | null) => void;
}

/**
 * Re-sync bank transactions: duplicate-checks the last 90 days, then invokes `akahu-sync` fetch.
 */
export const AkahuConnect: React.FC<AkahuConnectProps> = ({
  applicationId,
  firmId,
  isMfaVerified,
  mfaGuardLoading,
  onSynced,
  setParseResult,
}) => {
  const [akahuConnected, setAkahuConnected] = useState(false);
  const [akahuSyncing, setAkahuSyncing] = useState(false);
  const [akahuInfoBanner, setAkahuInfoBanner] = useState<string | null>(null);
  const {
    checkResult: akahuDupResult,
    setCheckResult: setAkahuDupResult,
    showModal: showAkahuDupModal,
    setShowModal: setShowAkahuDupModal,
    pendingAction: pendingAkahuFetch,
    setPendingAction: setPendingAkahuFetch,
  } = useDuplicateDetection();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('akahu_connections')
        .select('id')
        .eq('application_id', applicationId)
        .eq('status', 'active')
        .maybeSingle();
      if (!cancelled) setAkahuConnected(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const connectAkahu = useCallback(async () => {
    setAkahuSyncing(true);
    try {
      const { data: client } = await supabase
        .from('clients')
        .select('email')
        .eq(
          'id',
          (await supabase.from('applications').select('client_id').eq('id', applicationId).single()).data
            ?.client_id,
        )
        .single();

      const { data, error } = await invokeFunction<{ consent_url: string }>('akahu-sync', {
        action: 'connect',
        application_id: applicationId,
        firm_id: firmId,
        client_email: client?.email,
      });
      if (error) throw new Error(error);
      window.open(data.consent_url, '_blank', 'width=620,height=700,resizable=yes');
      setParseResult('Consent window opened — waiting for client to connect...');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setParseResult('Error: ' + msg);
    }
    setAkahuSyncing(false);
  }, [applicationId, firmId, setParseResult]);

  const syncTransactions = useCallback(async () => {
    const periodStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const periodEnd = new Date().toISOString().split('T')[0];

    const { data: conn } = await supabase
      .from('akahu_connections')
      .select('id')
      .eq('application_id', applicationId)
      .eq('status', 'active')
      .maybeSingle();
    if (!conn?.id) return;

    const result = await checkAkahuDuplicates(applicationId, periodStart, periodEnd);

    const runFetch = async () => {
      setAkahuSyncing(true);
      try {
        const { error } = await invokeFunction('akahu-sync', {
          action: 'fetch',
          connection_id: conn.id,
        });
        if (error) throw new Error(error);
        await onSynced();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setParseResult('Error: ' + msg);
      } finally {
        setAkahuSyncing(false);
      }
    };

    if (!result.requires_confirmation) {
      await runFetch();
      return;
    }

    const n = result.duplicate_count > 0 ? String(result.duplicate_count) : 'Some';
    const banner = `${n} transactions already imported for this period. Re-importing will overwrite manual category corrections. Proceed?`;

    setAkahuInfoBanner(banner);
    setAkahuDupResult(result);
    setPendingAkahuFetch(() => runFetch);
    setShowAkahuDupModal(true);
  }, [applicationId, onSynced, setAkahuDupResult, setPendingAkahuFetch, setShowAkahuDupModal, setParseResult]);

  return (
    <>
      {!akahuConnected && mfaGuardLoading ? (
        <div style={{ padding: '16px', borderRadius: 10, background: '#fafbff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🏦</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Checking security…</p>
        </div>
      ) : !akahuConnected && !isMfaVerified ? (
        <div style={{ padding: '16px', borderRadius: 10, background: '#fffbeb', border: '1.5px solid #fde68a' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', margin: '0 0 8px', lineHeight: 1.45 }}>
            MFA required to connect bank accounts — this protects your clients&apos; financial data. Enable MFA in
            Settings → Security.
          </p>
          <a
            href="/settings?section=mfa"
            onClick={goToMfaSettings}
            className="fin-btn"
            style={{
              display: 'block',
              textAlign: 'center',
              textDecoration: 'none',
              fontSize: 11,
              color: 'white',
              background: '#6366f1',
              padding: '8px 14px',
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 8,
            }}
          >
            Open MFA settings
          </a>
        </div>
      ) : (
        <div
          style={{
            padding: '16px',
            borderRadius: 10,
            background: akahuConnected ? '#f0fdf4' : '#fafbff',
            border: `1.5px solid ${akahuConnected ? '#a7f3d0' : '#e2e8f0'}`,
            cursor: akahuConnected ? 'default' : 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={akahuConnected ? undefined : connectAkahu}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>{akahuConnected ? '✅' : '🏦'}</div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
            {akahuConnected ? 'Bank Connected' : 'Fetch Bank Data'}
          </p>
          <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px', lineHeight: 1.4 }}>
            {akahuConnected
              ? '90-day transactions imported via Akahu'
              : 'One-click consent — pulls 90 days of verified transactions'}
          </p>
          {!akahuConnected && (
            <button
              className="fin-btn"
              disabled={akahuSyncing}
              style={{ fontSize: 11, color: 'white', background: '#6366f1', padding: '6px 14px', width: '100%' }}
            >
              {akahuSyncing ? 'Connecting...' : '🔗 Connect via Akahu'}
            </button>
          )}
          {akahuConnected && (
            <button
              className="fin-btn"
              onClick={(e) => {
                e.stopPropagation();
                void syncTransactions();
              }}
              style={{
                fontSize: 11,
                color: '#059669',
                background: 'white',
                border: '1px solid #a7f3d0',
                padding: '5px 14px',
                width: '100%',
              }}
            >
              {akahuSyncing ? 'Syncing...' : '↻ Re-sync transactions'}
            </button>
          )}
        </div>
      )}

      {showAkahuDupModal && akahuDupResult && (
        <DuplicateWarningModal
          result={akahuDupResult}
          actionLabel="Re-import Transactions"
          infoBanner={akahuInfoBanner ?? undefined}
          onProceed={() => {
            setShowAkahuDupModal(false);
            setAkahuInfoBanner(null);
            void pendingAkahuFetch?.();
            setPendingAkahuFetch(null);
            setAkahuDupResult(null);
          }}
          onCancel={() => {
            setShowAkahuDupModal(false);
            setAkahuInfoBanner(null);
            setPendingAkahuFetch(null);
            setAkahuDupResult(null);
          }}
        />
      )}
    </>
  );
};
